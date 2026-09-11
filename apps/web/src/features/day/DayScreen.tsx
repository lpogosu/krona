import { addDays, plural } from '@krona/core';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { Screen } from '../../app/route';
import { AnalysisFailed, DaySkeleton, NoProject } from '../../components/states';
import { WeekTimeline } from '../../components/WeekTimeline';
import { dayTitle, formatDate } from '../../lib/time';
import { dayView, findJob, jobColors } from '../../lib/view';
import { useProject } from '../../state/project';
import { useWorkspace } from '../../state/workspace';
import { Crown } from './Crown';
import { DayDetails } from './DayDetails';
import { JobsPanel } from './JobsPanel';
import { SourceErrors } from './SourceErrors';
import './day.css';

export function DayScreen({ go }: { go: (screen: Screen) => void }) {
  const workspace = useWorkspace();
  const { update } = useProject();
  const [dayIndex, setDayIndex] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>();

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
  const start = dayStarts[dayIndex] ?? 0;
  const end = dayStarts[dayIndex + 1] ?? start;
  const day = dayView(report, start, end);
  // Без явного выбора открыта задача из первой перегрузки — ради неё сюда и пришли.
  const selected = findJob(report, selectedJobId) ?? findJob(report, day.overloads[0]?.jobIds[0] ?? report.overloads[0]?.jobIds[0]) ?? report.jobs[0];
  const date = addDays(firstDay, dayIndex);
  const refreshing = analysis.status === 'loading';

  return (
    <div className={`day${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing}>
      {result.source.errors.length > 0 && (
        <p className="panel day-banner" role="alert">
          {result.source.errors.length} {plural(result.source.errors.length, 'строка не разобрана', 'строки не разобраны', 'строк не разобрано')} — они не участвуют в расчёте. Первая: строка {result.source.errors[0]?.line}, {result.source.errors[0]?.message}.
        </p>
      )}

      <JobsPanel report={report} colors={colors} selected={selected} onSelect={setSelectedJobId} timeZone={project.timeZone} />

      <section className="day-stage" aria-label="Крона суток">
        <div className="stage-bar">
          <label className="window-start surface">
            <CalendarDays size={18} aria-hidden />
            <span className="sr-only">Первый день окна анализа</span>
            <input
              type="date"
              value={formatDate(firstDay)}
              onChange={(e) => {
                if (e.target.value) {
                  setDayIndex(0);
                  update({ startDate: e.target.value });
                }
              }}
            />
          </label>
          <div className="day-switch surface">
            <button type="button" className="icon-btn" aria-label="Предыдущие сутки" disabled={dayIndex === 0} onClick={() => { setDayIndex((i) => i - 1); }}>
              <ChevronLeft size={20} aria-hidden />
            </button>
            <span>
              {dayTitle(date)} · {day.total} {plural(day.total, 'запуск', 'запуска', 'запусков')}
            </span>
            <button type="button" className="icon-btn" aria-label="Следующие сутки" disabled={dayIndex >= dayStarts.length - 2} onClick={() => { setDayIndex((i) => i + 1); }}>
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </div>
        <Crown report={report} day={day} timeZone={project.timeZone} colors={colors} selectedJobId={selected?.job.id} focusJobId={selectedJobId} onSelectJob={setSelectedJobId} />
        <ul className="legend panel" aria-label="Задачи и цвета">
          {report.jobs.map((j) => (
            <li key={j.job.id}>
              <span className="dot" style={{ ['--dot' as string]: colors.get(j.job.id) }} />
              {j.job.name}
            </li>
          ))}
        </ul>
      </section>

      <DayDetails report={report} day={day} title={dayTitle(date)} timeZone={project.timeZone} colors={colors} selected={selected} />

      <section className="panel day-week" aria-labelledby="week-title">
        <div className="day-week-head">
          <h2 id="week-title">Неделя</h2>
          <span className="muted">
            {dayTitle(firstDay)} — {dayTitle(addDays(firstDay, dayStarts.length - 2))} · сервер {project.timeZone}
          </span>
        </div>
        <WeekTimeline report={report} firstDay={firstDay} dayStarts={dayStarts} timeZone={project.timeZone} colors={colors} selectedDay={dayIndex} onSelectDay={setDayIndex} selectedJobId={selected?.job.id} />
      </section>
    </div>
  );
}
