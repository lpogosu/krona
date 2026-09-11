import {
  applyExpression,
  describeCron,
  FIELD_ORDER,
  formatDuration,
  parseCron,
  plural,
  type FieldName,
  type JobRuns,
  type Report,
} from '@krona/core';
import { Check } from 'lucide-react';
import { useState } from 'react';

import { hhmm } from '../../lib/time';
import { jobsInOverloads } from '../../lib/view';
import { useProject } from '../../state/project';
import './jobs-panel.css';

const FIELD_LABEL: Record<FieldName, string> = {
  minute: 'минута',
  hour: 'час',
  dayOfMonth: 'день',
  month: 'месяц',
  dayOfWeek: 'день нед.',
};

interface JobsPanelProps {
  readonly report: Report;
  readonly colors: ReadonlyMap<string, string>;
  readonly selected: JobRuns | undefined;
  readonly onSelect: (id: string) => void;
  readonly timeZone: string;
}

export function JobsPanel({ report, colors, selected, onSelect, timeZone }: JobsPanelProps) {
  const involved = jobsInOverloads(report);
  const assumed = report.jobs.filter((j) => j.job.durationSource === 'default');

  return (
    <section className="panel jobs-panel" aria-label="Задачи">
      {selected ? <CronEditor key={`${selected.job.id}:${selected.job.schedule.expression}`} job={selected} timeZone={timeZone} /> : null}

      <div className="jobs-head">
        <h2 className="label">
          Задачи · {report.jobs.length}
        </h2>
      </div>
      <ul className="jobs-list">
        {report.jobs.map((j) => (
          <li key={j.job.id}>
            <button
              type="button"
              className={`job-row${selected?.job.id === j.job.id ? ' is-selected' : ''}`}
              aria-pressed={selected?.job.id === j.job.id}
              onClick={() => {
                onSelect(j.job.id);
              }}
            >
              <span className="dot" style={{ ['--dot' as string]: colors.get(j.job.id) }} />
              <span className="job-name">{j.job.name}</span>
              {involved.has(j.job.id) && <span className="chip chip-conflict">перегрузка</span>}
              {j.selfOverlap && <span className="chip chip-warn">наложение</span>}
              <span className="mono muted job-expr">{j.job.schedule.expression}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="jobs-hint">
        <img src="./art/mascot-idle.webp" alt="" width={84} height={96} />
        {assumed.length > 0 ? (
          <p>
            <span className="hand">Сколько работает {assumed[0]?.job.name}?</span>
            <span className="muted">
              Для {assumed.length} {plural(assumed.length, 'задачи', 'задач', 'задач')} считаю по 5 минут. Точнее будет с <span className="mono">
                # krona: duration=40m
              </span>
            </span>
          </p>
        ) : (
          <p>
            <span className="hand">Длительности заданы — считаю честно</span>
            <span className="muted">Нажмите на огонёк на кроне, чтобы открыть задачу</span>
          </p>
        )}
      </div>
    </section>
  );
}

function CronEditor({ job, timeZone }: { job: JobRuns; timeZone: string }) {
  const { project, update } = useProject();
  const [value, setValue] = useState(job.job.schedule.expression);
  const parsed = parseCron(value);
  const changed = value.trim() !== job.job.schedule.expression;
  const next = job.runs[0];

  const commit = (): void => {
    if (!project || !parsed.ok || !changed) {
      return;
    }
    update({ text: applyExpression(project.text, job.job, value.trim()).text });
  };

  const errorField = parsed.ok ? undefined : parsed.error.field;
  const fields = value.trim().split(/\s+/);

  return (
    <div className="cron-editor">
      <label className="label" htmlFor="cron-expression">
        Cron-выражение · {job.job.name}
      </label>
      <form
        className={`cron-input${parsed.ok ? '' : ' is-invalid'}`}
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          id="cron-expression"
          className="mono"
          value={value}
          spellCheck={false}
          aria-invalid={!parsed.ok}
          aria-describedby="cron-help"
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
        {changed && parsed.ok ? (
          <button type="submit" className="btn btn-primary cron-apply">
            <Check size={18} aria-hidden />
            Применить
          </button>
        ) : (
          <span className={`chip ${parsed.ok ? 'chip-accent' : 'chip-conflict'}`}>{parsed.ok ? describeCron(parsed.value) : 'ошибка'}</span>
        )}
      </form>

      {!value.startsWith('@') && (
        <div className="cron-fields" aria-hidden>
          {FIELD_ORDER.map((field, i) => (
            <span key={field} className={`cron-field${errorField === field ? ' is-invalid' : ''}`}>
              <span className="mono">{fields[i] ?? '·'}</span>
              <span>{FIELD_LABEL[field]}</span>
            </span>
          ))}
        </div>
      )}

      <p id="cron-help" className={parsed.ok ? 'muted' : 'field-error'} role={parsed.ok ? undefined : 'alert'}>
        {parsed.ok
          ? next
            ? `Первый запуск в окне — ${new Date(next.start).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone })}, ${hhmm(next.start, timeZone)} · ${formatDuration(job.durationMinutes)}`
            : 'В окне анализа запусков нет'
          : parsed.error.message}
      </p>
    </div>
  );
}
