import type { Command } from 'commander';
import type { CliContext } from './context';
import { parsePhone } from './dest';
import { usage } from './errors';
import { ok, printApiResult, withClient } from './execute';
import {
  basenameOf,
  fileToDataUri,
  parseInteger,
  readBinaryFile,
  readFromFile,
  readJsonFile,
} from './io';
import { globalsFrom } from './local';
import { asArray, asRecord, pickString, printKv, printTable } from './output';

function settingsApi(client: { channel: unknown }) {
  return client.channel as {
    listSettings: (token: string) => Promise<unknown>;
    createSettings: (token: string, body: unknown) => Promise<unknown>;
  };
}

/** Commander dual `--foo` / `--no-foo` share one boolean; omitted stays undefined. */
function dualBool(value: unknown, negated?: unknown): boolean | undefined {
  if (negated === true) return false;
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

export async function handleChannelInfo(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const status = await withClient(ctx, flags, (client) => client.channel.getStatus(client.config.token));
  const me = await withClient(ctx, flags, (client) => client.profile.getMe(client.config.token));
  const combined = { status, me };
  printApiResult(ctx, flags, combined, () => {
    const s = asRecord(status);
    const m = asRecord(me);
    printKv(ctx.stdout, [
      ['status', s.status],
      ['accountStatus', s.accountStatus],
      ['mm_lite_available', s.mm_lite_available],
      ...Object.entries(m).filter(([key]) => key !== 'token'),
    ]);
  });
  return ok();
}

export async function handleStatus(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => client.channel.getStatus(client.config.token));
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    printKv(ctx.stdout, [
      ['status', rec.status],
      ['accountStatus', rec.accountStatus],
      ['mm_lite_available', rec.mm_lite_available],
    ]);
  });
  return ok();
}

export async function handleMe(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => client.profile.getMe(client.config.token));
  printApiResult(ctx, flags, body, () => {
    printKv(ctx.stdout, Object.entries(asRecord(body)));
  });
  return ok();
}

export async function handleMeUpdate(
  ctx: CliContext,
  cmd: Command,
  opts: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    vertical?: string;
    photo?: string;
    website?: string[];
  },
): Promise<number> {
  const payload: Record<string, unknown> = {};
  if (opts.about !== undefined) payload.about = opts.about;
  if (opts.address !== undefined) payload.address = opts.address;
  if (opts.description !== undefined) payload.description = opts.description;
  if (opts.email !== undefined) payload.email = opts.email;
  if (opts.vertical !== undefined) payload.vertical = opts.vertical;
  if (opts.photo !== undefined) payload.photo = opts.photo;
  if (opts.website?.length) payload.websites = opts.website;
  if (Object.keys(payload).length === 0) usage('pass at least one flag', '1msg me --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.profile.updateMe(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleChannelSettings(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    settingsApi(client).listSettings(client.config.token),
  );
  printApiResult(ctx, flags, body, () => {
    printKv(ctx.stdout, Object.entries(asRecord(body)));
  });
  return ok();
}

export async function handleChannelSettingsSet(
  ctx: CliContext,
  cmd: Command,
  opts: Record<string, unknown>,
): Promise<number> {
  const payload: Record<string, unknown> = {};
  const urls = opts.webhookUrl as string[] | undefined;
  if (urls && urls.length) {
    if (urls.length > 5) usage('--webhook-url max 5', '1msg channel --help');
    payload.webhookUrl = urls.length === 1 ? urls[0] : urls;
  }
  const guaranteed = dualBool(opts.guaranteedHooks, opts.noGuaranteedHooks);
  if (guaranteed !== undefined) payload.guaranteedHooks = guaranteed;
  const ack = dualBool(opts.ackNotifications, opts.noAckNotifications);
  if (ack !== undefined) payload.ackNotificationsOn = ack;
  const rawHooks = dualBool(opts.rawHooks, opts.noRawHooks);
  if (rawHooks !== undefined) payload.rawHooks = rawHooks;
  const analytics = dualBool(opts.templateAnalytics, opts.noTemplateAnalytics);
  if (analytics !== undefined) payload.template_analytics_enabled = analytics;
  const ctaOptOut = dualBool(opts.ctaTrackingOptOut, opts.noCtaTrackingOptOut);
  if (ctaOptOut !== undefined) payload.cta_url_link_tracking_opted_out = ctaOptOut;
  if (Object.keys(payload).length === 0) usage('pass at least one settings flag', '1msg channel --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    settingsApi(client).createSettings(client.config.token, payload),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleMmLite(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.getMmLiteStatus(client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleAutomation(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.channel.getConversationalAutomation(client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleAutomationSet(
  ctx: CliContext,
  cmd: Command,
  opts: { welcome?: boolean; noWelcome?: boolean; prompt?: string[]; command?: string[] },
): Promise<number> {
  const payload: Record<string, unknown> = {};
  const welcome = dualBool(opts.welcome, opts.noWelcome);
  if (welcome !== undefined) payload.enable_welcome_message = welcome;
  if (opts.prompt?.length) {
    if (opts.prompt.length > 4) usage('--prompt max 4', '1msg channel --help');
    for (const p of opts.prompt) {
      if (p.length > 80) usage('each --prompt must be ≤ 80 chars', '1msg channel --help');
    }
    payload.prompts = opts.prompt;
  }
  if (opts.command?.length) {
    payload.commands = opts.command.map((raw) => {
      const idx = raw.indexOf(':');
      if (idx <= 0) usage('--command must be name:description', '1msg channel --help');
      return { command_name: raw.slice(0, idx), command_description: raw.slice(idx + 1) };
    });
  }
  if (Object.keys(payload).length === 0) usage('pass at least one automation flag', '1msg channel --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.channel.setConversationalAutomation(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleWebhookGet(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => client.webhooks.getWebhook(client.config.token));
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleWebhookSet(
  ctx: CliContext,
  cmd: Command,
  opts: { url?: string[] },
): Promise<number> {
  const urls = opts.url ?? [];
  if (!urls.length) usage('--url is required', '1msg webhook --help');
  if (urls.length > 5) usage('--url max 5', '1msg webhook --help');
  const webhookUrl = urls.length === 1 ? urls[0] : urls;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.webhooks.setWebhook(client.config.token, { webhookUrl } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleWebhookClear(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    settingsApi(client).createSettings(client.config.token, { webhookUrl: '' }),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleMediaUpload(
  ctx: CliContext,
  cmd: Command,
  opts: { file?: string; url?: string },
): Promise<number> {
  if (Boolean(opts.file) === Boolean(opts.url)) usage('pass exactly one of --file or --url', '1msg media --help');
  let bodyField: string;
  if (opts.url) {
    bodyField = opts.url;
  } else {
    const buf = readBinaryFile(ctx, opts.file as string);
    bodyField = fileToDataUri(buf, basenameOf(opts.file as string));
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.createUploadMedia(client.config.token, {
      body: bodyField,
      url: opts.url,
    } as never),
  );
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    ctx.stdout.write(`${rec.mediaId ?? ''}\n`);
  });
  return ok();
}

export async function handleMediaGet(
  ctx: CliContext,
  cmd: Command,
  opts: { id?: string },
): Promise<number> {
  if (!opts.id) usage('--id is required', '1msg media --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.retrieveMedia(client.config.token, opts.id as string),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleMediaDelete(
  ctx: CliContext,
  cmd: Command,
  opts: { id?: string },
): Promise<number> {
  if (!opts.id) usage('--id is required', '1msg media --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.messaging.deleteMedia(client.config.token, opts.id as string),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleUserBlocked(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => client.users.listBlockedUsers(client.config.token));
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    const users = asArray(rec.blockedUsers ?? rec.users ?? rec.data);
    const rows = users.map((item) => {
      const row = asRecord(item);
      return { phone: pickString(row, ['phone', 'wa_id', 'id']) || String(item) };
    });
    printTable(ctx.stdout, ctx.stderr, ['phone'], rows);
  });
  return ok();
}

export async function handleUserBlock(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string },
  action: 'block' | 'unblock',
): Promise<number> {
  if (!opts.to) usage('--to is required', '1msg user --help');
  const phone = parsePhone(opts.to);
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    action === 'block'
      ? client.users.blockUser(client.config.token, { phone } as never)
      : client.users.unblockUser(client.config.token, { phone } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleCatalogGet(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => client.catalog.getCommerce(client.config.token));
  printApiResult(ctx, flags, body, () => {
    const items = Array.isArray(body) ? body : asArray(asRecord(body).data);
    const rows = items.map((item) => {
      const row = asRecord(item);
      return {
        id: pickString(row, ['id']),
        cart: String(row.is_cart_enabled === true),
        visible: String(row.is_catalog_visible === true),
      };
    });
    printTable(ctx.stdout, ctx.stderr, ['id', 'cart', 'visible'], rows);
  });
  return ok();
}

export async function handleCatalogSet(
  ctx: CliContext,
  cmd: Command,
  opts: { cart?: boolean; noCart?: boolean; visible?: boolean; noVisible?: boolean },
): Promise<number> {
  const cart = dualBool(opts.cart, opts.noCart);
  const visible = dualBool(opts.visible, opts.noVisible);
  if (cart === undefined || visible === undefined) {
    usage('pass --cart/--no-cart and --visible/--no-visible', '1msg catalog --help');
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.catalog.createCommerce(client.config.token, {
      params: { is_cart_enabled: cart, is_catalog_visible: visible },
    } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

function groupId(raw: string | undefined, help: string): string {
  if (!raw) usage('missing group id', help);
  return raw.replace(/@g\.us$/i, '');
}

export async function handleGroupList(
  ctx: CliContext,
  cmd: Command,
  opts: { limit?: string; before?: string; after?: string },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.groups.listGroups(
      client.config.token,
      parseInteger(opts.limit, '--limit'),
      opts.before,
      opts.after,
    ),
  );
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    const groups = asArray(rec.groups ?? rec.data ?? rec.items);
    const rows = groups.map((item) => {
      const row = asRecord(item);
      const id = pickString(row, ['id', 'groupId']).replace(/@g\.us$/i, '');
      return { id, subject: pickString(row, ['subject', 'name', 'groupName']) };
    });
    printTable(ctx.stdout, ctx.stderr, ['id', 'subject'], rows);
  });
  return ok();
}

export async function handleGroupCreate(
  ctx: CliContext,
  cmd: Command,
  opts: { name?: string; description?: string },
): Promise<number> {
  if (!opts.name) usage('--name is required', '1msg group --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.groups.createGroups(client.config.token, {
      groupName: opts.name,
      description: opts.description,
    } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleGroupGet(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  opts: { fields?: string },
): Promise<number> {
  const gid = groupId(id, '1msg group --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.groups.getGroupsGroupId(gid, client.config.token, opts.fields),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleGroupUpdate(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  opts: { subject?: string; description?: string; picture?: string },
): Promise<number> {
  const gid = groupId(id, '1msg group --help');
  const payload: Record<string, unknown> = {};
  if (opts.subject) payload.subject = opts.subject;
  if (opts.description) payload.description = opts.description;
  if (opts.picture) payload.profile_picture_file = opts.picture;
  if (!Object.keys(payload).length) usage('pass --subject, --description, or --picture', '1msg group --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.groups.createGroupsGroupId(gid, client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleGroupDelete(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
): Promise<number> {
  const gid = groupId(id, '1msg group --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.groups.deleteGroupsGroupId(gid, client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleGroupInviteLink(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  reset: boolean,
): Promise<number> {
  const gid = groupId(id, '1msg group --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    reset
      ? client.groups.createGroupsGroupIdInvitelink(gid, client.config.token)
      : client.groups.getGroupsGroupIdInvitelink(gid, client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

function waba(opts: { wabaAccountId?: string }): string | undefined {
  return opts.wabaAccountId;
}

export async function handleFlowList(
  ctx: CliContext,
  cmd: Command,
  opts: { wabaAccountId?: string; fields?: string },
): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.listFlows(client.config.token, waba(opts), opts.fields),
  );
  printApiResult(ctx, flags, body, () => {
    const rec = asRecord(body);
    const items = asArray(rec.items ?? rec.data ?? rec.flows);
    const rows = items.map((item) => {
      const row = asRecord(item);
      const categories = row.categories;
      return {
        id: pickString(row, ['id']),
        name: pickString(row, ['name']),
        status: pickString(row, ['status']),
        categories: Array.isArray(categories) ? categories.join(',') : String(categories ?? ''),
      };
    });
    printTable(ctx.stdout, ctx.stderr, ['id', 'name', 'status', 'categories'], rows);
  });
  return ok();
}

export async function handleFlowCreate(
  ctx: CliContext,
  cmd: Command,
  opts: {
    name?: string;
    category?: string[];
    endpoint?: string;
    publish?: boolean;
    jsonFile?: string;
    wabaAccountId?: string;
  },
): Promise<number> {
  if (!opts.name) usage('--name is required', '1msg flow --help');
  const categories = opts.category ?? [];
  const payload: Record<string, unknown> = { name: opts.name, categories };
  if (opts.endpoint) payload.endpointUri = opts.endpoint;
  if (opts.publish) payload.publish = true;
  if (opts.jsonFile) {
    const raw = await readFromFile(ctx, opts.jsonFile);
    payload.flowJson = JSON.parse(raw || '{}');
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.createFlows(client.config.token, payload as never, waba(opts)),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleFlowIdOp(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  kind: 'get' | 'delete' | 'preview' | 'publish' | 'deprecate',
  opts: { wabaAccountId?: string },
): Promise<number> {
  if (!id) usage('missing flow id', '1msg flow --help');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) => {
    const token = client.config.token;
    const w = waba(opts);
    switch (kind) {
      case 'get':
        return client.flows.getFlowsFlowId(id, token, w);
      case 'delete':
        return client.flows.deleteFlowsFlowId(id, token, w);
      case 'preview':
        return client.flows.getFlowsFlowIdPreview(id, token, w);
      case 'publish':
        return client.flows.createFlowsFlowIdPublish(id, token, w);
      case 'deprecate':
        return client.flows.createFlowsFlowIdDeprecate(id, token, w);
      default:
        usage('unknown flow command', '1msg flow --help');
    }
  });
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleFlowMetadata(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  opts: { name?: string; category?: string[]; endpoint?: string; wabaAccountId?: string },
): Promise<number> {
  if (!id) usage('missing flow id', '1msg flow --help');
  const payload: Record<string, unknown> = {};
  if (opts.name) payload.name = opts.name;
  if (opts.category?.length) payload.categories = opts.category;
  if (opts.endpoint) payload.endpointUri = opts.endpoint;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.patchFlowsFlowIdMetadata(id, client.config.token, payload as never, waba(opts)),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleFlowAssets(
  ctx: CliContext,
  cmd: Command,
  id: string | undefined,
  opts: { jsonFile?: string; wabaAccountId?: string },
): Promise<number> {
  if (!id) usage('missing flow id', '1msg flow --help');
  if (!opts.jsonFile) usage('--json-file is required', '1msg flow --help');
  const raw = await readFromFile(ctx, opts.jsonFile);
  const flowJson = JSON.parse(raw || '{}');
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.patchFlowsFlowIdAssets(id, client.config.token, { flowJson } as never, waba(opts)),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleFlowEncryption(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.getWhatsappBusinessEncryption(client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleFlowEncryptionSet(
  ctx: CliContext,
  cmd: Command,
  opts: { pemFile?: string },
): Promise<number> {
  if (!opts.pemFile) usage('--pem-file is required', '1msg flow --help');
  const pem = (await readFromFile(ctx, opts.pemFile)) ?? '';
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.flows.setWhatsappBusinessEncryption(client.config.token, {
      business_public_key: pem,
    } as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleCallSettings(ctx: CliContext, cmd: Command): Promise<number> {
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.calling.getCallingSettings(client.config.token),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleCallSettingsSet(
  ctx: CliContext,
  cmd: Command,
  opts: { fromFile?: string },
): Promise<number> {
  if (!opts.fromFile) usage('--from-file is required', '1msg call --help');
  const payload = await readJsonFile(ctx, opts.fromFile);
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.calling.updateCallingSettings(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

async function readSdp(ctx: CliContext, filePath: string | undefined, help: string): Promise<string> {
  if (!filePath) usage('--sdp-file is required', help);
  return (await readFromFile(ctx, filePath)) ?? '';
}

export async function handleCallConnect(
  ctx: CliContext,
  cmd: Command,
  opts: { to?: string; sdpFile?: string; callbackData?: string },
): Promise<number> {
  if (!opts.to) usage('--to is required', '1msg call --help');
  const sdp = await readSdp(ctx, opts.sdpFile, '1msg call --help');
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    action: 'connect',
    to: String(parsePhone(opts.to)),
    session: { sdp_type: 'offer', sdp },
  };
  if (opts.callbackData) payload.biz_opaque_callback_data = opts.callbackData;
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.calling.initiateCall(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

export async function handleCallControl(
  ctx: CliContext,
  cmd: Command,
  action: 'pre_accept' | 'accept' | 'reject' | 'terminate',
  opts: { callId?: string; sdpFile?: string },
): Promise<number> {
  if (!opts.callId) usage('--call-id is required', '1msg call --help');
  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    action,
    call_id: opts.callId,
  };
  if (action === 'pre_accept' || action === 'accept') {
    const sdp = await readSdp(ctx, opts.sdpFile, '1msg call --help');
    payload.session = { sdp_type: 'answer', sdp };
  }
  const flags = globalsFrom(cmd);
  const body = await withClient(ctx, flags, (client) =>
    client.calling.initiateCall(client.config.token, payload as never),
  );
  printApiResult(ctx, flags, body);
  return ok();
}

