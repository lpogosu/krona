import { withTimeOfDay } from '../cron/expression.js';
import type { Job } from '../jobs/job.js';

export interface DiffLine {
  readonly kind: 'context' | 'removed' | 'added';
  readonly text: string;
}

export interface AppliedMove {
  readonly text: string;
  readonly diff: readonly DiffLine[];
}

/**
 * Переписывает время задачи прямо в исходном тексте. Меняется только расписание в одной
 * строке: команда, отступы и комментарии остаются как были, чтобы дифф читался глазами.
 */
export function applyMove(source: string, job: Job, hour: number, minute: number): AppliedMove {
  return applyExpression(source, job, withTimeOfDay(job.schedule, hour, minute).expression);
}

/** Заменяет расписание задачи целиком — например, при разносе частых задач по минутам. */
export function applyExpression(source: string, job: Job, expression: string): AppliedMove {
  const lines = source.split(/\r?\n/);
  const index = job.source.line - 1;
  const original = lines[index];
  if (original === undefined) {
    throw new Error(`В тексте нет строки ${job.source.line}`);
  }

  const replaced = job.source.kind === 'crontab' ? rewriteCrontabLine(original, job.schedule.expression, expression) : rewriteYamlLine(original, expression);
  lines[index] = replaced;

  const diff: DiffLine[] = [];
  const before = lines[index - 1];
  if (before !== undefined) {
    diff.push({ kind: 'context', text: before });
  }
  diff.push({ kind: 'removed', text: original }, { kind: 'added', text: replaced });
  const after = lines[index + 1];
  if (after !== undefined) {
    diff.push({ kind: 'context', text: after });
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return { text: lines.join(newline), diff };
}

function rewriteCrontabLine(line: string, oldExpression: string, newExpression: string): string {
  const at = line.indexOf(oldExpression);
  if (at < 0) {
    throw new Error('Расписание в строке не совпадает с разобранным — текст менялся после анализа');
  }
  return line.slice(0, at) + newExpression + line.slice(at + oldExpression.length);
}

function rewriteYamlLine(line: string, newExpression: string): string {
  const match = /^(\s*schedule:\s*)(["']?)(.*?)\2(\s*(#.*)?)$/.exec(line);
  if (match === null) {
    throw new Error('Строка schedule в манифесте не найдена на ожидаемом месте');
  }
  const [, prefix = '', quote = '', , suffix = ''] = match;
  // В YAML звёздочка в начале значения — это алиас, поэтому без кавычек выражение не оставляем.
  const q = quote === '' ? '"' : quote;
  return `${prefix}${q}${newExpression}${q}${suffix}`;
}
