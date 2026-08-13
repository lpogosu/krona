import { isMacro, parseCron } from '../cron/expression.js';
import { isValidTimeZone } from '../time/zone.js';
import {
  DEFAULT_DURATION_MINUTES,
  nameFromCommand,
  parseDuration,
  uniqueNames,
  type Job,
  type ParsedSource,
  type SourceError,
  type SourceWarning,
} from './job.js';

export interface CrontabOptions {
  /** Пояс демона cron, если в файле нет CRON_TZ. Обычно это пояс сервера. */
  readonly timeZone: string;
  /**
   * Системный формат (/etc/crontab, /etc/cron.d): после расписания идёт имя пользователя.
   * В пользовательском crontab его нет.
   */
  readonly system?: boolean;
}

const ENV_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
const ANNOTATION = /^\s*#\s*krona:\s*(.*)$/;

/**
 * Разбирает crontab построчно. Ошибка в одной строке не останавливает разбор: остальные
 * задачи всё равно показываются, а сломанная строка подсвечивается с объяснением.
 */
export function parseCrontab(text: string, options: CrontabOptions): ParsedSource {
  const jobs: Job[] = [];
  const errors: SourceError[] = [];
  const warnings: SourceWarning[] = [];

  let timeZone = options.timeZone;
  let annotation: { name?: string; duration?: number } = {};

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const trimmed = raw.trim();

    const note = ANNOTATION.exec(raw);
    if (note) {
      const parsed = parseAnnotation(note[1] ?? '');
      if (typeof parsed === 'string') {
        errors.push({ line, message: parsed, text: raw });
      } else {
        annotation = parsed;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const env = ENV_LINE.exec(raw);
    if (env) {
      const [, key = '', value = ''] = env;
      const unquoted = value.replace(/^(['"])(.*)\1$/, '$2');
      if (key === 'CRON_TZ') {
        if (!isValidTimeZone(unquoted)) {
          errors.push({ line, message: `Неизвестный часовой пояс «${unquoted}»`, text: raw });
        } else {
          timeZone = unquoted;
        }
      } else if (key === 'TZ') {
        // Частая ловушка: TZ попадает в окружение команды, но расписание cronie читает из CRON_TZ.
        warnings.push({
          code: 'tz-variable-ignored',
          line,
          message: `TZ=${unquoted} меняет окружение команды, но не время запуска — для расписания нужен CRON_TZ`,
        });
      }
      continue;
    }

    const job = parseJobLine(raw, line, timeZone, options.system === true, annotation);
    annotation = {};
    if ('message' in job) {
      errors.push(job);
    } else {
      jobs.push(job);
      if (job.durationSource === 'default') {
        warnings.push({
          code: 'duration-assumed',
          line,
          message: `Длительность ${job.name} не указана — считаем ${DEFAULT_DURATION_MINUTES} мин (# krona: duration=40m)`,
        });
      }
    }
  }

  return { jobs: uniqueNames(jobs), errors, warnings };
}

function parseJobLine(
  raw: string,
  line: number,
  timeZone: string,
  system: boolean,
  annotation: { name?: string; duration?: number },
): Job | SourceError {
  const leading = raw.length - raw.trimStart().length;
  const tokens = [...raw.matchAll(/\S+/g)];
  const scheduleTokens = tokens[0] !== undefined && isMacro(tokens[0][0]) ? 1 : 5;
  const commandIndex = scheduleTokens + (system ? 1 : 0);
  const commandToken = tokens[commandIndex];

  const scheduleEnd = tokens[scheduleTokens - 1];
  const expression = scheduleEnd === undefined ? raw.trim() : raw.slice(leading, scheduleEnd.index + scheduleEnd[0].length);
  const parsed = parseCron(expression);
  if (!parsed.ok) {
    return { line, message: parsed.error.message, text: raw, column: leading + parsed.error.offset, length: parsed.error.length };
  }
  if (commandToken === undefined) {
    return { line, message: system ? 'Нет пользователя или команды после расписания' : 'Нет команды после расписания', text: raw };
  }

  const command = raw.slice(commandToken.index).trim();
  const duration = annotation.duration;
  return {
    id: `crontab:${line}`,
    name: annotation.name ?? nameFromCommand(command),
    schedule: parsed.value,
    timeZone,
    durationMinutes: duration ?? DEFAULT_DURATION_MINUTES,
    durationSource: duration === undefined ? 'default' : 'annotation',
    command,
    source: { kind: 'crontab', line },
  };
}

function parseAnnotation(body: string): { name?: string; duration?: number } | string {
  const result: { name?: string; duration?: number } = {};
  for (const pair of body.trim().split(/\s+/).filter(Boolean)) {
    const [key, value = ''] = pair.split('=', 2);
    if (key === 'name' && /^[\w.-]+$/.test(value)) {
      result.name = value;
    } else if (key === 'duration') {
      const minutes = parseDuration(value);
      if (minutes === undefined) {
        return `Не понял длительность «${value}» — пишите 40m, 1h30m или 90s`;
      }
      result.duration = minutes;
    } else {
      return `Неизвестный параметр аннотации «${pair}» — поддерживаются name= и duration=`;
    }
  }
  return result;
}
