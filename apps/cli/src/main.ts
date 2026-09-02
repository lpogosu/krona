#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { check } from './check.js';

const code = await check(process.argv.slice(2), {
  readFile: (path) => readFile(path, 'utf8'),
  out: (line) => {
    process.stdout.write(`${line}\n`);
  },
  now: () => Date.now(),
  env: process.env,
});
process.exitCode = code;
