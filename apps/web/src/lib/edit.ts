import { applyExpression, applyMove, parseCron, type MoveSuggestion, type Report, type StaggerPlan } from '@krona/core';

/** Текст crontab после переноса задачи; дифф нужен экрану конфликтов. */
export function textAfterMove(text: string, report: Report, suggestion: MoveSuggestion): ReturnType<typeof applyMove> {
  const job = report.jobs.find((j) => j.job.id === suggestion.jobId)?.job;
  if (!job) {
    throw new Error(`Задача ${suggestion.jobId} пропала из отчёта`);
  }
  return applyMove(text, job, suggestion.hour, suggestion.minute);
}

/**
 * Разнос правит несколько строк подряд. Номера строк не меняются, потому что каждая правка
 * заменяет расписание внутри той же строки, — поэтому применяем изменения по очереди.
 */
export function textAfterStagger(text: string, report: Report, plan: StaggerPlan): string {
  let current = text;
  for (const change of plan.changes) {
    const job = report.jobs.find((j) => j.job.id === change.jobId)?.job;
    if (!job) {
      continue;
    }
    const tail = job.schedule.expression.trim().split(/\s+/).slice(1).join(' ');
    const expression = `${change.to} ${tail}`;
    if (parseCron(expression).ok) {
      current = applyExpression(current, job, expression).text;
    }
  }
  return current;
}
