import { Check, ChevronDown, Globe, Link2, Moon, Sun } from 'lucide-react';
import { useState } from 'react';

import { timeZoneOptions } from '../lib/time';
import { useProject } from '../state/project';
import { SCREENS, type Screen } from './route';
import { encodeShare } from './share';
import type { Theme } from './use-theme';
import './header.css';

interface HeaderProps {
  readonly screen: Screen;
  readonly go: (screen: Screen) => void;
  readonly theme: Theme;
  readonly toggleTheme: () => void;
  readonly conflicts: number;
}

export function Header({ screen, go, theme, toggleTheme, conflicts }: HeaderProps) {
  const { project, update } = useProject();
  const [copied, setCopied] = useState(false);

  const share = async (): Promise<void> => {
    if (!project) {
      return;
    }
    const url = `${location.origin}${location.pathname}#/${screen}?p=${encodeShare(project)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      window.prompt('Скопируйте ссылку', url);
    }
  };

  return (
    <header className="header">
      <a className="brand" href="#/start" aria-label="КРОНА — к списку расписаний">
        <img src="./art/logo.webp" alt="" width={48} height={48} />
        <span>КРОНА</span>
      </a>

      <nav className="tabs" aria-label="Экраны">
        {SCREENS.map((s) => {
          const needsProject = s.id !== 'start' && !project;
          return (
            <button
              key={s.id}
              type="button"
              className="tab"
              aria-current={screen === s.id ? 'page' : undefined}
              disabled={needsProject}
              title={needsProject ? 'Сначала откройте расписание' : undefined}
              onClick={() => {
                go(s.id);
              }}
            >
              {s.title}
              {s.id === 'conflicts' && conflicts > 0 && <span className="tab-badge" aria-label={`${conflicts} перегрузок`} />}
            </button>
          );
        })}
      </nav>

      <div className="header-actions">
        {project && (
          <label className="zone-select">
            <Globe size={18} aria-hidden />
            <span className="sr-only">Пояс демона cron</span>
            <select
              value={project.timeZone}
              onChange={(e) => {
                update({ timeZone: e.target.value });
              }}
            >
              {timeZoneOptions(project.timeZone).map((z) => (
                <option key={z} value={z}>
                  Сервер · {z}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden />
          </label>
        )}
        {project && (
          <button type="button" className="btn share" onClick={() => void share()}>
            {copied ? <Check size={18} aria-hidden /> : <Link2 size={18} aria-hidden />}
            <span>{copied ? 'Ссылка скопирована' : 'Поделиться'}</span>
          </button>
        )}
        <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          {theme === 'dark' ? <Moon size={20} aria-hidden /> : <Sun size={20} aria-hidden />}
        </button>
      </div>
    </header>
  );
}
