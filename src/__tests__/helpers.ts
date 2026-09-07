import { Writable } from 'stream';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { Client, ClientConfigOptions } from '@1msg/sdk';
import { createDefaultContext, type CliContext } from '../context';

export class MemoryWriter extends Writable {
  chunks: string[] = [];
  override _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (err?: Error | null) => void): void {
    this.chunks.push(String(chunk));
    cb();
  }
  toString(): string {
    return this.chunks.join('');
  }
}

export function createRecordingClient(): { client: Client; calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const fn = (label: string) =>
    jest.fn().mockImplementation(async (...args: unknown[]) => {
      calls.push({ method: label, args });
      if (label === 'sendMessage' || label.startsWith('messaging.send')) {
        return { sent: true, id: 'wamid.mock', chatId: '12020721369@c.us' };
      }
      if (label === 'templates.listTemplates') {
        return { total: 1, templates: [{ name: 'hello_world', status: 'APPROVED', language: 'en', category: 'UTILITY', id: '1' }] };
      }
      if (label === 'messaging.listMessages') {
        return { messages: [{ time: 1, chatId: '12020721369@c.us', from: 'me', type: 'text', id: 'm1', body: 'hello' }] };
      }
      if (label === 'channel.getStatus') {
        return { status: 'connected', accountStatus: 'authenticated', mm_lite_available: false };
      }
      if (label === 'profile.getMe') {
        return { about: 'Available', phone: '12020721369' };
      }
      if (label === 'messaging.createUploadMedia') {
        return { mediaId: '123456' };
      }
      if (label === 'catalog.getCommerce') {
        return [{ id: 'cat1', is_cart_enabled: true, is_catalog_visible: false }];
      }
      if (label === 'users.listBlockedUsers') {
        return { blockedUsers: [{ phone: '12020721369' }] };
      }
      if (label === 'groups.listGroups') {
        return { groups: [{ id: '120363046942338209@g.us', subject: 'Support' }] };
      }
      if (label === 'flows.listFlows') {
        return { items: [{ id: 'FLOW1', name: 'lead', status: 'DRAFT', categories: ['OTHER'] }] };
      }
      return { ok: true };
    });

  const proxy = (prefix: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop: string) => fn(`${prefix}.${prop}`),
      },
    );

  const client = {
    config: { token: 'test-token', baseUrl: 'https://api.1msg.io', instanceId: 'ODI1' },
    sendMessage: fn('sendMessage'),
    messaging: proxy('messaging'),
    profile: proxy('profile'),
    templates: proxy('templates'),
    channel: proxy('channel'),
    catalog: proxy('catalog'),
    users: proxy('users'),
    groups: proxy('groups'),
    flows: proxy('flows'),
    webhooks: proxy('webhooks'),
    calling: proxy('calling'),
  } as unknown as Client;

  return { client, calls };
}

export function makeCtx(opts?: {
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  createClient?: (options: ClientConfigOptions) => Client;
  files?: Record<string, string>;
}): { ctx: CliContext; stdout: MemoryWriter; stderr: MemoryWriter; files: Map<string, Buffer | string> } {
  const stdout = new MemoryWriter();
  const stderr = new MemoryWriter();
  const homedir = opts?.homedir ?? path.join(os.tmpdir(), `1msg-cli-test-${Math.random().toString(16).slice(2)}`);
  const files = new Map<string, Buffer | string>();
  if (opts?.files) {
    for (const [k, v] of Object.entries(opts.files)) files.set(k, v);
  }
  const memFs: CliContext['fs'] = {
    existsSync: (p) => files.has(String(p)),
    readFileSync: ((p: fs.PathLike) => {
      const value = files.get(String(p));
      if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return value as string;
    }) as typeof fs.readFileSync,
    writeFileSync: ((p: fs.PathLike, data: string | Buffer) => {
      files.set(String(p), data);
    }) as typeof fs.writeFileSync,
    mkdirSync: (() => undefined) as typeof fs.mkdirSync,
    chmodSync: (() => undefined) as typeof fs.chmodSync,
  };
  const { client } = createRecordingClient();
  const ctx = createDefaultContext({
    env: opts?.env ?? {},
    cwd: homedir,
    homedir,
    platform: 'darwin',
    stdout,
    stderr,
    stdinIsTTY: false,
    fs: memFs,
    createClient: opts?.createClient ?? (() => client),
    readStdin: async () => '',
    prompt: {
      question: async () => '',
      hidden: async () => '',
    },
  });
  return { ctx, stdout, stderr, files };
}
