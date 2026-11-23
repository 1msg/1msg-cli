import type { PlatformCallInput } from '@1msg/sdk';

import { runCli } from '../run';
import { makeCtx } from './helpers';

/** Record platform calls without leaving the process. */
function recordingPlatform() {
  const calls: Array<{ operationId: string; input: PlatformCallInput }> = [];
  /** Store the operation id and input, then return a stub body. */
  async function call(operationId: string, input?: PlatformCallInput) {
    calls.push({ operationId, input: input ?? {} });
    return { ok: true };
  }
  /** Return a client that records each platform call. */
  function createPlatformClient() {
    return { call };
  }
  return { calls, createPlatformClient };
}

/** Exercise inbox and campaigns commands against a recording client. */
describe('platform commands', () => {
  /** List channels and record the platform operation. */
  it('lists inbox channels with the platform key', async () => {
    const platform = recordingPlatform();
    const { ctx, stdout } = makeCtx({
      env: { ONE_MSG_PLATFORM_KEY: '1msg_live_test' },
      createPlatformClient: platform.createPlatformClient,
    });
    const code = await runCli(['inbox', 'channels'], ctx);
    expect(code).toBe(0);
    expect(platform.calls).toEqual([
      {
        operationId: 'listInboxChannels',
        input: { path: {}, query: {} },
      },
    ]);
    expect(stdout.toString()).toContain('"ok": true');
  });

  /** Reject inbox commands when the platform key is missing. */
  it('refuses inbox commands without a platform key', async () => {
    const platform = recordingPlatform();
    const { ctx, stderr } = makeCtx({
      createPlatformClient: platform.createPlatformClient,
    });
    const code = await runCli(['inbox', 'channels'], ctx);
    expect(code).toBe(1);
    expect(stderr.toString()).toContain('ONE_MSG_PLATFORM_KEY');
    expect(platform.calls).toEqual([]);
  });

  /** Send a conversation status in the platform request body. */
  it('sends a conversation status change', async () => {
    const platform = recordingPlatform();
    const { ctx } = makeCtx({
      env: { ONE_MSG_PLATFORM_KEY: '1msg_live_test' },
      createPlatformClient: platform.createPlatformClient,
    });
    const code = await runCli(
      ['inbox', 'conversations', 'status', 'conv-1', '--status', 'CLOSED'],
      ctx,
    );
    expect(code).toBe(0);
    expect(platform.calls[0]).toEqual({
      operationId: 'updateInboxConversationStatus',
      input: {
        path: { conversationId: 'conv-1' },
        query: {},
        body: { status: 'CLOSED' },
      },
    });
  });

  /** Keep recipient analytics separate from the summary operation. */
  it('keeps analytics subcommands distinct from the summary id', async () => {
    const platform = recordingPlatform();
    const { ctx } = makeCtx({
      env: { ONE_MSG_PLATFORM_KEY: '1msg_live_test' },
      createPlatformClient: platform.createPlatformClient,
    });
    const code = await runCli(
      ['campaigns', 'analytics', 'recipients', 'camp-1', '--filter', 'replied'],
      ctx,
    );
    expect(code).toBe(0);
    expect(platform.calls[0]).toEqual({
      operationId: 'listCampaignAnalyticsRecipients',
      input: {
        path: { campaignId: 'camp-1' },
        query: { filter: 'replied' },
      },
    });
  });
});
