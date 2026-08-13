import { describe, expect, it } from 'vitest';

import {
  gapTransition,
  occurrences,
  offsetMinutes,
  parseCron,
  toWallTime,
  wallTimeToInstants,
  type CronSchedule,
} from '../src/index.js';

const iso = (s: string): number => Date.parse(s);
const at = (t: number): string => new Date(t).toISOString().slice(0, 16);

function parse(expression: string): CronSchedule {
  const result = parseCron(expression);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe('time zones', () => {
  it('reads wall time and offset', () => {
    const t = iso('2026-09-14T00:00:00Z');
    expect(toWallTime(t, 'Europe/Moscow')).toEqual({ year: 2026, month: 9, day: 14, hour: 3, minute: 0 });
    expect(offsetMinutes(t, 'America/New_York')).toBe(-240);
  });

  it('finds no instant for a wall time inside the spring-forward gap', () => {
    // Берлин, 29 марта 2026: в 02:00 часы переводятся на 03:00.
    expect(wallTimeToInstants({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Berlin')).toEqual([]);
    expect(at(gapTransition({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Berlin'))).toBe('2026-03-29T01:00');
  });

  it('finds two instants for a wall time repeated in autumn', () => {
    const instants = wallTimeToInstants({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, 'Europe/Berlin');
    expect(instants.map(at)).toEqual(['2026-10-25T00:30', '2026-10-25T01:30']);
  });

  it('handles zones with a half-hour offset', () => {
    expect(wallTimeToInstants({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, 'Asia/Kolkata').map(at)).toEqual(['2025-12-31T18:30']);
  });
});

describe('occurrences', () => {
  it('lists runs in a half-open window in the job time zone', () => {
    const { occurrences: list } = occurrences(parse('0 3 * * *'), 'Europe/Moscow', iso('2026-09-14T00:00:00Z'), iso('2026-09-16T00:00:00Z'));
    expect(list.map((o) => at(o.instant))).toEqual(['2026-09-14T00:00', '2026-09-15T00:00']);
  });

  it('excludes a run exactly at the window end', () => {
    const { occurrences: list } = occurrences(parse('0 0 * * *'), 'UTC', iso('2026-09-14T00:00:00Z'), iso('2026-09-15T00:00:00Z'));
    expect(list).toHaveLength(1);
  });

  it('respects weekdays across the local date boundary', () => {
    // 23:30 по Нью-Йорку в понедельник — это уже вторник по UTC.
    const { occurrences: list } = occurrences(parse('30 23 * * 1'), 'America/New_York', iso('2026-09-13T00:00:00Z'), iso('2026-09-20T00:00:00Z'));
    expect(list.map((o) => at(o.instant))).toEqual(['2026-09-15T03:30']);
  });

  it('counts every-minute runs over a week', () => {
    const { occurrences: list } = occurrences(parse('* * * * *'), 'Europe/Moscow', iso('2026-09-14T00:00:00Z'), iso('2026-09-21T00:00:00Z'));
    expect(list).toHaveLength(7 * 24 * 60);
  });

  describe('daylight saving time, cronie semantics', () => {
    const springDay = [iso('2026-03-28T12:00:00Z'), iso('2026-03-29T12:00:00Z')] as const;
    const autumnDay = [iso('2026-10-24T12:00:00Z'), iso('2026-10-25T12:00:00Z')] as const;

    it('runs a fixed-time job from the gap at the moment of the switch', () => {
      const result = occurrences(parse('30 2 * * *'), 'Europe/Berlin', ...springDay);
      expect(result.occurrences.map((o) => [at(o.instant), o.dst])).toEqual([['2026-03-29T01:00', 'shifted']]);
      expect(result.dst.map((d) => d.effect)).toEqual(['shifted']);
    });

    it('runs several gap times of one job only once', () => {
      const result = occurrences(parse('0,30 2 * * *'), 'Europe/Berlin', ...springDay);
      expect(result.occurrences).toHaveLength(1);
      expect(result.dst).toHaveLength(2);
    });

    it('drops wildcard runs that fall into the gap', () => {
      const result = occurrences(parse('*/30 * * * *'), 'Europe/Berlin', ...springDay);
      // 24 часа по UTC — это 48 получасов. По местным часам окно длиннее на час, но этот
      // час (02:00–03:00) не наступает, и два его запуска пропадают, а не переносятся.
      expect(result.occurrences).toHaveLength(48);
      expect(result.dst.map((d) => d.effect)).toEqual(['skipped', 'skipped']);
    });

    it('runs a fixed-time job once when the hour repeats', () => {
      const result = occurrences(parse('30 2 * * *'), 'Europe/Berlin', ...autumnDay);
      expect(result.occurrences.map((o) => [at(o.instant), o.dst])).toEqual([['2026-10-25T00:30', 'deduplicated']]);
    });

    it('runs wildcard jobs twice in the repeated hour', () => {
      const result = occurrences(parse('0 * * * *'), 'Europe/Berlin', ...autumnDay);
      // Сутки по UTC — 24 часа и 24 запуска, хотя по местным часам 02:00 было дважды.
      expect(result.occurrences).toHaveLength(24);
      expect(result.occurrences.filter((o) => o.dst === 'doubled').map((o) => at(o.instant))).toEqual([
        '2026-10-25T00:00',
        '2026-10-25T01:00',
      ]);
    });
  });
});
