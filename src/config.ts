import path from 'path';
import { parse, stringify } from 'yaml';
import type { CliContext } from './context';
import { NotConfiguredError, UsageError } from './errors';
import { configFilePath } from './paths';

export interface ChannelBlock {
  base_url?: string;
  instance_id?: string;
  token?: string;
}

export interface FileConfig {
  version: 1;
  default_channel?: string;
  channels: Record<string, ChannelBlock>;
}

export interface GlobalFlags {
  channel?: string;
  instanceId?: string;
  baseUrl?: string;
  token?: string;
  json?: boolean;
  color?: boolean;
}

export interface ResolvedChannel {
  name?: string;
  baseUrl: string;
  instanceId: string;
  token: string;
}

const PUBLIC_API_HOST_ALIASES: Record<string, string> = {
  'api.1msg.io': 'api.1msg.io',
  'www.api.1msg.io': 'api.1msg.io',
  'sandbox.1msg.io': 'sandbox.1msg.io',
  'www.sandbox.1msg.io': 'sandbox.1msg.io',
  'api.sandbox.1msg.io': 'sandbox.1msg.io',
};

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new UsageError('base URL must not be empty');
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new UsageError(
      `Invalid base URL '${raw}'. Use https://api.1msg.io or https://sandbox.1msg.io`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UsageError(`Invalid base URL protocol '${parsed.protocol}'`);
  }
  const hostname = parsed.hostname.toLowerCase();
  const canonical = PUBLIC_API_HOST_ALIASES[hostname];
  if (canonical) return `https://${canonical}`;
  const protocol = hostname.endsWith('.1msg.io') ? 'https:' : parsed.protocol;
  const host = parsed.port ? `${hostname}:${parsed.port}` : hostname;
  return `${protocol}//${host}`;
}

function readEnv(ctx: CliContext, name: string, aliases: string[] = []): string | undefined {
  for (const key of [name, ...aliases]) {
    const value = ctx.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function envChannel(ctx: CliContext): string | undefined {
  return readEnv(ctx, 'ONE_MSG_CHANNEL');
}

export function envBaseUrl(ctx: CliContext): string | undefined {
  return readEnv(ctx, 'ONE_MSG_BASE_URL', [
    'CHAT_API_BASE_URL',
    'CHAT_API_ROOT_URL',
    'CHAT_API_URL',
  ]);
}

export function envInstanceId(ctx: CliContext): string | undefined {
  return readEnv(ctx, 'ONE_MSG_INSTANCE_ID', ['CHAT_API_INSTANCE_ID', 'INSTANCE_ID']);
}

export function envToken(ctx: CliContext): string | undefined {
  return readEnv(ctx, 'ONE_MSG_TOKEN', ['CHAT_API_TOKEN', 'CHAT_API_KEY', 'TOKEN']);
}

export function loadConfig(ctx: CliContext): FileConfig | null {
  const filePath = configFilePath(ctx);
  if (!ctx.fs.existsSync(filePath)) return null;
  const raw = ctx.fs.readFileSync(filePath, 'utf8');
  if (!String(raw).trim()) return null;
  const parsed = parse(String(raw)) as Partial<FileConfig> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  const channels =
    parsed.channels && typeof parsed.channels === 'object' ? parsed.channels : {};
  return {
    version: 1,
    default_channel: parsed.default_channel,
    channels,
  };
}

export function saveConfig(ctx: CliContext, config: FileConfig): void {
  const filePath = configFilePath(ctx);
  const parent = path.dirname(filePath);
  ctx.fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const yaml = stringify({
    version: 1,
    default_channel: config.default_channel,
    channels: config.channels,
  });
  ctx.fs.writeFileSync(filePath, yaml, { encoding: 'utf8', mode: 0o600 });
  try {
    ctx.fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows may ignore mode.
  }
}

export function emptyConfig(): FileConfig {
  return { version: 1, channels: {} };
}

export function resolveChannel(ctx: CliContext, flags: GlobalFlags): ResolvedChannel {
  const file = loadConfig(ctx);
  const channelName =
    flags.channel ||
    envChannel(ctx) ||
    file?.default_channel ||
    (file && Object.keys(file.channels).length === 1
      ? Object.keys(file.channels)[0]
      : undefined);

  if (channelName) {
    const block = file?.channels[channelName];
    if (!block) {
      throw new UsageError(`channel "${channelName}" not in config`, '1msg channel list');
    }
    return fillChannel(ctx, flags, block, channelName);
  }

  const baseUrl = flags.baseUrl || envBaseUrl(ctx);
  const instanceId = flags.instanceId || envInstanceId(ctx);
  const token = flags.token || envToken(ctx);
  if (baseUrl && instanceId && token) {
    return {
      baseUrl: normalizeBaseUrl(baseUrl),
      instanceId,
      token,
    };
  }

  throw new NotConfiguredError();
}

function fillChannel(
  ctx: CliContext,
  flags: GlobalFlags,
  block: ChannelBlock,
  name: string,
): ResolvedChannel {
  let baseUrl = block.base_url?.trim() || '';
  let instanceId = block.instance_id?.trim() || '';
  let token = block.token?.trim() || '';
  if (!baseUrl) baseUrl = envBaseUrl(ctx) || '';
  if (!instanceId) instanceId = envInstanceId(ctx) || '';
  if (!token) token = envToken(ctx) || '';
  if (flags.baseUrl) baseUrl = flags.baseUrl;
  if (flags.instanceId) instanceId = flags.instanceId;
  if (flags.token) token = flags.token;
  if (!baseUrl || !instanceId || !token) {
    throw new NotConfiguredError();
  }
  return {
    name,
    baseUrl: normalizeBaseUrl(baseUrl),
    instanceId,
    token,
  };
}

export function lookupChannelName(config: FileConfig, nameOrId: string): string {
  if (config.channels[nameOrId]) return nameOrId;
  const matches = Object.entries(config.channels)
    .filter(([, block]) => block.instance_id === nameOrId)
    .map(([name]) => name);
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new UsageError(`channel "${nameOrId}" not in config`, '1msg channel list');
  }
  throw new UsageError(
    `instance id ${nameOrId} matches ${matches.join(' and ')}; pass a config name`,
  );
}

export function channelNames(ctx: CliContext): string[] {
  const file = loadConfig(ctx);
  return file ? Object.keys(file.channels) : [];
}
