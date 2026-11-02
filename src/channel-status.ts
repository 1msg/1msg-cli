import type { GlobalFlags } from './config';
import type { CliContext } from './context';

import { printApiResult, withClient } from './execute';
import { asRecord, printKv } from './output';

/** Fetch channel availability and render the same JSON/human output for verification and status commands. */
export async function printChannelStatus(ctx: CliContext, flags: GlobalFlags): Promise<void> {
  const body = await withClient(ctx, flags, (client) =>
    client.channel.getStatus(client.config.token),
  );
  /** Render stable human-readable channel fields when JSON output was not requested. */
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    printKv(ctx.stdout, [
      ['status', rec.status],
      ['accountStatus', rec.accountStatus],
      ['mm_lite_available', rec.mm_lite_available],
    ]);
  });
}
