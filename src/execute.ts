import type { Client } from '@1msg/sdk';
import type { CliContext } from './context';
import { type GlobalFlags, resolveChannel } from './config';
import {
  ApiError,
  CliExit,
  EXIT_OK,
  NotConfiguredError,
  UsageError,
  hintFor,
  normalizeThrown,
} from './errors';
import { printError, printJson, printKv, type OutputOpts } from './output';

export function outputOpts(flags: GlobalFlags, ctx: CliContext): OutputOpts {
  const noColorEnv = Boolean(ctx.env.NO_COLOR);
  return {
    json: Boolean(flags.json),
    color: flags.color !== false && !noColorEnv,
  };
}

export async function withClient<T>(
  ctx: CliContext,
  flags: GlobalFlags,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const resolved = resolveChannel(ctx, flags);
  const client = ctx.createClient({
    baseUrl: resolved.baseUrl,
    instanceId: resolved.instanceId,
    token: resolved.token,
  });
  try {
    return await fn(client);
  } catch (error) {
    throw await normalizeThrown(error);
  }
}

export function printApiResult(
  ctx: CliContext,
  flags: GlobalFlags,
  body: unknown,
  human?: () => void,
): void {
  const opts = outputOpts(flags, ctx);
  if (opts.json) {
    printJson(ctx.stdout, body);
    return;
  }
  if (human) {
    human();
    return;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    printKv(
      ctx.stdout,
      Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, v]),
    );
    return;
  }
  printJson(ctx.stdout, body);
}

export function printSent(ctx: CliContext, flags: GlobalFlags, body: unknown, to?: string): void {
  printApiResult(ctx, flags, body, () => {
    const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    printKv(ctx.stdout, [
      ['sent', rec.sent],
      ['id', rec.id ?? rec.message],
      ['to', rec.to ?? rec.chatId ?? to],
    ]);
  });
}

export async function emitError(ctx: CliContext, flags: GlobalFlags, error: unknown): Promise<number> {
  const normalized = await normalizeThrown(error);
  if (normalized instanceof CliExit) return normalized.exitCode;

  const opts = outputOpts(flags, ctx);
  if (normalized instanceof UsageError) {
    printError(ctx.stderr, opts, normalized, { see: normalized.see });
    return normalized.exitCode;
  }
  if (normalized instanceof NotConfiguredError) {
    printError(ctx.stderr, opts, normalized);
    return normalized.exitCode;
  }
  if (normalized instanceof ApiError) {
    const human = new Error(`${normalized.message} (HTTP ${normalized.status})`);
    printError(ctx.stderr, opts, opts.json ? normalized : human, {
      hint: hintFor(normalized),
      rawBody: opts.json ? normalized.rawBody || JSON.stringify({ error: normalized.message }) : undefined,
      jsonBody: opts.json ? normalized.jsonBody ?? { error: normalized.message } : undefined,
    });
    return normalized.exitCode;
  }
  printError(ctx.stderr, opts, normalized);
  return 'exitCode' in normalized && typeof (normalized as { exitCode: number }).exitCode === 'number'
    ? (normalized as { exitCode: number }).exitCode
    : 1;
}

export function ok(): number {
  return EXIT_OK;
}
