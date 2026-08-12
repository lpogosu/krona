import { matchesDate, type CronSchedule } from '../cron/expression.js';
import {
  addDays,
  DAY,
  gapTransition,
  MINUTE,
  offsetMinutes,
  toWallTime,
  wallAsUtc,
  wallTimeToInstants,
  weekday,
  type WallTime,
} from '../time/zone.js';

/**
 * Что происходит с запуском в ночь перевода часов. Поведение взято из cronie (cron.c,
 * «time warp»): задачи с фиксированным временем не теряются и не дублируются, а задачи
 * со звёздочкой в минуте или часе просто идут по часам.
 */
export type DstEffect =
  /** Фиксированное время попало в провал — cronie выполнит задачу в момент перевода. */
  | 'shifted'
  /** Задача со звёздочкой попала в провал — этого запуска не будет. */
  | 'skipped'
  /** Фиксированное время повторилось — задача выполнится один раз, в первый. */
  | 'deduplicated'
  /** Задача со звёздочкой в повторившемся часе — выполнится дважды. */
  | 'doubled';

export interface Occurrence {
  readonly instant: number;
  /** Время по часам пояса задачи, как его видит cron. */
  readonly wall: WallTime;
  readonly dst?: DstEffect;
}

export interface DstNotice {
  readonly effect: DstEffect;
  readonly wall: WallTime;
  /** Момент, когда задача на самом деле выполнится; нет, если запуск пропадает. */
  readonly instant?: number;
}

export interface OccurrencesResult {
  readonly occurrences: Occurrence[];
  readonly dst: DstNotice[];
}

/**
 * Все запуски расписания в полуоткрытом окне [from, to).
 *
 * Перебираются календарные дни пояса, а не минуты: неделя задачи «каждую минуту» — это
 * 10 080 запусков, а перебор минут недели для задачи раз в сутки дал бы столько же
 * бесполезных проверок.
 */
export function occurrences(schedule: CronSchedule, timeZone: string, from: number, to: number): OccurrencesResult {
  const out: Occurrence[] = [];
  const dst: DstNotice[] = [];
  const fixedTime = !schedule.minute.wildcard && !schedule.hour.wildcard;
  // Несколько фиксированных времён в одном провале (0,30 2 * * *) cronie догоняет одним запуском.
  const shifted = new Set<number>();

  const first = toWallTime(from, timeZone);
  const last = toWallTime(to, timeZone);
  // Сутки с запасом по краям: момент `from` может лежать в предыдущих местных сутках.
  let date = addDays(first, -1);
  const stop = addDays(last, 1);

  while (compareDates(date, stop) <= 0) {
    if (matchesDate(schedule, date.month, date.day, weekday(date))) {
      const midnight = wallAsUtc({ ...date, hour: 0, minute: 0 });
      const offset = offsetMinutes(midnight - DAY, timeZone);
      // Смещение одинаково за сутки до и через сутки после — переводов в эти сутки нет,
      // и местное время переводится в момент простым вычитанием.
      const stable = offset === offsetMinutes(midnight + 2 * DAY, timeZone);
      for (const hour of schedule.hour.values) {
        for (const minute of schedule.minute.values) {
          const wall: WallTime = { ...date, hour, minute };
          if (stable) {
            const instant = wallAsUtc(wall) - offset * MINUTE;
            if (instant >= from && instant < to) {
              out.push({ instant, wall });
            }
          } else {
            collect(wall, timeZone, fixedTime, from, to, out, dst, shifted);
          }
        }
      }
    }
    date = addDays(date, 1);
  }

  out.sort((a, b) => a.instant - b.instant);
  return { occurrences: out, dst };
}

function collect(
  wall: WallTime,
  timeZone: string,
  fixedTime: boolean,
  from: number,
  to: number,
  out: Occurrence[],
  dst: DstNotice[],
  shifted: Set<number>,
): void {
  const instants = wallTimeToInstants(wall, timeZone);
  const inWindow = (t: number): boolean => t >= from && t < to;

  if (instants.length === 1) {
    const [instant] = instants as [number];
    if (inWindow(instant)) {
      out.push({ instant, wall });
    }
    return;
  }

  if (instants.length === 0) {
    const transition = gapTransition(wall, timeZone);
    if (!inWindow(transition)) {
      return;
    }
    if (fixedTime) {
      if (!shifted.has(transition)) {
        shifted.add(transition);
        out.push({ instant: transition, wall, dst: 'shifted' });
      }
      dst.push({ effect: 'shifted', wall, instant: transition });
    } else {
      dst.push({ effect: 'skipped', wall });
    }
    return;
  }

  const [early, late] = instants as [number, number];
  if (fixedTime) {
    if (inWindow(early)) {
      out.push({ instant: early, wall, dst: 'deduplicated' });
      dst.push({ effect: 'deduplicated', wall, instant: early });
    }
    return;
  }
  for (const instant of [early, late]) {
    if (inWindow(instant)) {
      out.push({ instant, wall, dst: 'doubled' });
    }
  }
  if (inWindow(late)) {
    dst.push({ effect: 'doubled', wall, instant: late });
  }
}

function compareDates(a: Pick<WallTime, 'year' | 'month' | 'day'>, b: Pick<WallTime, 'year' | 'month' | 'day'>): number {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}
