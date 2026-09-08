import { RotateCcw } from 'lucide-react';

import type { Screen } from '../app/route';
import './states.css';

export function NoProject({ go }: { go: (screen: Screen) => void }) {
  return (
    <section className="panel state-card">
      <img src="./art/mascot-empty.webp" alt="" width={220} height={222} />
      <div>
        <h1>Расписание не открыто</h1>
        <p className="muted">Вставьте crontab или откройте пример — этот экран покажет его по часам.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            go('start');
          }}
        >
          К импорту
        </button>
      </div>
    </section>
  );
}

export function AnalysisFailed({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="panel state-card" role="alert">
      <img src="./art/mascot-conflict.webp" alt="" width={220} height={222} />
      <div>
        <h1>Анализ не завершился</h1>
        <p className="muted">
          Расчёт остановился с ошибкой: <span className="mono">{message}</span>. Текст расписания сохранён — попробуйте ещё раз.
        </p>
        <button type="button" className="btn btn-primary" onClick={retry}>
          <RotateCcw size={18} aria-hidden />
          Повторить
        </button>
      </div>
    </section>
  );
}

/** Скелет экрана с кроной: те же блоки, что и у готового экрана, чтобы раскладка не прыгала. */
export function DaySkeleton() {
  return (
    <div className="day-skeleton" aria-busy="true" aria-label="Раскладываю задачи по часам">
      <div className="panel skeleton-col">
        <div className="skeleton" style={{ height: 52 }} />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 18, width: `${60 + ((i * 17) % 35)}%` }} />
        ))}
      </div>
      <div className="skeleton-stage">
        <img src="./art/mascot-loading.webp" alt="" width={160} height={160} />
        <p className="title">Раскладываю задачи по часам…</p>
      </div>
      <div className="panel skeleton-col">
        <div className="skeleton" style={{ height: 34, width: '70%' }} />
        <div className="skeleton" style={{ height: 88 }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    </div>
  );
}
