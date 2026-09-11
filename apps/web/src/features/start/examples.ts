import dst from '../../../../../examples/dst-berlin.crontab?raw';
import everyFive from '../../../../../examples/every-5-minutes.crontab?raw';
import multiRegion from '../../../../../examples/multi-region.yaml?raw';
import prodDb from '../../../../../examples/prod-db-01.crontab?raw';

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly file: string;
  readonly art: string;
  readonly text: string;
  readonly timeZone: string;
  readonly threshold: number;
  /** Неделя, на которой пример показателен, — например, та, где переводят часы. */
  readonly startDate?: string;
}

/** Те же файлы, что лежат в examples/ и проверяются тестами CLI, — демо не расходится с кодом. */
export const EXAMPLES: readonly Example[] = [
  { id: 'prod-db-01', title: 'Ночное обслуживание базы', file: 'prod-db-01.crontab', art: 'nightly', text: prodDb, timeZone: 'UTC', threshold: 2 },
  { id: 'every-5-minutes', title: 'Сервисы каждые 5 минут', file: 'every-5-minutes.crontab', art: 'every5', text: everyFive, timeZone: 'UTC', threshold: 4 },
  { id: 'dst-berlin', title: 'Переход на летнее время', file: 'dst-berlin.crontab', art: 'dst', text: dst, timeZone: 'Europe/Berlin', threshold: 2, startDate: '2026-10-19' },
  { id: 'multi-region', title: 'Три часовых пояса', file: 'multi-region.yaml', art: 'timezones', text: multiRegion, timeZone: 'UTC', threshold: 1 },
];
