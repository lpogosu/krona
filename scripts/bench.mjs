// Замер анализа на примерах и на синтетическом crontab из 300 задач.
// Запуск: npm run bench (сначала собирает ядро). Цифры из вывода — это цифры README.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { analyze, DAY, parseSource } from '../packages/core/dist/index.js';

const FROM = Date.parse('2026-09-14T00:00:00Z');
const RUNS = 7;

function measure(name, text, threshold) {
  const times = [];
  let report;
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    const source = parseSource(text, { timeZone: 'UTC' });
    report = analyze(source.jobs, { from: FROM, to: FROM + 7 * DAY, threshold });
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const runs = report.jobs.reduce((n, j) => n + j.runs.length, 0);
  // Первый прогон греет JIT и в медиану не входит.
  const median = times[Math.floor(times.length / 2)];
  console.log(`${name.padEnd(28)} ${String(report.jobs.length).padStart(4)} задач ${String(runs).padStart(7)} запусков  медиана ${median.toFixed(1).padStart(7)} мс`);
}

function synthetic(count) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 10;
    if (kind < 6) {
      lines.push(`# krona: name=nightly-${i} duration=${10 + (i % 50)}m`, `${(i * 7) % 60} ${(i * 3) % 6} * * * /srv/nightly/${i}`);
    } else if (kind < 9) {
      lines.push(`# krona: name=hourly-${i} duration=${2 + (i % 8)}m`, `${i % 60} * * * * /srv/hourly/${i}`);
    } else {
      lines.push(`# krona: name=poll-${i} duration=1m`, `*/5 * * * * /srv/poll/${i}`);
    }
  }
  return lines.join('\n');
}

const example = (file) => readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8');

measure('prod-db-01.crontab', example('prod-db-01.crontab'), 2);
measure('every-5-minutes.crontab', example('every-5-minutes.crontab'), 4);
measure('multi-region.yaml', example('multi-region.yaml'), 1);
measure('синтетика, 300 задач', synthetic(300), 40);
