import { Command, CommanderError, Option } from 'commander';
import type { CliContext } from './context';
import { CliExit, UsageError } from './errors';
import { collect } from './io';
import {
  handleChannelAdd,
  handleChannelCurrent,
  handleChannelList,
  handleChannelRemove,
  handleChannelUse,
  handleCompleteQuery,
  handleCompletion,
  handleInit,
  handleVersion,
  missingSubcommand,
  writeHelp,
} from './local';
import {
  handleMessageAddress,
  handleMessageButtons,
  handleMessageCarousel,
  handleMessageContact,
  handleMessageCta,
  handleMessageFlow,
  handleMessageList,
  handleMessageLocation,
  handleMessageLocationRequest,
  handleMessageMenu,
  handleMessageOrder,
  handleMessagePayment,
  handleMessageProduct,
  handleMessageReact,
  handleMessageRead,
  handleMessageSticker,
  handleSend,
  handleTemplateAdd,
  handleTemplateList,
  handleTemplateRemove,
  handleTemplateSend,
} from './send';
import {
  handleAutomation,
  handleAutomationSet,
  handleCallConnect,
  handleCallControl,
  handleCallSettings,
  handleCallSettingsSet,
  handleCatalogGet,
  handleCatalogSet,
  handleChannelInfo,
  handleChannelSettings,
  handleChannelSettingsSet,
  handleFlowAssets,
  handleFlowCreate,
  handleFlowEncryption,
  handleFlowEncryptionSet,
  handleFlowIdOp,
  handleFlowList,
  handleFlowMetadata,
  handleGroupCreate,
  handleGroupDelete,
  handleGroupGet,
  handleGroupInviteLink,
  handleGroupList,
  handleGroupUpdate,
  handleMe,
  handleMeUpdate,
  handleMediaDelete,
  handleMediaGet,
  handleMediaUpload,
  handleMmLite,
  handleStatus,
  handleUserBlock,
  handleUserBlocked,
  handleWebhookClear,
  handleWebhookGet,
  handleWebhookSet,
} from './rest';

function wrap(fn: (this: Command, ...args: any[]) => unknown) {
  return async function (this: Command, ...args: any[]): Promise<void> {
    await fn.apply(this, args);
  };
}

function commandPath(cmd: Command): string {
  const names: string[] = [];
  let current: Command | null = cmd;
  while (current) {
    const name = current.name();
    if (name && name !== '1msg') names.unshift(name);
    current = current.parent;
  }
  return names.join(' ');
}

function applyCommon(cmd: Command, ctx: CliContext, helpPath?: string): Command {
  cmd.helpOption(false);
  cmd.addHelpCommand(false);
  cmd.option('-c, --channel <name>');
  cmd.option('--instance-id <id>');
  cmd.option('--base-url <url>');
  cmd.option('--token <token>');
  cmd.option('--json');
  cmd.addOption(new Option('--no-color'));
  cmd.option('-h, --help');
  cmd.hook('preAction', (thisCommand, actionCommand) => {
    if (thisCommand !== actionCommand) return;
    const opts = actionCommand.optsWithGlobals() as { help?: boolean };
    if (opts.help) {
      writeHelp(ctx, helpPath || commandPath(actionCommand) || 'root');
      throw new CliExit(0);
    }
  });
  return cmd;
}

function destFlags(cmd: Command): Command {
  cmd.option('--to <phone>');
  cmd.option('--chat-id <id>');
  cmd.option('--quote <wamid>');
  return cmd;
}

export function createProgram(ctx: CliContext): Command {
  const program = new Command();
  program.name('1msg');
  program.exitOverride();
  program.showSuggestionAfterError(false);
  program.configureOutput({
    writeOut: (s) => {
      ctx.stdout.write(s);
    },
    writeErr: (s) => {
      ctx.stderr.write(s);
    },
  });
  applyCommon(program, ctx, 'root');
  program.option('-v, --version');

  program.action(wrap((opts: { help?: boolean; version?: boolean }) => {
    if (opts.version) {
      handleVersion(ctx);
      return;
    }
    if (opts.help) {
      writeHelp(ctx, 'root');
      throw new CliExit(0);
    }
    writeHelp(ctx, 'root');
    throw new CliExit(1);
  }));

  const init = applyCommon(program.command('init'), ctx, 'init');
  init.option('--name <name>');
  init.option('--token-stdin');
  init.addOption(new Option('--no-verify'));
  init.action(wrap((opts) => handleInit(ctx, init, opts)));

  const send = applyCommon(program.command('send'), ctx, 'send');
  destFlags(send);
  send.option('--text <body>');
  send.option('--file <path>');
  send.option('--caption <text>');
  send.option('--filename <name>');
  send.option('--media-id <id>');
  send.option('--media-type <type>');
  send.option('--voice');
  send.action(wrap((opts) => handleSend(ctx, send, opts)));

  const message = applyCommon(program.command('message'), ctx, 'message');
  message.action(wrap(() => missingSubcommand(ctx, 'message')));

  const messageSend = applyCommon(message.command('send'), ctx, 'message send');
  destFlags(messageSend);
  messageSend.option('--text <body>');
  messageSend.option('--file <path>');
  messageSend.option('--caption <text>');
  messageSend.option('--filename <name>');
  messageSend.option('--media-id <id>');
  messageSend.option('--media-type <type>');
  messageSend.option('--voice');
  messageSend.action(wrap((opts) => handleSend(ctx, messageSend, opts)));

  const messageList = applyCommon(message.command('list'), ctx, 'message list');
  messageList.option('--chat-id <id>');
  messageList.option('--limit <n>');
  messageList.option('--last');
  messageList.option('--msg-id <id>');
  messageList.option('--min-time <unix>');
  messageList.option('--max-time <unix>');
  messageList.option('--first-number <n>');
  messageList.option('--last-number <n>');
  messageList.action(wrap((opts) => handleMessageList(ctx, messageList, opts)));

  const messageRead = applyCommon(message.command('read'), ctx, 'message read');
  messageRead.option('--message-id <id>');
  messageRead.option('--typing');
  messageRead.action(wrap((opts) => handleMessageRead(ctx, messageRead, opts)));

  const messageReact = applyCommon(message.command('react'), ctx, 'message react');
  destFlags(messageReact);
  messageReact.option('--message-id <id>');
  messageReact.option('--emoji <emoji>');
  messageReact.action(wrap((opts) => handleMessageReact(ctx, messageReact, opts)));

  const messageLocation = applyCommon(message.command('location'), ctx, 'message location');
  destFlags(messageLocation);
  messageLocation.option('--lat <n>');
  messageLocation.option('--lng <n>');
  messageLocation.option('--name <text>');
  messageLocation.option('--address <text>');
  messageLocation.action(wrap((opts) => handleMessageLocation(ctx, messageLocation, opts)));

  const messageLocReq = applyCommon(
    message.command('location-request'),
    ctx,
    'message location-request',
  );
  destFlags(messageLocReq);
  messageLocReq.option('--text <body>');
  messageLocReq.action(wrap((opts) => handleMessageLocationRequest(ctx, messageLocReq, opts)));

  const messageContact = applyCommon(message.command('contact'), ctx, 'message contact');
  destFlags(messageContact);
  messageContact.option('--name <formatted>');
  messageContact.option('--first-name <text>');
  messageContact.option('--last-name <text>');
  messageContact.option('--phone <number>');
  messageContact.option('--email <email>');
  messageContact.option('--org <company>');
  messageContact.option('--title <text>');
  messageContact.option('--url <url>');
  messageContact.option('--from-file <path>');
  messageContact.action(wrap((opts) => handleMessageContact(ctx, messageContact, opts)));

  const messageButtons = applyCommon(message.command('buttons'), ctx, 'message buttons');
  destFlags(messageButtons);
  messageButtons.option('--text <body>');
  messageButtons.option('--footer <text>');
  messageButtons.option('--button <id:title>', 'repeatable', collect, [] as string[]);
  messageButtons.option('--from-file <path>');
  messageButtons.action(wrap((opts) => handleMessageButtons(ctx, messageButtons, opts)));

  const messageMenu = applyCommon(message.command('menu'), ctx, 'message menu');
  destFlags(messageMenu);
  messageMenu.option('--from-file <path>');
  messageMenu.option('--text <body>');
  messageMenu.option('--button-text <text>');
  messageMenu.option('--title <text>');
  messageMenu.option('--footer <text>');
  messageMenu.action(wrap((opts) => handleMessageMenu(ctx, messageMenu, opts)));

  const messageCarousel = applyCommon(message.command('carousel'), ctx, 'message carousel');
  destFlags(messageCarousel);
  messageCarousel.option('--text <body>');
  messageCarousel.option('--from-file <path>');
  messageCarousel.action(wrap((opts) => handleMessageCarousel(ctx, messageCarousel, opts)));

  const messageProduct = applyCommon(message.command('product'), ctx, 'message product');
  destFlags(messageProduct);
  messageProduct.option('--text <body>');
  messageProduct.option('--header <text>');
  messageProduct.option('--footer <text>');
  messageProduct.option('--catalog-id <id>');
  messageProduct.option('--product-id <retailer-id>');
  messageProduct.option('--from-file <path>');
  messageProduct.action(wrap((opts) => handleMessageProduct(ctx, messageProduct, opts)));

  const messageCta = applyCommon(message.command('cta'), ctx, 'message cta');
  destFlags(messageCta);
  messageCta.option('--text <body>');
  messageCta.option('--button <label>');
  messageCta.option('--url <https>');
  messageCta.option('--footer <text>');
  messageCta.option('--from-file <path>');
  messageCta.action(wrap((opts) => handleMessageCta(ctx, messageCta, opts)));

  const messageAddress = applyCommon(message.command('address'), ctx, 'message address');
  destFlags(messageAddress);
  messageAddress.option('--text <body>');
  messageAddress.option('--country <IN|SG>');
  messageAddress.option('--from-file <path>');
  messageAddress.action(wrap((opts) => handleMessageAddress(ctx, messageAddress, opts)));

  const messageOrder = applyCommon(message.command('order'), ctx, 'message order');
  destFlags(messageOrder);
  messageOrder.option('--name <template>');
  messageOrder.option('--lang <code>');
  messageOrder.option('--namespace <id>');
  messageOrder.option('--reference-id <id>');
  messageOrder.option('--currency <code>');
  messageOrder.option('--from-file <path>');
  messageOrder.action(wrap((opts) => handleMessageOrder(ctx, messageOrder, opts)));

  const messagePayment = applyCommon(message.command('payment'), ctx, 'message payment');
  messagePayment.option('--to <phone>');
  messagePayment.option('--chat-id <id>');
  messagePayment.option('--region <IN|SG|BR>');
  messagePayment.option('--text <body>');
  messagePayment.option('--from-file <path>');
  messagePayment.action(wrap((opts) => handleMessagePayment(ctx, messagePayment, opts)));

  const messageSticker = applyCommon(message.command('sticker'), ctx, 'message sticker');
  destFlags(messageSticker);
  messageSticker.option('--link <https>');
  messageSticker.option('--media-id <id>');
  messageSticker.option('--file <path>');
  messageSticker.action(wrap((opts) => handleMessageSticker(ctx, messageSticker, opts)));

  const messageFlow = applyCommon(message.command('flow'), ctx, 'message flow');
  destFlags(messageFlow);
  messageFlow.option('--text <body>');
  messageFlow.option('--flow-id <id>');
  messageFlow.option('--flow-token <token>');
  messageFlow.option('--cta <text>');
  messageFlow.option('--header <text>');
  messageFlow.option('--footer <text>');
  messageFlow.option('--action <navigate|data_exchange>');
  messageFlow.option('--screen <id>');
  messageFlow.option('--mode <draft|published>');
  messageFlow.option('--from-file <path>');
  messageFlow.action(wrap((opts) => handleMessageFlow(ctx, messageFlow, opts)));

  const template = applyCommon(program.command('template'), ctx, 'template');
  template.action(wrap(() => missingSubcommand(ctx, 'template')));

  const templateList = applyCommon(template.command('list'), ctx, 'template list');
  templateList.option('--limit <n>');
  templateList.option('--offset <n>');
  templateList.option('--sort <id|name|status>');
  templateList.action(wrap((opts) => handleTemplateList(ctx, templateList, opts)));

  const templateSend = applyCommon(template.command('send'), ctx, 'template send');
  destFlags(templateSend);
  templateSend.option('--name <template>');
  templateSend.option('--lang <code>');
  templateSend.option('--namespace <id>');
  templateSend.option('--params <json>');
  templateSend.option('--params-file <path>');
  templateSend.option('--mm-lite');
  templateSend.option('--activity-sharing');
  templateSend.option('--ttl <seconds>');
  templateSend.action(wrap((opts) => handleTemplateSend(ctx, templateSend, opts)));

  const templateAdd = applyCommon(template.command('add'), ctx, 'template add');
  templateAdd.option('--from-file <path>');
  templateAdd.option('--name <name>');
  templateAdd.option('--category <MARKETING|UTILITY|AUTHENTICATION>');
  templateAdd.option('--language <code>');
  templateAdd.action(wrap((opts) => handleTemplateAdd(ctx, templateAdd, opts)));

  const templateRemove = applyCommon(template.command('remove'), ctx, 'template remove');
  templateRemove.option('--name <name>');
  templateRemove.action(wrap((opts) => handleTemplateRemove(ctx, templateRemove, opts)));

  const channel = applyCommon(program.command('channel'), ctx, 'channel');
  channel.action(wrap(() => missingSubcommand(ctx, 'channel')));

  applyCommon(channel.command('list'), ctx, 'channel').action(wrap(function (this: Command) {
    return handleChannelList(ctx, this);
  }));
  applyCommon(channel.command('use'), ctx, 'channel use')
    .argument('[name-or-id]')
    .action(wrap((nameOrId: string | undefined) => handleChannelUse(ctx, nameOrId)));
  const channelAdd = applyCommon(channel.command('add'), ctx, 'channel add');
  channelAdd.option('--name <name>');
  channelAdd.option('--token-stdin');
  channelAdd.option('--default');
  channelAdd.addOption(new Option('--no-verify'));
  channelAdd.action(wrap((opts) => handleChannelAdd(ctx, channelAdd, opts)));
  applyCommon(channel.command('remove'), ctx, 'channel')
    .argument('[name]')
    .action(wrap((name: string | undefined) => handleChannelRemove(ctx, name)));
  applyCommon(channel.command('current'), ctx, 'channel').action(wrap(function (this: Command) {
    return handleChannelCurrent(ctx, this);
  }));
  applyCommon(channel.command('info'), ctx, 'channel info').action(wrap(function (this: Command) {
    return handleChannelInfo(ctx, this);
  }));
  applyCommon(channel.command('status'), ctx, 'channel status').action(wrap(function (this: Command) {
    return handleStatus(ctx, this);
  }));

  const settings = applyCommon(channel.command('settings'), ctx, 'channel');
  settings.action(wrap(function (this: Command) {
    return handleChannelSettings(ctx, this);
  }));
  const settingsSet = applyCommon(settings.command('set'), ctx, 'channel');
  settingsSet.option('--webhook-url <url>', 'repeatable', collect, [] as string[]);
  settingsSet.option('--guaranteed-hooks');
  settingsSet.option('--no-guaranteed-hooks');
  settingsSet.option('--ack-notifications');
  settingsSet.option('--no-ack-notifications');
  settingsSet.option('--raw-hooks');
  settingsSet.option('--no-raw-hooks');
  settingsSet.option('--template-analytics');
  settingsSet.option('--no-template-analytics');
  settingsSet.option('--cta-tracking-opt-out');
  settingsSet.option('--no-cta-tracking-opt-out');
  settingsSet.action(wrap((opts) => handleChannelSettingsSet(ctx, settingsSet, opts)));

  applyCommon(channel.command('mm-lite'), ctx, 'channel').action(wrap(function (this: Command) {
    return handleMmLite(ctx, this);
  }));
  const automation = applyCommon(channel.command('automation'), ctx, 'channel');
  automation.action(wrap(function (this: Command) {
    return handleAutomation(ctx, this);
  }));
  const automationSet = applyCommon(automation.command('set'), ctx, 'channel');
  automationSet.option('--welcome');
  automationSet.option('--no-welcome');
  automationSet.option('--prompt <text>', 'repeatable', collect, [] as string[]);
  automationSet.option('--command <name:description>', 'repeatable', collect, [] as string[]);
  automationSet.action(wrap((opts) => handleAutomationSet(ctx, automationSet, opts)));

  const me = applyCommon(program.command('me'), ctx, 'me');
  me.action(wrap(function (this: Command) {
    return handleMe(ctx, this);
  }));
  const meUpdate = applyCommon(me.command('update'), ctx, 'me');
  meUpdate.option('--about <text>');
  meUpdate.option('--address <text>');
  meUpdate.option('--description <text>');
  meUpdate.option('--email <email>');
  meUpdate.option('--vertical <text>');
  meUpdate.option('--photo <url>');
  meUpdate.option('--website <url>', 'repeatable', collect, [] as string[]);
  meUpdate.action(wrap((opts) => handleMeUpdate(ctx, meUpdate, opts)));

  const status = applyCommon(program.command('status'), ctx, 'status');
  status.action(wrap(function (this: Command) {
    return handleStatus(ctx, this);
  }));

  const media = applyCommon(program.command('media'), ctx, 'media');
  media.action(wrap(() => missingSubcommand(ctx, 'media')));
  const mediaUpload = applyCommon(media.command('upload'), ctx, 'media');
  mediaUpload.option('--file <path>');
  mediaUpload.option('--url <https>');
  mediaUpload.action(wrap((opts) => handleMediaUpload(ctx, mediaUpload, opts)));
  const mediaGet = applyCommon(media.command('get'), ctx, 'media');
  mediaGet.option('--id <id>');
  mediaGet.action(wrap((opts) => handleMediaGet(ctx, mediaGet, opts)));
  const mediaDelete = applyCommon(media.command('delete'), ctx, 'media');
  mediaDelete.option('--id <id>');
  mediaDelete.action(wrap((opts) => handleMediaDelete(ctx, mediaDelete, opts)));

  const group = applyCommon(program.command('group'), ctx, 'group');
  group.action(wrap(() => missingSubcommand(ctx, 'group')));
  const groupList = applyCommon(group.command('list'), ctx, 'group');
  groupList.option('--limit <n>');
  groupList.option('--before <cursor>');
  groupList.option('--after <cursor>');
  groupList.action(wrap((opts) => handleGroupList(ctx, groupList, opts)));
  const groupCreate = applyCommon(group.command('create'), ctx, 'group');
  groupCreate.option('--name <subject>');
  groupCreate.option('--description <text>');
  groupCreate.action(wrap((opts) => handleGroupCreate(ctx, groupCreate, opts)));
  const groupGet = applyCommon(group.command('get'), ctx, 'group');
  groupGet.argument('[group-id]');
  groupGet.option('--fields <csv>');
  groupGet.action(wrap((id: string | undefined, opts) => handleGroupGet(ctx, groupGet, id, opts)));
  const groupUpdate = applyCommon(group.command('update'), ctx, 'group');
  groupUpdate.argument('[group-id]');
  groupUpdate.option('--subject <text>');
  groupUpdate.option('--description <text>');
  groupUpdate.option('--picture <url>');
  groupUpdate.action(wrap((id: string | undefined, opts) => handleGroupUpdate(ctx, groupUpdate, id, opts)));
  applyCommon(group.command('delete'), ctx, 'group')
    .argument('[group-id]')
    .action(wrap(function (this: Command, id: string | undefined) {
      return handleGroupDelete(ctx, this, id);
    }));
  const invite = applyCommon(group.command('invite-link'), ctx, 'group');
  invite.argument('[group-id]');
  invite.action(wrap(function (this: Command, id: string | undefined) {
    return handleGroupInviteLink(ctx, this, id, false);
  }));
  applyCommon(invite.command('reset'), ctx, 'group')
    .argument('[group-id]')
    .action(wrap(function (this: Command, id: string | undefined) {
      return handleGroupInviteLink(ctx, this, id, true);
    }));

  const flow = applyCommon(program.command('flow'), ctx, 'flow');
  flow.action(wrap(() => missingSubcommand(ctx, 'flow')));
  const flowWaba = (c: Command) => c.option('--waba-account-id <id>');
  const flowList = applyCommon(flow.command('list'), ctx, 'flow');
  flowWaba(flowList);
  flowList.option('--fields <csv>');
  flowList.action(wrap((opts) => handleFlowList(ctx, flowList, opts)));
  const flowCreate = applyCommon(flow.command('create'), ctx, 'flow');
  flowWaba(flowCreate);
  flowCreate.option('--name <name>');
  flowCreate.option('--category <ENUM>', 'repeatable', collect, [] as string[]);
  flowCreate.option('--endpoint <uri>');
  flowCreate.option('--publish');
  flowCreate.option('--json-file <path>');
  flowCreate.action(wrap((opts) => handleFlowCreate(ctx, flowCreate, opts)));
  const flowGet = applyCommon(flow.command('get'), ctx, 'flow');
  flowWaba(flowGet);
  flowGet.argument('[flow-id]');
  flowGet.action(wrap((id: string | undefined, opts) => handleFlowIdOp(ctx, flowGet, id, 'get', opts)));
  const flowDelete = applyCommon(flow.command('delete'), ctx, 'flow');
  flowWaba(flowDelete);
  flowDelete.argument('[flow-id]');
  flowDelete.action(wrap((id: string | undefined, opts) => handleFlowIdOp(ctx, flowDelete, id, 'delete', opts)));
  const flowPreview = applyCommon(flow.command('preview'), ctx, 'flow');
  flowWaba(flowPreview);
  flowPreview.argument('[flow-id]');
  flowPreview.action(wrap((id: string | undefined, opts) => handleFlowIdOp(ctx, flowPreview, id, 'preview', opts)));
  const flowPublish = applyCommon(flow.command('publish'), ctx, 'flow');
  flowWaba(flowPublish);
  flowPublish.argument('[flow-id]');
  flowPublish.action(wrap((id: string | undefined, opts) => handleFlowIdOp(ctx, flowPublish, id, 'publish', opts)));
  const flowDeprecate = applyCommon(flow.command('deprecate'), ctx, 'flow');
  flowWaba(flowDeprecate);
  flowDeprecate.argument('[flow-id]');
  flowDeprecate.action(wrap((id: string | undefined, opts) =>
    handleFlowIdOp(ctx, flowDeprecate, id, 'deprecate', opts),
  ));
  const flowMetadata = applyCommon(flow.command('metadata'), ctx, 'flow');
  flowWaba(flowMetadata);
  flowMetadata.argument('[flow-id]');
  flowMetadata.option('--name <name>');
  flowMetadata.option('--category <ENUM>', 'repeatable', collect, [] as string[]);
  flowMetadata.option('--endpoint <uri>');
  flowMetadata.action(wrap((id: string | undefined, opts) => handleFlowMetadata(ctx, flowMetadata, id, opts)));
  const flowAssets = applyCommon(flow.command('assets'), ctx, 'flow');
  flowWaba(flowAssets);
  flowAssets.argument('[flow-id]');
  flowAssets.option('--json-file <path>');
  flowAssets.action(wrap((id: string | undefined, opts) => handleFlowAssets(ctx, flowAssets, id, opts)));
  const encryption = applyCommon(flow.command('encryption'), ctx, 'flow');
  encryption.action(wrap(function (this: Command) {
    return handleFlowEncryption(ctx, this);
  }));
  const encryptionSet = applyCommon(encryption.command('set'), ctx, 'flow');
  encryptionSet.option('--pem-file <path>');
  encryptionSet.action(wrap((opts) => handleFlowEncryptionSet(ctx, encryptionSet, opts)));

  const webhook = applyCommon(program.command('webhook'), ctx, 'webhook');
  webhook.action(wrap(() => missingSubcommand(ctx, 'webhook')));
  applyCommon(webhook.command('get'), ctx, 'webhook').action(wrap(function (this: Command) {
    return handleWebhookGet(ctx, this);
  }));
  const webhookSet = applyCommon(webhook.command('set'), ctx, 'webhook');
  webhookSet.option('--url <https>', 'repeatable', collect, [] as string[]);
  webhookSet.action(wrap((opts) => handleWebhookSet(ctx, webhookSet, opts)));
  applyCommon(webhook.command('clear'), ctx, 'webhook').action(wrap(function (this: Command) {
    return handleWebhookClear(ctx, this);
  }));

  const user = applyCommon(program.command('user'), ctx, 'user');
  user.action(wrap(() => missingSubcommand(ctx, 'user')));
  applyCommon(user.command('blocked'), ctx, 'user').action(wrap(function (this: Command) {
    return handleUserBlocked(ctx, this);
  }));
  const userBlock = applyCommon(user.command('block'), ctx, 'user');
  userBlock.option('--to <phone>');
  userBlock.action(wrap((opts) => handleUserBlock(ctx, userBlock, opts, 'block')));
  const userUnblock = applyCommon(user.command('unblock'), ctx, 'user');
  userUnblock.option('--to <phone>');
  userUnblock.action(wrap((opts) => handleUserBlock(ctx, userUnblock, opts, 'unblock')));

  const catalog = applyCommon(program.command('catalog'), ctx, 'catalog');
  catalog.action(wrap(() => missingSubcommand(ctx, 'catalog')));
  applyCommon(catalog.command('get'), ctx, 'catalog').action(wrap(function (this: Command) {
    return handleCatalogGet(ctx, this);
  }));
  const catalogSet = applyCommon(catalog.command('set'), ctx, 'catalog');
  catalogSet.option('--cart');
  catalogSet.option('--no-cart');
  catalogSet.option('--visible');
  catalogSet.option('--no-visible');
  catalogSet.action(wrap((opts) => handleCatalogSet(ctx, catalogSet, opts)));

  const call = applyCommon(program.command('call'), ctx, 'call');
  call.action(wrap(() => missingSubcommand(ctx, 'call')));
  const callSettings = applyCommon(call.command('settings'), ctx, 'call');
  callSettings.action(wrap(function (this: Command) {
    return handleCallSettings(ctx, this);
  }));
  const callSettingsSet = applyCommon(callSettings.command('set'), ctx, 'call');
  callSettingsSet.option('--from-file <path>');
  callSettingsSet.action(wrap((opts) => handleCallSettingsSet(ctx, callSettingsSet, opts)));
  const callConnect = applyCommon(call.command('connect'), ctx, 'call');
  callConnect.option('--to <phone>');
  callConnect.option('--sdp-file <path>');
  callConnect.option('--callback-data <str>');
  callConnect.action(wrap((opts) => handleCallConnect(ctx, callConnect, opts)));
  const callPre = applyCommon(call.command('pre-accept'), ctx, 'call');
  callPre.option('--call-id <id>');
  callPre.option('--sdp-file <path>');
  callPre.action(wrap((opts) => handleCallControl(ctx, callPre, 'pre_accept', opts)));
  const callAccept = applyCommon(call.command('accept'), ctx, 'call');
  callAccept.option('--call-id <id>');
  callAccept.option('--sdp-file <path>');
  callAccept.action(wrap((opts) => handleCallControl(ctx, callAccept, 'accept', opts)));
  const callReject = applyCommon(call.command('reject'), ctx, 'call');
  callReject.option('--call-id <id>');
  callReject.action(wrap((opts) => handleCallControl(ctx, callReject, 'reject', opts)));
  const callHangup = applyCommon(call.command('hangup'), ctx, 'call');
  callHangup.option('--call-id <id>');
  callHangup.action(wrap((opts) => handleCallControl(ctx, callHangup, 'terminate', opts)));

  const completion = applyCommon(program.command('completion'), ctx, 'completion');
  completion.argument('[shell]');
  completion.action(wrap((shell: string | undefined) => handleCompletion(ctx, shell)));

  applyCommon(program.command('version'), ctx, 'version').action(wrap(() => handleVersion(ctx)));

  const hidden = applyCommon(program.command('__complete', { hidden: true }), ctx, 'root');
  hidden.argument('[kind]');
  hidden.action(wrap((kind: string | undefined) => handleCompleteQuery(ctx, kind)));

  return program;
}

export function translateCommanderError(error: CommanderError): Error {
  const msg = error.message.replace(/^error: /i, '').trim();
  if (/unknown command/i.test(msg)) {
    return new UsageError(msg, '1msg --help');
  }
  return new UsageError(msg);
}
