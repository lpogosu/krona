import { formatOffset, maxLoadBetween, offsetMinutes, plural, type JobRuns, type Report } from '@krona/core';
import { ArrowRight, Shuffle } from 'lucide-react';

import { textAfterMove, textAfterStagger } from '../../lib/edit';
import { formatMinuteOfDay, hhmm } from '../../lib/time';
import { nameOf, type DayView } from '../../lib/view';
import { useProject } from '../../state/project';
import './day-details.css';

interface DayDetailsProps {
  readonly report: Report;
  readonly day: DayView;
  readonly title: string;
  readonly timeZone: string;
  readonly colors: ReadonlyMap<string, string>;
  readonly selected: JobRuns | undefined;
}

export function DayDetails({ report, day, title, timeZone, colors, selected }: DayDetailsProps) {
  const { project, update } = useProject();
  const threshold = report.options.threshold;
  const dayPeak = maxLoadBetween(report.segments, day.start, day.end);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const shift = offsetMinutes(day.start, browserZone) - offsetMinutes(day.start, timeZone);
  const episode = day.overloads[0];
  const best = report.suggestions[0];
  const stagger = report.stagger;
  const pairs = report.conflicts.filter((c) => c.overlaps.some((o) => o.start < day.end && o.end > day.start));
  const relocation = selected ? report.relocations.get(selected.job.id) : undefined;

  return (
    <section className="panel day-details" aria-label="Подробности суток">
      <h2>{title}</h2>

      <dl className="day-stats">
        <div className="surface">
          <dd>{day.total}</dd>
          <dt>{plural(day.total, 'запуск', 'запуска', 'запусков')}</dt>
        </div>
        <div className="surface">
          <dd className={dayPeak > threshold ? 'is-conflict' : undefined}>{dayPeak}</dd>
          <dt>пик · порог {threshold}</dt>
        </div>
        <div className="surface">
          <dd>{formatShift(shift)}</dd>
          <dt>ваши часы</dt>
        </div>
      </dl>

      {episode ? (
        <div className="period">
          <div className="period-head">
            <strong>
              {hhmm(episode.start, timeZone)} – {hhmm(episode.end, timeZone)}
            </strong>
            <span className="chip chip-conflict-solid">Перегрузка</span>
          </div>
          <p>
            Одновременно {episode.peak} {plural(episode.peak, 'задача', 'задачи', 'задач')} при пороге {threshold}:
          </p>
          <ul className="period-jobs">
            {episode.jobIds.map((id) => (
              <li key={id}>
                <span className="dot" style={{ ['--dot' as string]: colors.get(id) }} />
                {nameOf(report, id)}
              </li>
            ))}
          </ul>
          <div className="load-bar" role="img" aria-label={`Нагрузка ${episode.peak} из ${threshold}`}>
            <span style={{ width: '100%' }} />
            <i style={{ left: `${(threshold / episode.peak) * 100}%` }} />
          </div>
          {best && project && (
            <button
              type="button"
              className="btn btn-danger-soft"
              onClick={() => {
                update({ text: textAfterMove(project.text, report, best).text });
              }}
            >
              Сдвинуть {nameOf(report, best.jobId)} на {formatMinuteOfDay(best.hour * 60 + best.minute)}
              <ArrowRight size={18} aria-hidden />
            </button>
          )}
          {stagger && project && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                update({ text: textAfterStagger(project.text, report, stagger) });
              }}
            >
              <Shuffle size={18} aria-hidden />
              Разнести частые задачи: пик {stagger.peakBefore} → {stagger.peakAfter}
            </button>
          )}
        </div>
      ) : (
        <div className="period period-ok">
          <img src="./art/mascot-success.webp" alt="" width={120} height={120} />
          <div>
            <strong>Сутки без перегрузок</strong>
            <p className="muted">
              Больше {threshold} {plural(threshold, 'задачи', 'задач', 'задач')} одновременно не работает ни разу.
            </p>
          </div>
        </div>
      )}

      {pairs.length > 0 && (
        <div className="details-block">
          <div className="details-block-head">
            <h3 className="label">Пересечения</h3>
            <span className="is-conflict">{pairs.length}</span>
          </div>
          <ul className="pair-list">
            {pairs.map((c) => {
              const overlap = c.overlaps.find((o) => o.start < day.end && o.end > day.start);
              return (
                <li key={c.jobIds.join()} className="surface">
                  {c.jobIds.map((id, i) => (
                    <span key={id} className="pair-job">
                      {i > 0 && <span className="muted">×</span>}
                      <span className="dot" style={{ ['--dot' as string]: colors.get(id) }} />
                      {nameOf(report, id)}
                    </span>
                  ))}
                  {overlap && (
                    <span className="mono muted pair-time">
                      {hhmm(overlap.start, timeZone)}–{hhmm(overlap.end, timeZone)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected && relocation && (
        <div className="details-block">
          <h3 className="label">Куда перенести {selected.job.name}</h3>
          {relocation.movable ? (
            relocation.windows.length > 0 ? (
              <ul className="window-list">
                {nearestWindows(relocation.windows, selected).map((w) => (
                  <li key={w.from} className="surface">
                    <span className="mono">
                      {formatMinuteOfDay(w.from)}
                      {w.to !== w.from && ` – ${formatMinuteOfDay(w.to)}`}
                    </span>
                    <span className="chip chip-accent">в пределах порога</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Свободного времени старта нет — нужно поднять порог или укоротить задачу.</p>
            )
          ) : (
            <p className="muted">{relocation.reason}</p>
          )}
        </div>
      )}

      {shift !== 0 && (
        <p className="sticky hand">
          на циферблате — время сервера ({formatOffset(offsetMinutes(day.start, timeZone))}). Ваши часы: {formatShift(shift)}
        </p>
      )}
    </section>
  );
}

function formatShift(minutes: number): string {
  if (minutes === 0) {
    return '0 ч';
  }
  const abs = Math.abs(minutes);
  const sign = minutes > 0 ? '+' : '−';
  return abs % 60 === 0 ? `${sign}${abs / 60} ч` : `${sign}${Math.floor(abs / 60)} ч ${abs % 60} мин`;
}

/** Три окна, ближайших после текущего времени задачи, — остальные читатель не будет листать. */
function nearestWindows(windows: readonly { from: number; to: number }[], job: JobRuns): { from: number; to: number }[] {
  const first = job.runs[0];
  const current = first ? first.wall.hour * 60 + first.wall.minute : 0;
  return [...windows].sort((a, b) => ((a.from - current + 1440) % 1440) - ((b.from - current + 1440) % 1440)).slice(0, 3);
}
