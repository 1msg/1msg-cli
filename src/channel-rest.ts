import type { Command } from 'commander';

import type { CliContext } from './context';

import { printChannelStatus } from './channel-status';
import { ok, printApiResult, withClient } from './execute';
import { globalsFrom } from './local';
import { asRecord, meProfileRows, printKv } from './output';

/** Fetch channel status and profile through the configured client and render their combined view. */
export async function handleChannelInfo(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const status = await withClient(ctx, flags, (client) =>
    client.channel.getStatus(client.config.token),
  );
  const me = await withClient(ctx, flags, (client) => client.profile.getMe(client.config.token));
  const combined = { status, me };
  /** Present status followed by profile rows in a stable human-readable order. */
  printApiResult(ctx, flags, combined, () => {
    const s = asRecord(status);
    printKv(ctx.stdout, [
      ['status', s.status],
      ['accountStatus', s.accountStatus],
      ['mm_lite_available', s.mm_lite_available],
      ...meProfileRows(me),
    ]);
  });
  return ok();
}

/** Adapt Commander flags into the shared channel-status scenario and preserve the successful exit code. */
export async function handleStatus(ctx: CliContext, cmd: Command): Promise<number> {
  await printChannelStatus(ctx, globalsFrom(cmd));
  return ok();
}
