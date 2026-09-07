import type { Writable } from 'stream';

const TOKEN_KEYS = new Set([
  'token',
  'apiToken',
  'api_token',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
]);

export interface OutputOpts {
  json: boolean;
  color: boolean;
}

function shouldColor(opts: OutputOpts, stream: Writable): boolean {
  if (!opts.color) return false;
  const tty = (stream as Writable & { isTTY?: boolean }).isTTY;
  return Boolean(tty);
}

function red(text: string, enable: boolean): string {
  return enable ? `\u001b[31m${text}\u001b[0m` : text;
}

export function sanitizeForOutput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForOutput);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (TOKEN_KEYS.has(key)) continue;
      out[key] = sanitizeForOutput(nested);
    }
    return out;
  }
  return value;
}

export function printJson(stdout: Writable, body: unknown): void {
  stdout.write(`${JSON.stringify(sanitizeForOutput(body), null, 2)}\n`);
}

export function printKv(stdout: Writable, rows: Array<[string, unknown]>): void {
  const present = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const width = present.reduce((max, [key]) => Math.max(max, key.length), 0);
  for (const [key, value] of present) {
    stdout.write(`${key.padEnd(width)}  ${stringifyCell(value)}\n`);
  }
}

function stringifyCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function printTable(
  stdout: Writable,
  stderr: Writable,
  columns: string[],
  rows: Array<Record<string, unknown>>,
): void {
  if (rows.length === 0) {
    stderr.write('No rows.\n');
    return;
  }
  const stringRows = rows.map((row) =>
    columns.map((col) => stringifyCell(row[col] ?? '')),
  );
  const widths = columns.map((col, i) =>
    Math.max(col.length, ...stringRows.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    `${cells.map((cell, i) => cell.padEnd(widths[i])).join('  ')}\n`;
  stdout.write(line(columns));
  for (const row of stringRows) stdout.write(line(row));
}

export function printError(
  stderr: Writable,
  opts: OutputOpts,
  error: Error,
  extras?: { see?: string; hint?: string; jsonBody?: unknown; rawBody?: string },
): void {
  const color = shouldColor(opts, stderr);
  if (opts.json) {
    if (extras?.rawBody) {
      stderr.write(extras.rawBody.endsWith('\n') ? extras.rawBody : `${extras.rawBody}\n`);
      return;
    }
    if (extras?.jsonBody !== undefined) {
      stderr.write(`${JSON.stringify(extras.jsonBody)}\n`);
      return;
    }
    stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    return;
  }
  stderr.write(`${red('Error:', color)} ${error.message}\n`);
  if (extras?.hint) stderr.write(`Hint: ${extras.hint}\n`);
  if (extras?.see) stderr.write(`See:  ${extras.see}\n`);
}

export function truncate(text: string, max = 60): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}
