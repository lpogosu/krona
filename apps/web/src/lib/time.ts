import { addDays, gapTransition, pad, toWallTime, wallTimeToInstants, type WallTime } from '@krona/core';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Момент местной полуночи; если полночи в эти сутки нет из-за перевода часов — первый момент суток. */
export function startOfDay(date: Pick<WallTime, 'year' | 'month' | 'day'>, timeZone: string): number {
  const midnight = { ...date, hour: 0, minute: 0 };
  return wallTimeToInstants(midnight, timeZone)[0] ?? gapTransition(midnight, timeZone);
}

export function todayIn(timeZone: string, now = Date.now()): { year: number; month: number; day: number } {
  const w = toWallTime(now, timeZone);
  return { year: w.year, month: w.month, day: w.day };
}

export function parseDate(text: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, day = 1] = text.split('-').map(Number);
  return { year, month, day };
}

export function formatDate(date: Pick<WallTime, 'year' | 'month' | 'day'>): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function dayStarts(first: Pick<WallTime, 'year' | 'month' | 'day'>, days: number, timeZone: string): number[] {
  return Array.from({ length: days + 1 }, (_, i) => startOfDay(addDays(first, i), timeZone));
}

export function hhmm(instant: number, timeZone: string): string {
  const w = toWallTime(instant, timeZone);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

export function minuteOfDay(instant: number, timeZone: string): number {
  const w = toWallTime(instant, timeZone);
  return w.hour * 60 + w.minute;
}

export function formatMinuteOfDay(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
}

export function dayTitle(date: Pick<WallTime, 'year' | 'month' | 'day'>): string {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return `${WEEKDAYS[weekday] ?? ''}, ${date.day} ${MONTHS_GENITIVE[date.month - 1] ?? ''}`;
}

export function shortDay(date: Pick<WallTime, 'year' | 'month' | 'day'>): string {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return `${WEEKDAYS[weekday] ?? ''} ${date.day}`;
}

export function isWeekend(date: Pick<WallTime, 'year' | 'month' | 'day'>): boolean {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Пояса в выпадающем списке: частые для серверов и текущий пояс браузера. */
export function timeZoneOptions(current: string): string[] {
  const common = ['UTC', 'Europe/Moscow', 'Europe/Berlin', 'Europe/London', 'America/New_York', 'Asia/Dubai', 'Asia/Novosibirsk', 'Asia/Tokyo'];
  const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([current, browser, ...common])];
}
