import { CalendarDays, ChartNoAxesGantt, Clock3, Globe, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SCREENS, type Screen } from './route';

const ICONS: Record<Screen, LucideIcon> = {
  start: CalendarDays,
  day: Clock3,
  week: ChartNoAxesGantt,
  conflicts: TriangleAlert,
  zones: Globe,
};

interface BottomNavProps {
  readonly screen: Screen;
  readonly go: (screen: Screen) => void;
  readonly hasProject: boolean;
  readonly conflicts: number;
}

/** Навигация для узких экранов: те же пять разделов, что и вкладки в шапке. */
export function BottomNav({ screen, go, hasProject, conflicts }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Экраны">
      {SCREENS.map((s) => {
        const Icon = ICONS[s.id];
        return (
          <button
            key={s.id}
            type="button"
            aria-current={screen === s.id ? 'page' : undefined}
            disabled={s.id !== 'start' && !hasProject}
            onClick={() => {
              go(s.id);
            }}
          >
            <Icon size={22} aria-hidden />
            <span>{s.id === 'zones' ? 'Пояса' : s.title}</span>
            {s.id === 'conflicts' && conflicts > 0 && <i className="tab-badge" aria-hidden />}
          </button>
        );
      })}
    </nav>
  );
}
