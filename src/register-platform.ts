import type {
  PlatformCallInput,
  PlatformCaller,
  PlatformField,
  PlatformOperation,
  PlatformQuery,
} from '@1msg/sdk';

import { PLATFORM_OPERATIONS, PlatformError } from '@1msg/sdk';
import { Command } from 'commander';

import type { CliContext } from './context';

import { applyCommon, wrap } from './command-binding';
import { ApiError, UsageError } from './errors';
import { missingSubcommand } from './local';
import { printJson } from './output';

/** Kebab flag for one camelCase contract field. */
function flagName(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Read a non-empty option string. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Repeatable commander option. */
function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/** Create a nested command once and reuse it for later operations. */
function childCommand(parent: Command, ctx: CliContext, name: string, helpPath: string): Command {
  const existing = parent.commands.find((item) => item.name() === name);
  if (existing) return existing;
  return applyCommon(parent.command(name), ctx, helpPath);
}

/** Walk cli segments under a root command. */
function walk(parent: Command, ctx: CliContext, names: string[], prefix: string): Command {
  const name = names[0];
  if (!name) return parent;
  const helpPath = `${prefix} ${name}`;
  const command = childCommand(parent, ctx, name, helpPath);
  const rest = names.slice(1);
  if (!rest.length) return command;
  return walk(command, ctx, rest, helpPath);
}

/** Declare optional positionals. The handler reports a missing value. */
function addArguments(command: Command, names: readonly string[]): void {
  for (const name of names) command.argument(`[${name}]`);
}

/** Declare query and body flags. File bodies use --from-file only. */
function addFlags(command: Command, operation: PlatformOperation): void {
  if (operation.body.length || operation.cliBody === 'file') {
    command.option('--from-file <path>');
  }
  if (operation.cliBody === 'file') return;
  for (const field of [...operation.query, ...operation.body]) addField(command, field);
}

/** One scalar flag, or a repeatable flag for an array. */
function addField(command: Command, field: PlatformField): void {
  const flag = `--${flagName(field.name)} <value>`;
  if (field.schema.type === 'array') {
    command.option(flag, 'Repeat for each value.', collect);
    return;
  }
  command.option(flag);
}

/** Platform key from the flag or the environment. */
function apiKey(ctx: CliContext, opts: Record<string, unknown>): string {
  const key = text(opts.apiKey) ?? text(ctx.env.ONE_MSG_PLATFORM_KEY);
  if (!key) {
    throw new UsageError('missing platform API key: pass --api-key or set ONE_MSG_PLATFORM_KEY');
  }
  return key;
}

/** Path parameters from the positional arguments. */
function pathFrom(command: Command, operation: PlatformOperation): Record<string, string> {
  const path: Record<string, string> = {};
  for (const [index, name] of operation.pathParams.entries()) {
    const value = command.args[index];
    if (!value) throw new UsageError(`missing <${name}>`);
    path[name] = value;
  }
  return path;
}

/** Query flags. Required ones must be present. */
function queryFrom(opts: Record<string, unknown>, operation: PlatformOperation): PlatformQuery {
  const query: PlatformQuery = {};
  for (const field of operation.query) {
    const value = opts[field.name];
    if (typeof value === 'string' && value.trim()) query[field.name] = value.trim();
    if (Array.isArray(value) && value.length) query[field.name] = value.map(String);
    if (field.required && query[field.name] === undefined) {
      throw new UsageError(`pass --${flagName(field.name)}`);
    }
  }
  return query;
}

/** JSON file, or `-` for stdin. */
async function readJson(ctx: CliContext, file: string): Promise<unknown> {
  const raw = file === '-' ? await ctx.readStdin() : ctx.fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(String(raw)) as unknown;
  } catch {
    throw new UsageError(`invalid JSON in ${file}`);
  }
}

/** Body object from flags. The literal null is JSON null for a nullable field. */
function bodyFields(
  opts: Record<string, unknown>,
  operation: PlatformOperation,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of operation.body) {
    const value = opts[field.name];
    if (value === undefined) {
      if (field.required) throw new UsageError(`pass --${flagName(field.name)}`);
      continue;
    }
    body[field.name] = value === 'null' && field.schema.nullable ? null : value;
  }
  return body;
}

/** Request body from --from-file or individual flags. */
async function bodyFrom(
  ctx: CliContext,
  opts: Record<string, unknown>,
  operation: PlatformOperation,
): Promise<unknown> {
  const file = text(opts.fromFile);
  if (file) return readJson(ctx, file);
  if (operation.cliBody === 'file') {
    if (operation.bodyRequired) throw new UsageError('pass --from-file <path>');
    return undefined;
  }
  const body = bodyFields(opts, operation);
  return Object.keys(body).length ? body : undefined;
}

/** Assemble the client call from parsed commander state. */
async function callInput(
  ctx: CliContext,
  command: Command,
  operation: PlatformOperation,
): Promise<PlatformCallInput> {
  const opts = command.opts() as Record<string, unknown>;
  const body = await bodyFrom(ctx, opts, operation);
  return {
    path: pathFrom(command, operation),
    query: queryFrom(opts, operation),
    ...(body === undefined ? {} : { body }),
  };
}

/** Translate a platform HTTP failure into the CLI's API error. */
function asApiError(error: PlatformError): ApiError {
  let jsonBody: unknown;
  try {
    jsonBody = error.body ? (JSON.parse(error.body) as unknown) : undefined;
  } catch {
    jsonBody = undefined;
  }
  return new ApiError(error.status, error.body, jsonBody, error.message);
}

/** Call one platform operation and print its JSON body. */
async function runPlatform(
  ctx: CliContext,
  command: Command,
  operation: PlatformOperation,
): Promise<void> {
  const global = command.optsWithGlobals() as Record<string, unknown>;
  const client: PlatformCaller = ctx.createPlatformClient({
    baseUrl:
      text(global.platformUrl) ?? text(ctx.env.ONE_MSG_PLATFORM_URL) ?? 'https://api.1msg.io',
    apiKey: apiKey(ctx, global),
  });
  try {
    const input = await callInput(ctx, command, operation);
    printJson(ctx.stdout, await client.call(operation.operationId, input));
  } catch (error) {
    if (error instanceof PlatformError) throw asApiError(error);
    throw error;
  }
}

/** Give group commands a help action without replacing an operation. */
function fillGroups(
  command: Command,
  ctx: CliContext,
  path: string,
  leaves: ReadonlySet<Command>,
): void {
  if (!leaves.has(command)) {
    command.action(wrap(() => missingSubcommand(ctx, path)));
  }
  for (const child of command.commands) {
    fillGroups(child, ctx, `${path} ${child.name()}`, leaves);
  }
}

/** Root platform command with the key and host flags. */
function platformRoot(program: Command, ctx: CliContext, name: string): Command {
  const command = applyCommon(program.command(name), ctx, name);
  command.option('--api-key <key>');
  command.option('--platform-url <url>');
  return command;
}

/** Register inbox and campaigns from the platform contract. */
export function registerPlatform(program: Command, ctx: CliContext): void {
  const inbox = platformRoot(program, ctx, 'inbox');
  const campaigns = platformRoot(program, ctx, 'campaigns');
  const roots = new Map<string, Command>([
    ['inbox', inbox],
    ['campaigns', campaigns],
  ]);
  const leaves = new Set<Command>();
  for (const operation of PLATFORM_OPERATIONS) {
    const rootName = operation.cli[0];
    const root = rootName ? roots.get(rootName) : undefined;
    if (!root || !rootName) {
      throw new Error(`platform command has no root: ${operation.operationId}`);
    }
    const leaf = walk(root, ctx, operation.cli.slice(1), rootName);
    addArguments(leaf, operation.pathParams);
    addFlags(leaf, operation);
    leaf.action(
      /** Call this platform operation with the parsed command state. */
      wrap(function (this: Command) {
        return runPlatform(ctx, this, operation);
      }),
    );
    leaves.add(leaf);
  }
  fillGroups(inbox, ctx, 'inbox', leaves);
  fillGroups(campaigns, ctx, 'campaigns', leaves);
}
