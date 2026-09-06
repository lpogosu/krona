import type { ParsedSource, Report } from '@krona/core';

export interface AnalysisRequest {
  readonly id: number;
  readonly text: string;
  readonly timeZone: string;
  readonly threshold: number;
  readonly system: boolean;
  readonly from: number;
  readonly days: number;
}

export interface AnalysisResult {
  readonly source: ParsedSource & { readonly format: 'crontab' | 'cronjob' };
  /** Нет, если в тексте не нашлось ни одной задачи. */
  readonly report?: Report;
  readonly tookMs: number;
}

export type AnalysisResponse =
  | { readonly id: number; readonly ok: true; readonly result: AnalysisResult }
  | { readonly id: number; readonly ok: false; readonly message: string };
