import type { Command } from 'commander';

import type { CliContext } from './context';

import { destStringPhone, requireDest } from './dest';
import { usage } from './errors';
import { ok, printSent, withClient } from './execute';
import { basenameOf, fileToDataUri, readBinaryFile } from './io';
import { globalsFrom } from './local';
import { asRecord } from './output';

/** Send a sticker from either an existing media identifier or an uploaded local file, preserving optional message metadata. */
export async function handleMessageSticker(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    link?: string;
    mediaId?: string;
    file?: string;
  },
): Promise<number> {
  const sources = [Boolean(opts.link), Boolean(opts.mediaId), Boolean(opts.file)].filter(Boolean);
  if (sources.length !== 1)
    usage('exactly one source: --link, --media-id, or --file', '1msg message sticker --help');
  requireDest(opts, '1msg message sticker --help');
  const dest = destStringPhone(opts);
  const flags = globalsFrom(cmd);
  const payload: Record<string, unknown> = { ...dest };
  if (opts.link) payload.link = opts.link;
  if (opts.mediaId) payload.mediaId = opts.mediaId;
  /** Upload a local file only when selected, then send the resolved sticker identifier through the same client. */
  const body = await withClient(ctx, flags, async (client) => {
    if (opts.file) {
      const buf = readBinaryFile(ctx, opts.file);
      const uploaded = asRecord(
        await client.messaging.createUploadMedia(client.config.token, {
          body: fileToDataUri(buf, basenameOf(opts.file)),
        } as never),
      );
      payload.mediaId = uploaded.mediaId;
    }
    return client.messaging.sendSticker(client.config.token, payload as never);
  });
  printSent(ctx, flags, body);
  return ok();
}
