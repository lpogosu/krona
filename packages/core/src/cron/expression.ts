/**
 * Разбор пятипольного выражения cron в множества допустимых значений.
 *
 * Семантика повторяет cronie (Vixie cron), потому что именно он стоит на большинстве
 * Linux-серверов: воскресенье — это и 0, и 7; имена месяцев и дней недели не зависят от
 * регистра; день месяца и день недели объединяются через ИЛИ, если оба поля ограничены.
 */

export type FieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export const FIELD_ORDER: readonly FieldName[] = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];

interface FieldSpec {
  readonly min: number;
  readonly max: number;
  readonly names?: readonly string[];
  readonly label: string;
}

const FIELDS: Readonly<Record<FieldName, FieldSpec>> = {
  minute: { min: 0, max: 59, label: 'минута' },
  hour: { min: 0, max: 23, label: 'час' },
  dayOfMonth: { min: 1, max: 31, label: 'день месяца' },
  month: {
    min: 1,
    max: 12,
    label: 'месяц',
    names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  },
  // 7 разрешён как синоним воскресенья и сворачивается в 0 после разбора.
  dayOfWeek: { min: 0, max: 7, label: 'день недели', names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
};

const MACROS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

export interface CronField {
  /** Исходный текст поля — нужен для подсветки ошибки и для правки строки при переносе. */
  readonly source: string;
  /** Отсортированные значения без повторов. */
  readonly values: readonly number[];
  /**
   * Поле начинается со звёздочки (`*` или `*\/15`). cronie смотрит именно на первый символ:
   * от него зависит и правило ИЛИ для дней, и поведение при переводе часов.
   */
  readonly wildcard: boolean;
}

export interface CronSchedule {
  readonly expression: string;
  readonly minute: CronField;
  readonly hour: CronField;
  readonly dayOfMonth: CronField;
  readonly month: CronField;
  readonly dayOfWeek: CronField;
}

export interface CronParseError {
  readonly message: string;
  /** Поле, в котором найдена ошибка; нет, если сломано выражение целиком. */
  readonly field?: FieldName;
  /** Смещение начала проблемного фрагмента в исходной строке. */
  readonly offset: number;
  readonly length: number;
}

export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: CronParseError };

class FieldError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly length: number,
  ) {
    super(message);
  }
}

export function isMacro(token: string): boolean {
  return token.startsWith('@');
}

export function parseCron(input: string): ParseResult<CronSchedule> {
  const expression = input.trim();
  const leading = input.length - input.trimStart().length;

  if (expression === '') {
    return fail('Пустое выражение', undefined, leading, 0);
  }

  if (isMacro(expression)) {
    if (expression.toLowerCase() === '@reboot') {
      return fail('@reboot срабатывает при старте демона и не привязан ко времени', undefined, leading, expression.length);
    }
    const expanded = MACROS[expression.toLowerCase()];
    if (expanded === undefined) {
      return fail(`Неизвестный макрос ${expression}`, undefined, leading, expression.length);
    }
    const parsed = parseFields(expanded, 0);
    return parsed.ok ? { ok: true, value: { ...parsed.value, expression } } : parsed;
  }

  return parseFields(expression, leading);
}

function parseFields(expression: string, baseOffset: number): ParseResult<CronSchedule> {
  const tokens = [...expression.matchAll(/\S+/g)];
  if (tokens.length !== FIELD_ORDER.length) {
    return fail(
      `Ожидается 5 полей (минута, час, день, месяц, день недели), получено ${tokens.length}`,
      undefined,
      baseOffset,
      expression.length,
    );
  }

  const fields: Partial<Record<FieldName, CronField>> = {};
  for (const [index, name] of FIELD_ORDER.entries()) {
    const token = tokens[index];
    if (token === undefined) {
      throw new Error('unreachable: token count checked above');
    }
    const offset = baseOffset + token.index;
    try {
      fields[name] = parseField(name, token[0]);
    } catch (error) {
      if (error instanceof FieldError) {
        return fail(error.message, name, offset + error.offset, error.length);
      }
      throw error;
    }
  }

  const { minute, hour, dayOfMonth, month, dayOfWeek } = fields as Record<FieldName, CronField>;
  return { ok: true, value: { expression, minute, hour, dayOfMonth, month, dayOfWeek } };
}

function parseField(name: FieldName, source: string): CronField {
  const spec = FIELDS[name];
  const values = new Set<number>();
  let cursor = 0;

  for (const part of source.split(',')) {
    if (part === '') {
      throw new FieldError(`Пустой элемент списка в поле «${spec.label}»`, cursor, 1);
    }
    for (const value of expandPart(spec, part, cursor)) {
      values.add(name === 'dayOfWeek' && value === 7 ? 0 : value);
    }
    cursor += part.length + 1;
  }

  return { source, values: [...values].sort((a, b) => a - b), wildcard: source.startsWith('*') };
}

function expandPart(spec: FieldSpec, part: string, offset: number): number[] {
  const [rangeText = '', stepText, extra] = part.split('/');
  if (extra !== undefined) {
    throw new FieldError(`Лишний «/» в «${part}»`, offset, part.length);
  }

  let step = 1;
  if (stepText !== undefined) {
    step = parseNumber(stepText, offset + rangeText.length + 1);
    if (step === 0) {
      throw new FieldError('Шаг не может быть нулевым', offset + rangeText.length + 1, stepText.length);
    }
  }

  let from: number;
  let to: number;
  if (rangeText === '*') {
    from = spec.min;
    to = spec.max;
  } else if (rangeText.includes('-')) {
    const [fromText = '', toText = ''] = rangeText.split('-', 2);
    from = parseValue(spec, fromText, offset);
    to = parseValue(spec, toText, offset + fromText.length + 1);
    if (from > to) {
      // cronie отвергает обратные диапазоны вроде 22-2; перенос через полночь пишется списком.
      throw new FieldError(
        `Диапазон ${rangeText} идёт в обратную сторону — запишите его как ${fromText}-${spec.max},${spec.min}-${toText}`,
        offset,
        rangeText.length,
      );
    }
  } else {
    from = parseValue(spec, rangeText, offset);
    // «5/15» — от пяти до конца поля с шагом 15, как в cronie и robfig/cron.
    to = stepText === undefined ? from : spec.max;
  }

  const out: number[] = [];
  for (let value = from; value <= to; value += step) {
    out.push(value);
  }
  return out;
}

function parseValue(spec: FieldSpec, text: string, offset: number): number {
  const byName = spec.names?.indexOf(text.toLowerCase()) ?? -1;
  if (byName >= 0) {
    return spec.min + byName;
  }
  const value = parseNumber(text, offset);
  if (value < spec.min || value > spec.max) {
    throw new FieldError(`${spec.label} «${text}» вне диапазона ${spec.min}–${spec.max}`, offset, text.length);
  }
  return value;
}

function parseNumber(text: string, offset: number): number {
  if (!/^\d+$/.test(text)) {
    throw new FieldError(`«${text}» — не число`, offset, Math.max(text.length, 1));
  }
  return Number(text);
}

function fail(message: string, field: FieldName | undefined, offset: number, length: number): ParseResult<never> {
  const error: CronParseError = field === undefined ? { message, offset, length } : { message, field, offset, length };
  return { ok: false, error };
}

/** Совпадает ли календарная дата с полями дня, месяца и дня недели. */
export function matchesDate(schedule: CronSchedule, month: number, day: number, weekday: number): boolean {
  if (!schedule.month.values.includes(month)) {
    return false;
  }
  const domMatch = schedule.dayOfMonth.values.includes(day);
  const dowMatch = schedule.dayOfWeek.values.includes(weekday);
  // Правило cronie: если оба поля ограничены, достаточно совпасть одному из них.
  if (!schedule.dayOfMonth.wildcard && !schedule.dayOfWeek.wildcard) {
    return domMatch || dowMatch;
  }
  return domMatch && dowMatch;
}

/** То же расписание с другим временем суток: дни, месяцы и дни недели не трогаются. */
export function withTimeOfDay(schedule: CronSchedule, hour: number, minute: number): CronSchedule {
  const minuteField: CronField = { source: String(minute), values: [minute], wildcard: false };
  const hourField: CronField = { source: String(hour), values: [hour], wildcard: false };
  const tail = [schedule.dayOfMonth.source, schedule.month.source, schedule.dayOfWeek.source].join(' ');
  return { ...schedule, minute: minuteField, hour: hourField, expression: `${minute} ${hour} ${tail}` };
}

/** Задача с одним фиксированным временем в сутки — только такую можно переносить. */
export function fixedTimeOfDay(schedule: CronSchedule): { hour: number; minute: number } | undefined {
  const [hour, ...restHours] = schedule.hour.values;
  const [minute, ...restMinutes] = schedule.minute.values;
  if (hour === undefined || minute === undefined || restHours.length > 0 || restMinutes.length > 0) {
    return undefined;
  }
  return { hour, minute };
}
