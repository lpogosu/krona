import { summarizeOverloads, type JobRuns, type Overload, type Report, type Run } from '@krona/core';

const PALETTE_SIZE = 8;

/** Цвет закреплён за задачей по порядку в файле: при пересчёте цвета не перемешиваются. */
export function jobColors(report: Report): Map<string, string> {
  return new Map(report.jobs.map((j, i) => [j.job.id, `var(--job-${(i % PALETTE_SIZE) + 1})`]));
}

export interface DayView {
  readonly start: number;
  readonly end: number;
  readonly runs: ReadonlyMap<string, readonly Run[]>;
  readonly total: number;
  readonly overloads: readonly Overload[];
}

export function dayView(report: Report, start: number, end: number): DayView {
  const runs = new Map<string, Run[]>();
  let total = 0;
  for (const { job, runs: list } of report.jobs) {
    const inDay = list.filter((r) => r.start >= start && r.start < end);
    runs.set(job.id, inDay);
    total += inDay.length;
  }
  const overloads = report.overloads.filter((o) => o.start < end && o.end > start);
  return { start, end, runs, total, overloads };
}

export function nameOf(report: Report, id: string): string {
  return report.jobs.find((j) => j.job.id === id)?.job.name ?? id;
}

export function findJob(report: Report, id: string | undefined): JobRuns | undefined {
  return id === undefined ? undefined : report.jobs.find((j) => j.job.id === id);
}

/** Задачи, которые попадали в перегрузки хотя бы раз, — для бейджа в списке. */
export function jobsInOverloads(report: Report): Set<string> {
  return new Set(report.overloads.flatMap((o) => o.jobIds));
}

export function recurringCount(report: Report, timeZone: string): number {
  return summarizeOverloads(report.overloads, timeZone).length;
}
