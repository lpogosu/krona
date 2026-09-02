import {
  analyze,
  DAY,
  DEFAULT_THRESHOLD,
  describeCron,
  formatDuration,
  isValidTimeZone,
  pad,
  parseSource,
  plural,
  summarizeOverloads,
  toWallTime,
  type Job,
  type Report,
  type SourceError,
  type SourceWarning,
} from '@krona/core';
import { parseArgs } from 'node:util';

export interface Io {
  readonly readFile: (path: string) => Promise<string>;
  readonly out: (line: string) => void;
  readonly now: () => number;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** 0 — всё чисто, 1 — найдены перегрузки, 2 — файл не разобран или неверные аргументы. */
export type ExitCode = 0 | 1 | 2;

const USAGE = `Использование: krona check <файл...> [параметры]

  --tz <пояс>         пояс демона cron, если в файле нет CRON_TZ (по умолчанию UTC)
  --threshold <n>     сколько задач могут работать одновременно (по умолчанию ${DEFAULT_THRESHOLD})
  --days <n>          длина окна анализа в сутках (по умолчанию 7)
  --from <дата>       начало окна, ISO 8601 (по умолчанию начало текущих суток UTC)
  --system            системный формат crontab с колонкой пользователя
  --format text|json  формат вывода`;

interface FileResult {
  readonly path: string;
  readonly jobs: Job[];
  readonly errors: SourceError[];
  readonly warnings: SourceWarning[];
  readonly report?: Report;
}

export async function check(argv: readonly string[], io: Io): Promise<ExitCode> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        tz: { type: 'string', default: 'UTC' },
        threshold: { type: 'string', default: String(DEFAULT_THRESHOLD) },
        days: { type: 'string', default: '7' },
        from: { type: 'string' },
        system: { type: 'boolean', default: false },
        format: { type: 'string', default: 'text' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    io.out(error instanceof Error ? error.message : String(error));
    io.out(USAGE);
    return 2;
  }

  const { values, positionals } = parsed;
  const [command, ...files] = positionals;
  if (values.help || command !== 'check' || files.length === 0) {
    io.out(USAGE);
    return values.help ? 0 : 2;
  }

  const threshold = Number(values.threshold);
  const days = Number(values.days);
  const from = values.from === undefined ? Math.floor(io.now() / DAY) * DAY : Date.parse(values.from);
  const problems = [
    !isValidTimeZone(values.tz) && `неизвестный часовой пояс ${values.tz}`,
    !(Number.isInteger(threshold) && threshold >= 1) && '--threshold должен быть целым числом от 1',
    !(Number.isInteger(days) && days >= 1 && days <= 31) && '--days должен быть от 1 до 31',
    Number.isNaN(from) && `--from: не дата «${values.from ?? ''}»`,
    !['text', 'json'].includes(values.format) && '--format: text или json',
  ].filter((p): p is string => typeof p === 'string');
  if (problems.length > 0) {
    problems.forEach((p) => {
      io.out(`krona: ${p}`);
    });
    return 2;
  }

  const results: FileResult[] = [];
  for (const path of files) {
    let text: string;
    try {
      text = await io.readFile(path);
    } catch {
      results.push({ path, jobs: [], errors: [{ line: 0, message: 'файл не прочитан', text: '' }], warnings: [] });
      continue;
    }
    const source = parseSource(text, { timeZone: values.tz, system: values.system });
    const report = source.jobs.length > 0 ? analyze(source.jobs, { from, to: from + days * DAY, threshold }) : undefined;
    results.push({ path, jobs: source.jobs, errors: source.errors, warnings: source.warnings, ...(report ? { report } : {}) });
  }

  const hasErrors = results.some((r) => r.errors.length > 0);
  const hasOverloads = results.some((r) => (r.report?.overloads.length ?? 0) > 0 || r.report?.jobs.some((j) => j.selfOverlap));

  if (values.format === 'json') {
    io.out(JSON.stringify(results.map(toJson), null, 2));
  } else {
    printText(results, threshold, values.tz, io);
  }
  if (io.env['GITHUB_ACTIONS'] === 'true') {
    printAnnotations(results, io);
  }

  return hasErrors ? 2 : hasOverloads ? 1 : 0;
}

function printText(results: readonly FileResult[], threshold: number, zone: string, io: Io): void {
  for (const result of results) {
    io.out(result.path);
    for (const error of result.errors) {
      io.out(`  ошибка   строка ${error.line}: ${error.message}`);
    }
    const report = result.report;
    if (!report) {
      continue;
    }
    const nameOf = (id: string): string => result.jobs.find((j) => j.id === id)?.name ?? id;

    for (const { job, durationMinutes, runs } of report.jobs) {
      io.out(`  ${job.name.padEnd(20)} ${job.schedule.expression.padEnd(16)} ${describeCron(job.schedule)} · ${formatDuration(durationMinutes)} · ${runs.length} ${plural(runs.length, 'запуск', 'запуска', 'запусков')}`);
    }
    const recurring = summarizeOverloads(report.overloads, zone);
    for (const group of recurring.slice(0, MAX_OVERLOAD_LINES)) {
      const when = group.occurrences === 1 ? stamp(group.first, zone).slice(0, 5) : `${group.occurrences} ${plural(group.occurrences, 'раз', 'раза', 'раз')}`;
      io.out(`  перегрузка ${group.window} ${zone}, ${when}: ${group.peak} при пороге ${threshold} (${group.jobIds.map(nameOf).join(', ')})`);
    }
    if (recurring.length > MAX_OVERLOAD_LINES) {
      io.out(`  … и ещё ${recurring.length - MAX_OVERLOAD_LINES} вариантов перегрузки, полный список — --format json`);
    }
    for (const { job } of report.jobs.filter((j) => j.selfOverlap)) {
      io.out(`  наложение ${job.name}: следующий запуск стартует до окончания предыдущего`);
    }
    for (const { job, dst } of report.jobs) {
      for (const notice of dst) {
        io.out(`  перевод часов ${job.name}: ${DST_TEXT[notice.effect]} (${pad(notice.wall.day)}.${pad(notice.wall.month)} ${pad(notice.wall.hour)}:${pad(notice.wall.minute)})`);
      }
    }
    for (const s of report.suggestions) {
      io.out(`  совет: перенести ${nameOf(s.jobId)} на ${pad(s.hour)}:${pad(s.minute)} (+${s.shiftMinutes} мин) — перегрузок останется ${s.overloadsAfter}`);
    }
    if (report.stagger) {
      const plan = report.stagger;
      const moves = plan.changes.map((c) => `${nameOf(c.jobId)} ${c.from} → ${c.to}`).join(', ');
      io.out(`  совет: разнести частые задачи по минутам (${moves}) — пик ${plan.peakBefore} → ${plan.peakAfter}`);
    }
    if (report.overloads.length === 0) {
      io.out(`  перегрузок нет, пик ${report.peak.count} при пороге ${threshold}`);
    }
  }
}

const MAX_OVERLOAD_LINES = 10;

const DST_TEXT = {
  shifted: 'время попало в провал, cron выполнит задачу в момент перевода',
  skipped: 'запуск в провале пропадёт',
  deduplicated: 'время повторится, задача выполнится один раз',
  doubled: 'час повторится, задача выполнится дважды',
} as const;

function printAnnotations(results: readonly FileResult[], io: Io): void {
  for (const result of results) {
    for (const error of result.errors) {
      io.out(`::error file=${result.path},line=${error.line}::${escape(error.message)}`);
    }
    const report = result.report;
    if (!report) {
      continue;
    }
    // Одна аннотация на задачу: семь одинаковых перегрузок за неделю — это одна находка.
    const episodes = new Map<string, { peak: number; count: number }>();
    for (const episode of report.overloads) {
      for (const id of episode.jobIds) {
        const seen = episodes.get(id);
        episodes.set(id, { peak: Math.max(seen?.peak ?? 0, episode.peak), count: (seen?.count ?? 0) + 1 });
      }
    }
    for (const [id, { peak, count }] of episodes) {
      const job = result.jobs.find((j) => j.id === id);
      if (job) {
        io.out(`::warning file=${result.path},line=${job.source.line}::${escape(`${job.name}: перегрузок ${count}, до ${peak} задач одновременно`)}`);
      }
    }
  }
}

function escape(message: string): string {
  return message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function time(instant: number, zone: string): string {
  const w = toWallTime(instant, zone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

function stamp(instant: number, zone: string): string {
  const w = toWallTime(instant, zone);
  return `${pad(w.day)}.${pad(w.month)} ${time(instant, zone)}`;
}

function toJson(result: FileResult): unknown {
  const report = result.report;
  return {
    path: result.path,
    errors: result.errors,
    warnings: result.warnings,
    jobs: report?.jobs.map((j) => ({
      name: j.job.name,
      expression: j.job.schedule.expression,
      description: describeCron(j.job.schedule),
      timeZone: j.job.timeZone,
      durationMinutes: j.durationMinutes,
      durationSource: j.job.durationSource,
      line: j.job.source.line,
      runs: j.runs.length,
      selfOverlap: j.selfOverlap,
      dst: j.dst.map((d) => ({ effect: d.effect, wall: d.wall })),
    })),
    peak: report?.peak.count ?? 0,
    overloads: report?.overloads.map((o) => ({
      start: new Date(o.start).toISOString(),
      end: new Date(o.end).toISOString(),
      peak: o.peak,
      jobs: o.jobIds.map((id) => result.jobs.find((j) => j.id === id)?.name ?? id),
    })),
    stagger: report?.stagger && {
      peakBefore: report.stagger.peakBefore,
      peakAfter: report.stagger.peakAfter,
      changes: report.stagger.changes.map((c) => ({ job: result.jobs.find((j) => j.id === c.jobId)?.name ?? c.jobId, from: c.from, to: c.to })),
    },
    suggestions: report?.suggestions.map((s) => ({
      job: result.jobs.find((j) => j.id === s.jobId)?.name ?? s.jobId,
      time: `${pad(s.hour)}:${pad(s.minute)}`,
      shiftMinutes: s.shiftMinutes,
      overloadsAfter: s.overloadsAfter,
    })),
  };
}
