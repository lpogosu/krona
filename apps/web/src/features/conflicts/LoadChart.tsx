interface LoadChartProps {
  readonly before: readonly number[];
  readonly after: readonly number[] | undefined;
  readonly threshold: number;
  readonly loading: boolean;
}

const W = 1200;
const RIGHT = 36;
const ROW = 150;
const LEFT = 90;

/** Две полосы столбиков на одной шкале: до и после исправления. */
export function LoadChart({ before, after, threshold, loading }: LoadChartProps) {
  const max = Math.max(threshold + 1, ...before, ...(after ?? []));
  const barWidth = (W - LEFT - RIGHT) / before.length;
  const unit = (ROW - 30) / max;

  const row = (values: readonly number[], baseline: number, kind: 'before' | 'after') => (
    <g>
      <line x1={LEFT} x2={W - RIGHT} y1={baseline} y2={baseline} className="chart-axis" />
      <line x1={LEFT} x2={W - RIGHT} y1={baseline - threshold * unit} y2={baseline - threshold * unit} className="chart-threshold" />
      {values.map((v, i) =>
        v === 0 ? null : (
          <rect
            key={i}
            x={LEFT + i * barWidth + 1.5}
            y={baseline - v * unit}
            width={barWidth - 3}
            height={v * unit}
            rx={2}
            // Ниже порога столбики приглушены: взгляд должен цепляться за уровень порога и выше.
            className={v > threshold ? 'bar-over' : `${kind === 'before' ? 'bar-before' : 'bar-after'}${v < threshold ? ' is-low' : ''}`}
          />
        ),
      )}
    </g>
  );

  return (
    <svg className="load-chart" viewBox={`0 0 ${W} ${ROW * 2 + 40}`} role="img" aria-label={`Нагрузка за сутки до и после исправления при пороге ${threshold}`}>
      <text x={0} y={ROW - 50} className="chart-label">
        Было
      </text>
      {row(before, ROW - 10, 'before')}
      <text x={0} y={ROW * 2 - 50} className="chart-label is-after">
        Станет
      </text>
      {after ? (
        row(after, ROW * 2 - 10, 'after')
      ) : (
        <text x={LEFT} y={ROW * 2 - 40} className="chart-note">
          {loading ? 'Пересчитываю с исправлением…' : 'Исправление не найдено'}
        </text>
      )}
      {Array.from({ length: 9 }, (_, i) => (
        <text key={i} x={LEFT + ((i * 3 * 4) / before.length) * (W - LEFT - RIGHT)} y={ROW * 2 + 26} textAnchor="middle" className="chart-hour">
          {String(i * 3).padStart(2, '0')}:00
        </text>
      ))}
    </svg>
  );
}
