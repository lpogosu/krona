import { plural } from '@krona/core';
import { ChevronRight, ClipboardPaste, Clock3, FileUp, Folder } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';

import { useAnalysis } from '../../analysis/use-analysis';
import type { Screen } from '../../app/route';
import type { Theme } from '../../app/use-theme';
import { headline } from '../../lib/summary';
import { dayStarts, parseDate, todayIn } from '../../lib/time';
import { useProject, type Project } from '../../state/project';
import { useWorkspace } from '../../state/workspace';
import { EXAMPLES, type Example } from './examples';
import './start.css';

const PLACEHOLDER = `# m  h  dom mon dow  command
0    2  *   *   *    /opt/backup/run.sh
*/15 *  *   *   *    /srv/sync-orders
30   3  *   *   *    /srv/billing/close-day`;

const MAX_FILE_BYTES = 512 * 1024;

export function StartScreen({ go, theme }: { go: (screen: Screen) => void; theme: Theme }) {
  const { open } = useProject();

  const openProject = (project: Project): void => {
    open(project);
    go('day');
  };

  return (
    <div className="start">
      <div className="start-main">
        <header className="page-head">
          <h1>Новое расписание</h1>
          <p className="muted">Вставьте crontab или манифест CronJob — КРОНА разложит задачи по часам и найдёт пересечения.</p>
        </header>
        <ImportPanel onOpen={openProject} />
        <section aria-labelledby="examples-title">
          <h2 id="examples-title" className="section-title">
            Примеры расписаний
          </h2>
          <div className="examples">
            {EXAMPLES.map((example) => (
              <ExampleCard key={example.id} example={example} theme={theme} onOpen={openProject} />
            ))}
          </div>
        </section>
      </div>
      <aside className="start-side">
        <Recent onOpen={openProject} />
        <Preview go={go} />
      </aside>
    </div>
  );
}

function ImportPanel({ onOpen }: { onOpen: (project: Project) => void }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = async (file: File): Promise<void> => {
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`Файл ${file.name} больше 512 КБ — это не похоже на crontab`);
      return;
    }
    setFileError(undefined);
    setText(await file.text());
    setTitle(file.name);
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void readFile(file);
    }
  };

  const submit = (): void => {
    onOpen({
      id: `local-${Date.now().toString(36)}`,
      title: title.trim() || 'Моё расписание',
      text,
      timeZone: 'UTC',
      threshold: 2,
      system: false,
    });
  };

  return (
    <section
      className={`panel import${dragging ? ' is-dragging' : ''}`}
      aria-labelledby="import-title"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="import-art" aria-hidden>
        <img src="./art/mascot-empty.webp" alt="" width={280} height={282} />
        <p className="hand import-note">Посадим первые задачи?</p>
      </div>
      <div className="import-body">
        <h2 id="import-title">Перетащите файл или вставьте текст</h2>
        <label className="sr-only" htmlFor="crontab-input">
          Текст crontab или манифеста CronJob
        </label>
        <textarea
          id="crontab-input"
          className="import-text mono"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          rows={6}
        />
        {fileError && (
          <p className="field-error" role="alert">
            {fileError}
          </p>
        )}
        <div className="import-actions">
          <button type="button" className="btn btn-primary" disabled={text.trim() === ''} onClick={submit}>
            <ClipboardPaste size={20} aria-hidden />
            Разобрать расписание
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              fileInput.current?.click();
            }}
          >
            <FileUp size={20} aria-hidden />
            Выбрать файл
          </button>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".cron,.crontab,.yaml,.yml,.txt,text/plain"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void readFile(file);
              }
            }}
          />
        </div>
        <p className="formats">
          <span className="muted">Понимает:</span>
          {['crontab', 'CronJob YAML', '@daily и другие макросы', 'CRON_TZ=', '# krona: duration=40m'].map((f) => (
            <span key={f} className="chip chip-accent mono">
              {f}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

function exampleProject(example: Example): Project {
  return {
    id: `example-${example.id}`,
    title: example.title,
    text: example.text,
    timeZone: example.timeZone,
    threshold: example.threshold,
    system: false,
    ...(example.startDate ? { startDate: example.startDate } : {}),
  };
}

function ExampleCard({ example, theme, onOpen }: { example: Example; theme: Theme; onOpen: (project: Project) => void }) {
  const first = example.startDate ? parseDate(example.startDate) : todayIn(example.timeZone);
  const analysis = useAnalysis({
    text: example.text,
    timeZone: example.timeZone,
    threshold: example.threshold,
    system: false,
    from: dayStarts(first, 1, example.timeZone)[0] ?? 0,
    days: 7,
  });
  const tag = analysis.status === 'ready' ? headline(analysis.result, example.timeZone) : undefined;

  return (
    <button
      type="button"
      className="panel example"
      onClick={() => {
        onOpen(exampleProject(example));
      }}
    >
      <img src={`./art/card-${example.art}${theme === 'dark' ? '-night' : ''}.webp`} alt="" width={640} height={357} loading="lazy" />
      <span className="example-body">
        <span className="example-title">{example.title}</span>
        <span className="mono muted example-file">{example.file}</span>
        {tag ? (
          <span className={`chip chip-${tag.tone}`}>{tag.text}</span>
        ) : analysis.status === 'error' ? (
          <span className="chip chip-plain">не посчитано</span>
        ) : (
          <span className="skeleton example-tag-skeleton" aria-label="Считаю" />
        )}
      </span>
    </button>
  );
}

function Recent({ onOpen }: { onOpen: (project: Project) => void }) {
  const { recent } = useProject();
  return (
    <section className="panel recent" aria-labelledby="recent-title">
      <div className="recent-head">
        <h2 id="recent-title">Недавние</h2>
        <span className="muted">Всего: {recent.length}</span>
      </div>
      {recent.length === 0 ? (
        <p className="muted recent-empty">Здесь появятся расписания, которые вы открывали. Хранятся только в этом браузере.</p>
      ) : (
        <ul>
          {recent.map((entry) => (
            <li key={entry.project.id}>
              <button
                type="button"
                className="surface recent-item"
                onClick={() => {
                  onOpen(entry.project);
                }}
              >
                <Folder size={22} aria-hidden className="muted" />
                <span className="recent-text">
                  <span className="recent-title">{entry.project.title}</span>
                  <span className="muted">
                    {new Date(entry.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {entry.jobs}{' '}
                    {plural(entry.jobs, 'задача', 'задачи', 'задач')}
                  </span>
                </span>
                <span className={`chip ${entry.conflicts > 0 ? 'chip-conflict' : 'chip-accent'}`}>
                  {entry.conflicts > 0 ? `${entry.conflicts} ${plural(entry.conflicts, 'перегрузка', 'перегрузки', 'перегрузок')}` : 'без перегрузок'}
                </span>
                <ChevronRight size={18} aria-hidden className="muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Preview({ go }: { go: (screen: Screen) => void }) {
  const workspace = useWorkspace();
  const report = workspace?.result?.report;

  if (!workspace) {
    return (
      <section className="panel preview preview-empty">
        <span className="preview-icon" aria-hidden>
          <Clock3 size={32} />
        </span>
        <h2>Расписание не выбрано</h2>
        <p className="muted">Вставьте crontab или откройте пример — здесь появится крона на сутки: сколько задач, где пик и есть ли пересечения.</p>
      </section>
    );
  }

  return (
    <section className="panel preview">
      <span className="label">Открыто сейчас</span>
      <h2>{workspace.project.title}</h2>
      {report ? (
        <dl className="preview-stats">
          <div className="surface">
            <dt className="muted">задач</dt>
            <dd>{report.jobs.length}</dd>
          </div>
          <div className="surface">
            <dt className="muted">пик</dt>
            <dd className={report.overloads.length > 0 ? 'is-conflict' : undefined}>{report.peak.count}</dd>
          </div>
          <div className="surface">
            <dt className="muted">порог</dt>
            <dd>{report.options.threshold}</dd>
          </div>
        </dl>
      ) : (
        <div className="skeleton" style={{ height: 88 }} />
      )}
      <img className="preview-mascot" src={report && report.overloads.length > 0 ? './art/mascot-conflict.webp' : './art/mascot-idle.webp'} alt="" width={180} height={180} />
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          go('day');
        }}
      >
        Открыть сутки
      </button>
    </section>
  );
}
