import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { check, type Io } from '../src/check.js';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../examples');

function io(env: Record<string, string> = {}, files: Record<string, string> = {}): Io & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    out: (line) => lines.push(line),
    now: () => Date.parse('2026-09-14T10:00:00Z'),
    env,
    readFile: async (p) => files[p] ?? readFile(path.join(examples, p), 'utf8'),
  };
}

describe('krona check', () => {
  it('exits 1 on overloads and prints the recurring episode once with both fixes', async () => {
    const out = io();
    expect(await check(['check', 'prod-db-01.crontab'], out)).toBe(1);
    const text = out.lines.join('\n');
    expect(text).toContain('перегрузка 03:30–03:40 UTC, 7 раз: 3 при пороге 2');
    expect(text).toContain('совет: перенести billing на 03:40 (+10 мин)');
    expect(out.lines.filter((l) => l.includes('перегрузка'))).toHaveLength(1);
  });

  it('exits 0 when the threshold allows the load', async () => {
    expect(await check(['check', 'prod-db-01.crontab', '--threshold', '3'], io())).toBe(0);
  });

  it('exits 2 and names the line when a file does not parse', async () => {
    const out = io({}, { 'broken.crontab': '0 3 * * * /ok\n0 25 * * * /broken' });
    expect(await check(['check', 'broken.crontab'], out)).toBe(2);
    expect(out.lines).toContain('  ошибка   строка 2: час «25» вне диапазона 0–23');
  });

  it('reports daylight saving effects in the window', async () => {
    const out = io();
    await check(['check', 'dst-berlin.crontab', '--from', '2026-03-26', '--days', '5'], out);
    expect(out.lines).toContain('  перевод часов invoices: время попало в провал, cron выполнит задачу в момент перевода (29.03 02:30)');
    expect(out.lines).toContain('  перевод часов metrics-rollup: запуск в провале пропадёт (29.03 02:00)');
  });

  it('suggests staggering jobs that all start on the same minute', async () => {
    const out = io();
    await check(['check', 'every-5-minutes.crontab', '--threshold', '4', '--format', 'json'], out);
    const [result] = JSON.parse(out.lines.join('\n')) as [{ stagger: { peakBefore: number; peakAfter: number } }];
    expect(result.stagger.peakAfter).toBeLessThan(result.stagger.peakBefore);
  });

  it('emits one GitHub annotation per job, not per daily episode', async () => {
    const out = io({ GITHUB_ACTIONS: 'true' });
    await check(['check', 'prod-db-01.crontab'], out);
    const annotations = out.lines.filter((l) => l.startsWith('::warning'));
    expect(annotations).toEqual([
      '::warning file=prod-db-01.crontab,line=12::cleanup-tmp: перегрузок 7, до 3 задач одновременно',
      '::warning file=prod-db-01.crontab,line=18::sync-orders: перегрузок 7, до 3 задач одновременно',
      '::warning file=prod-db-01.crontab,line=21::billing: перегрузок 7, до 3 задач одновременно',
    ]);
  });

  it.each([
    [['check', 'x', '--tz', 'Mars/Base'], 'неизвестный часовой пояс Mars/Base'],
    [['check', 'x', '--threshold', '0'], '--threshold должен быть целым числом от 1'],
    [['check', 'x', '--from', 'вчера'], '--from: не дата «вчера»'],
  ])('rejects bad arguments %j', async (argv, message) => {
    const out = io();
    expect(await check(argv, out)).toBe(2);
    expect(out.lines).toContain(`krona: ${message}`);
  });

  it('prints usage without a command', async () => {
    const out = io();
    expect(await check([], out)).toBe(2);
    expect(out.lines[0]).toContain('Использование: krona check');
  });
});
