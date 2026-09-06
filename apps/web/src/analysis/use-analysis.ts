import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnalysisRequest, AnalysisResponse, AnalysisResult } from './protocol';

export type AnalysisState =
  | { readonly status: 'loading'; readonly previous?: AnalysisResult }
  | { readonly status: 'ready'; readonly result: AnalysisResult }
  | { readonly status: 'error'; readonly message: string };

let worker: Worker | undefined;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/**
 * Анализ в воркере с отменой устаревших ответов: пока пользователь печатает, приходят
 * результаты для старого текста, и показывать их нельзя — только последний запрос.
 */
export function useAnalysis(request: Omit<AnalysisRequest, 'id'> | undefined): AnalysisState & { retry: () => void } {
  const [state, setState] = useState<AnalysisState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const lastResult = useRef<AnalysisResult | undefined>(undefined);

  const key = request ? JSON.stringify(request) : '';

  useEffect(() => {
    if (key === '') {
      return;
    }
    // Запрос восстанавливается из ключа: эффект зависит от содержимого, а не от того,
    // что родитель на каждой отрисовке создаёт новый объект с теми же полями.
    const payload = JSON.parse(key) as Omit<AnalysisRequest, 'id'>;
    const id = nextId++;
    latest.current = id;
    setState(lastResult.current ? { status: 'loading', previous: lastResult.current } : { status: 'loading' });

    const w = getWorker();
    const onMessage = (event: MessageEvent<AnalysisResponse>): void => {
      if (event.data.id !== latest.current) {
        return;
      }
      if (event.data.ok) {
        lastResult.current = event.data.result;
        setState({ status: 'ready', result: event.data.result });
      } else {
        setState({ status: 'error', message: event.data.message });
      }
    };
    const onError = (event: ErrorEvent): void => {
      if (latest.current === id) {
        setState({ status: 'error', message: event.message || 'Воркер анализа остановился' });
      }
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ ...payload, id } satisfies AnalysisRequest);
    return () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
