import { DAY, describeCron, formatOffset, offsetMinutes, pad, type DstEffect } from '@krona/core';

import type { Screen } from '../../app/route';
import type { Theme } from '../../app/use-theme';
import { AnalysisFailed, DaySkeleton, NoProject } from '../../components/states';
import { hhmm } from '../../lib/time';
import { jobColors } from '../../lib/view';
import { useProject } from '../../state/project';
import { useWorkspace } from '../../state/workspace';
import { SourceErrors } from '../day/SourceErrors';
import './zones.css';

const EFFECT: Record<DstEffect, { title: string; text: string; tone: 'warn' | 'conflict' }> = {
  shifted: { title: 'Сдвинется', text: 'время попадает в пропущенный час — cron выполнит задачу в момент перевода', tone: 'warn' },
  skipped: { title: 'Пропадёт', text: 'запуск в пропущенном часе не произойдёт вовсе', tone: 'conflict' },
  deduplicated: { title: 'Один раз', text: 'час повторится, но задача с фиксированным временем выполнится однажды', tone: 'warn' },
  doubled: { title: 'Дважды', text: 'в повторившемся часе задача со звёздочкой выполнится два раза', tone: 'conflict' },
};

/** Ближайший перевод часов в поясе: суточный шаг, затем поиск минуты внутри суток. */
function nextTransition(timeZone: string, from: number): { at: number; before: number; after: number } | undefined {
  const start = offsetMinutes(from, timeZone);
  for (let t = from + DAY; t < from + 400 * DAY; t += DAY) {
    if (offsetMinutes(t, timeZone) !== start) {
      let lo = t - DAY;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 2 / 60_000) * 60_000;
        if (offsetMinutes(mid, timeZone) === start) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return { at: hi, before: start, after: offsetMinutes(hi, timeZone) };
    }
  }
  return undefined;
}

export function ZonesScreen({ go, theme }: { go: (screen: Screen) => void; theme: Theme }) {
  const workspace = useWorkspace();
  const { update } = useProject();
  if (!workspace) {
    return <NoProject go={go} />;
  }
  const { analysis, result, project, dayStarts } = workspace;
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

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const from = dayStarts[0] ?? 0;
  const zones = [...new Set([project.timeZone, ...report.jobs.map((j) => j.job.timeZone)])];
  const colors = jobColors(report);
  const notices = report.jobs.flatMap((j) => j.dst.map((d) => ({ job: j.job, notice: d })));

  return (
    <div className="zones">
      <header className="page-head">
        <h1>Часовые пояса</h1>
        <p className="muted">Когда задачи срабатывают по часам сервера и по вашим — и что с ними сделает перевод часов.</p>
      </header>

      <section className="panel zone-overview" aria-label="Пояса расписания">
        <div className="zone-cards">
        {zones.map((zone) => {
          const transition = nextTransition(zone, from);
          return (
            <article key={zone} className="surface zone-card">
              <span className="label">{zone === project.timeZone ? 'Пояс сервера' : 'Пояс задач'}</span>
              <strong>{zone}</strong>
              <span className="mono">{formatOffset(offsetMinutes(from, zone))}</span>
              <p className="muted">
                {transition
                  ? `Перевод ${new Date(transition.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: zone })}: ${formatOffset(transition.before)} → ${formatOffset(transition.after)}`
                  : 'Часы здесь не переводят'}
              </p>
              {transition && transition.at - from > 7 * DAY && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const d = new Date(transition.at - 3 * DAY);
                    update({ startDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` });
                  }}
                >
                  Проверить неделю перевода
                </button>
              )}
            </article>
          );
        })}
        </div>
        <figure className="zone-figure">
          <img src={`./art/card-dst${theme === 'dark' ? '-night' : ''}.webp`} alt="" width={640} height={357} />
          <figcaption>
            <span className="hand">Весной час пропадает, осенью — повторяется</span>
            <span className="muted">Задача на 02:30 весной выполнится в момент перевода, осенью — один раз, а «каждый час» осенью сработает в 02:00 дважды.</span>
          </figcaption>
        </figure>
      </section>

      <section className="panel zone-table-panel" aria-labelledby="zone-table-title">
        <h2 id="zone-table-title">Первый запуск каждой задачи</h2>
        <div className="table-scroll">
          <table className="zone-table">
            <thead>
              <tr>
                <th scope="col">Задача</th>
                <th scope="col">Расписание</th>
                <th scope="col">Пояс задачи</th>
                <th scope="col">По часам задачи</th>
                <th scope="col">UTC</th>
                <th scope="col">У вас · {browserZone}</th>
              </tr>
            </thead>
            <tbody>
              {report.jobs.map((j) => {
                const first = j.runs[0];
                return (
                  <tr key={j.job.id}>
                    <th scope="row">
                      <span className="zone-job">
                        <span className="dot" style={{ ['--dot' as string]: colors.get(j.job.id) }} />
                        {j.job.name}
                      </span>
                    </th>
                    <td>
                      <span className="mono">{j.job.schedule.expression}</span>
                      <span className="muted zone-desc">{describeCron(j.job.schedule)}</span>
                    </td>
                    <td className="mono">{j.job.timeZone}</td>
                    <td className="mono">{first ? hhmm(first.start, j.job.timeZone) : '—'}</td>
                    <td className="mono">{first ? hhmm(first.start, 'UTC') : '—'}</td>
                    <td className="mono">{first ? hhmm(first.start, browserZone) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel dst-panel" aria-labelledby="dst-title">
        <h2 id="dst-title">Перевод часов в окне анализа</h2>
        {notices.length === 0 ? (
          <div className="dst-empty">
            <img src="./art/mascot-idle.webp" alt="" width={120} height={120} />
            <p className="muted">На этой неделе часы не переводят. Если пояс их переводит, откройте неделю перевода кнопкой выше.</p>
          </div>
        ) : (
          <ul>
            {notices.map(({ job, notice }, i) => {
              const effect = EFFECT[notice.effect];
              return (
                <li key={`${job.id}-${i}`} className="surface">
                  <span className={`chip chip-${effect.tone}`}>{effect.title}</span>
                  <strong>{job.name}</strong>
                  <span className="mono">
                    {pad(notice.wall.day)}.{pad(notice.wall.month)} {pad(notice.wall.hour)}:{pad(notice.wall.minute)}
                  </span>
                  <span className="muted">
                    {effect.text}
                    {notice.instant !== undefined && ` · фактически ${hhmm(notice.instant, 'UTC')} UTC`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="muted dst-note">
          Модель поведения — cronie: задачи с фиксированным временем не теряются и не повторяются, задачи со звёздочкой в минуте или часе идут по часам.
        </p>
      </section>
    </div>
  );
}
