import type { Run } from './runs.js';

/** Отрезок, на котором число одновременно работающих задач не меняется. */
export interface Segment {
  readonly start: number;
  readonly end: number;
  readonly count: number;
  readonly jobIds: readonly string[];
}

/**
 * Развёртка по событиям начала и конца: O(n log n) вместо проверки каждой минуты.
 * В одну точку времени сначала обрабатываются окончания — интервалы полуоткрытые.
 */
export function loadSegments(runs: readonly Run[]): Segment[] {
  const events: { at: number; delta: 1 | -1; jobId: string }[] = [];
  for (const run of runs) {
    events.push({ at: run.start, delta: 1, jobId: run.jobId }, { at: run.end, delta: -1, jobId: run.jobId });
  }
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  const active = new Map<string, number>();
  const segments: Segment[] = [];
  let count = 0;
  let i = 0;
  while (i < events.length) {
    const at = events[i]?.at ?? 0;
    while (i < events.length && events[i]?.at === at) {
      const event = events[i];
      if (event !== undefined) {
        count += event.delta;
        const next = (active.get(event.jobId) ?? 0) + event.delta;
        if (next === 0) {
          active.delete(event.jobId);
        } else {
          active.set(event.jobId, next);
        }
      }
      i++;
    }
    const nextAt = events[i]?.at;
    if (count > 0 && nextAt !== undefined) {
      segments.push({ start: at, end: nextAt, count, jobIds: [...active.keys()].sort() });
    }
  }
  return segments;
}

export interface Peak {
  readonly count: number;
  /** Первый момент, когда нагрузка достигла пика; нет, если задач не было вовсе. */
  readonly at?: number;
}

export function peakOf(segments: readonly Segment[]): Peak {
  let best: Peak = { count: 0 };
  for (const s of segments) {
    if (s.count > best.count) {
      best = { count: s.count, at: s.start };
    }
  }
  return best;
}

/** Максимум одновременных задач в каждой корзине окна — для графиков и полос таймлайна. */
export function loadBuckets(segments: readonly Segment[], from: number, to: number, bucketMs: number): number[] {
  const buckets = new Array<number>(Math.ceil((to - from) / bucketMs)).fill(0);
  for (const s of segments) {
    const first = Math.max(0, Math.floor((s.start - from) / bucketMs));
    const last = Math.min(buckets.length - 1, Math.ceil((s.end - from) / bucketMs) - 1);
    for (let b = first; b <= last; b++) {
      buckets[b] = Math.max(buckets[b] ?? 0, s.count);
    }
  }
  return buckets;
}

export interface Overload {
  readonly start: number;
  readonly end: number;
  readonly peak: number;
  readonly jobIds: readonly string[];
}

/** Промежутки, где задач больше порога. Соседние отрезки склеиваются в один эпизод. */
export function overloads(segments: readonly Segment[], threshold: number): Overload[] {
  const out: { start: number; end: number; peak: number; jobIds: Set<string> }[] = [];
  for (const s of segments) {
    if (s.count <= threshold) {
      continue;
    }
    const last = out.at(-1);
    if (last !== undefined && last.end === s.start) {
      last.end = s.end;
      last.peak = Math.max(last.peak, s.count);
      s.jobIds.forEach((id) => last.jobIds.add(id));
    } else {
      out.push({ start: s.start, end: s.end, peak: s.count, jobIds: new Set(s.jobIds) });
    }
  }
  return out.map((o) => ({ ...o, jobIds: [...o.jobIds].sort() }));
}

/** Наибольшая нагрузка на отрезке [start, end) — для проверки кандидатов при переносе. */
export function maxLoadBetween(segments: readonly Segment[], start: number, end: number): number {
  return maxLoadExcluding(segments, start, end, undefined);
}

/**
 * То же, но без одной задачи: при подборе нового времени её нынешние запуски не должны
 * мешать самой себе. Так общая развёртка строится один раз на весь анализ, а не заново
 * для каждой задачи-кандидата.
 */
export function maxLoadExcluding(segments: readonly Segment[], start: number, end: number, jobId: string | undefined): number {
  let lo = 0;
  let hi = segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((segments[mid]?.end ?? 0) <= start) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  let max = 0;
  for (let i = lo; i < segments.length; i++) {
    const s = segments[i];
    if (s === undefined || s.start >= end) {
      break;
    }
    max = Math.max(max, jobId !== undefined && s.jobIds.includes(jobId) ? s.count - 1 : s.count);
  }
  return max;
}
