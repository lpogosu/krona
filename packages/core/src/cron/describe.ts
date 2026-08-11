import type { CronField, CronSchedule } from './expression.js';

/**
 * Расписание человеческим языком: «каждый день в 03:00», «каждые 15 минут по будням».
 *
 * Описание не пытается пересказать любое выражение — сложные сочетания честно
 * возвращаются как есть, а не превращаются в запутанную фразу, которой нельзя верить.
 */
export function describeCron(schedule: CronSchedule): string {
  const time = describeTime(schedule);
  const days = describeDays(schedule);
  if (time === undefined || days === undefined) {
    return `по расписанию ${schedule.expression}`;
  }
  if (days === '') {
    return time.startsWith('в ') ? `каждый день ${time}` : time;
  }
  return time.startsWith('в ') ? `${days} ${time}` : `${time} ${days}`;
}

const WEEKDAYS_DATIVE = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_PREPOSITIONAL = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
];

function describeTime(s: CronSchedule): string | undefined {
  const minutes = s.minute.values;
  const hours = s.hour.values;
  const everyMinute = isFull(s.minute, 60);
  const everyHour = isFull(s.hour, 24);

  if (everyMinute && everyHour) {
    return 'каждую минуту';
  }

  const minuteStep = uniformStep(s.minute, 60);
  if (everyHour && minuteStep !== undefined && minuteStep > 1 && minutes[0] === 0) {
    return `каждые ${minuteStep} ${plural(minuteStep, 'минуту', 'минуты', 'минут')}`;
  }

  if (minutes.length === 1 && minutes[0] !== undefined) {
    const mm = pad(minutes[0]);
    if (everyHour) {
      return minutes[0] === 0 ? 'каждый час' : `каждый час в :${mm}`;
    }
    const hourStep = uniformStep(s.hour, 24);
    if (hourStep !== undefined && hourStep > 1 && hours[0] === 0) {
      return `каждые ${hourStep} ${plural(hourStep, 'час', 'часа', 'часов')} в :${mm}`;
    }
    if (hours.length <= 4) {
      return `в ${joinRu(hours.map((h) => `${pad(h)}:${mm}`))}`;
    }
  }

  if (everyMinute && hours.length === 1 && hours[0] !== undefined) {
    return `каждую минуту с ${pad(hours[0])}:00 до ${pad(hours[0])}:59`;
  }
  return undefined;
}

function describeDays(s: CronSchedule): string | undefined {
  const allDom = s.dayOfMonth.wildcard && isFull(s.dayOfMonth, 31);
  const allDow = s.dayOfWeek.wildcard && isFull(s.dayOfWeek, 7);
  const allMonths = isFull(s.month, 12);

  let days: string | undefined;
  if (allDom && allDow) {
    days = 'каждый день';
  } else if (allDom) {
    days = describeWeekdays(s.dayOfWeek.values);
  } else if (allDow && s.dayOfMonth.values.length === 1) {
    days = `${s.dayOfMonth.values[0] ?? ''}-го числа`;
  } else {
    return undefined;
  }

  if (days === undefined) {
    return undefined;
  }
  if (allMonths) {
    return days === 'каждый день' ? '' : days;
  }
  if (s.month.values.length === 1 && s.month.values[0] !== undefined) {
    const month = MONTHS_PREPOSITIONAL[s.month.values[0] - 1] ?? '';
    return days === 'каждый день' ? `каждый день в ${month}` : `${days} в ${month}`;
  }
  return undefined;
}

function describeWeekdays(values: readonly number[]): string | undefined {
  const key = values.join(',');
  if (values.length === 7) {
    return 'каждый день';
  }
  if (key === '1,2,3,4,5') {
    return 'по будням';
  }
  if (key === '0,6') {
    return 'по выходным';
  }
  if (values.length === 1 && values[0] !== undefined) {
    return `по ${WEEKDAYS_DATIVE[values[0]] ?? ''}`;
  }
  if (values.length <= 4) {
    return `по ${values.map((v) => WEEKDAYS_SHORT[v] ?? '').join(', ')}`;
  }
  return undefined;
}

function isFull(field: CronField, size: number): boolean {
  return field.values.length === size;
}

/** Шаг, если значения идут ровно через одинаковый интервал и покрывают поле до конца. */
function uniformStep(field: CronField, size: number): number | undefined {
  const [first, second] = field.values;
  if (first === undefined || second === undefined) {
    return undefined;
  }
  const step = second - first;
  const covers = field.values.every((v, i) => v === first + i * step) && first + field.values.length * step >= size;
  return covers ? step : undefined;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }
  return many;
}

function joinRu(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1] ?? ''}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
