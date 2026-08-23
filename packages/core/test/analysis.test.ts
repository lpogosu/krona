import { describe, expect, it } from 'vitest';

import {
  analyze,
  applyMove,
  loadBuckets,
  loadSegments,
  maxLoadBetween,
  MINUTE,
  overloads,
  parseCrontab,
  type Run,
} from '../src/index.js';

const iso = (s: string): number => Date.parse(s);
const hm = (t: number): string => new Date(t).toISOString().slice(11, 16);

// Сценарий с макета: сервер в UTC, 6 задач, порог — две одновременно.
const CRONTAB = `# krona: duration=5m
0 0 * * *    /srv/rotate-logs
# krona: duration=50m
0 2 * * *    /opt/backup/run.sh
# krona: name=cleanup-tmp duration=40m
0 3 * * *    /srv/cleanup-tmp
# krona: duration=20m
0 6 * * 1-5  /srv/reports
# krona: duration=10m
*/15 * * * * /srv/sync-orders
# krona: duration=25m
30 3 * * *   /srv/billing/close-day
`;

const WEEK = { from: iso('2026-09-14T00:00:00Z'), to: iso('2026-09-21T00:00:00Z'), threshold: 2 };

function run(jobId: string, start: string, minutes: number): Run {
  const s = iso(`2026-09-14T${start}:00Z`);
  return { jobId, start: s, end: s + minutes * MINUTE, wall: { year: 2026, month: 9, day: 14, hour: 0, minute: 0 } };
}

describe('load', () => {
  it('treats intervals as half-open so back-to-back jobs do not overlap', () => {
    const segments = loadSegments([run('a', '03:00', 30), run('b', '03:30', 30)]);
    expect(segments.map((s) => s.count)).toEqual([1, 1]);
  });

  it('tracks which jobs are active in each segment', () => {
    const segments = loadSegments([run('a', '03:00', 40), run('b', '03:30', 25), run('c', '03:30', 10)]);
    expect(segments.map((s) => [hm(s.start), hm(s.end), s.count, s.jobIds.join('+')])).toEqual([
      ['03:00', '03:30', 1, 'a'],
      ['03:30', '03:40', 3, 'a+b+c'],
      ['03:40', '03:55', 1, 'b'],
    ]);
  });

  it('merges touching overload segments into one episode', () => {
    const segments = loadSegments([run('a', '03:00', 60), run('b', '03:00', 60), run('c', '03:10', 10), run('d', '03:20', 10)]);
    expect(overloads(segments, 2).map((o) => [hm(o.start), hm(o.end), o.jobIds.join('+')])).toEqual([['03:10', '03:30', 'a+b+c+d']]);
  });

  it('reports the maximum per bucket', () => {
    const segments = loadSegments([run('a', '00:10', 30), run('b', '00:20', 5)]);
    expect(loadBuckets(segments, iso('2026-09-14T00:00:00Z'), iso('2026-09-14T01:00:00Z'), 15 * MINUTE)).toEqual([1, 2, 1, 0]);
  });

  it('finds the maximum load on an arbitrary interval', () => {
    const segments = loadSegments([run('a', '03:00', 60), run('b', '03:20', 10)]);
    expect(maxLoadBetween(segments, iso('2026-09-14T02:00:00Z'), iso('2026-09-14T03:10:00Z'))).toBe(1);
    expect(maxLoadBetween(segments, iso('2026-09-14T03:25:00Z'), iso('2026-09-14T03:26:00Z'))).toBe(2);
    expect(maxLoadBetween(segments, iso('2026-09-14T04:00:00Z'), iso('2026-09-14T05:00:00Z'))).toBe(0);
  });
});

describe('analyze — the mock-up scenario', () => {
  const { jobs } = parseCrontab(CRONTAB, { timeZone: 'UTC' });
  const report = analyze(jobs, WEEK);
  const nameOf = (id: string): string => jobs.find((j) => j.id === id)?.name ?? id;

  it('finds one overload per day, 03:30–03:40, with three jobs', () => {
    expect(report.overloads).toHaveLength(7);
    const [first] = report.overloads;
    expect([hm(first?.start ?? 0), hm(first?.end ?? 0), first?.peak]).toEqual(['03:30', '03:40', 3]);
    expect(first?.jobIds.map(nameOf).sort()).toEqual(['cleanup-tmp', 'close-day', 'sync-orders']);
  });

  it('reports the three pairs that meet inside the overload', () => {
    const pairs = report.conflicts.map((c) => c.jobIds.map(nameOf).sort().join(' × '));
    expect(pairs.sort()).toEqual(['cleanup-tmp × close-day', 'cleanup-tmp × sync-orders', 'close-day × sync-orders']);
  });

  it('ranks the smallest shift that clears every overload first', () => {
    // close-day на 10 минут позже выходит из перегрузки: cleanup-tmp к 03:40 уже закончила.
    // cleanup-tmp тоже можно спасти, но только сдвигом на 55 минут — это второй вариант.
    expect(report.suggestions.map((s) => [nameOf(s.jobId), s.hour, s.minute, s.shiftMinutes, s.overloadsAfter])).toEqual([
      ['close-day', 3, 40, 10, 0],
      ['cleanup-tmp', 3, 55, 55, 0],
    ]);
  });

  it('lists free windows for cleanup-tmp in minutes of the day', () => {
    const cleanup = jobs.find((j) => j.name === 'cleanup-tmp');
    const relocation = cleanup && report.relocations.get(cleanup.id);
    expect(relocation?.movable).toBe(true);
    const windows = relocation?.movable ? relocation.windows.map((w) => [w.from, w.to]) : [];
    // Старты, при которых рядом только sync-orders: 02:50 втискивается ровно между концом
    // backup и началом close-day.
    expect(windows).toEqual([
      [5, 80],
      [170, 170],
      [235, 320],
      [380, 1400],
    ]);
  });

  it('refuses to relocate a job that runs many times a day', () => {
    const sync = jobs.find((j) => j.name === 'sync-orders');
    const relocation = sync && report.relocations.get(sync.id);
    expect(relocation).toMatchObject({ movable: false });
  });

  it('shrinks an assumed duration to the gap between runs', () => {
    const { jobs: everyMinute } = parseCrontab('* * * * * /srv/heartbeat', { timeZone: 'UTC' });
    const result = analyze(everyMinute, WEEK);
    expect(result.jobs[0]?.durationMinutes).toBe(1);
    expect(result.peak.count).toBe(1);
  });

  it('flags a job whose declared duration is longer than its period', () => {
    const { jobs: slow } = parseCrontab('# krona: duration=20m\n*/15 * * * * /srv/slow', { timeZone: 'UTC' });
    expect(analyze(slow, WEEK).jobs[0]?.selfOverlap).toBe(true);
  });
});

describe('applyMove', () => {
  it('rewrites only the schedule of one crontab line and keeps its spacing', () => {
    const { jobs } = parseCrontab(CRONTAB, { timeZone: 'UTC' });
    const cleanup = jobs.find((j) => j.name === 'cleanup-tmp');
    if (!cleanup) {
      throw new Error('cleanup-tmp not parsed');
    }
    const moved = applyMove(CRONTAB, cleanup, 3, 55);
    expect(moved.text.split('\n')[5]).toBe('55 3 * * *    /srv/cleanup-tmp');
    expect(moved.diff).toEqual([
      { kind: 'context', text: '# krona: name=cleanup-tmp duration=40m' },
      { kind: 'removed', text: '0 3 * * *    /srv/cleanup-tmp' },
      { kind: 'added', text: '55 3 * * *    /srv/cleanup-tmp' },
      { kind: 'context', text: '# krona: duration=20m' },
    ]);

    const again = analyze(parseCrontab(moved.text, { timeZone: 'UTC' }).jobs, WEEK);
    expect(again.overloads).toEqual([]);
  });

  it('expands a macro when moving it', () => {
    const text = '@daily /srv/rotate-logs';
    const [job] = parseCrontab(text, { timeZone: 'UTC' }).jobs;
    expect(job && applyMove(text, job, 4, 0).text).toBe('0 4 * * * /srv/rotate-logs');
  });
});

describe('staggerPlan', () => {
  const text = [
    '# krona: name=a duration=3m',
    '*/5 * * * * /srv/a',
    '# krona: name=b duration=3m',
    '*/5 * * * * /srv/b',
    '# krona: name=c duration=2m',
    '*/5 * * * * /srv/c',
    '# krona: name=nightly duration=30m',
    '0 3 * * * /srv/nightly',
  ].join('\n');
  const { jobs } = parseCrontab(text, { timeZone: 'UTC' });
  const report = analyze(jobs, WEEK);

  it('spreads jobs that start in the same minute and keeps fixed-time jobs untouched', () => {
    expect(report.stagger?.peakBefore).toBe(4);
    // 8 минут работы на пятиминутный цикл: хотя бы две задачи всегда встречаются, и в 03:00
    // сверху ложится ночная — пик 3 вместо 4 без разноса.
    expect(report.stagger?.peakAfter).toBe(3);
    const changed = report.stagger?.changes.map((c) => jobs.find((j) => j.id === c.jobId)?.name).sort();
    expect(changed).not.toContain('nightly');
    expect(report.stagger?.changes.every((c) => c.from === '*/5' && /^\d-59\/5$/.test(c.to))).toBe(true);
  });

  it('does not propose anything for a single frequent job', () => {
    const { jobs: one } = parseCrontab('*/5 * * * * /srv/a\n0 3 * * * /srv/b', { timeZone: 'UTC' });
    expect(analyze(one, { ...WEEK, threshold: 1 }).stagger).toBeUndefined();
  });
});
