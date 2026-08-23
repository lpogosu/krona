import { looksLikeManifest, parseCronJobs } from './jobs/cronjob.js';
import { parseCrontab } from './jobs/crontab.js';
import type { ParsedSource } from './jobs/job.js';

export * from './cron/expression.js';
export { describeCron, plural, pad } from './cron/describe.js';
export * from './time/zone.js';
export * from './schedule/occurrences.js';
export * from './jobs/job.js';
export { parseCrontab, type CrontabOptions } from './jobs/crontab.js';
export { parseCronJobs, looksLikeManifest, DURATION_ANNOTATION, type CronJobOptions } from './jobs/cronjob.js';
export * from './analysis/runs.js';
export * from './analysis/load.js';
export * from './analysis/conflicts.js';
export * from './analysis/relocate.js';
export * from './analysis/analyze.js';
export * from './analysis/summary.js';
export * from './analysis/stagger.js';
export * from './fix/apply.js';

/** Формат определяется по содержимому: манифест Kubernetes или crontab. */
export function parseSource(text: string, options: { timeZone: string; system?: boolean }): ParsedSource & { format: 'crontab' | 'cronjob' } {
  if (looksLikeManifest(text)) {
    return { ...parseCronJobs(text, { timeZone: options.timeZone }), format: 'cronjob' };
  }
  return { ...parseCrontab(text, options), format: 'crontab' };
}
