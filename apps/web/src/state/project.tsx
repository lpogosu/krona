import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import { isRecord, load, save } from './storage';

export interface Project {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Пояс демона cron для строк без CRON_TZ. */
  readonly timeZone: string;
  readonly threshold: number;
  readonly system: boolean;
  /** Первый день окна анализа, YYYY-MM-DD; без него — сегодня по поясу проекта. */
  readonly startDate?: string;
}

export interface RecentEntry {
  /** Проект целиком: недавний открывается одним нажатием, без повторной вставки текста. */
  readonly project: Project;
  readonly savedAt: number;
  readonly jobs: number;
  readonly conflicts: number;
}

interface ProjectContextValue {
  readonly project: Project | undefined;
  readonly recent: readonly RecentEntry[];
  readonly open: (project: Project) => void;
  readonly update: (patch: Partial<Omit<Project, 'id'>>) => void;
  readonly close: () => void;
  readonly remember: (entry: Omit<RecentEntry, 'savedAt'>) => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const PROJECT_KEY = 'krona.project';
const RECENT_KEY = 'krona.recent';
const MAX_RECENT = 6;

function parseProject(raw: unknown): Project | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const { id, title, text, timeZone, threshold, system, startDate } = raw;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof text !== 'string' || typeof timeZone !== 'string' || typeof threshold !== 'number') {
    return undefined;
  }
  const base = { id, title, text, timeZone, threshold, system: system === true };
  return typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? { ...base, startDate } : base;
}

function parseRecent(raw: unknown): RecentEntry[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.flatMap((e) => {
    if (!isRecord(e) || typeof e['savedAt'] !== 'number' || typeof e['jobs'] !== 'number' || typeof e['conflicts'] !== 'number') {
      return [];
    }
    const project = parseProject(e['project']);
    return project ? [{ project, savedAt: e['savedAt'], jobs: e['jobs'], conflicts: e['conflicts'] }] : [];
  });
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | undefined>(() => load(PROJECT_KEY, parseProject));
  const [recent, setRecent] = useState<RecentEntry[]>(() => load(RECENT_KEY, parseRecent) ?? []);

  const open = useCallback((next: Project) => {
    setProject(next);
    save(PROJECT_KEY, next);
  }, []);

  const update = useCallback((patch: Partial<Omit<Project, 'id'>>) => {
    setProject((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, ...patch };
      save(PROJECT_KEY, next);
      return next;
    });
  }, []);

  const close = useCallback(() => {
    setProject(undefined);
    save(PROJECT_KEY, null);
  }, []);

  const remember = useCallback((entry: Omit<RecentEntry, 'savedAt'>) => {
    setRecent((list) => {
      const previous = list.find((e) => e.project.id === entry.project.id);
      if (previous && previous.project.text === entry.project.text && previous.project.title === entry.project.title && previous.jobs === entry.jobs && previous.conflicts === entry.conflicts) {
        return list;
      }
      const next = [{ ...entry, savedAt: Date.now() }, ...list.filter((e) => e.project.id !== entry.project.id)].slice(0, MAX_RECENT);
      save(RECENT_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ project, recent, open, update, close, remember }), [project, recent, open, update, close, remember]);
  return <ProjectContext value={value}>{children}</ProjectContext>;
}

export function useProject(): ProjectContextValue {
  const value = use(ProjectContext);
  if (!value) {
    throw new Error('useProject вне ProjectProvider');
  }
  return value;
}
