import path from 'path';
import type { CliContext } from './context';
import { usage } from './errors';
import { resolveUserPath } from './paths';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function mimeFromName(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function fileToDataUri(contents: Buffer, filename: string): string {
  return `data:${mimeFromName(filename)};base64,${contents.toString('base64')}`;
}

export async function readFromFile(
  ctx: CliContext,
  filePath: string | undefined,
): Promise<string | undefined> {
  if (!filePath) return undefined;
  if (filePath === '-') return ctx.readStdin();
  const resolved = resolveUserPath(ctx, filePath);
  return ctx.fs.readFileSync(resolved, 'utf8').toString();
}

export async function readJsonFile(
  ctx: CliContext,
  filePath: string | undefined,
): Promise<Record<string, unknown>> {
  const raw = await readFromFile(ctx, filePath);
  if (raw === undefined) return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      usage('JSON file must contain an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) usage(`invalid JSON: ${error.message}`);
    throw error;
  }
}

export async function readJsonValue(
  ctx: CliContext,
  filePath: string | undefined,
): Promise<unknown> {
  const raw = await readFromFile(ctx, filePath);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) usage(`invalid JSON: ${error.message}`);
    throw error;
  }
}

export function parseJsonFlag(raw: string | undefined, flag: string): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    usage(`${flag} must be valid JSON`);
  }
}

export function readBinaryFile(ctx: CliContext, filePath: string): Buffer {
  const resolved = resolveUserPath(ctx, filePath);
  const data = ctx.fs.readFileSync(resolved);
  return Buffer.isBuffer(data) ? data : Buffer.from(String(data));
}

export function basenameOf(filePath: string): string {
  return path.basename(filePath);
}

export function splitOnce(value: string, sep: string): [string, string] {
  const index = value.indexOf(sep);
  if (index === -1) return [value, ''];
  return [value.slice(0, index), value.slice(index + sep.length)];
}

export function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function parseInteger(raw: string | number | undefined, flag: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) usage(`${flag} must be a number`);
  return n;
}
