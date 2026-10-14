import { createClient, type Client, type ClientConfigOptions } from '@1msg/sdk';
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';

export interface CliFs {
  readFileSync: typeof fs.readFileSync;
  writeFileSync: typeof fs.writeFileSync;
  mkdirSync: typeof fs.mkdirSync;
  existsSync: typeof fs.existsSync;
  chmodSync: typeof fs.chmodSync;
}

export interface CliContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  homedir: string;
  platform: NodeJS.Platform;
  stdout: Writable;
  stderr: Writable;
  stdin: NodeJS.ReadableStream;
  stdinIsTTY: boolean;
  createClient: (options: ClientConfigOptions) => Client;
  now: () => Date;
  fs: CliFs;
  prompt: {
    question: (query: string) => Promise<string>;
    hidden: (query: string) => Promise<string>;
  };
  readStdin: () => Promise<string>;
}

/** Buffer text or binary stdin until end; reject unsupported object-mode chunks and propagate stream failures. */
function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  /** Resolve only after the stream ends and reject stream errors before producing a partial input value. */
  return new Promise(
    /** Collect validated chunks until end; reject input stream errors. */ (resolve, reject) => {
      const chunks: Buffer[] = [];
      /** Accept only byte buffers and strings from the input stream; unsupported object-mode values are errors. */
      stream.on('data', (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) chunks.push(Buffer.from(chunk));
        else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk));
        else reject(new TypeError('Expected a text or Buffer stream chunk'));
      });
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    },
  );
}

function pauseStdin(stdin: NodeJS.ReadableStream): void {
  const stream = stdin as NodeJS.ReadStream;
  try {
    if (typeof stream.pause === 'function') stream.pause();
  } catch {
    /* ignore */
  }
}

/** Restore cooked TTY and drop stdin so the process can exit after prompts. */
export function releaseStdio(stdin: NodeJS.ReadableStream = process.stdin): void {
  const tty = stdin as NodeJS.ReadStream;
  try {
    if (typeof tty.setRawMode === 'function' && tty.isTTY) tty.setRawMode(false);
  } catch {
    /* ignore */
  }
  pauseStdin(stdin);
}

async function question(
  stdin: NodeJS.ReadableStream,
  stdout: Writable,
  query: string,
): Promise<string> {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: false,
  });
  try {
    return await rl.question(query);
  } finally {
    rl.close();
    pauseStdin(stdin);
  }
}

async function hiddenQuestion(
  stdin: NodeJS.ReadableStream,
  stdout: Writable,
  query: string,
): Promise<string> {
  const tty = stdin as NodeJS.ReadStream;
  stdout.write(query);
  if (typeof tty.setRawMode !== 'function') {
    return question(stdin, stdout, '');
  }
  const wasRaw = Boolean(tty.isRaw);
  tty.setRawMode(true);
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk: Buffer | string) => {
        const text = String(chunk);
        if (text === '\n' || text === '\r' || text === '\u0004') {
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (text === '\u0003') {
          cleanup();
          reject(new Error('cancelled'));
          return;
        }
        if (text === '\u007f' || text === '\b') {
          value = value.slice(0, -1);
          return;
        }
        value += text;
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        stdin.off('data', onData);
        stdin.off('error', onError);
      };
      stdin.on('data', onData);
      stdin.on('error', onError);
    });
  } finally {
    try {
      tty.setRawMode(wasRaw);
    } catch {
      /* ignore */
    }
    pauseStdin(stdin);
  }
}

export function createDefaultContext(overrides: Partial<CliContext> = {}): CliContext {
  const stdin = overrides.stdin ?? process.stdin;
  const stdout = overrides.stdout ?? process.stdout;
  const stderr = overrides.stderr ?? process.stderr;
  const env = overrides.env ?? process.env;
  return {
    env,
    cwd: overrides.cwd ?? process.cwd(),
    homedir: overrides.homedir ?? os.homedir(),
    platform: overrides.platform ?? process.platform,
    stdout,
    stderr,
    stdin,
    stdinIsTTY: overrides.stdinIsTTY ?? Boolean((stdin as NodeJS.ReadStream).isTTY),
    createClient: overrides.createClient ?? createClient,
    now: overrides.now ?? (() => new Date()),
    fs: overrides.fs ?? {
      readFileSync: fs.readFileSync,
      writeFileSync: fs.writeFileSync,
      mkdirSync: fs.mkdirSync,
      existsSync: fs.existsSync,
      chmodSync: fs.chmodSync,
    },
    prompt: overrides.prompt ?? {
      question: (query) => question(stdin, stdout, query),
      hidden: (query) => hiddenQuestion(stdin, stdout, query),
    },
    readStdin: overrides.readStdin ?? (() => collectStream(stdin)),
  };
}
