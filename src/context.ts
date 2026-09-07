import fs from 'fs';
import os from 'os';
import path from 'path';
import { Writable } from 'stream';
import { createClient, type Client, type ClientConfigOptions } from '@1msg/sdk';

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

function collectStream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function question(stdin: NodeJS.ReadableStream, stdout: Writable, query: string): Promise<string> {
  stdout.write(query);
  return new Promise((resolve, reject) => {
    const readable = stdin as NodeJS.ReadableStream & {
      setEncoding?: (enc: BufferEncoding) => void;
    };
    readable.setEncoding?.('utf8');
    const onData = (chunk: string | Buffer) => {
      cleanup();
      resolve(String(chunk).replace(/\r?\n$/, ''));
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
  tty.setRawMode(true);
  return new Promise((resolve, reject) => {
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
      if (typeof tty.setRawMode === 'function') tty.setRawMode(false);
      stdin.off('data', onData);
      stdin.off('error', onError);
    };
    stdin.on('data', onData);
    stdin.on('error', onError);
  });
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
