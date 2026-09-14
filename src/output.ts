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

const ME_FIELDS = [
  'phone',
  'about',
  'description',
  'address',
  'email',
  'vertical',
  'websites',
  'photo',
] as const;

const ME_SKIP = new Set<string>([
  ...ME_FIELDS,
  'token',
  'messaging_product',
  'profile_picture_url',
  'error',
]);

function flattenPhone(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  return (
    pickString(value as Record<string, unknown>, [
      'phone',
      'display_phone_number',
      'displayPhoneNumber',
      'phone_number',
      'id',
    ]) || value
  );
}

/** Normalize GET /me bodies (envelope, phone object, websites[]) into kv fields. */
export function normalizeMe(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body === 'string' || typeof body === 'number' || typeof body === 'boolean') {
    return { phone: String(body) };
  }
  let rec = asRecord(body);
  if (Array.isArray(rec.data) && rec.data[0] && typeof rec.data[0] === 'object') {
    const inner = asRecord(rec.data[0]);
    const { data: _data, ...outer } = rec;
    rec = { ...inner };
    for (const [key, value] of Object.entries(outer)) {
      if (value !== undefined) rec[key] = value;
    }
  }
  if (rec.phone !== undefined) rec.phone = flattenPhone(rec.phone);
  if (!rec.photo && typeof rec.profile_picture_url === 'string') {
    rec.photo = rec.profile_picture_url;
  }
  if (Array.isArray(rec.websites)) {
    rec.websites = rec.websites.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  return rec;
}

export function meErrorMessage(body: unknown): string | undefined {
  const rec = asRecord(body);
  if (typeof rec.error !== 'string' || !rec.error.trim()) return undefined;
  const profile = normalizeMe(body);
  const hasProfile = ME_FIELDS.some((key) => {
    const value = profile[key];
    return value !== undefined && value !== null && value !== '';
  });
  if (hasProfile) return undefined;
  return rec.error.trim();
}

export function meProfileRows(body: unknown): Array<[string, unknown]> {
  const rec = normalizeMe(body);
  const rows: Array<[string, unknown]> = ME_FIELDS.map((key) => [key, rec[key]]);
  for (const [key, value] of Object.entries(rec)) {
    if (ME_SKIP.has(key)) continue;
    rows.push([key, value]);
  }
  return rows;
}

export function printMe(stdout: Writable, body: unknown, emptyHint?: Writable): void {
  const rows = meProfileRows(body);
  const present = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (present.length === 0) {
    emptyHint?.write('empty WhatsApp Business profile (GET /me)\n');
    emptyHint?.write('See:  1msg me --json\n');
    return;
  }
  printKv(stdout, rows);
}
