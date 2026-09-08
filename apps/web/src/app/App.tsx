import { useEffect } from 'react';

import { ConflictsScreen } from '../features/conflicts/ConflictsScreen';
import { DayScreen } from '../features/day/DayScreen';
import { StartScreen } from '../features/start/StartScreen';
import { WeekScreen } from '../features/week/WeekScreen';
import { ZonesScreen } from '../features/zones/ZonesScreen';
import { ProjectProvider, useProject } from '../state/project';
import { useWorkspace, WorkspaceProvider } from '../state/workspace';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { useScreen, type Screen } from './route';
import { sharedFromLocation } from './share';
import { useTheme } from './use-theme';
import './app.css';

export function App() {
  return (
    <ProjectProvider>
      <WorkspaceProvider>
        <Shell />
      </WorkspaceProvider>
    </ProjectProvider>
  );
}

function Shell() {
  const [screen, go] = useScreen();
  const [theme, toggleTheme] = useTheme();
  const { project, open } = useProject();
  const workspace = useWorkspace();

  // Ссылка «Поделиться» несёт проект в хеше: открываем его и убираем данные из адреса.
  useEffect(() => {
    const shared = sharedFromLocation();
    if (shared) {
      open({ ...shared, id: `shared-${Date.now().toString(36)}` });
      history.replaceState(null, '', location.href.split('?')[0]);
    }
  }, [open]);

  const effective: Screen = !project && screen !== 'start' ? 'start' : screen;
  const overloads = workspace?.result?.report?.overloads.length ?? 0;

  return (
    <div className="app">
      <a className="skip" href="#main">
        К содержимому
      </a>
      <Header screen={effective} go={go} theme={theme} toggleTheme={toggleTheme} conflicts={overloads} />
      <main id="main" className="main">
        {effective === 'start' && <StartScreen go={go} theme={theme} />}
        {effective === 'day' && <DayScreen go={go} />}
        {effective === 'week' && <WeekScreen go={go} />}
        {effective === 'conflicts' && <ConflictsScreen go={go} />}
        {effective === 'zones' && <ZonesScreen go={go} theme={theme} />}
      </main>
      <BottomNav screen={effective} go={go} hasProject={project !== undefined} conflicts={overloads} />
    </div>
  );
}
