import { pad } from '../cron/describe.js';
import { toWallTime } from '../time/zone.js';
import type { Overload } from './load.js';

export interface RecurringOverload {
  /** «03:30–03:40» по часам выбранного пояса. */
  readonly window: string;
  readonly startMinute: number;
  readonly peak: number;
  readonly jobIds: readonly string[];
  /** Сколько раз эпизод случился в окне анализа. */
  readonly occurrences: number;
  readonly first: number;
}

/**
 * Одна и та же перегрузка каждый день — одна находка, а не семь. Эпизоды склеиваются по
 * времени суток в выбранном поясе и составу задач; всё, что отличается, остаётся отдельно.
 */
export function summarizeOverloads(episodes: readonly Overload[], timeZone: string): RecurringOverload[] {
  const groups = new Map<string, { window: string; startMinute: number; peak: number; jobIds: readonly string[]; occurrences: number; first: number }>();
  for (const episode of episodes) {
    const start = toWallTime(episode.start, timeZone);
    const end = toWallTime(episode.end, timeZone);
    const window = `${pad(start.hour)}:${pad(start.minute)}–${pad(end.hour)}:${pad(end.minute)}`;
    const key = `${window}|${episode.jobIds.join(',')}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        window,
        startMinute: start.hour * 60 + start.minute,
        peak: episode.peak,
        jobIds: episode.jobIds,
        occurrences: 1,
        first: episode.start,
      });
    } else {
      group.occurrences += 1;
      group.peak = Math.max(group.peak, episode.peak);
    }
  }
  return [...groups.values()].sort((a, b) => b.peak - a.peak || b.occurrences - a.occurrences || a.startMinute - b.startMinute);
}
