import type { CronSchedule } from '../cron/expression.js';

export type SourceKind = 'crontab' | 'cronjob';

export interface Job {
  /** Уникален в пределах разбора; стабилен между разборами одного и того же текста. */
  readonly id: string;
  readonly name: string;
  readonly schedule: CronSchedule;
  readonly timeZone: string;
  readonly durationMinutes: number;
  /** Откуда взята длительность: без аннотации это допущение, и интерфейс так и говорит. */
  readonly durationSource: 'annotation' | 'default';
  readonly command: string;
  readonly source: {
    readonly kind: SourceKind;
    /** Номер строки с 1 — в crontab строка задачи, в YAML строка `schedule:`. */
    readonly line: number;
  };
}

export interface SourceError {
  readonly line: number;
  readonly message: string;
  readonly text: string;
  /** Позиция ошибки внутри строки, если её удалось определить. */
  readonly column?: number;
  readonly length?: number;
}

export type WarningCode = 'tz-variable-ignored' | 'duration-assumed' | 'timezone-in-schedule';

export interface SourceWarning {
  readonly code: WarningCode;
  readonly line: number;
  readonly message: string;
}

export interface ParsedSource {
  readonly jobs: Job[];
  readonly errors: SourceError[];
  readonly warnings: SourceWarning[];
}

export const DEFAULT_DURATION_MINUTES = 5;

/**
 * «40m», «1h30m», «90s», «2h». Секунды округляются вверх до минуты: анализ идёт с
 * минутной точностью, а короткую задачу нельзя считать мгновенной.
 */
export function parseDuration(text: string): number | undefined {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim());
  if (match === null || text.trim() === '') {
    return undefined;
  }
  const [, h = '0', m = '0', s = '0'] = match;
  const total = Number(h) * 60 + Number(m) + Math.ceil(Number(s) / 60);
  return total > 0 ? total : undefined;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) {
    return `${m} мин`;
  }
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

const GENERIC_BASENAMES = new Set(['run', 'main', 'start', 'index', 'job', 'cron', 'task', 'script']);

/** Имя задачи из команды: `/srv/cleanup-tmp --force` → `cleanup-tmp`, `/opt/backup/run.sh` → `backup`. */
export function nameFromCommand(command: string): string {
  const executable = command.trim().split(/\s+/).find((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) ?? '';
  const segments = executable.split('/').filter(Boolean);
  const base = (segments.at(-1) ?? 'job').replace(/\.(sh|py|rb|pl|js)$/, '');
  if (GENERIC_BASENAMES.has(base) && segments.length > 1) {
    return segments.at(-2) ?? base;
  }
  return base;
}

/** Одинаковые имена получают суффикс: две задачи `backup` станут `backup` и `backup-2`. */
export function uniqueNames<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, count);
    return count === 1 ? item : { ...item, name: `${item.name}-${count}` };
  });
}
