import type { AnalysisRequest, AnalysisResponse } from './protocol';
import { runAnalysis } from './run';

// Неделя задачи «каждую минуту» с поиском окон — это десятки тысяч интервалов; в основном
// потоке такой расчёт замораживал бы ввод в редакторе.
self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, ...request } = event.data;
  let response: AnalysisResponse;
  try {
    response = { id, ok: true, result: runAnalysis(request) };
  } catch (error) {
    response = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
