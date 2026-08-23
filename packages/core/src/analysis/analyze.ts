import { withTimeOfDay } from '../cron/expression.js';
import type { Job } from '../jobs/job.js';
import { conflicts, type Conflict } from './conflicts.js';
import { loadSegments, overloads, peakOf, type Overload, type Peak, type Segment } from './load.js';
import { relocate, type Relocation } from './relocate.js';
import { expandRuns, type JobRuns } from './runs.js';
import { staggerPlan, type StaggerPlan } from './stagger.js';

export interface AnalyzeOptions {
  readonly from: number;
  readonly to: number;
  /** Сколько задач может работать одновременно, не мешая друг другу. */
  readonly threshold: number;
}

export interface MoveSuggestion {
  readonly jobId: string;
  readonly hour: number;
  readonly minute: number;
  readonly shiftMinutes: number;
  /** Сколько эпизодов перегрузки останется, если сделать только этот перенос. */
  readonly overloadsAfter: number;
  readonly peakAfter: number;
}

export interface Report {
  readonly options: AnalyzeOptions;
  readonly jobs: readonly JobRuns[];
  readonly segments: readonly Segment[];
  readonly peak: Peak;
  readonly overloads: readonly Overload[];
  readonly conflicts: readonly Conflict[];
  readonly relocations: ReadonlyMap<string, Relocation>;
  /** Лучшие переносы: сначала те, что убирают больше перегрузок, затем с меньшим сдвигом. */
  readonly suggestions: readonly MoveSuggestion[];
  /** Разнос частых задач по минутам, если он снижает пик. */
  readonly stagger?: StaggerPlan;
}

export const DEFAULT_THRESHOLD = 2;

const MAX_VERIFIED_SUGGESTIONS = 5;

export function analyze(jobs: readonly Job[], options: AnalyzeOptions): Report {
  const expanded = jobs.map((job) => expandRuns(job, options.from, options.to));
  const runs = expanded.flatMap((j) => j.runs);
  const segments = loadSegments(runs);
  const episodes = overloads(segments, options.threshold);

  const relocations = new Map<string, Relocation>();
  const involved = new Set(episodes.flatMap((e) => e.jobIds));
  const candidates: { target: JobRuns; hour: number; minute: number; shiftMinutes: number }[] = [];

  for (const target of expanded) {
    if (!involved.has(target.job.id)) {
      continue;
    }
    const relocation = relocate(target, segments, options.threshold);
    relocations.set(target.job.id, relocation);
    if (relocation.movable && relocation.suggestion !== undefined) {
      candidates.push({ target, ...relocation.suggestion });
    }
  }

  // Полный пересчёт недели дорог, поэтому проверяются только ближайшие переносы: совет со
  // сдвигом на восемь часов читатель всё равно не применит, если есть сдвиг на десять минут.
  candidates.sort((a, b) => a.shiftMinutes - b.shiftMinutes);
  const suggestions: MoveSuggestion[] = candidates.slice(0, MAX_VERIFIED_SUGGESTIONS).map(({ target, hour, minute, shiftMinutes }) => {
    const moved = expandRuns({ ...target.job, schedule: withTimeOfDay(target.job.schedule, hour, minute) }, options.from, options.to);
    const after = loadSegments([...runs.filter((r) => r.jobId !== target.job.id), ...moved.runs]);
    return {
      jobId: target.job.id,
      hour,
      minute,
      shiftMinutes,
      overloadsAfter: overloads(after, options.threshold).length,
      peakAfter: peakOf(after).count,
    };
  });

  suggestions.sort((a, b) => a.overloadsAfter - b.overloadsAfter || a.shiftMinutes - b.shiftMinutes);

  const stagger = episodes.length > 0 ? staggerPlan(jobs, options.threshold, options.from) : undefined;

  return {
    ...(stagger ? { stagger } : {}),
    options,
    jobs: expanded,
    segments,
    peak: peakOf(segments),
    overloads: episodes,
    conflicts: conflicts(runs, episodes),
    relocations,
    suggestions,
  };
}
