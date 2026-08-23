import type { Job } from '../jobs/job.js';
import { occurrences, type DstNotice } from '../schedule/occurrences.js';
import { MINUTE, type WallTime } from '../time/zone.js';

export interface Run {
  readonly jobId: string;
  readonly start: number;
  /** Не включается: задача, закончившая работу в 03:40, не пересекается с той, что стартует в 03:40. */
  readonly end: number;
  readonly wall: WallTime;
}

export interface JobRuns {
  readonly job: Job;
  /** Длительность, с которой шёл расчёт; для задач без аннотации может быть урезана. */
  readonly durationMinutes: number;
  readonly runs: Run[];
  readonly dst: DstNotice[];
  /** Запуск начинается раньше, чем закончился предыдущий — при заданной вручную длительности. */
  readonly selfOverlap: boolean;
}

export function expandRuns(job: Job, from: number, to: number): JobRuns {
  const { occurrences: list, dst } = occurrences(job.schedule, job.timeZone, from, to);
  const gap = smallestGap(list.map((o) => o.instant));

  // Длительность по умолчанию — допущение. Если оно длиннее интервала между запусками,
  // задача «каждую минуту» сама себе создала бы перегрузку, которой в жизни нет.
  const durationMinutes =
    job.durationSource === 'default' && gap !== undefined ? Math.max(1, Math.min(job.durationMinutes, gap / MINUTE)) : job.durationMinutes;

  const runs = list.map((o) => ({ jobId: job.id, start: o.instant, end: o.instant + durationMinutes * MINUTE, wall: o.wall }));
  const selfOverlap = job.durationSource === 'annotation' && gap !== undefined && gap < durationMinutes * MINUTE;
  return { job, durationMinutes, runs, dst, selfOverlap };
}

function smallestGap(instants: readonly number[]): number | undefined {
  let best: number | undefined;
  for (let i = 1; i < instants.length; i++) {
    const gap = (instants[i] ?? 0) - (instants[i - 1] ?? 0);
    if (gap > 0 && (best === undefined || gap < best)) {
      best = gap;
    }
  }
  return best;
}
