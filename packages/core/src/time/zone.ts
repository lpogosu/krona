/**
 * Настенное время в часовом поясе поверх Intl, без сторонних библиотек.
 *
 * Intl умеет только одно направление — момент → местное время. Обратное (местное время →
 * момент) выводится подбором смещения; при переводе часов у местного времени бывает ноль
 * моментов (провал весной) или два (повтор осенью), и это нужно видеть явно, а не терять.
 */

export interface WallTime {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function toWallTime(instant: number, timeZone: string): WallTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts['year'] ?? 0,
    month: parts['month'] ?? 0,
    day: parts['day'] ?? 0,
    hour: parts['hour'] ?? 0,
    minute: parts['minute'] ?? 0,
  };
}

/** Смещение пояса от UTC в минутах в данный момент (Москва — +180). */
export function offsetMinutes(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / MINUTE) * MINUTE;
  return (wallAsUtc(toWallTime(floored, timeZone)) - floored) / MINUTE;
}

/** Местное время, прочитанное так, будто это UTC. Удобная числовая шкала для сравнения. */
export function wallAsUtc(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
}

export function weekday(w: Pick<WallTime, 'year' | 'month' | 'day'>): number {
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

/**
 * Все моменты, в которые часы в поясе показывают это время: 0, 1 или 2.
 *
 * Кандидаты — смещения за сутки до и через сутки после. Переводы часов в реальных
 * поясах не случаются чаще раза в двое суток, поэтому других смещений быть не может.
 */
export function wallTimeToInstants(w: WallTime, timeZone: string): number[] {
  const naive = wallAsUtc(w);
  const offsets = new Set([offsetMinutes(naive - DAY, timeZone), offsetMinutes(naive + DAY, timeZone)]);
  const found = new Set<number>();
  for (const offset of offsets) {
    const candidate = naive - offset * MINUTE;
    if (wallAsUtc(toWallTime(candidate, timeZone)) === naive) {
      found.add(candidate);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Быстрый перевод местного времени в момент для многих запросов в одном поясе.
 *
 * Для суток без перевода часов смещение одно на весь день, и вместо трёх вызовов Intl на
 * каждое время хватает двух на сутки. Возвращает первый момент или ничего для времени
 * в провале — ровно как wallTimeToInstants, только без его цены на горячем пути.
 */
export function wallTimeResolver(timeZone: string): (w: WallTime) => number | undefined {
  const stableOffsets = new Map<number, number | null>();
  return (w) => {
    const midnight = Date.UTC(w.year, w.month - 1, w.day);
    let offset = stableOffsets.get(midnight);
    if (offset === undefined) {
      const before = offsetMinutes(midnight - DAY, timeZone);
      offset = before === offsetMinutes(midnight + 2 * DAY, timeZone) ? before : null;
      stableOffsets.set(midnight, offset);
    }
    return offset === null ? wallTimeToInstants(w, timeZone)[0] : wallAsUtc(w) - offset * MINUTE;
  };
}

/**
 * Момент перевода часов вперёд, внутри которого оказалось несуществующее время `w`.
 * Нужен, чтобы поставить пропущенный запуск туда, где его выполнит cronie.
 */
export function gapTransition(w: WallTime, timeZone: string): number {
  const naive = wallAsUtc(w);
  const before = offsetMinutes(naive - DAY, timeZone);
  // До перевода часы показывали меньше, после — больше; ищем первую минуту с новым смещением.
  let lo = naive - before * MINUTE - 3 * HOUR;
  let hi = naive - before * MINUTE;
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE;
    if (offsetMinutes(mid, timeZone) === before) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

export function addDays(date: Pick<WallTime, 'year' | 'month' | 'day'>, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function formatOffset(minutes: number): string {
  if (minutes === 0) {
    return 'UTC';
  }
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}
