import { stringify } from 'yaml';
import { configFilePath } from '../paths';
import { resolveChannel } from '../config';
import { makeCtx } from './helpers';
import { runCli } from '../run';
import { NotConfiguredError } from '../errors';

describe('config precedence', () => {
  it('does not let leftover ONE_MSG_TOKEN override a named channel token', () => {
    const { ctx } = makeCtx({
      env: {
        ONE_MSG_TOKEN: 'env-token',
        ONE_MSG_BASE_URL: 'https://sandbox.1msg.io',
        ONE_MSG_INSTANCE_ID: 'ENVINST',
      },
    });
    const file = configFilePath(ctx);
    ctx.fs.writeFileSync(
      file,
      stringify({
        version: 1,
        default_channel: 'prod',
        channels: {
          prod: {
            base_url: 'https://api.1msg.io',
            instance_id: 'ODI371267300',
            token: 'file-token',
          },
        },
      }),
    );
    const resolved = resolveChannel(ctx, {});
    expect(resolved.token).toBe('file-token');
    expect(resolved.instanceId).toBe('ODI371267300');
    expect(resolved.baseUrl).toBe('https://api.1msg.io');
  });

  it('fills empty named-channel fields from env', () => {
    const { ctx } = makeCtx({
      env: {
        ONE_MSG_TOKEN: 'env-token',
        ONE_MSG_BASE_URL: 'https://api.1msg.io',
      },
    });
    ctx.fs.writeFileSync(
      configFilePath(ctx),
      stringify({
        version: 1,
        default_channel: 'prod',
        channels: {
          prod: { instance_id: 'ODI1' },
        },
      }),
    );
    const resolved = resolveChannel(ctx, {});
    expect(resolved.token).toBe('env-token');
    expect(resolved.baseUrl).toBe('https://api.1msg.io');
    expect(resolved.instanceId).toBe('ODI1');
  });

  it('lets --token / --base-url / --instance-id win', () => {
    const { ctx } = makeCtx({
      env: { ONE_MSG_TOKEN: 'env-token' },
    });
    ctx.fs.writeFileSync(
      configFilePath(ctx),
      stringify({
        version: 1,
        default_channel: 'prod',
        channels: {
          prod: {
            base_url: 'https://api.1msg.io',
            instance_id: 'ODI1',
            token: 'file-token',
          },
        },
      }),
    );
    const resolved = resolveChannel(ctx, {
      token: 'flag-token',
      baseUrl: 'https://sandbox.1msg.io',
      instanceId: 'ODI2',
    });
    expect(resolved.token).toBe('flag-token');
    expect(resolved.baseUrl).toBe('https://sandbox.1msg.io');
    expect(resolved.instanceId).toBe('ODI2');
  });

  it('uses env as implicit channel when there is no config file', () => {
    const { ctx } = makeCtx({
      env: {
        ONE_MSG_BASE_URL: 'https://api.1msg.io',
        ONE_MSG_INSTANCE_ID: 'ODI1',
        ONE_MSG_TOKEN: 'ci-token',
      },
    });
    const resolved = resolveChannel(ctx, {});
    expect(resolved.token).toBe('ci-token');
    expect(resolved.name).toBeUndefined();
  });

  it('exits 5 when nothing is configured', () => {
    const { ctx } = makeCtx({ env: {} });
    expect(() => resolveChannel(ctx, {})).toThrow(NotConfiguredError);
  });

  it('fills named-channel token from CHAT_API_TOKEN alias', () => {
    const { ctx } = makeCtx({
      env: { CHAT_API_TOKEN: 'mcp-token' },
    });
    ctx.fs.writeFileSync(
      configFilePath(ctx),
      stringify({
        version: 1,
        default_channel: 'prod',
        channels: {
          prod: {
            base_url: 'https://api.1msg.io',
            instance_id: 'ODI1',
          },
        },
      }),
    );
    expect(resolveChannel(ctx, {}).token).toBe('mcp-token');
  });

  it('channel use accepts a unique instance id', async () => {
    const { ctx, stdout } = makeCtx();
    ctx.fs.writeFileSync(
      configFilePath(ctx),
      stringify({
        version: 1,
        default_channel: 'a',
        channels: {
          a: { instance_id: 'ODI1', base_url: 'https://api.1msg.io' },
          b: { instance_id: 'ODI2', base_url: 'https://sandbox.1msg.io' },
        },
      }),
    );
    const code = await runCli(['channel', 'use', 'ODI2'], ctx);
    expect(code).toBe(0);
    expect(stdout.toString()).toContain('b');
  });

  it('channel use errors when instance id matches two names', async () => {
    const { ctx, stderr } = makeCtx();
    ctx.fs.writeFileSync(
      configFilePath(ctx),
      stringify({
        version: 1,
        default_channel: 'a',
        channels: {
          'acme-prod': { instance_id: 'ODI371267300' },
          'acme-test': { instance_id: 'ODI371267300' },
        },
      }),
    );
    const code = await runCli(['channel', 'use', 'ODI371267300'], ctx);
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('matches acme-prod and acme-test');
  });
});
