#!/usr/bin/env node

import { releaseStdio } from './context';
import { runCli } from './run';

function exitProcess(code: number): void {
  releaseStdio(process.stdin);
  // Prompts resume stdin; undici may keep sockets. Without an explicit
  // exit the shell never gets the console back after `1msg init`.
  process.exit(code);
}

runCli(process.argv.slice(2))
  .then((code) => exitProcess(code))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    exitProcess(1);
  });
