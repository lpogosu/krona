import { addDays, type Report } from '@krona/core';
import { useState } from 'react';

import { hhmm, isWeekend, shortDay } from '../lib/time';
import './week-timeline.css';

interface WeekTimelineProps {
  readonly report: Report;
  readonly firstDay: { year: number; month: number; day: number };
  readonly dayStarts: readonly number[];
  readonly timeZone: string;
  readonly colors: ReadonlyMap<string, string>;
  readonly selectedDay?: number;
  readonly onSelectDay?: (index: number) => void;
  readonly selectedJobId?: string | undefined;
  readonly rowHeight?: number;
}

/**
 * Неделя одним полотном на SVG: запуски — штрихи, работа частых задач — полупрозрачная
 * лента, перегрузки — красные полосы на всю высоту. Позиция считается по реальному времени,
 * поэтому сутки с переводом часов выглядят на час короче или длиннее — как и есть.
 */
export function WeekTimeline({ report, firstDay, dayStarts, timeZone, colors, selectedDay, onSelectDay, selectedJobId, rowHeight = 18 }: WeekTimelineProps) {
  // Отметка «сейчас» ставится при открытии экрана: двигать её каждую минуту незачем.
  const [now] = useState(Date.now);
  const from = dayStarts[0] ?? 0;
  const to = dayStarts.at(-1) ?? from;
  const width = 1000;
  const x = (t: number): number => ((t - from) / (to - from)) * width;
  const height = report.jobs.length * rowHeight;

  return (
    <div className="week" style={{ ['--rows' as string]: report.jobs.length, ['--row' as string]: `${rowHeight}px` }}>
      <div className="week-names" aria-hidden>
        {report.jobs.map((j) => (
          <span key={j.job.id} className={selectedJobId === j.job.id ? 'is-selected' : undefined}>
            {j.job.name}
          </span>
        ))}
      </div>
      <div className="week-canvas">
        <div className="week-days">
          {dayStarts.slice(0, -1).map((start, i) => {
            const date = addDays(firstDay, i);
            const label = shortDay(date);
            return onSelectDay ? (
              <button
                key={start}
                type="button"
                className={`week-day${selectedDay === i ? ' is-selected' : ''}${isWeekend(date) ? ' is-weekend' : ''}`}
                style={{ left: `${(x(start) / width) * 100}%` }}
                aria-pressed={selectedDay === i}
                onClick={() => {
                  onSelectDay(i);
                }}
              >
                {label}
              </button>
            ) : (
              <span key={start} className={`week-day${isWeekend(date) ? ' is-weekend' : ''}`} style={{ left: `${(x(start) / width) * 100}%` }}>
                {label}
              </span>
            );
          })}
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Запуски задач за неделю" style={{ height }}>
          {selectedDay !== undefined && dayStarts[selectedDay] !== undefined && (
            <rect x={x(dayStarts[selectedDay] ?? 0)} width={x(dayStarts[selectedDay + 1] ?? to) - x(dayStarts[selectedDay] ?? 0)} y={0} height={height} className="week-selected" />
          )}
          {dayStarts.slice(1, -1).map((t) => (
            <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={height} className="week-sep" vectorEffect="non-scaling-stroke" />
          ))}
          {report.overloads.map((o) => (
            <rect key={o.start} x={x(o.start)} width={Math.max(x(o.end) - x(o.start), 1.2)} y={0} height={height} className="week-overload">
              <title>{`Перегрузка ${hhmm(o.start, timeZone)}–${hhmm(o.end, timeZone)}`}</title>
            </rect>
          ))}
          {report.jobs.map((j, row) => {
            const y = row * rowHeight;
            const color = colors.get(j.job.id);
            const dim = selectedJobId !== undefined && selectedJobId !== j.job.id;
            // Больше ста штрихов в ряд сливаются в серую кашу — частые задачи рисуем лентой занятости.
            const dense = j.runs.length > 100;
            return (
              <g key={j.job.id} opacity={dim ? 0.35 : 1}>
                {dense ? (
                  <rect x={0} width={width} y={y + rowHeight / 2 - 2} height={4} rx={2} fill={color} opacity={0.55} />
                ) : (
                  j.runs.map((r) => <rect key={r.start} x={x(r.start)} width={Math.max(x(r.end) - x(r.start), 1.6)} y={y + 3} height={rowHeight - 6} rx={1.5} fill={color} />)
                )}
              </g>
            );
          })}
          {now >= from && now < to && <line x1={x(now)} x2={x(now)} y1={0} y2={height} className="week-now" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
    </div>
  );
}
