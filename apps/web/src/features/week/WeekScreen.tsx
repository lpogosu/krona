import { addDays, loadBuckets, MINUTE, plural, summarizeOverloads } from '@krona/core';

import type { Screen } from '../../app/route';
import { AnalysisFailed, DaySkeleton, NoProject } from '../../components/states';
import { WeekTimeline } from '../../components/WeekTimeline';
import { dayTitle, shortDay } from '../../lib/time';
import { jobColors, nameOf } from '../../lib/view';
import { useWorkspace } from '../../state/workspace';
import { SourceErrors } from '../day/SourceErrors';
import './week.css';

const BUCKET = 60 * MINUTE;

export function WeekScreen({ go }: { go: (screen: Screen) => void }) {
  const workspace = useWorkspace();
  if (!workspace) {
    return <NoProject go={go} />;
  }
  const { analysis, result, project, firstDay, dayStarts } = workspace;
  if (analysis.status === 'error') {
    return <AnalysisFailed message={analysis.message} retry={analysis.retry} />;
  }
  if (!result) {
    return <DaySkeleton />;
  }
  const report = result.report;
  if (!report) {
    return <SourceErrors source={result.source} go={go} />;
  }

  const colors = jobColors(report);
  const threshold = report.options.threshold;
  const recurring = summarizeOverloads(report.overloads, project.timeZone);

  return (
    <div className="week-screen">
      <header className="page-head">
        <h1>Неделя</h1>
        <p className="muted">
          {dayTitle(firstDay)} — {dayTitle(addDays(firstDay, dayStarts.length - 2))} · время сервера {project.timeZone} · порог {threshold}
        </p>
      </header>

      <section className="panel week-panel" aria-label="Запуски за неделю">
        <WeekTimeline report={report} firstDay={firstDay} dayStarts={dayStarts} timeZone={project.timeZone} colors={colors} rowHeight={34} />
      </section>

      <section className="panel heat-panel" aria-labelledby="heat-title">
        <h2 id="heat-title">Нагрузка по часам</h2>
        <p className="muted">Максимум одновременных задач в каждом часе. Красным — выше порога.</p>
        <div className="heat" role="table" aria-label="Нагрузка по дням и часам">
          <div role="row" className="heat-row heat-hours">
            <span role="columnheader" />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} role="columnheader">
                {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
              </span>
            ))}
          </div>
          {dayStarts.slice(0, -1).map((start, i) => {
            const buckets = loadBuckets(report.segments, start, start + 24 * BUCKET, BUCKET);
            return (
              <div role="row" key={start} className="heat-row">
                <span role="rowheader">{shortDay(addDays(firstDay, i))}</span>
                {buckets.map((v, h) => (
                  <span
                    key={h}
                    role="cell"
                    className={`heat-cell${v > threshold ? ' is-over' : ''}`}
                    style={{ ['--level' as string]: Math.min(v / Math.max(threshold, 1), 1) }}
                    title={`${String(h).padStart(2, '0')}:00 — до ${v} ${plural(v, 'задачи', 'задач', 'задач')}`}
                  >
                    {v > 0 ? v : ''}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel recurring-panel" aria-labelledby="recurring-title">
        <h2 id="recurring-title">Повторяющиеся перегрузки</h2>
        {recurring.length === 0 ? (
          <div className="recurring-empty">
            <img src="./art/mascot-success.webp" alt="" width={120} height={120} />
            <p>За неделю нагрузка ни разу не превысила порог {threshold}.</p>
          </div>
        ) : (
          <ul>
            {recurring.slice(0, 8).map((g) => (
              <li key={`${g.window}-${g.jobIds.join()}`} className="surface">
                <span className="mono">{g.window}</span>
                <span className="chip chip-conflict">
                  {g.peak} при пороге {threshold}
                </span>
                <span className="muted">
                  {g.occurrences} {plural(g.occurrences, 'раз', 'раза', 'раз')} · {g.jobIds.map((id) => nameOf(report, id)).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {recurring.length > 8 && <p className="muted">и ещё {recurring.length - 8} — полный список в «Конфликтах»</p>}
        {recurring.length > 0 && (
          <div className="recurring-note">
            <img src="./art/mascot-conflict.webp" alt="" width={120} height={120} />
            <p>
              <span className="hand">Каждый день в одно и то же время</span>
              <span className="muted">— значит, дело в расписании, а не в случайной долгой задаче. Такое чинится переносом.</span>
            </p>
            <button type="button" className="btn btn-primary" onClick={() => { go('conflicts'); }}>
              К исправлению
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
