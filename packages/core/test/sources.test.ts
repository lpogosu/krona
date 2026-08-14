import { describe, expect, it } from 'vitest';

import { nameFromCommand, parseCronJobs, parseCrontab, parseDuration, parseSource } from '../src/index.js';

describe('parseDuration', () => {
  it.each([
    ['40m', 40],
    ['1h30m', 90],
    ['2h', 120],
    ['90s', 2],
    ['1s', 1],
  ])('%s → %i min', (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(['', '0m', '40', 'm40', '1d'])('rejects %j', (text) => {
    expect(parseDuration(text)).toBeUndefined();
  });
});

describe('nameFromCommand', () => {
  it.each([
    ['/srv/cleanup-tmp --force', 'cleanup-tmp'],
    ['/opt/backup/run.sh', 'backup'],
    ['PGPASSFILE=/etc/pg.pass /usr/local/bin/pg-dump.sh prod', 'pg-dump'],
    ['python3 -m reports', 'python3'],
  ])('%s → %s', (command, name) => {
    expect(nameFromCommand(command)).toBe(name);
  });
});

describe('parseCrontab', () => {
  const text = [
    '# m h dom mon dow command',
    'MAILTO=ops@example.org',
    '# krona: duration=50m',
    '0 2 * * *   /opt/backup/run.sh',
    '# krona: name=cleanup duration=40m',
    '0 3 * * *   /srv/cleanup-tmp',
    'CRON_TZ=Europe/Moscow',
    '0 25 * * *  /srv/broken',
    '@daily      /srv/rotate-logs',
    'TZ=Asia/Tokyo',
    '0 3 * * *',
  ].join('\n');

  const parsed = parseCrontab(text, { timeZone: 'UTC' });

  it('keeps parsing after a broken line and reports every problem with its line', () => {
    expect(parsed.jobs.map((j) => j.name)).toEqual(['backup', 'cleanup', 'rotate-logs']);
    expect(parsed.errors.map((e) => [e.line, e.message])).toEqual([
      [8, 'час «25» вне диапазона 0–23'],
      [11, 'Нет команды после расписания'],
    ]);
  });

  it('points the error column at the broken field', () => {
    const [error] = parsed.errors;
    expect(error?.column).toBe(2);
    expect(error?.text.slice(error.column, (error.column ?? 0) + (error.length ?? 0))).toBe('25');
  });

  it('applies CRON_TZ only to the lines after it', () => {
    expect(parsed.jobs.map((j) => j.timeZone)).toEqual(['UTC', 'UTC', 'Europe/Moscow']);
  });

  it('uses annotations for exactly one following job', () => {
    expect(parsed.jobs.map((j) => [j.durationMinutes, j.durationSource])).toEqual([
      [50, 'annotation'],
      [40, 'annotation'],
      [5, 'default'],
    ]);
  });

  it('warns that TZ does not change the schedule and that a duration was assumed', () => {
    expect(parsed.warnings.map((w) => w.code)).toEqual(['duration-assumed', 'tz-variable-ignored']);
  });

  it('reads the user column in the system crontab format', () => {
    const system = parseCrontab('17 * * * * root cd / && run-parts --report /etc/cron.hourly', { timeZone: 'UTC', system: true });
    expect(system.jobs[0]?.command).toBe('cd / && run-parts --report /etc/cron.hourly');
  });

  it('renames duplicate job names', () => {
    const dup = parseCrontab('0 1 * * * /opt/backup/run.sh\n0 2 * * * /opt/backup/run.sh', { timeZone: 'UTC' });
    expect(dup.jobs.map((j) => j.name)).toEqual(['backup', 'backup-2']);
  });

  it('rejects an unknown CRON_TZ', () => {
    expect(parseCrontab('CRON_TZ=Mars/Olympus', { timeZone: 'UTC' }).errors[0]?.message).toContain('Mars/Olympus');
  });
});

describe('parseCronJobs', () => {
  const manifest = `apiVersion: batch/v1
kind: CronJob
metadata:
  name: payments-close-day
  annotations:
    krona/duration: 25m
spec:
  schedule: "30 3 * * *"
  timeZone: Europe/Moscow
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: close
              image: registry.local/payments/close-day:1.4.2
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: unrelated
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: legacy
spec:
  schedule: "CRON_TZ=UTC 0 1 * * *"
`;

  const parsed = parseCronJobs(manifest, { timeZone: 'UTC' });

  it('reads name, schedule line, time zone, duration and image', () => {
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]).toMatchObject({
      name: 'payments-close-day',
      timeZone: 'Europe/Moscow',
      durationMinutes: 25,
      command: 'registry.local/payments/close-day:1.4.2',
      source: { kind: 'cronjob', line: 8 },
    });
  });

  it('rejects a time zone inside the schedule', () => {
    expect(parsed.errors.map((e) => [e.line, e.message])).toEqual([
      [28, 'Часовой пояс внутри schedule в CronJob не поддерживается — укажите spec.timeZone'],
    ]);
  });

  it('is picked by content in parseSource', () => {
    expect(parseSource(manifest, { timeZone: 'UTC' }).format).toBe('cronjob');
    expect(parseSource('0 3 * * * /x', { timeZone: 'UTC' }).format).toBe('crontab');
  });
});
