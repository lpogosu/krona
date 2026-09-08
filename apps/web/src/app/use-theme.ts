import { useCallback, useState } from 'react';

import { save } from '../state/storage';

export type Theme = 'light' | 'dark';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light'));
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset['theme'] = next;
      save('krona.theme', next);
      return next;
    });
  }, []);
  return [theme, toggle];
}
