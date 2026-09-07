import type { Command } from 'commander';
import type { CliContext } from './context';
import { destFields, destStringPhone, parsePhone, requireDest } from './dest';
import { usage } from './errors';
import { ok, printApiResult, printSent, withClient } from './execute';
import {
  basenameOf,
  fileToDataUri,
  isHttpUrl,
  parseInteger,
  parseJsonFlag,
  readBinaryFile,
  readJsonFile,
  readJsonValue,
} from './io';
import { globalsFrom } from './local';
import { asArray, asRecord, pickString, printTable, truncate } from './output';
import { writeCompletionCache } from './completion';
import { resolveChannel } from './config';

type SendOpts = {
  to?: string;
  chatId?: string;
  quote?: string;
  text?: string;
  file?: string;
  caption?: string;
  filename?: string;
  mediaId?: string;
  mediaType?: string;
  voice?: boolean;
};

export async function handleSend(ctx: CliContext, cmd: Command, opts: SendOpts): Promise<number> {
  const dest = requireDest(opts, '1msg send --help');
  const bodies = [opts.text !== undefined, Boolean(opts.file), Boolean(opts.mediaId)].filter(Boolean);
  if (bodies.length !== 1) usage('pass exactly one of --text, --file, or --media-id', '1msg send --help');
  const flags = globalsFrom(cmd);
  const toLabel = opts.chatId || (opts.to ? `${opts.to}@c.us` : undefined);

  if (opts.text !== undefined) {
    if (opts.text.length > 4096) usage('--text max 4096 characters', '1msg send --help');
    const body = await withClient(ctx, flags, (client) =>
      client.sendMessage({
        body: opts.text as string,
        quotedMsgId: dest.quotedMsgId,
        chatId: dest.chatId,
        phone: dest.phone,
      }),
    );
    printSent(ctx, flags, body, toLabel);
    return ok();
  }

  let fileBody: string | undefined;
  let filename = opts.filename;
  if (opts.file) {
    if (isHttpUrl(opts.file)) {
      if (!filename) usage('https --file requires --filename', '1msg send --help');
      fileBody = opts.file;
    } else {
      const buf = readBinaryFile(ctx, opts.file);
      filename = filename || basenameOf(opts.file);
      fileBody = fileToDataUri(buf, filename);
    }
  }
  if (opts.mediaId && !opts.mediaType) {
    usage('--media-type is required with --media-id', '1msg send --help');
  }
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendFile(
      client.config.token,
      fileBody,
      filename,
      opts.mediaId,
      opts.mediaType as never,
      opts.voice,
      opts.caption,
      dest.quotedMsgId,
      dest.chatId,
      dest.phone,
    ),
  );
  printSent(ctx, flags, body, toLabel);
  return ok();
}

export async function handleMessageList(
  ctx: CliContext,
  cmd: Command,
  opts: {
    chatId?: string;
    limit?: string;
    last?: boolean;
    msgId?: string;
    minTime?: string;
    maxTime?: string;
    firstNumber?: string;
    lastNumber?: string;
  },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.listMessages(
      client.config.token,
      opts.chatId,
      parseInteger(opts.limit, '--limit'),
      opts.last,
      parseInteger(opts.lastNumber, '--last-number'),
      parseInteger(opts.firstNumber, '--first-number'),
      parseInteger(opts.minTime, '--min-time'),
      parseInteger(opts.maxTime, '--max-time'),
      opts.msgId,
    ),
  );
  const rec = asRecord(body);
  const messages = asArray(rec.messages ?? rec.data);
  if (typeof rec.notice === 'string' && messages.length === 0) {
    printApiResult(ctx, flags, body, () => {
      ctx.stdout.write(`${rec.notice}\n`);
    });
    return ok();
  }
  printApiResult(ctx, flags, body, () => {
    const rows = messages.map((item) => {
      const row = asRecord(item);
      return {
        time: pickString(row, ['time', 'timestamp', 't', 'messageNumber']),
        chat_id: pickString(row, ['chatId', 'chat_id', 'chatid']),
        from: pickString(row, ['from', 'author', 'senderName']),
        type: pickString(row, ['type']),
        id: pickString(row, ['id', 'messageId', 'msgId']),
        body: truncate(pickString(row, ['body', 'text', 'caption'])),
      };
    });
    printTable(ctx.stdout, ctx.stderr, ['time', 'chat_id', 'from', 'type', 'id', 'body'], rows);
  });
  return ok();
}

export async function handleMessageRead(
  ctx: CliContext,
  cmd: Command,
  opts: { messageId?: string; typing?: boolean },
): Promise<number> {
  if (!opts.messageId) usage('--message-id is required', '1msg message read --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.createReadMessage(client.config.token, opts.messageId, undefined, opts.typing),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleMessageReact(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; messageId?: string; emoji?: string },
): Promise<number> {
  if (opts.messageId === undefined) usage('--message-id is required', '1msg message react --help');
  if (opts.emoji === undefined) usage('--emoji is required', '1msg message react --help');
  requireDest(opts, '1msg message react --help');
  const dest = destStringPhone(opts);
  const flags = globalsFrom(cmd);
  const payload = {
    body: opts.emoji,
    quotedMsgId: opts.messageId,
    ...dest,
  };
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendReaction(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageLocation(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; quote?: string; lat?: string; lng?: string; name?: string; address?: string },
): Promise<number> {
  if (opts.lat === undefined || opts.lng === undefined) {
    usage('--lat and --lng are required', '1msg message location --help');
  }
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) usage('--lat must be -90..90', '1msg message location --help');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) usage('--lng must be -180..180', '1msg message location --help');
  const dest = requireDest(opts, '1msg message location --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendLocation(
      client.config.token,
      String(opts.lat),
      String(opts.lng),
      opts.address,
      opts.name,
      dest.quotedMsgId,
      dest.chatId,
      dest.phone,
    ),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageLocationRequest(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; quote?: string; text?: string },
): Promise<number> {
  requireDest(opts, '1msg message location-request --help');
  const dest = destStringPhone(opts);
  const flags = globalsFrom(cmd);
  const payload = { ...dest, body: opts.text };
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendLocationRequest(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageContact(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    org?: string;
    title?: string;
    url?: string;
    fromFile?: string;
  },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const file = await readJsonFile(ctx, opts.fromFile);
  const dest = destFields(opts);
  if (!opts.fromFile) {
    requireDest(opts, '1msg message contact --help');
    if (!opts.name || !opts.phone) usage('--name and --phone are required', '1msg message contact --help');
  }
  const payload: Record<string, unknown> = { ...file };
  if (!payload.contacts && !payload.contact) {
    payload.contacts = [
      {
        name: {
          formatted_name: opts.name,
          first_name: opts.firstName || opts.name?.split(/\s+/)[0],
          last_name: opts.lastName,
        },
        phones: opts.phone ? [{ phone: opts.phone, type: 'CELL' }] : undefined,
        emails: opts.email ? [{ email: opts.email }] : undefined,
        org: opts.org || opts.title ? { company: opts.org, title: opts.title } : undefined,
        urls: opts.url ? [{ url: opts.url }] : undefined,
      },
    ];
  }
  if (dest.phone && payload.phone === undefined) payload.phone = dest.phone;
  if (dest.chatId && payload.chatId === undefined) payload.chatId = dest.chatId;
  if (dest.quotedMsgId && payload.quotedMsgId === undefined) payload.quotedMsgId = dest.quotedMsgId;
  if (!payload.phone && !payload.chatId) requireDest(opts, '1msg message contact --help');
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendContact(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageButtons(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    text?: string;
    footer?: string;
    button?: string[];
    fromFile?: string;
  },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const file = await readJsonFile(ctx, opts.fromFile);
  if (!opts.fromFile) requireDest(opts, '1msg message buttons --help');
  const dest = destStringPhone(opts);
  const buttons = opts.button ?? [];
  if (!opts.fromFile && (!opts.text || buttons.length === 0)) {
    usage('--text and at least one --button are required', '1msg message buttons --help');
  }
  if (buttons.length > 3) usage('--button max 3', '1msg message buttons --help');
  const payload: Record<string, unknown> = { ...file, ...dest };
  if (opts.text) payload.body = opts.text;
  if (opts.footer) payload.footer = opts.footer;
  if (buttons.length) {
    const parsed = buttons.map((raw) => {
      const idx = raw.indexOf(':');
      if (idx <= 0) usage('--button must be id:title', '1msg message buttons --help');
      return { id: raw.slice(0, idx), title: raw.slice(idx + 1) };
    });
    payload.buttons = parsed;
    payload.sections = parsed.map((b) => ({ type: 'reply', reply: b }));
  }
  if (!payload.phone && !payload.chatId) requireDest(opts, '1msg message buttons --help');
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendButton(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageMenu(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    fromFile?: string;
    text?: string;
    buttonText?: string;
    title?: string;
    footer?: string;
  },
): Promise<number> {
  if (!opts.fromFile) usage('--from-file is required', '1msg message menu --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const dest = destStringPhone(opts);
  const payload: Record<string, unknown> = { ...file, ...mergeDefined(dest) };
  if (opts.text) payload.body = opts.text;
  if (opts.buttonText) payload.buttonText = opts.buttonText;
  if (opts.title) payload.title = opts.title;
  if (opts.footer) payload.footer = opts.footer;
  if (!payload.phone && !payload.chatId) requireDest(opts, '1msg message menu --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendList(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageCarousel(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; quote?: string; text?: string; fromFile?: string },
): Promise<number> {
  if (!opts.fromFile) usage('--from-file is required', '1msg message carousel --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const dest = requireDest(opts, '1msg message carousel --help');
  const cards = asArray(file.cards) as object[];
  const params = asArray(file.params) as object[];
  if (!cards.length && !params.length) {
    usage('JSON must include cards[] and/or params[]', '1msg message carousel --help');
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => {
    const sendCarousel = client.messaging.sendCarousel as unknown as (
      token: string,
      body?: string,
      cards?: object[],
      params?: object[],
      quotedMsgId?: string,
      chatId?: string,
      phone?: number,
    ) => Promise<unknown>;
    return sendCarousel(
      client.config.token,
      opts.text ?? (file.body as string | undefined),
      cards.length ? cards : undefined,
      params.length ? params : undefined,
      dest.quotedMsgId,
      dest.chatId,
      dest.phone,
    );
  });
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageProduct(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    text?: string;
    header?: string;
    footer?: string;
    catalogId?: string;
    productId?: string;
    fromFile?: string;
  },
): Promise<number> {
  const hasPair = Boolean(opts.catalogId && opts.productId);
  if (Boolean(opts.fromFile) === hasPair || (!opts.fromFile && !hasPair)) {
    usage('exactly one of: --from-file, or --catalog-id plus --product-id', '1msg message product --help');
  }
  requireDest(opts, '1msg message product --help');
  const dest = destStringPhone(opts);
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload: Record<string, unknown> = { ...file, ...dest };
  if (opts.text) payload.body = opts.text;
  if (opts.header) payload.header = opts.header;
  if (opts.footer) payload.footer = opts.footer;
  if (hasPair) {
    payload.action = {
      catalog_id: opts.catalogId,
      product_retailer_id: opts.productId,
    };
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendProduct(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageCta(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    text?: string;
    button?: string;
    url?: string;
    footer?: string;
    fromFile?: string;
  },
): Promise<number> {
  requireDest(opts, '1msg message cta --help');
  const dest = destStringPhone(opts);
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload: Record<string, unknown> = { ...file, ...dest };
  if (opts.text) payload.body = opts.text;
  if (opts.button) payload.displayText = opts.button;
  if (opts.url) payload.url = opts.url;
  if (opts.footer) payload.footer = opts.footer;
  if (!payload.body || !payload.displayText || !payload.url) {
    usage('--text, --button, and --url are required', '1msg message cta --help');
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendCtaUrl(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageAddress(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; quote?: string; text?: string; country?: string; fromFile?: string },
): Promise<number> {
  if (!opts.text) usage('--text is required', '1msg message address --help');
  const dest = requireDest(opts, '1msg message address --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload: Record<string, unknown> = {
    ...file,
    body: opts.text,
    country: opts.country || 'IN',
    ...dest,
  };
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendAddressMessage(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageOrder(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    name?: string;
    lang?: string;
    namespace?: string;
    referenceId?: string;
    currency?: string;
    fromFile?: string;
  },
): Promise<number> {
  if (!opts.fromFile) usage('--from-file is required', '1msg message order --help');
  const dest = destFields(opts);
  if (!opts.to && !opts.chatId) requireDest(opts, '1msg message order --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload: Record<string, unknown> = { ...file, ...dest };
  if (opts.name) payload.template = opts.name;
  if (opts.namespace) payload.namespace = opts.namespace;
  if (opts.referenceId) payload.referenceId = opts.referenceId;
  if (opts.currency) payload.currency = opts.currency;
  if (opts.lang) {
    payload.language = { policy: 'deterministic', code: opts.lang };
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendOrderDetails(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessagePayment(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; region?: string; text?: string; fromFile?: string; chatId?: string },
): Promise<number> {
  if (opts.chatId) usage('this command accepts --to only (no --chat-id)', '1msg message payment --help');
  if (!opts.to) usage('missing destination: pass --to', '1msg message payment --help');
  if (!opts.region) usage('--region is required (IN|SG|BR)', '1msg message payment --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload: Record<string, unknown> = {
    ...file,
    phone: parsePhone(opts.to),
    region: opts.region,
  };
  if (opts.text) payload.body = opts.text;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendPaymentRequest(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleMessageSticker(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; chatId?: string; quote?: string; link?: string; mediaId?: string; file?: string },
): Promise<number> {
  const sources = [Boolean(opts.link), Boolean(opts.mediaId), Boolean(opts.file)].filter(Boolean);
  if (sources.length !== 1) usage('exactly one source: --link, --media-id, or --file', '1msg message sticker --help');
  requireDest(opts, '1msg message sticker --help');
  const dest = destStringPhone(opts);
  const flags = globalsFrom(cmd);
  const payload: Record<string, unknown> = { ...dest };
  if (opts.link) payload.link = opts.link;
  if (opts.mediaId) payload.mediaId = opts.mediaId;
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

export async function handleMessageFlow(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    text?: string;
    flowId?: string;
    flowToken?: string;
    cta?: string;
    header?: string;
    footer?: string;
    action?: string;
    screen?: string;
    mode?: string;
    fromFile?: string;
  },
): Promise<number> {
  if (!opts.text || !opts.flowId || !opts.flowToken || !opts.cta) {
    usage('--text, --flow-id, --flow-token, and --cta are required', '1msg message flow --help');
  }
  const dest = requireDest(opts, '1msg message flow --help');
  const file = await readJsonFile(ctx, opts.fromFile);
  const payload = file.flowActionPayload as object | undefined;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.sendFlow(
      client.config.token,
      opts.text as string,
      opts.flowId as string,
      opts.flowToken as string,
      opts.cta as string,
      (opts.header ?? file.header) as never,
      opts.footer ?? (file.footer as string | undefined),
      (opts.action ?? file.flowAction) as never,
      payload,
      file.flowMessageVersion as string | undefined,
      (opts.mode ?? file.mode) as never,
      file.flowActionData as object | undefined,
      opts.screen ?? (file.flowActionScreen as string | undefined),
      dest.quotedMsgId,
      dest.chatId,
      dest.phone,
    ),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleTemplateList(
  ctx: CliContext,
  cmd: Command,
  opts: { limit?: string; offset?: string; sort?: string },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.templates.listTemplates(
      client.config.token,
      parseInteger(opts.limit, '--limit'),
      parseInteger(opts.offset, '--offset'),
      opts.sort as never,
    ),
  );
  const rec = asRecord(body);
  const templates = asArray(rec.templates);
  const names = templates
    .map((item) => pickString(asRecord(item), ['name']))
    .filter(Boolean);
  try {
    const resolved = resolveChannel(ctx, flags);
    writeCompletionCache(ctx, resolved.name || 'env', names);
  } catch {
    // cache is best-effort
  }
  printApiResult(ctx, flags, body, () => {
    const rows = templates.map((item) => {
      const row = asRecord(item);
      return {
        name: pickString(row, ['name']),
        status: pickString(row, ['status']),
        language: pickString(row, ['language', 'lang']),
        category: pickString(row, ['category']),
        id: pickString(row, ['id']),
      };
    });
    printTable(ctx.stdout, ctx.stderr, ['name', 'status', 'language', 'category', 'id'], rows);
    const total = rec.total ?? templates.length;
    if (rows.length) ctx.stdout.write(`total ${total}\n`);
  });
  return ok();
}

export async function handleTemplateSend(
  ctx: CliContext,
  cmd: Command,
  opts: {
    to?: string;
    chatId?: string;
    quote?: string;
    name?: string;
    lang?: string;
    namespace?: string;
    params?: string;
    paramsFile?: string;
    mmLite?: boolean;
    activitySharing?: boolean;
    ttl?: string;
  },
): Promise<number> {
  if (!opts.name) usage('--name is required', '1msg template send --help');
  requireDest(opts, '1msg template send --help');
  const dest = destStringPhone(opts);
  let params = parseJsonFlag(opts.params, '--params');
  if (opts.paramsFile) params = await readJsonValue(ctx, opts.paramsFile);
  const payload: Record<string, unknown> = {
    template: opts.name,
    ...dest,
  };
  if (opts.lang) payload.language = { policy: 'deterministic', code: opts.lang };
  if (opts.namespace) payload.namespace = opts.namespace;
  if (params !== undefined) payload.params = params;
  if (opts.mmLite) payload.useMMlite = true;
  if (opts.activitySharing) payload.messageActivitySharing = true;
  const ttl = parseInteger(opts.ttl, '--ttl');
  if (ttl !== undefined) payload.messageSendTtlSeconds = ttl;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.templates.sendTemplate(client.config.token, payload as never),
  );
  printSent(ctx, flags, body);
  return ok();
}

export async function handleTemplateAdd(
  ctx: CliContext,
  cmd: Command,
  opts: { fromFile?: string; name?: string; category?: string; language?: string },
): Promise<number> {
  if (!opts.fromFile) usage('--from-file is required', '1msg template add --help');
  const payload = await readJsonFile(ctx, opts.fromFile);
  if (!Array.isArray(payload.components)) usage('components[] is absent', '1msg template add --help');
  if (opts.name) payload.name = opts.name;
  if (opts.category) payload.category = opts.category;
  if (opts.language) payload.language = opts.language;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.templates.addTemplate(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleTemplateRemove(
  ctx: CliContext,
  cmd: Command,
  opts: { name?: string },
): Promise<number> {
  if (!opts.name) usage('--name is required', '1msg template remove --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.templates.removeTemplate(client.config.token, { name: opts.name } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

function mergeDefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
