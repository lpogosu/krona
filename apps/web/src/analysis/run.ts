import { analyze, DAY, parseSource } from '@krona/core';

import type { AnalysisRequest, AnalysisResult } from './protocol';

/** Общий для воркера и тестов расчёт: разбор текста и анализ окна. */
export function runAnalysis(request: Omit<AnalysisRequest, 'id'>): AnalysisResult {
  const started = performance.now();
  const source = parseSource(request.text, { timeZone: request.timeZone, system: request.system });
  const report =
    source.jobs.length > 0
      ? analyze(source.jobs, { from: request.from, to: request.from + request.days * DAY, threshold: request.threshold })
      : undefined;
  return { source, ...(report ? { report } : {}), tookMs: Math.round(performance.now() - started) };
}
