import { plural } from '@krona/core';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import type { AnalysisResult } from '../../analysis/protocol';
import type { Screen } from '../../app/route';
import { useProject } from '../../state/project';
import './source-errors.css';

/** Ни одной задачи не разобрано: показываем строки с ошибками и даём поправить текст на месте. */
export function SourceErrors({ source, go }: { source: AnalysisResult['source']; go: (screen: Screen) => void }) {
  const { project, update } = useProject();
  const [text, setText] = useState(project?.text ?? '');
  const lines = (project?.text ?? '').split(/\r?\n/);

  if (source.errors.length === 0) {
    return (
      <section className="panel source-errors">
        <img src="./art/mascot-empty.webp" alt="" width={200} height={202} />
        <div>
          <h1>Крона пока голая</h1>
          <p className="muted">В тексте нет ни одной задачи — только комментарии или переменные. Добавьте строку cron или откройте пример.</p>
          <button type="button" className="btn btn-primary" onClick={() => { go('start'); }}>
            Открыть пример
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel source-errors" aria-labelledby="errors-title">
      <div className="source-errors-body">
        <p className="label">Ошибка · {source.errors.length} {plural(source.errors.length, 'строка не разобрана', 'строки не разобраны', 'строк не разобрано')}</p>
        <h1 id="errors-title">Ни одна задача не разобрана</h1>
        <ol className="error-lines mono">
          {source.errors.map((e) => {
            const raw = lines[e.line - 1] ?? e.text;
            const column = e.column ?? 0;
            const length = e.length ?? 0;
            return (
              <li key={`${e.line}-${e.message}`}>
                <span className="error-line-no">{e.line}</span>
                <span className="error-code">
                  {length > 0 ? (
                    <>
                      {raw.slice(0, column)}
                      <mark>{raw.slice(column, column + length)}</mark>
                      {raw.slice(column + length)}
                    </>
                  ) : (
                    raw
                  )}
                </span>
                <span className="error-message">{e.message}</span>
              </li>
            );
          })}
        </ol>
        <label className="label" htmlFor="fix-text">
          Текст расписания
        </label>
        <textarea id="fix-text" className="mono import-text" rows={6} spellCheck={false} value={text} onChange={(e) => { setText(e.target.value); }} />
        <div className="import-actions">
          <button type="button" className="btn btn-primary" disabled={text === project?.text} onClick={() => { update({ text }); }}>
            <RotateCcw size={18} aria-hidden />
            Разобрать заново
          </button>
          <button type="button" className="btn" onClick={() => { go('start'); }}>
            Другое расписание
          </button>
        </div>
      </div>
      <div className="source-errors-art" aria-hidden>
        <img src="./art/mascot-conflict.webp" alt="" width={240} height={242} />
        <p className="hand">Проверим строку {source.errors[0]?.line}?</p>
      </div>
    </section>
  );
}
