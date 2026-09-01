import { parseCron, type CronSchedule } from '../cron/expression.js';
import type { Job } from '../jobs/job.js';
import { DAY, MINUTE } from '../time/zone.js';
import { expandRuns, type Run } from './runs.js';

export interface StaggeredJob {
  readonly jobId: string;
  readonly from: string;
  readonly to: string;
}

export interface StaggerPlan {
  readonly changes: readonly StaggeredJob[];
  readonly peakBefore: number;
  readonly peakAfter: number;
  /** Сколько минут суток после разноса остаётся выше порога. */
  readonly overloadedMinutesAfter: number;
}

/** Шаг минут, если задача идёт «каждые N минут» с N, делящим час, и её можно разнести. */
function minuteStep(schedule: CronSchedule): { step: number; offset: number } | undefined {
  const values = schedule.minute.values;
  const [first, second] = values;
  if (first === undefined || second === undefined || schedule.hour.values.length !== 24) {
    return undefined;
  }
  const step = second - first;
  if (60 % step !== 0 || values.length !== 60 / step || !values.every((v, i) => v === first + i * step)) {
    return undefined;
  }
  return { step, offset: first };
}

/**
 * Нагрузка суток поминутно. Все запуски начинаются в целую минуту и длятся целые минуты,
 * поэтому массив из 1440 чисел точен, а добавить задачу или найти максимум под ней — это
 * проход по её минутам, без сортировки всех интервалов заново на каждое смещение.
 */
class MinuteLoad {
  readonly counts = new Uint16Array(24 * 60);

  constructor(private readonly from: number) {}

  add(runs: readonly Run[]): void {
    this.each(runs, (m) => {
      this.counts[m] = (this.counts[m] ?? 0) + 1;
    });
  }

  /** Пик нагрузки под запусками, если бы они добавились. */
  peakWith(runs: readonly Run[]): number {
    let max = 0;
    this.each(runs, (m) => {
      max = Math.max(max, (this.counts[m] ?? 0) + 1);
    });
    return max;
  }

  peak(): number {
    return this.counts.reduce((max, v) => Math.max(max, v), 0);
  }

  above(threshold: number): number {
    return this.counts.reduce((n, v) => n + (v > threshold ? 1 : 0), 0);
  }

  private each(runs: readonly Run[], visit: (minute: number) => void): void {
    for (const run of runs) {
      const first = Math.max(0, Math.floor((run.start - this.from) / MINUTE));
      const last = Math.min(this.counts.length, Math.ceil((run.end - this.from) / MINUTE));
      for (let m = first; m < last; m++) {
        visit(m);
      }
    }
  }
}

/**
 * Разнос частых задач по минутам: «*\/5» у пяти сервисов — это пять стартов в одну секунду.
 *
 * Жадный подбор: задачи от самой долгой к самой короткой, каждой — смещение с наименьшим
 * пиком при уже расставленных. Полный перебор смещений растёт как step^n и на десятке задач
 * уже не укладывается в отклик интерфейса.
 */
export function staggerPlan(jobs: readonly Job[], threshold: number, from: number): StaggerPlan | undefined {
  const movable = jobs
    .map((job) => ({ job, step: minuteStep(job.schedule) }))
    .filter((x): x is { job: Job; step: { step: number; offset: number } } => x.step !== undefined);
  if (movable.length < 2) {
    return undefined;
  }

  // Одних суток хватает: у частых задач рисунок нагрузки повторяется каждый час.
  const to = from + DAY;
  const before = new MinuteLoad(from);
  jobs.forEach((job) => {
    before.add(expandRuns(job, from, to).runs);
  });

  const placed = new MinuteLoad(from);
  jobs
    .filter((job) => !movable.some((m) => m.job === job))
    .forEach((job) => {
      placed.add(expandRuns(job, from, to).runs);
    });

  const changes: StaggeredJob[] = [];
  const order = [...movable].sort((a, b) => b.job.durationMinutes - a.job.durationMinutes);
  for (const { job, step } of order) {
    let best: { offset: number; peak: number; runs: readonly Run[] } | undefined;
    for (let offset = 0; offset < step.step; offset++) {
      const runs = expandRuns({ ...job, schedule: withMinuteOffset(job.schedule, step.step, offset) }, from, to).runs;
      const peak = placed.peakWith(runs);
      // При равенстве оставляем текущее смещение: лишняя правка crontab ничего не даёт.
      if (best === undefined || peak < best.peak || (peak === best.peak && offset === step.offset)) {
        best = { offset, peak, runs };
      }
    }
    if (best === undefined) {
      continue;
    }
    placed.add(best.runs);
    if (best.offset !== step.offset) {
      changes.push({ jobId: job.id, from: job.schedule.minute.source, to: withMinuteOffset(job.schedule, step.step, best.offset).minute.source });
    }
  }

  const peakBefore = before.peak();
  const peakAfter = placed.peak();
  if (changes.length === 0 || peakAfter >= peakBefore) {
    return undefined;
  }
  return { changes, peakBefore, peakAfter, overloadedMinutesAfter: placed.above(threshold) };
}

function withMinuteOffset(schedule: CronSchedule, step: number, offset: number): CronSchedule {
  const minute = offset === 0 ? `*/${step}` : `${offset}-59/${step}`;
  const rest = [schedule.hour.source, schedule.dayOfMonth.source, schedule.month.source, schedule.dayOfWeek.source].join(' ');
  const parsed = parseCron(`${minute} ${rest}`);
  if (!parsed.ok) {
    throw new Error(`unreachable: generated invalid expression ${minute} ${rest}`);
  }
  return parsed.value;
}
