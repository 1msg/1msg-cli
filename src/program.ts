import { Command, CommanderError, Option } from 'commander';

import type { CliContext } from './context';

import { handleChannelInfo, handleStatus } from './channel-rest';
import { applyCommon, bindCommandAction, wrap } from './command-binding';
import { CliExit, UsageError } from './errors';
import { registerFlowCommands } from './flow-program';
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
import { handleMessageSticker } from './message-sticker';
import {
  handleAutomation,
  handleAutomationSet,
  handleCallConnect,
  handleCallControl,
  handleCallSettings,
  handleCallSettingsSet,
  handleCatalogGet,
  handleCatalogSet,
  handleChannelSettings,
  handleChannelSettingsSet,
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
  handleUserBlock,
  handleUserBlocked,
  handleWebhookClear,
  handleWebhookGet,
  handleWebhookSet,
} from './rest';
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
  handleSend,
  handleTemplateAdd,
  handleTemplateList,
  handleTemplateRemove,
  handleTemplateSend,
} from './send';

function destFlags(cmd: Command): Command {
  cmd.option('--to <phone>');
  cmd.option('--chat-id <id>');
  cmd.option('--quote <wamid>');
  return cmd;
}

/** Compose the Commander command tree and typed handlers; parsing performs no API request until an action runs. */
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

  program.action(
    wrap((opts: { help?: boolean; version?: boolean }) => {
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
    }),
  );

  const init = applyCommon(program.command('init'), ctx, 'init');
  init.option('--name <name>');
  init.option('--token-stdin');
  init.addOption(new Option('--no-verify'));
  bindCommandAction(init, ctx, handleInit);

  const send = applyCommon(program.command('send'), ctx, 'send');
  destFlags(send);
  send.option('--text <body>');
  send.option('--file <path>');
  send.option('--caption <text>');
  send.option('--filename <name>');
  send.option('--media-id <id>');
  send.option('--media-type <type>');
  send.option('--voice');
  bindCommandAction(send, ctx, handleSend);

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
  bindCommandAction(messageSend, ctx, handleSend);

  const messageList = applyCommon(message.command('list'), ctx, 'message list');
  messageList.option('--chat-id <id>');
  messageList.option('--limit <n>');
  messageList.option('--last');
  messageList.option('--msg-id <id>');
  messageList.option('--min-time <unix>');
  messageList.option('--max-time <unix>');
  messageList.option('--first-number <n>');
  messageList.option('--last-number <n>');
  bindCommandAction(messageList, ctx, handleMessageList);

  const messageRead = applyCommon(message.command('read'), ctx, 'message read');
  messageRead.option('--message-id <id>');
  messageRead.option('--typing');
  bindCommandAction(messageRead, ctx, handleMessageRead);

  const messageReact = applyCommon(message.command('react'), ctx, 'message react');
  destFlags(messageReact);
  messageReact.option('--message-id <id>');
  messageReact.option('--emoji <emoji>');
  bindCommandAction(messageReact, ctx, handleMessageReact);

  const messageLocation = applyCommon(message.command('location'), ctx, 'message location');
  destFlags(messageLocation);
  messageLocation.option('--lat <n>');
  messageLocation.option('--lng <n>');
  messageLocation.option('--name <text>');
  messageLocation.option('--address <text>');
  bindCommandAction(messageLocation, ctx, handleMessageLocation);

  const messageLocReq = applyCommon(
    message.command('location-request'),
    ctx,
    'message location-request',
  );
  destFlags(messageLocReq);
  messageLocReq.option('--text <body>');
  bindCommandAction(messageLocReq, ctx, handleMessageLocationRequest);

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
  bindCommandAction(messageContact, ctx, handleMessageContact);

  const messageButtons = applyCommon(message.command('buttons'), ctx, 'message buttons');
  destFlags(messageButtons);
  messageButtons.option('--text <body>');
  messageButtons.option('--footer <text>');
  messageButtons.option('--button <id:title>', 'repeatable', collect, [] as string[]);
  messageButtons.option('--from-file <path>');
  bindCommandAction(messageButtons, ctx, handleMessageButtons);

  const messageMenu = applyCommon(message.command('menu'), ctx, 'message menu');
  destFlags(messageMenu);
  messageMenu.option('--from-file <path>');
  messageMenu.option('--text <body>');
  messageMenu.option('--button-text <text>');
  messageMenu.option('--title <text>');
  messageMenu.option('--footer <text>');
  bindCommandAction(messageMenu, ctx, handleMessageMenu);

  const messageCarousel = applyCommon(message.command('carousel'), ctx, 'message carousel');
  destFlags(messageCarousel);
  messageCarousel.option('--text <body>');
  messageCarousel.option('--from-file <path>');
  bindCommandAction(messageCarousel, ctx, handleMessageCarousel);

  const messageProduct = applyCommon(message.command('product'), ctx, 'message product');
  destFlags(messageProduct);
  messageProduct.option('--text <body>');
  messageProduct.option('--header <text>');
  messageProduct.option('--footer <text>');
  messageProduct.option('--catalog-id <id>');
  messageProduct.option('--product-id <retailer-id>');
  messageProduct.option('--from-file <path>');
  bindCommandAction(messageProduct, ctx, handleMessageProduct);

  const messageCta = applyCommon(message.command('cta'), ctx, 'message cta');
  destFlags(messageCta);
  messageCta.option('--text <body>');
  messageCta.option('--button <label>');
  messageCta.option('--url <https>');
  messageCta.option('--footer <text>');
  messageCta.option('--from-file <path>');
  bindCommandAction(messageCta, ctx, handleMessageCta);

  const messageAddress = applyCommon(message.command('address'), ctx, 'message address');
  destFlags(messageAddress);
  messageAddress.option('--text <body>');
  messageAddress.option('--country <IN|SG>');
  messageAddress.option('--from-file <path>');
  bindCommandAction(messageAddress, ctx, handleMessageAddress);

  const messageOrder = applyCommon(message.command('order'), ctx, 'message order');
  destFlags(messageOrder);
  messageOrder.option('--name <template>');
  messageOrder.option('--lang <code>');
  messageOrder.option('--namespace <id>');
  messageOrder.option('--reference-id <id>');
  messageOrder.option('--currency <code>');
  messageOrder.option('--from-file <path>');
  bindCommandAction(messageOrder, ctx, handleMessageOrder);

  const messagePayment = applyCommon(message.command('payment'), ctx, 'message payment');
  messagePayment.option('--to <phone>');
  messagePayment.option('--chat-id <id>');
  messagePayment.option('--region <IN|SG|BR>');
  messagePayment.option('--text <body>');
  messagePayment.option('--from-file <path>');
  bindCommandAction(messagePayment, ctx, handleMessagePayment);

  const messageSticker = applyCommon(message.command('sticker'), ctx, 'message sticker');
  destFlags(messageSticker);
  messageSticker.option('--link <https>');
  messageSticker.option('--media-id <id>');
  messageSticker.option('--file <path>');
  bindCommandAction(messageSticker, ctx, handleMessageSticker);

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
  bindCommandAction(messageFlow, ctx, handleMessageFlow);

  const template = applyCommon(program.command('template'), ctx, 'template');
  template.action(wrap(() => missingSubcommand(ctx, 'template')));

  const templateList = applyCommon(template.command('list'), ctx, 'template list');
  templateList.option('--limit <n>');
  templateList.option('--offset <n>');
  templateList.option('--sort <id|name|status>');
  bindCommandAction(templateList, ctx, handleTemplateList);

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
  bindCommandAction(templateSend, ctx, handleTemplateSend);

  const templateAdd = applyCommon(template.command('add'), ctx, 'template add');
  templateAdd.option('--from-file <path>');
  templateAdd.option('--name <name>');
  templateAdd.option('--category <MARKETING|UTILITY|AUTHENTICATION>');
  templateAdd.option('--language <code>');
  bindCommandAction(templateAdd, ctx, handleTemplateAdd);

  const templateRemove = applyCommon(template.command('remove'), ctx, 'template remove');
  templateRemove.option('--name <name>');
  bindCommandAction(templateRemove, ctx, handleTemplateRemove);

  const channel = applyCommon(program.command('channel'), ctx, 'channel');
  channel.action(wrap(() => missingSubcommand(ctx, 'channel')));

  bindCommandAction(applyCommon(channel.command('list'), ctx, 'channel'), ctx, handleChannelList);
  applyCommon(channel.command('use'), ctx, 'channel use')
    .argument('[name-or-id]')
    .action(wrap((nameOrId: string | undefined) => handleChannelUse(ctx, nameOrId)));
  const channelAdd = applyCommon(channel.command('add'), ctx, 'channel add');
  channelAdd.option('--name <name>');
  channelAdd.option('--token-stdin');
  channelAdd.option('--default');
  channelAdd.addOption(new Option('--no-verify'));
  bindCommandAction(channelAdd, ctx, handleChannelAdd);
  applyCommon(channel.command('remove'), ctx, 'channel')
    .argument('[name]')
    .action(wrap((name: string | undefined) => handleChannelRemove(ctx, name)));
  bindCommandAction(
    applyCommon(channel.command('current'), ctx, 'channel'),
    ctx,
    handleChannelCurrent,
  );
  bindCommandAction(
    applyCommon(channel.command('info'), ctx, 'channel info'),
    ctx,
    handleChannelInfo,
  );
  bindCommandAction(
    applyCommon(channel.command('status'), ctx, 'channel status'),
    ctx,
    handleStatus,
  );

  const settings = applyCommon(channel.command('settings'), ctx, 'channel');
  bindCommandAction(settings, ctx, handleChannelSettings);
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
  bindCommandAction(settingsSet, ctx, handleChannelSettingsSet);

  bindCommandAction(applyCommon(channel.command('mm-lite'), ctx, 'channel'), ctx, handleMmLite);
  const automation = applyCommon(channel.command('automation'), ctx, 'channel');
  bindCommandAction(automation, ctx, handleAutomation);
  const automationSet = applyCommon(automation.command('set'), ctx, 'channel');
  automationSet.option('--welcome');
  automationSet.option('--no-welcome');
  automationSet.option('--prompt <text>', 'repeatable', collect, [] as string[]);
  automationSet.option('--command <name:description>', 'repeatable', collect, [] as string[]);
  bindCommandAction(automationSet, ctx, handleAutomationSet);

  const me = applyCommon(program.command('me'), ctx, 'me');
  bindCommandAction(me, ctx, handleMe);
  const meUpdate = applyCommon(me.command('update'), ctx, 'me');
  meUpdate.option('--about <text>');
  meUpdate.option('--address <text>');
  meUpdate.option('--description <text>');
  meUpdate.option('--email <email>');
  meUpdate.option('--vertical <text>');
  meUpdate.option('--photo <url>');
  meUpdate.option('--website <url>', 'repeatable', collect, [] as string[]);
  bindCommandAction(meUpdate, ctx, handleMeUpdate);

  const status = applyCommon(program.command('status'), ctx, 'status');
  bindCommandAction(status, ctx, handleStatus);

  const media = applyCommon(program.command('media'), ctx, 'media');
  media.action(wrap(() => missingSubcommand(ctx, 'media')));
  const mediaUpload = applyCommon(media.command('upload'), ctx, 'media');
  mediaUpload.option('--file <path>');
  mediaUpload.option('--url <https>');
  bindCommandAction(mediaUpload, ctx, handleMediaUpload);
  const mediaGet = applyCommon(media.command('get'), ctx, 'media');
  mediaGet.option('--id <id>');
  bindCommandAction(mediaGet, ctx, handleMediaGet);
  const mediaDelete = applyCommon(media.command('delete'), ctx, 'media');
  mediaDelete.option('--id <id>');
  bindCommandAction(mediaDelete, ctx, handleMediaDelete);

  const group = applyCommon(program.command('group'), ctx, 'group');
  group.action(wrap(() => missingSubcommand(ctx, 'group')));
  const groupList = applyCommon(group.command('list'), ctx, 'group');
  groupList.option('--limit <n>');
  groupList.option('--before <cursor>');
  groupList.option('--after <cursor>');
  bindCommandAction(groupList, ctx, handleGroupList);
  const groupCreate = applyCommon(group.command('create'), ctx, 'group');
  groupCreate.option('--name <subject>');
  groupCreate.option('--description <text>');
  bindCommandAction(groupCreate, ctx, handleGroupCreate);
  const groupGet = applyCommon(group.command('get'), ctx, 'group');
  groupGet.argument('[group-id]');
  groupGet.option('--fields <csv>');
  groupGet.action(
    wrap((id: string | undefined, opts: Parameters<typeof handleGroupGet>[3]) =>
      handleGroupGet(ctx, groupGet, id, opts),
    ),
  );
  const groupUpdate = applyCommon(group.command('update'), ctx, 'group');
  groupUpdate.argument('[group-id]');
  groupUpdate.option('--subject <text>');
  groupUpdate.option('--description <text>');
  groupUpdate.option('--picture <url>');
  groupUpdate.action(
    wrap((id: string | undefined, opts: Parameters<typeof handleGroupUpdate>[3]) =>
      handleGroupUpdate(ctx, groupUpdate, id, opts),
    ),
  );
  applyCommon(group.command('delete'), ctx, 'group')
    .argument('[group-id]')
    .action(
      wrap(function (this: Command, id: string | undefined) {
        return handleGroupDelete(ctx, this, id);
      }),
    );
  const invite = applyCommon(group.command('invite-link'), ctx, 'group');
  invite.argument('[group-id]');
  invite.action(
    wrap(function (this: Command, id: string | undefined) {
      return handleGroupInviteLink(ctx, this, id, false);
    }),
  );
  applyCommon(invite.command('reset'), ctx, 'group')
    .argument('[group-id]')
    .action(
      wrap(function (this: Command, id: string | undefined) {
        return handleGroupInviteLink(ctx, this, id, true);
      }),
    );

  registerFlowCommands(program, ctx);

  const webhook = applyCommon(program.command('webhook'), ctx, 'webhook');
  webhook.action(wrap(() => missingSubcommand(ctx, 'webhook')));
  bindCommandAction(applyCommon(webhook.command('get'), ctx, 'webhook'), ctx, handleWebhookGet);
  const webhookSet = applyCommon(webhook.command('set'), ctx, 'webhook');
  webhookSet.option('--url <https>', 'repeatable', collect, [] as string[]);
  bindCommandAction(webhookSet, ctx, handleWebhookSet);
  bindCommandAction(applyCommon(webhook.command('clear'), ctx, 'webhook'), ctx, handleWebhookClear);

  const user = applyCommon(program.command('user'), ctx, 'user');
  user.action(wrap(() => missingSubcommand(ctx, 'user')));
  bindCommandAction(applyCommon(user.command('blocked'), ctx, 'user'), ctx, handleUserBlocked);
  const userBlock = applyCommon(user.command('block'), ctx, 'user');
  userBlock.option('--to <phone>');
  userBlock.action(
    wrap((opts: Parameters<typeof handleUserBlock>[2]) =>
      handleUserBlock(ctx, userBlock, opts, 'block'),
    ),
  );
  const userUnblock = applyCommon(user.command('unblock'), ctx, 'user');
  userUnblock.option('--to <phone>');
  userUnblock.action(
    wrap((opts: Parameters<typeof handleUserBlock>[2]) =>
      handleUserBlock(ctx, userUnblock, opts, 'unblock'),
    ),
  );

  const catalog = applyCommon(program.command('catalog'), ctx, 'catalog');
  catalog.action(wrap(() => missingSubcommand(ctx, 'catalog')));
  bindCommandAction(applyCommon(catalog.command('get'), ctx, 'catalog'), ctx, handleCatalogGet);
  const catalogSet = applyCommon(catalog.command('set'), ctx, 'catalog');
  catalogSet.option('--cart');
  catalogSet.option('--no-cart');
  catalogSet.option('--visible');
  catalogSet.option('--no-visible');
  bindCommandAction(catalogSet, ctx, handleCatalogSet);

  const call = applyCommon(program.command('call'), ctx, 'call');
  call.action(wrap(() => missingSubcommand(ctx, 'call')));
  const callSettings = applyCommon(call.command('settings'), ctx, 'call');
  bindCommandAction(callSettings, ctx, handleCallSettings);
  const callSettingsSet = applyCommon(callSettings.command('set'), ctx, 'call');
  callSettingsSet.option('--from-file <path>');
  bindCommandAction(callSettingsSet, ctx, handleCallSettingsSet);
  const callConnect = applyCommon(call.command('connect'), ctx, 'call');
  callConnect.option('--to <phone>');
  callConnect.option('--sdp-file <path>');
  callConnect.option('--callback-data <str>');
  bindCommandAction(callConnect, ctx, handleCallConnect);
  const callPre = applyCommon(call.command('pre-accept'), ctx, 'call');
  callPre.option('--call-id <id>');
  callPre.option('--sdp-file <path>');
  callPre.action(
    wrap((opts: Parameters<typeof handleCallControl>[3]) =>
      handleCallControl(ctx, callPre, 'pre_accept', opts),
    ),
  );
  const callAccept = applyCommon(call.command('accept'), ctx, 'call');
  callAccept.option('--call-id <id>');
  callAccept.option('--sdp-file <path>');
  callAccept.action(
    wrap((opts: Parameters<typeof handleCallControl>[3]) =>
      handleCallControl(ctx, callAccept, 'accept', opts),
    ),
  );
  const callReject = applyCommon(call.command('reject'), ctx, 'call');
  callReject.option('--call-id <id>');
  callReject.action(
    wrap((opts: Parameters<typeof handleCallControl>[3]) =>
      handleCallControl(ctx, callReject, 'reject', opts),
    ),
  );
  const callHangup = applyCommon(call.command('hangup'), ctx, 'call');
  callHangup.option('--call-id <id>');
  callHangup.action(
    wrap((opts: Parameters<typeof handleCallControl>[3]) =>
      handleCallControl(ctx, callHangup, 'terminate', opts),
    ),
  );

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
