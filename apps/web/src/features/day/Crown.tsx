import { formatDuration, pad, type Report } from '@krona/core';

import { hhmm, minuteOfDay } from '../../lib/time';
import type { DayView } from '../../lib/view';
import './crown.css';

const SIZE = 1000;
const CX = 500;
const CY = 470;
const RING = 330;
const LABELS = 374;
const BELT = 314;
const OVERLOAD = 346;
/**
 * Больше стольких запусков в сутки — задача рисуется поясом бусин, а не отдельными огнями:
 * двадцать четыре огня «каждого часа» закрывают крону и спорят с редкими задачами за внимание.
 */
const FREQUENT = 8;

interface CrownProps {
  readonly report: Report;
  readonly day: DayView;
  readonly timeZone: string;
  readonly colors: ReadonlyMap<string, string>;
  readonly selectedJobId: string | undefined;
  /** Задача, выбранная пользователем: остальные приглушаются только после явного выбора. */
  readonly focusJobId: string | undefined;
  readonly onSelectJob: (id: string) => void;
}

function polar(minute: number, radius: number): [number, number] {
  const angle = (minute / 1440) * 2 * Math.PI - Math.PI / 2;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function arcPath(fromMinute: number, toMinute: number, radius: number): string {
  // Короткие эпизоды вытягиваются до заметной длины: пять минут на круге суток — меньше пикселя.
  const span = Math.max(toMinute - fromMinute, 8);
  const [x1, y1] = polar(fromMinute, radius);
  const [x2, y2] = polar(fromMinute + span, radius);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${span > 720 ? 1 : 0} 1 ${x2} ${y2}`;
}

export function Crown({ report, day, timeZone, colors, selectedJobId, focusJobId, onSelectJob }: CrownProps) {
  const frequent = report.jobs.filter((j) => (day.runs.get(j.job.id)?.length ?? 0) > FREQUENT);
  const sparse = report.jobs.filter((j) => !frequent.includes(j));
  const laneRadius = (index: number): number => (sparse.length <= 1 ? 220 : 120 + (index * 170) / (sparse.length - 1));
  const overloadHours = new Set(day.overloads.map((o) => Math.floor(minuteOfDay(o.start, timeZone) / 60)));

  return (
    <svg className="crown" viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Запуски за сутки по часам">
      <defs>
        {report.jobs.map((j) => (
          <radialGradient key={j.job.id} id={`glow-${cssId(j.job.id)}`}>
            <stop offset="0%" stopColor={colors.get(j.job.id)} stopOpacity="1" />
            <stop offset="40%" stopColor={colors.get(j.job.id)} stopOpacity="0.55" />
            <stop offset="100%" stopColor={colors.get(j.job.id)} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>

      <image href="./art/tree.webp" x={CX - 260} y={CY - 205} width={520} height={612} className="crown-tree" />

      <circle cx={CX} cy={CY} r={RING} className="crown-ring" />
      {Array.from({ length: 24 }, (_, h) => {
        const [x1, y1] = polar(h * 60, RING);
        const [x2, y2] = polar(h * 60, RING + (h % 6 === 0 ? 18 : 10));
        const [lx, ly] = polar(h * 60, LABELS);
        const major = h % 6 === 0;
        const hot = overloadHours.has(h);
        return (
          <g key={h}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="crown-tick" strokeWidth={major ? 4 : 2.5} />
            <g className={`crown-hour${major ? ' is-major' : ''}${hot ? ' is-hot' : ''}`} transform={`translate(${lx} ${ly})`}>
              <rect x={major ? -26 : -20} y={-15} width={major ? 52 : 40} height={30} rx={15} />
              <text textAnchor="middle" dominantBaseline="central">
                {pad(h)}
              </text>
            </g>
          </g>
        );
      })}

      {frequent.map((j, i) => {
        const runs = day.runs.get(j.job.id) ?? [];
        const dim = focusJobId !== undefined && focusJobId !== j.job.id;
        const radius = BELT - i * 14;
        return (
          <g
            key={j.job.id}
            className={`crown-belt${dim ? ' is-dim' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${j.job.name}: ${runs.length} запусков за сутки`}
            onClick={() => {
              onSelectJob(j.job.id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectJob(j.job.id);
              }
            }}
          >
            <title>{`${j.job.name} · ${runs.length} запусков`}</title>
            {runs.map((r) => {
              const [x, y] = polar(minuteOfDay(r.start, timeZone), radius);
              return <circle key={r.start} cx={x} cy={y} r={runs.length > 200 ? 2.5 : 5} fill={colors.get(j.job.id)} />;
            })}
          </g>
        );
      })}

      {day.overloads.map((o) => (
        <path key={o.start} d={arcPath(minuteOfDay(o.start, timeZone), minuteOfDay(o.start, timeZone) + (o.end - o.start) / 60_000, OVERLOAD)} className="crown-overload" />
      ))}

      {sparse.map((j, lane) => {
        const radius = laneRadius(lane);
        const dim = focusJobId !== undefined && focusJobId !== j.job.id;
        return (day.runs.get(j.job.id) ?? []).map((r) => {
          const [x, y] = polar(minuteOfDay(r.start, timeZone), radius);
          const label = `${j.job.name}: ${hhmm(r.start, timeZone)}, ${formatDuration(j.durationMinutes)}`;
          return (
            <g
              key={`${j.job.id}-${r.start}`}
              className={`crown-run${dim ? ' is-dim' : ''}${selectedJobId === j.job.id ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={() => {
                onSelectJob(j.job.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectJob(j.job.id);
                }
              }}
            >
              <title>{label}</title>
              <circle cx={x} cy={y} r={78} fill={`url(#glow-${cssId(j.job.id)})`} className="crown-glow" />
              <circle cx={x} cy={y} r={17} fill={colors.get(j.job.id)} className="crown-core" />
            </g>
          );
        });
      })}
    </svg>
  );
}

function cssId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
