import { createContext, use, useEffect, useMemo, type ReactNode } from 'react';

import type { AnalysisResult } from '../analysis/protocol';
import { useAnalysis, type AnalysisState } from '../analysis/use-analysis';
import { dayStarts, parseDate, todayIn } from '../lib/time';
import { useProject, type Project } from './project';

export const WINDOW_DAYS = 7;

export interface Workspace {
  readonly project: Project;
  readonly analysis: AnalysisState & { retry: () => void };
  /** Первые сутки окна по поясу проекта и границы всех суток окна. */
  readonly firstDay: { year: number; month: number; day: number };
  readonly dayStarts: readonly number[];
  /** Последний готовый результат: пока идёт пересчёт, экран показывает его, а не пустоту. */
  readonly result: AnalysisResult | undefined;
}

const WorkspaceContext = createContext<Workspace | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { project, remember } = useProject();
  const zone = project?.timeZone ?? 'UTC';
  const startDate = project?.startDate;
  const firstDay = useMemo(() => (startDate ? parseDate(startDate) : todayIn(zone)), [startDate, zone]);
  const starts = useMemo(() => dayStarts(firstDay, WINDOW_DAYS, zone), [firstDay, zone]);

  const analysis = useAnalysis(
    project && {
      text: project.text,
      timeZone: project.timeZone,
      threshold: project.threshold,
      system: project.system,
      from: starts[0] ?? 0,
      days: WINDOW_DAYS,
    },
  );

  const result = analysis.status === 'ready' ? analysis.result : analysis.status === 'loading' ? analysis.previous : undefined;

  const readyResult = analysis.status === 'ready' ? analysis.result : undefined;
  useEffect(() => {
    if (project && readyResult) {
      remember({ project, jobs: readyResult.source.jobs.length, conflicts: readyResult.report?.overloads.length ?? 0 });
    }
  }, [project, readyResult, remember]);
  const value = useMemo(
    () => (project ? { project, analysis, firstDay, dayStarts: starts, result } : undefined),
    [project, analysis, firstDay, starts, result],
  );
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

/** Нет, если проект ещё не открыт — экраны показывают пустое состояние со ссылкой на импорт. */
export function useWorkspace(): Workspace | undefined {
  return use(WorkspaceContext);
}
