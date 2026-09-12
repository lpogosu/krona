import { loadBuckets, MINUTE, plural, summarizeOverloads, type DiffLine, type Report } from '@krona/core';
import { ArrowRight, Check, Download, TriangleAlert } from 'lucide-react';

import { useAnalysis } from '../../analysis/use-analysis';
import type { Screen } from '../../app/route';
import { AnalysisFailed, DaySkeleton, NoProject } from '../../components/states';
import { textAfterMove, textAfterStagger } from '../../lib/edit';
import { formatMinuteOfDay, hhmm } from '../../lib/time';
import { jobColors, nameOf } from '../../lib/view';
import type { Project } from '../../state/project';
import { useProject } from '../../state/project';
import { useWorkspace, WINDOW_DAYS } from '../../state/workspace';
import { SourceErrors } from '../day/SourceErrors';
import { LoadChart } from './LoadChart';
import './conflicts.css';

interface Fix {
  readonly title: string;
  readonly text: string;
  readonly diff: readonly DiffLine[];
}

/** Исправление, которое экран предлагает целиком: перенос, если он убирает всё, иначе разнос. */
function chooseFix(project: Project, report: Report): Fix | undefined {
  const move = report.suggestions[0];
  if (move && (move.overloadsAfter === 0 || !report.stagger)) {
    const applied = textAfterMove(project.text, report, move);
    return { title: `Перенести ${nameOf(report, move.jobId)} на ${formatMinuteOfDay(move.hour * 60 + move.minute)}`, text: applied.text, diff: applied.diff };
  }
  if (report.stagger) {
    const text = textAfterStagger(project.text, report, report.stagger);
    return { title: `Разнести ${report.stagger.changes.length} ${plural(report.stagger.changes.length, 'частую задачу', 'частые задачи', 'частых задач')} по минутам`, text, diff: lineDiff(project.text, text) };
  }
  return undefined;
}

function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const out: DiffLine[] = [];
  a.forEach((line, i) => {
    if (line !== b[i]) {
      out.push({ kind: 'removed', text: line }, { kind: 'added', text: b[i] ?? '' });
    }
  });
  return out;
}

export function ConflictsScreen({ go }: { go: (screen: Screen) => void }) {
  const workspace = useWorkspace();
  const { update } = useProject();
  const report = workspace?.result?.report;
  const fix = workspace && report ? chooseFix(workspace.project, report) : undefined;

  const after = useAnalysis(
    workspace && fix
      ? {
          text: fix.text,
          timeZone: workspace.project.timeZone,
          threshold: workspace.project.threshold,
          system: workspace.project.system,
          from: workspace.dayStarts[0] ?? 0,
          days: WINDOW_DAYS,
        }
      : undefined,
  );

  if (!workspace) {
    return <NoProject go={go} />;
  }
  const { analysis, result, project, dayStarts } = workspace;
  if (analysis.status === 'error') {
    return <AnalysisFailed message={analysis.message} retry={analysis.retry} />;
  }
  if (!result) {
    return <DaySkeleton />;
  }
  if (!report) {
    return <SourceErrors source={result.source} go={go} />;
  }

  const zone = project.timeZone;
  const threshold = report.options.threshold;
  const recurring = summarizeOverloads(report.overloads, zone);
  const worst = recurring[0];
  const colors = jobColors(report);
  const totalRuns = report.jobs.reduce((n, j) => n + j.runs.length, 0);
  const dstCount = report.jobs.reduce((n, j) => n + j.dst.length, 0);
  const assumed = report.jobs.filter((j) => j.job.durationSource === 'default').length;
  const hasCronTz = /^\s*CRON_TZ\s*=/m.test(project.text) || result.source.format === 'cronjob';
  const afterReport = after.status === 'ready' ? after.result.report : undefined;

  // День для графика — тот, где случилась первая перегрузка; без перегрузок — первый день окна.
  const worstDayIndex = Math.max(0, dayStarts.findIndex((s, i) => report.overloads[0] !== undefined && report.overloads[0].start >= s && report.overloads[0].start < (dayStarts[i + 1] ?? s)));
  const chartFrom = dayStarts[worstDayIndex] ?? 0;
  const bucket = 15 * MINUTE;
  const before = loadBuckets(report.segments, chartFrom, chartFrom + 96 * bucket, bucket);
  const afterBuckets = afterReport ? loadBuckets(afterReport.segments, chartFrom, chartFrom + 96 * bucket, bucket) : undefined;

  const download = (): void => {
    if (!fix) {
      return;
    }
    const url = URL.createObjectURL(new Blob([fix.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.source.format === 'cronjob' ? 'cronjobs.fixed.yaml' : 'crontab.fixed';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="conflicts">
      <header className="conflicts-head">
        <span className={`head-icon${report.overloads.length > 0 ? ' is-conflict' : ''}`} aria-hidden>
          {report.overloads.length > 0 ? <TriangleAlert size={36} /> : <Check size={36} />}
        </span>
        <div>
          <h1>{recurring.length > 0 ? `${recurring.length} ${plural(recurring.length, 'повторяющаяся перегрузка', 'повторяющиеся перегрузки', 'повторяющихся перегрузок')}` : 'Перегрузок нет'}</h1>
          <p className="muted">
            {project.title} · {result.source.format === 'cronjob' ? 'CronJob' : 'crontab'} · расчёт {result.tookMs} мс
          </p>
        </div>
        <ul className="head-chips">
          {[`${report.jobs.length} ${plural(report.jobs.length, 'задача', 'задачи', 'задач')}`, `${totalRuns} запусков за неделю`, `сервер: ${zone}`, `порог: ${threshold} одновременно`].map((c) => (
            <li key={c} className="chip chip-plain mono">
              {c}
            </li>
          ))}
        </ul>
      </header>

      <div className="stat-cards">
        <article className="panel stat-card">
          <div className="stat-top">
            <span>{worst ? worst.window : 'Вся неделя'}</span>
            <span className={`chip ${worst ? 'chip-conflict' : 'chip-accent'}`}>{worst ? 'Перегрузка' : 'Норма'}</span>
          </div>
          <strong className={worst ? 'is-conflict' : 'is-accent'}>{worst ? worst.peak : report.peak.count}</strong>
          <p>{worst ? `задачи одновременно при пороге ${threshold}` : `максимум одновременно при пороге ${threshold}`}</p>
          <p className="mono muted">{worst ? worst.jobIds.map((id) => nameOf(report, id)).join(' · ') : 'пересечений внутри порога нет'}</p>
        </article>
        <article className="panel stat-card">
          <div className="stat-top">
            <span>Пик недели</span>
            <span className={`chip ${report.peak.count > threshold ? 'chip-warn' : 'chip-accent'}`}>Нагрузка</span>
          </div>
          <strong className={report.peak.count > threshold ? 'is-warn' : 'is-accent'}>{Math.round((report.peak.count / threshold) * 100)} %</strong>
          <p>от порога в самый плотный момент</p>
          <p className="mono muted">{report.peak.at !== undefined ? `впервые ${hhmm(report.peak.at, zone)} ${zone}` : 'задач нет'}</p>
        </article>
        <article className="panel stat-card">
          <div className="stat-top">
            <span>{dstCount > 0 ? 'Перевод часов' : 'Длительности'}</span>
            <span className={`chip ${dstCount > 0 || assumed > 0 ? 'chip-warn' : 'chip-accent'}`}>{dstCount > 0 ? 'Ловушка' : assumed > 0 ? 'Допущение' : 'Заданы'}</span>
          </div>
          <strong className={dstCount > 0 || assumed > 0 ? 'is-warn' : 'is-accent'}>{dstCount > 0 ? dstCount : `${report.jobs.length - assumed}/${report.jobs.length}`}</strong>
          <p>{dstCount > 0 ? `${plural(dstCount, 'запуск меняется', 'запуска меняются', 'запусков меняются')} из-за перевода часов` : 'задач с известной длительностью'}</p>
          <p className="mono muted">{dstCount > 0 ? 'подробно — во вкладке «Часовые пояса»' : assumed > 0 ? '# krona: duration=40m' : 'расчёт без допущений'}</p>
        </article>
      </div>

      <section className="panel chart-panel" aria-labelledby="chart-title">
        <div className="chart-head">
          <div>
            <h2 id="chart-title">Сколько задач выполняется одновременно</h2>
            <p className="muted">шаг 15 минут · пунктир — порог {threshold}</p>
          </div>
          {afterReport && (
            <strong className="is-accent">
              пик {maxOf(before)} → {maxOf(afterBuckets ?? [])}
            </strong>
          )}
        </div>
        <LoadChart before={before} after={afterBuckets} threshold={threshold} loading={fix !== undefined && after.status === 'loading'} />
      </section>

      <section className="panel pairs-panel" aria-labelledby="pairs-title">
        <h2 id="pairs-title" className="sr-only">
          Пересечения
        </h2>
        {report.conflicts.length === 0 ? (
          <p className="muted">Задачи встречаются, но ни разу не выводят нагрузку за порог — конфликтов нет.</p>
        ) : (
          <ul>
            {report.conflicts.slice(0, 4).map((c) => (
              <li key={c.jobIds.join()} className="surface pair-card">
                <div className="pair-head">
                  {c.jobIds.map((id, i) => (
                    <span key={id} className="pair-job">
                      {i > 0 && <span className="muted">×</span>}
                      <span className="dot" style={{ ['--dot' as string]: colors.get(id) }} />
                      {nameOf(report, id)}
                    </span>
                  ))}
                  <span className="mono is-conflict pair-when">
                    {hhmm(c.overlaps[0]?.start ?? 0, zone)}–{hhmm(c.overlaps[0]?.end ?? 0, zone)}
                  </span>
                </div>
                <p className="muted">
                  Встречаются в перегрузке {c.overlaps.length} {plural(c.overlaps.length, 'раз', 'раза', 'раз')} за неделю, суммарно{' '}
                  {Math.round(c.overlaps.reduce((n, o) => n + (o.end - o.start), 0) / MINUTE)} мин.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="panel outcome" aria-labelledby="outcome-title">
        {fix ? (
          <>
            <div className="outcome-hero">
              <img src="./art/mascot-success.webp" alt="" width={200} height={200} />
              <p className="hand">
                {afterReport && afterReport.overloads.length === 0 ? 'Одна правка — и перегрузок больше нет!' : 'Станет заметно легче!'}
              </p>
            </div>
            <h2 id="outcome-title">{fix.title}</h2>
            <dl className="outcome-stats">
              <div className="surface">
                <dt>Перегрузки за неделю</dt>
                <dd>
                  {report.overloads.length} → {afterReport ? afterReport.overloads.length : '…'}
                </dd>
              </div>
              <div className="surface">
                <dt>Пик одновременности</dt>
                <dd>
                  {report.peak.count} → {afterReport ? afterReport.peak.count : '…'}
                </dd>
              </div>
            </dl>
            <h3 className="label">Изменения в файле</h3>
            <pre className="diff mono" aria-label="Изменения">
              {fix.diff.map((line, i) => (
                <span key={i} className={`diff-${line.kind}`}>
                  {line.kind === 'removed' ? '- ' : line.kind === 'added' ? '+ ' : '  '}
                  {line.text}
                  {'\n'}
                </span>
              ))}
            </pre>
            {!hasCronTz && (
              <p className="tz-warning">
                <TriangleAlert size={18} aria-hidden />
                <span>
                  В файле нет CRON_TZ: время считается в поясе демона ({zone}). Если сервер в другом поясе, добавьте строку <span className="mono">CRON_TZ={zone}</span>.
                </span>
              </p>
            )}
            <div className="outcome-actions">
              <button type="button" className="btn btn-primary" onClick={download}>
                <Download size={20} aria-hidden />
                Скачать исправленный файл
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  update({ text: fix.text });
                  go('day');
                }}
              >
                Применить и открыть сутки
                <ArrowRight size={18} aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <div className="outcome-empty">
            <img src={report.overloads.length > 0 ? './art/mascot-conflict.webp' : './art/mascot-success.webp'} alt="" width={220} height={220} />
            <h2 id="outcome-title">{report.overloads.length > 0 ? 'Готового исправления нет' : 'Исправлять нечего'}</h2>
            <p className="muted">
              {report.overloads.length > 0
                ? 'Перегрузку создают задачи, которые запускаются много раз в сутки. Поднимите порог или сократите длительность — перенос тут не поможет.'
                : `Ни одна задача не выводит нагрузку за порог ${threshold}. Можно спать спокойно.`}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function maxOf(values: readonly number[]): number {
  return values.reduce((m, v) => Math.max(m, v), 0);
}
