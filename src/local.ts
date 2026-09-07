import type { Command } from 'commander';
import type { CliContext } from './context';
import {
  emptyConfig,
  envInstanceId,
  envToken,
  loadConfig,
  lookupChannelName,
  normalizeBaseUrl,
  saveConfig,
  type FileConfig,
  type GlobalFlags,
} from './config';
import { CliExit, usage } from './errors';
import { ok, outputOpts, printApiResult, withClient } from './execute';
import { helpFor } from './help-text';
import { asRecord, printKv, printTable } from './output';
import { configFilePath } from './paths';
import { CLI_VERSION } from './version';
import { SDK_VERSION } from '@1msg/sdk';
import { completeKind, completionScript } from './completion';

export function globalsFrom(cmd: Command): GlobalFlags {
  const opts = cmd.optsWithGlobals() as Record<string, unknown>;
  return {
    channel: opts.channel as string | undefined,
    instanceId: opts.instanceId as string | undefined,
    baseUrl: opts.baseUrl as string | undefined,
    token: opts.token as string | undefined,
    json: Boolean(opts.json),
    color: opts.color as boolean | undefined,
  };
}

export function writeHelp(ctx: CliContext, path: string): void {
  const text = resolveHelp(path);
  ctx.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

export function resolveHelp(path: string): string {
  const parts = path.split(' ').filter(Boolean);
  while (parts.length) {
    const key = parts.join(' ');
    const text = helpFor(key);
    if (text) return text;
    parts.pop();
  }
  return helpFor('root') ?? '';
}

export function missingSubcommand(ctx: CliContext, helpPath: string): never {
  writeHelp(ctx, helpPath);
  throw new CliExit(1);
}

async function maybeToken(ctx: CliContext, opts: { tokenStdin?: boolean }): Promise<string | undefined> {
  if (opts.tokenStdin) {
    const token = (await ctx.readStdin()).trim();
    return token || undefined;
  }
  return envToken(ctx);
}

async function verifyStatus(ctx: CliContext, flags: GlobalFlags): Promise<void> {
  const body = await withClient(ctx, flags, (client) => client.channel.getStatus(client.config.token));
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    printKv(ctx.stdout, [
      ['status', rec.status],
      ['accountStatus', rec.accountStatus],
      ['mm_lite_available', rec.mm_lite_available],
    ]);
  });
}

async function promptChannel(
  ctx: CliContext,
  opts: {
    name?: string;
    baseUrl?: string;
    instanceId?: string;
    tokenStdin?: boolean;
  },
  interactive: boolean,
): Promise<{ name: string; baseUrl: string; instanceId: string; token: string }> {
  let name = opts.name;
  let baseUrl = opts.baseUrl;
  let instanceId = opts.instanceId;
  let token = await maybeToken(ctx, opts);

  if (interactive) {
    if (!name) {
      const answer = (await ctx.prompt.question('Channel name [default]: ')).trim();
      name = answer || 'default';
    }
    if (!baseUrl) {
      const answer = (
        await ctx.prompt.question('Host: (1) live https://api.1msg.io  (2) sandbox https://sandbox.1msg.io [1]: ')
      ).trim();
      if (answer === '2' || /sandbox/i.test(answer)) baseUrl = 'https://sandbox.1msg.io';
      else if (answer && answer !== '1') baseUrl = answer;
      else baseUrl = 'https://api.1msg.io';
    }
    if (!instanceId) {
      instanceId = (await ctx.prompt.question('Instance id: ')).trim() || envInstanceId(ctx);
    }
    if (!token) {
      token = (await ctx.prompt.hidden('Token: ')).trim() || envToken(ctx);
    }
  }

  name = name || 'default';
  if (!baseUrl) usage('--base-url is required', '1msg init --help');
  if (!instanceId) usage('--instance-id is required', '1msg init --help');
  if (!token) usage('token is required (stdin, prompt, or ONE_MSG_TOKEN)', '1msg init --help');
  return {
    name,
    baseUrl: normalizeBaseUrl(baseUrl),
    instanceId,
    token,
  };
}

function upsertChannel(
  ctx: CliContext,
  input: {
    name: string;
    baseUrl: string;
    instanceId: string;
    token: string;
    makeDefault?: boolean;
  },
): FileConfig {
  const config = loadConfig(ctx) ?? emptyConfig();
  const first = Object.keys(config.channels).length === 0;
  config.channels[input.name] = {
    base_url: input.baseUrl,
    instance_id: input.instanceId,
    token: input.token,
  };
  if (input.makeDefault || first || !config.default_channel) {
    config.default_channel = input.name;
  }
  saveConfig(ctx, config);
  return config;
}

export async function handleInit(
  ctx: CliContext,
  cmd: Command,
  opts: {
    name?: string;
    baseUrl?: string;
    instanceId?: string;
    tokenStdin?: boolean;
    verify?: boolean;
  },
): Promise<number> {
  const interactive = !opts.tokenStdin && ctx.stdinIsTTY && (!opts.baseUrl || !opts.instanceId);
  const channel = await promptChannel(ctx, opts, interactive);
  let makeDefault = true;
  if (interactive) {
    const answer = (await ctx.prompt.question('Set as default? [Y/n]: ')).trim().toLowerCase();
    makeDefault = answer !== 'n' && answer !== 'no';
  }
  upsertChannel(ctx, { ...channel, makeDefault });
  ctx.stderr.write(`Wrote ${configFilePath(ctx)}\n`);
  if (opts.verify === false) return ok();
  await verifyStatus(ctx, { ...globalsFrom(cmd), channel: channel.name, token: channel.token, baseUrl: channel.baseUrl, instanceId: channel.instanceId });
  return ok();
}

export async function handleChannelAdd(
  ctx: CliContext,
  cmd: Command,
  opts: {
    name?: string;
    baseUrl?: string;
    instanceId?: string;
    tokenStdin?: boolean;
    default?: boolean;
    verify?: boolean;
  },
): Promise<number> {
  const nonInteractive = Boolean(opts.name && opts.baseUrl && (opts.instanceId || envInstanceId(ctx)));
  const interactive = !nonInteractive;
  if (!interactive && !opts.name) usage('--name is required', '1msg channel add --help');
  const channel = await promptChannel(
    ctx,
    {
      name: opts.name,
      baseUrl: opts.baseUrl,
      instanceId: opts.instanceId || envInstanceId(ctx),
      tokenStdin: opts.tokenStdin,
    },
    interactive,
  );
  upsertChannel(ctx, { ...channel, makeDefault: Boolean(opts.default) });
  ctx.stderr.write(`Wrote ${configFilePath(ctx)}\n`);
  if (opts.verify === false) return ok();
  await verifyStatus(ctx, {
    ...globalsFrom(cmd),
    channel: channel.name,
    token: channel.token,
    baseUrl: channel.baseUrl,
    instanceId: channel.instanceId,
  });
  return ok();
}

export function handleChannelList(ctx: CliContext, cmd: Command): number {
  const flags = globalsFrom(cmd);
  const config = loadConfig(ctx) ?? emptyConfig();
  const rows = Object.entries(config.channels).map(([name, block]) => ({
    default: config.default_channel === name ? '*' : '',
    name,
    instance_id: block.instance_id ?? '',
    base_url: block.base_url ?? '',
  }));
  const opts = outputOpts(flags, ctx);
  if (opts.json) {
    ctx.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return ok();
  }
  printTable(ctx.stdout, ctx.stderr, ['default', 'name', 'instance_id', 'base_url'], rows);
  return ok();
}

export function handleChannelUse(ctx: CliContext, nameOrId: string | undefined): number {
  if (!nameOrId) usage('missing channel name or instance id', '1msg channel use --help');
  const config = loadConfig(ctx);
  if (!config) usage(`channel "${nameOrId}" not in config`, '1msg channel list');
  const name = lookupChannelName(config, nameOrId);
  config.default_channel = name;
  saveConfig(ctx, config);
  const block = config.channels[name];
  ctx.stdout.write(`${name}  ${block.instance_id ?? ''}\n`);
  return ok();
}

export function handleChannelRemove(ctx: CliContext, name: string | undefined): number {
  if (!name) usage('missing channel name', '1msg channel --help');
  const config = loadConfig(ctx);
  if (!config || !config.channels[name]) {
    usage(`channel "${name}" not in config`, '1msg channel list');
  }
  delete config.channels[name];
  if (config.default_channel === name) {
    const remaining = Object.keys(config.channels);
    config.default_channel = remaining.length === 1 ? remaining[0] : remaining[0];
    if (remaining.length === 0) delete config.default_channel;
  }
  saveConfig(ctx, config);
  return ok();
}

export function handleChannelCurrent(ctx: CliContext, cmd: Command): number {
  const config = loadConfig(ctx);
  const flags = globalsFrom(cmd);
  const name = config?.default_channel;
  const block = name ? config?.channels[name] : undefined;
  if (!name || !block) usage('no default channel — run 1msg init', '1msg channel list');
  const body = { name, instance_id: block.instance_id ?? '' };
  if (outputOpts(flags, ctx).json) {
    ctx.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    return ok();
  }
  ctx.stdout.write(`${name}  ${block.instance_id ?? ''}\n`);
  return ok();
}

export function handleVersion(ctx: CliContext): number {
  printKv(ctx.stdout, [
    ['cli', CLI_VERSION],
    ['sdk', SDK_VERSION],
  ]);
  return ok();
}

export function handleCompletion(ctx: CliContext, shell: string | undefined): number {
  if (!shell) usage('missing shell: bash | zsh | powershell', '1msg completion --help');
  ctx.stdout.write(completionScript(shell));
  return ok();
}

export function handleCompleteQuery(ctx: CliContext, kind: string | undefined): number {
  const values = completeKind(ctx, kind || 'commands');
  for (const value of values) ctx.stdout.write(`${value}\n`);
  return ok();
}
