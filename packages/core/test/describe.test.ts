import { describe, expect, it } from 'vitest';

import { describeCron, parseCron, plural } from '../src/index.js';

function text(expression: string): string {
  const parsed = parseCron(expression);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return describeCron(parsed.value);
}

describe('describeCron', () => {
  it.each([
    ['0 3 * * *', 'каждый день в 03:00'],
    ['*/15 * * * *', 'каждые 15 минут'],
    ['*/5 * * * 1-5', 'каждые 5 минут по будням'],
    ['0 6 * * 1-5', 'по будням в 06:00'],
    ['0 8,16 * * *', 'каждый день в 08:00 и 16:00'],
    ['0 10 * * 0,6', 'по выходным в 10:00'],
    ['30 2 * * 1', 'по понедельникам в 02:30'],
    ['0 0 1 * *', '1-го числа в 00:00'],
    ['15 * * * *', 'каждый час в :15'],
    ['0 */2 * * *', 'каждые 2 часа в :00'],
    ['* * * * *', 'каждую минуту'],
    ['0 9 * 1 *', 'каждый день в январе в 09:00'],
    ['@hourly', 'каждый час'],
  ])('%s → %s', (expression, expected) => {
    expect(text(expression)).toBe(expected);
  });

  it('falls back to the raw expression instead of guessing', () => {
    expect(text('7,19 1-5 10-20 * 2')).toBe('по расписанию 7,19 1-5 10-20 * 2');
  });
});

describe('plural', () => {
  it.each([
    [1, 'минуту'],
    [2, 'минуты'],
    [5, 'минут'],
    [11, 'минут'],
    [12, 'минут'],
    [21, 'минуту'],
    [22, 'минуты'],
  ])('%i', (n, form) => {
    expect(plural(n, 'минуту', 'минуты', 'минут')).toBe(form);
  });
});
