import { LineCounter, parseAllDocuments, isMap, isScalar, type Document } from 'yaml';

import { parseCron } from '../cron/expression.js';
import { isValidTimeZone } from '../time/zone.js';
import {
  DEFAULT_DURATION_MINUTES,
  parseDuration,
  uniqueNames,
  type Job,
  type ParsedSource,
  type SourceError,
  type SourceWarning,
} from './job.js';

export interface CronJobOptions {
  /** Пояс kube-controller-manager: без spec.timeZone расписание считается в нём. */
  readonly timeZone: string;
}

export const DURATION_ANNOTATION = 'krona/duration';

/** Манифесты CronJob (batch/v1), в том числе несколько документов через `---`. */
export function parseCronJobs(text: string, options: CronJobOptions): ParsedSource {
  const jobs: Job[] = [];
  const errors: SourceError[] = [];
  const warnings: SourceWarning[] = [];
  const lines = new LineCounter();
  const sourceLines = text.split(/\r?\n/);
  const lineText = (line: number): string => sourceLines[line - 1] ?? '';

  for (const doc of parseAllDocuments(text, { lineCounter: lines }) as Document.Parsed[]) {
    for (const error of doc.errors) {
      const line = lines.linePos(error.pos[0]).line;
      errors.push({ line, message: `YAML: ${error.message.split('\n')[0] ?? ''}`, text: lineText(line) });
    }
    if (doc.errors.length > 0 || doc.get('kind') !== 'CronJob') {
      continue;
    }

    const nameValue = doc.getIn(['metadata', 'name']);
    const name = typeof nameValue === 'string' ? nameValue : 'cronjob';
    const scheduleNode = doc.getIn(['spec', 'schedule'], true);
    const line = isScalar(scheduleNode) && scheduleNode.range ? lines.linePos(scheduleNode.range[0]).line : 1;
    const schedule = isScalar(scheduleNode) ? String(scheduleNode.value) : '';

    if (/^\s*(CRON_)?TZ=/.test(schedule)) {
      errors.push({
        line,
        message: 'Часовой пояс внутри schedule в CronJob не поддерживается — укажите spec.timeZone',
        text: lineText(line),
      });
      continue;
    }

    const parsed = parseCron(schedule);
    if (!parsed.ok) {
      errors.push({ line, message: `${name}: ${parsed.error.message}`, text: lineText(line) });
      continue;
    }

    const zone = doc.getIn(['spec', 'timeZone']);
    const timeZone = typeof zone === 'string' ? zone : options.timeZone;
    if (!isValidTimeZone(timeZone)) {
      errors.push({ line, message: `${name}: неизвестный часовой пояс «${timeZone}»`, text: lineText(line) });
      continue;
    }

    const annotations = doc.getIn(['metadata', 'annotations']);
    const durationText = isMap(annotations) ? annotations.get(DURATION_ANNOTATION) : undefined;
    const duration = typeof durationText === 'string' ? parseDuration(durationText) : undefined;
    if (typeof durationText === 'string' && duration === undefined) {
      errors.push({ line, message: `${name}: не понял длительность «${durationText}»`, text: lineText(line) });
    }
    if (duration === undefined) {
      warnings.push({
        code: 'duration-assumed',
        line,
        message: `Длительность ${name} не указана — считаем ${DEFAULT_DURATION_MINUTES} мин (аннотация ${DURATION_ANNOTATION})`,
      });
    }

    const container = doc.getIn(['spec', 'jobTemplate', 'spec', 'template', 'spec', 'containers', 0, 'image']);
    jobs.push({
      id: `cronjob:${name}:${line}`,
      name,
      schedule: parsed.value,
      timeZone,
      durationMinutes: duration ?? DEFAULT_DURATION_MINUTES,
      durationSource: duration === undefined ? 'default' : 'annotation',
      command: typeof container === 'string' ? container : '',
      source: { kind: 'cronjob', line },
    });
  }

  return { jobs: uniqueNames(jobs), errors, warnings };
}

/** Похоже ли содержимое на YAML-манифест, а не на crontab. */
export function looksLikeManifest(text: string): boolean {
  return /^\s*(apiVersion|kind)\s*:/m.test(text);
}
