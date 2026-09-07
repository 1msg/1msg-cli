import { stringify } from 'yaml';
import { runCli } from '../run';
import { configFilePath } from '../paths';
import { createRecordingClient, makeCtx } from './helpers';

function withChannel(ctxFilesWrite: (ctx: ReturnType<typeof makeCtx>['ctx']) => void) {
  const bundle = createRecordingClient();
  const made = makeCtx({ createClient: () => bundle.client });
  made.ctx.fs.writeFileSync(
    configFilePath(made.ctx),
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
  ctxFilesWrite(made.ctx);
  return { ...made, bundle };
}

describe('commands', () => {
  it('send --text calls sendMessage', async () => {
    const { ctx, stdout, bundle } = withChannel(() => undefined);
    const code = await runCli(['send', '--to', '12020721369', '--text', 'Hello'], ctx);
    expect(code).toBe(0);
    expect(bundle.calls.some((c) => c.method === 'sendMessage')).toBe(true);
    expect(stdout.toString()).toMatch(/sent/);
  });

  it('rejects missing destination', async () => {
    const { ctx, stderr } = withChannel(() => undefined);
    const code = await runCli(['send', '--text', 'Hello'], ctx);
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('missing destination: pass --to or --chat-id');
  });

  it('rejects two body kinds', async () => {
    const { ctx, stderr } = withChannel(() => undefined);
    const code = await runCli(
      ['send', '--to', '12020721369', '--text', 'Hello', '--file', './a.jpg'],
      ctx,
    );
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('pass exactly one of --text, --file, or --media-id');
  });

  it('usage --json prints { error }', async () => {
    const { ctx, stderr } = withChannel(() => undefined);
    const code = await runCli(['send', '--text', 'Hello', '--json'], ctx);
    expect(code).toBe(1);
    expect(JSON.parse(stderr.toString())).toEqual({
      error: 'missing destination: pass --to or --chat-id',
    });
  });

  it('missing named channel is a usage error', async () => {
    const { ctx, stderr } = withChannel(() => undefined);
    const code = await runCli(['-c', 'missing', 'status'], ctx);
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('channel "missing" not in config');
  });

  it('channel info --json nests status and me', async () => {
    const { ctx, stdout } = withChannel(() => undefined);
    const code = await runCli(['channel', 'info', '--json'], ctx);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.toString()) as { status: unknown; me: unknown };
    expect(parsed.status).toMatchObject({ status: 'connected' });
    expect(parsed.me).toMatchObject({ phone: '12020721369' });
  });

  it('status --json is the raw GET /status body', async () => {
    const { ctx, stdout } = withChannel(() => undefined);
    const code = await runCli(['status', '--json'], ctx);
    expect(code).toBe(0);
    expect(JSON.parse(stdout.toString())).toMatchObject({ status: 'connected' });
  });

  it('https --file without --filename exits 1', async () => {
    const { ctx, stderr } = withChannel(() => undefined);
    const code = await runCli(
      ['send', '--to', '12020721369', '--file', 'https://example.com/a.pdf'],
      ctx,
    );
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('https --file requires --filename');
  });

  it('completion prints a bash script', async () => {
    const { ctx, stdout } = withChannel(() => undefined);
    const code = await runCli(['completion', 'bash'], ctx);
    expect(code).toBe(0);
    expect(stdout.toString()).toContain('complete -F _1msg 1msg');
  });

  it('version prints cli and sdk', async () => {
    const { ctx, stdout } = withChannel(() => undefined);
    const code = await runCli(['version'], ctx);
    expect(code).toBe(0);
    expect(stdout.toString()).toMatch(/cli\s+0\.1\.0/);
    expect(stdout.toString()).toMatch(/sdk\s+/);
  });

  it('channel list never prints tokens', async () => {
    const { ctx, stdout } = withChannel(() => undefined);
    const code = await runCli(['channel', 'list'], ctx);
    expect(code).toBe(0);
    expect(stdout.toString()).not.toContain('file-token');
    expect(stdout.toString()).toContain('prod');
  });

  it('template list writes completion cache names', async () => {
    const { ctx, files } = withChannel(() => undefined);
    const code = await runCli(['template', 'list'], ctx);
    expect(code).toBe(0);
    const cache = [...files.entries()].find(([k]) => k.endsWith('completion.json'));
    expect(cache).toBeDefined();
    expect(String(cache?.[1])).toContain('hello_world');
  });

  it('settings set --no-guaranteed-hooks sends false', async () => {
    const { ctx, bundle } = withChannel(() => undefined);
    const code = await runCli(
      ['channel', 'settings', 'set', '--ack-notifications', '--no-guaranteed-hooks'],
      ctx,
    );
    expect(code).toBe(0);
    const call = bundle.calls.find((c) => c.method === 'channel.createSettings');
    expect(call?.args[1]).toEqual({
      guaranteedHooks: false,
      ackNotificationsOn: true,
    });
  });

  it('catalog set --no-cart --no-visible sends false', async () => {
    const { ctx, bundle } = withChannel(() => undefined);
    const code = await runCli(['catalog', 'set', '--no-cart', '--no-visible'], ctx);
    expect(code).toBe(0);
    const call = bundle.calls.find((c) => c.method === 'catalog.createCommerce');
    expect(call?.args[1]).toEqual({
      params: { is_cart_enabled: false, is_catalog_visible: false },
    });
  });

  it('API 401 exits 2 with HTTP hint', async () => {
    const { ctx, stderr, bundle } = withChannel(() => undefined);
    (bundle.client.sendMessage as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 401,
        text: async () => JSON.stringify({ error: 'invalid or expired token' }),
      },
    });
    const code = await runCli(['send', '--to', '12020721369', '--text', 'Hello'], ctx);
    expect(code).toBe(2);
    expect(stderr.toString()).toContain('invalid or expired token (HTTP 401)');
    expect(stderr.toString()).toContain('set ONE_MSG_TOKEN or run `1msg init`');
  });

  it('API 500 exits 3 and --json prints the raw body', async () => {
    const { ctx, stderr, bundle } = withChannel(() => undefined);
    (bundle.client.sendMessage as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 500,
        text: async () => JSON.stringify({ error: 'upstream' }),
      },
    });
    const code = await runCli(['send', '--to', '12020721369', '--text', 'Hello', '--json'], ctx);
    expect(code).toBe(3);
    expect(JSON.parse(stderr.toString())).toEqual({ error: 'upstream' });
  });

  it('network errors exit 4', async () => {
    const { ctx, bundle } = withChannel(() => undefined);
    const err = new Error('fetch failed');
    err.name = 'FetchError';
    (bundle.client.sendMessage as jest.Mock).mockRejectedValueOnce(err);
    const code = await runCli(['send', '--to', '12020721369', '--text', 'Hello'], ctx);
    expect(code).toBe(4);
  });

  it('not configured exits 5', async () => {
    const { ctx, stderr } = makeCtx({ env: {} });
    const code = await runCli(['status'], ctx);
    expect(code).toBe(5);
    expect(stderr.toString()).toContain('no channel configured — run 1msg init');
  });
});
