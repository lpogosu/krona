import { plural, summarizeOverloads } from '@krona/core';

import type { AnalysisResult } from '../analysis/protocol';

export type Tone = 'accent' | 'conflict' | 'warn';

/** Главная находка расписания одной фразой — для карточек примеров и недавних. */
export function headline(result: AnalysisResult, timeZone: string): { text: string; tone: Tone } {
  const report = result.report;
  if (!report) {
    return result.source.errors.length > 0 ? { text: `${result.source.errors.length} ${plural(result.source.errors.length, 'ошибка', 'ошибки', 'ошибок')}`, tone: 'conflict' } : { text: 'нет задач', tone: 'warn' };
  }
  const groups = summarizeOverloads(report.overloads, timeZone);
  if (groups.length > 0) {
    return { text: `пик ${report.peak.count} при пороге ${report.options.threshold}`, tone: 'conflict' };
  }
  const dst = report.jobs.reduce((n, j) => n + j.dst.length, 0);
  if (dst > 0) {
    return { text: `перевод часов: ${dst} ${plural(dst, 'запуск', 'запуска', 'запусков')}`, tone: 'warn' };
  }
  const zones = new Set(report.jobs.map((j) => j.job.timeZone)).size;
  if (zones > 1) {
    return { text: `${zones} ${plural(zones, 'пояс', 'пояса', 'поясов')}, без перегрузок`, tone: 'accent' };
  }
  return { text: 'без перегрузок', tone: 'accent' };
}
