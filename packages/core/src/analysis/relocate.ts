import { fixedTimeOfDay } from '../cron/expression.js';
import { MINUTE, wallTimeResolver } from '../time/zone.js';
import { maxLoadExcluding, type Segment } from './load.js';
import type { JobRuns } from './runs.js';

export interface TimeRange {
  /** Минуты от начала суток по часам задачи, включительно. */
  readonly from: number;
  readonly to: number;
}

export type Relocation =
  | { readonly movable: false; readonly reason: string }
  | {
      readonly movable: true;
      /** Время старта, при котором задача ни разу не выводит нагрузку за порог. */
      readonly windows: readonly TimeRange[];
      /** Ближайшее такое время после текущего; нет, если переносить незачем или некуда. */
      readonly suggestion?: { readonly hour: number; readonly minute: number; readonly shiftMinutes: number };
    };

export const RELOCATION_STEP_MINUTES = 5;

/**
 * Куда перенести задачу, чтобы она не создавала перегрузок.
 *
 * Переносятся только задачи с одним временем в сутки: для «каждые 15 минут» перенос —
 * это другое расписание, а не сдвиг, и такой совет был бы подменой решения.
 * Проверка идёт по тем же дням, в которые задача реально запускается в окне анализа.
 */
export function relocate(target: JobRuns, segments: readonly Segment[], threshold: number): Relocation {
  const time = fixedTimeOfDay(target.job.schedule);
  if (time === undefined) {
    return { movable: false, reason: 'Задача запускается несколько раз в сутки — её переносит только смена расписания' };
  }
  if (target.runs.length === 0) {
    return { movable: false, reason: 'В окне анализа у задачи нет запусков' };
  }

  const duration = target.durationMinutes * MINUTE;
  const dates = target.runs.map((r) => ({ year: r.wall.year, month: r.wall.month, day: r.wall.day }));
  const resolve = wallTimeResolver(target.job.timeZone);

  const fits = (minuteOfDay: number): boolean =>
    dates.every((date) => {
      const instant = resolve({ ...date, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 });
      // Время, которого в эти сутки нет из-за перевода часов, не предлагаем.
      return instant !== undefined && maxLoadExcluding(segments, instant, instant + duration, target.job.id) + 1 <= threshold;
    });

  const ok: number[] = [];
  for (let m = 0; m < 24 * 60; m += RELOCATION_STEP_MINUTES) {
    if (fits(m)) {
      ok.push(m);
    }
  }

  const windows: TimeRange[] = [];
  for (const m of ok) {
    const last = windows.at(-1);
    if (last !== undefined && last.to + RELOCATION_STEP_MINUTES === m) {
      windows[windows.length - 1] = { from: last.from, to: m };
    } else {
      windows.push({ from: m, to: m });
    }
  }

  const current = time.hour * 60 + time.minute;
  const next = ok.find((m) => m > current) ?? ok[0];
  if (next === undefined || fits(current)) {
    return { movable: true, windows };
  }
  const shiftMinutes = (next - current + 24 * 60) % (24 * 60);
  return { movable: true, windows, suggestion: { hour: Math.floor(next / 60), minute: next % 60, shiftMinutes } };
}
