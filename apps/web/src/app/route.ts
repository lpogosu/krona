import { useCallback, useSyncExternalStore } from 'react';

export type Screen = 'start' | 'day' | 'week' | 'conflicts' | 'zones';

export const SCREENS: readonly { id: Screen; title: string }[] = [
  { id: 'start', title: 'Расписания' },
  { id: 'day', title: 'Сутки' },
  { id: 'week', title: 'Неделя' },
  { id: 'conflicts', title: 'Конфликты' },
  { id: 'zones', title: 'Часовые пояса' },
];

function current(): Screen {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  return SCREENS.some((s) => s.id === id) ? (id as Screen) : 'start';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/**
 * Маршрут в хеше: демо живёт на GitHub Pages, где нет сервера, который отдал бы
 * index.html на /krona/day. Роутер-библиотека ради пяти экранов не нужна.
 */
export function useScreen(): [Screen, (screen: Screen) => void] {
  const screen = useSyncExternalStore(subscribe, current, (): Screen => 'start');
  const go = useCallback((next: Screen) => {
    location.hash = `/${next}`;
    window.scrollTo({ top: 0 });
  }, []);
  return [screen, go];
}
