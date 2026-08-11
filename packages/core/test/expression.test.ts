import { describe, expect, it } from 'vitest';

import { fixedTimeOfDay, matchesDate, parseCron, withTimeOfDay, type CronSchedule } from '../src/index.js';

function parse(expression: string): CronSchedule {
  const result = parseCron(expression);
  if (!result.ok) {
    throw new Error(`${expression}: ${result.error.message}`);
  }
  return result.value;
}

function errorOf(expression: string) {
  const result = parseCron(expression);
  if (result.ok) {
    throw new Error(`${expression} unexpectedly parsed`);
  }
  return result.error;
}

describe('parseCron', () => {
  it('expands lists, ranges and steps', () => {
    const s = parse('0,30 8-10 */10 1-12/3 mon-fri');
    expect(s.minute.values).toEqual([0, 30]);
    expect(s.hour.values).toEqual([8, 9, 10]);
    expect(s.dayOfMonth.values).toEqual([1, 11, 21, 31]);
    expect(s.month.values).toEqual([1, 4, 7, 10]);
    expect(s.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it('treats a start value with a step as running to the end of the field', () => {
    expect(parse('5/20 * * * *').minute.values).toEqual([5, 25, 45]);
  });

  it('folds Sunday written as 7 into 0 without duplicates', () => {
    expect(parse('0 0 * * 0,7').dayOfWeek.values).toEqual([0]);
    expect(parse('0 0 * * 5-7').dayOfWeek.values).toEqual([0, 5, 6]);
  });

  it('accepts names in any case', () => {
    expect(parse('0 0 * JAN,Dec Sun').month.values).toEqual([1, 12]);
  });

  it('marks a field as wildcard by its first character, like cronie', () => {
    const s = parse('*/15 3 * * *');
    expect(s.minute.wildcard).toBe(true);
    expect(s.hour.wildcard).toBe(false);
  });

  it('expands macros and keeps the macro as the expression', () => {
    const s = parse('@daily');
    expect(s.expression).toBe('@daily');
    expect([s.minute.values, s.hour.values]).toEqual([[0], [0]]);
  });

  it('rejects @reboot because it has no time', () => {
    expect(errorOf('@reboot').message).toContain('не привязан ко времени');
  });

  it('points at the offending field and characters', () => {
    const error = errorOf('0 25 * * *');
    expect(error.field).toBe('hour');
    expect(error.offset).toBe(2);
    expect(error.length).toBe(2);
    expect(error.message).toContain('0–23');
  });

  it('offsets errors past leading whitespace', () => {
    expect(errorOf('  0 3 * * xyz').offset).toBe(10);
  });

  it.each([
    ['0 3 * *', 'Ожидается 5 полей'],
    ['0 22-2 * * *', 'в обратную сторону'],
    ['*/0 * * * *', 'нулевым'],
    ['0 3 * * mon/fri/2', 'Лишний'],
    ['0 3 1,,2 * *', 'Пустой элемент'],
    ['@often', 'Неизвестный макрос'],
  ])('rejects %s', (expression, fragment) => {
    expect(errorOf(expression).message).toContain(fragment);
  });
});

describe('matchesDate', () => {
  it('uses OR when both day fields are restricted', () => {
    const s = parse('0 0 13 * 5');
    // 13 сентября 2026 — воскресенье, 18-е — пятница, 14-е — ни то ни другое.
    expect(matchesDate(s, 9, 13, 0)).toBe(true);
    expect(matchesDate(s, 9, 18, 5)).toBe(true);
    expect(matchesDate(s, 9, 14, 1)).toBe(false);
  });

  it('uses AND when day of month is a stepped wildcard', () => {
    const s = parse('0 0 */2 * 1');
    expect(matchesDate(s, 9, 1, 2)).toBe(false);
    expect(matchesDate(s, 9, 2, 1)).toBe(false);
    expect(matchesDate(s, 9, 7, 1)).toBe(true);
  });
});

describe('time of day helpers', () => {
  it('finds a single fixed time and nothing for repeated schedules', () => {
    expect(fixedTimeOfDay(parse('30 3 * * 1-5'))).toEqual({ hour: 3, minute: 30 });
    expect(fixedTimeOfDay(parse('0 8,16 * * *'))).toBeUndefined();
    expect(fixedTimeOfDay(parse('*/15 * * * *'))).toBeUndefined();
  });

  it('replaces the time but keeps the day fields as written', () => {
    expect(withTimeOfDay(parse('0 3 1-7 * mon'), 4, 5).expression).toBe('5 4 1-7 * mon');
    expect(withTimeOfDay(parse('@weekly'), 4, 0).expression).toBe('0 4 * * 0');
  });
});
