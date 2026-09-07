import path from 'path';
import { stringify } from 'yaml';
import { OPERATION_COMMANDS } from '../commands';
import { configFilePath } from '../paths';
import { runCli } from '../run';
import { createRecordingClient, makeCtx } from './helpers';

type Case = {
  argv: string[];
  method: string;
  files?: Record<string, string>;
};

const PHONE = '12020721369';
const GID = '120363046942338209';
const FLOW = 'FLOW123';

const CASES: Record<string, Case> = {
  sendMessage: { argv: ['send', '--to', PHONE, '--text', 'Hello'], method: 'sendMessage' },
  sendFile: {
    argv: ['send', '--to', PHONE, '--file', './a.jpg'],
    method: 'messaging.sendFile',
    files: { 'a.jpg': 'xx' },
  },
  createUploadMedia: {
    argv: ['media', 'upload', '--file', './a.jpg'],
    method: 'messaging.createUploadMedia',
    files: { 'a.jpg': 'xx' },
  },
  listMessages: { argv: ['message', 'list'], method: 'messaging.listMessages' },
  createReadMessage: {
    argv: ['message', 'read', '--message-id', 'wamid.1'],
    method: 'messaging.createReadMessage',
  },
  sendTemplate: {
    argv: ['template', 'send', '--to', PHONE, '--name', 'hello_world'],
    method: 'templates.sendTemplate',
  },
  listTemplates: { argv: ['template', 'list'], method: 'templates.listTemplates' },
  addTemplate: {
    argv: ['template', 'add', '--from-file', './tpl.json'],
    method: 'templates.addTemplate',
    files: {
      'tpl.json': JSON.stringify({
        name: 'hello',
        category: 'UTILITY',
        language: 'en_US',
        components: [{ type: 'BODY', text: 'Hi' }],
      }),
    },
  },
  removeTemplate: {
    argv: ['template', 'remove', '--name', 'hello_world'],
    method: 'templates.removeTemplate',
  },
  getStatus: { argv: ['status'], method: 'channel.getStatus' },
  getMe: { argv: ['me'], method: 'profile.getMe' },
  updateMe: { argv: ['me', 'update', '--about', 'Available'], method: 'profile.updateMe' },
  retrieveMedia: { argv: ['media', 'get', '--id', '123'], method: 'messaging.retrieveMedia' },
  deleteMedia: { argv: ['media', 'delete', '--id', '123'], method: 'messaging.deleteMedia' },
  sendReaction: {
    argv: ['message', 'react', '--to', PHONE, '--message-id', 'wamid.1', '--emoji', '👍'],
    method: 'messaging.sendReaction',
  },
  sendLocation: {
    argv: ['message', 'location', '--to', PHONE, '--lat', '55.75', '--lng', '37.61'],
    method: 'messaging.sendLocation',
  },
  sendLocationRequest: {
    argv: ['message', 'location-request', '--to', PHONE],
    method: 'messaging.sendLocationRequest',
  },
  sendContact: {
    argv: ['message', 'contact', '--to', PHONE, '--name', 'John Doe', '--phone', '+12020721369'],
    method: 'messaging.sendContact',
  },
  sendButton: {
    argv: ['message', 'buttons', '--to', PHONE, '--text', 'Choose', '--button', 'yes:Yes'],
    method: 'messaging.sendButton',
  },
  sendList: {
    argv: ['message', 'menu', '--to', PHONE, '--from-file', './menu.json'],
    method: 'messaging.sendList',
    files: {
      'menu.json': JSON.stringify({
        body: 'Pick',
        buttonText: 'Open',
        sections: [{ title: 'A', rows: [{ id: '1', title: 'One' }] }],
      }),
    },
  },
  sendCarousel: {
    argv: ['message', 'carousel', '--to', PHONE, '--from-file', './cards.json'],
    method: 'messaging.sendCarousel',
    files: { 'cards.json': JSON.stringify({ cards: [{ cardIndex: 0 }] }) },
  },
  sendProduct: {
    argv: ['message', 'product', '--to', PHONE, '--catalog-id', '1', '--product-id', '0001'],
    method: 'messaging.sendProduct',
  },
  sendCtaUrl: {
    argv: [
      'message',
      'cta',
      '--to',
      PHONE,
      '--text',
      'See',
      '--button',
      'Open',
      '--url',
      'https://example.com',
    ],
    method: 'messaging.sendCtaUrl',
  },
  sendAddressMessage: {
    argv: ['message', 'address', '--to', '919876543210', '--text', 'Address?', '--country', 'IN'],
    method: 'messaging.sendAddressMessage',
  },
  sendOrderDetails: {
    argv: ['message', 'order', '--to', '919876543210', '--from-file', './order.json'],
    method: 'messaging.sendOrderDetails',
    files: {
      'order.json': JSON.stringify({
        template: 'order_details_utility',
        namespace: 'NS',
        language: { policy: 'deterministic', code: 'en' },
        order: { items: [] },
      }),
    },
  },
  sendPaymentRequest: {
    argv: ['message', 'payment', '--to', '919876543210', '--region', 'IN'],
    method: 'messaging.sendPaymentRequest',
  },
  sendSticker: {
    argv: ['message', 'sticker', '--to', PHONE, '--link', 'https://example.com/s.webp'],
    method: 'messaging.sendSticker',
  },
  sendFlow: {
    argv: [
      'message',
      'flow',
      '--to',
      PHONE,
      '--text',
      'Open',
      '--flow-id',
      FLOW,
      '--flow-token',
      'tok',
      '--cta',
      'Start',
    ],
    method: 'messaging.sendFlow',
  },
  getWebhook: { argv: ['webhook', 'get'], method: 'webhooks.getWebhook' },
  setWebhook: {
    argv: ['webhook', 'set', '--url', 'https://example.com/hook'],
    method: 'webhooks.setWebhook',
  },
  listSettings: { argv: ['channel', 'settings'], method: 'channel.listSettings' },
  createSettings: {
    argv: ['channel', 'settings', 'set', '--ack-notifications'],
    method: 'channel.createSettings',
  },
  getMmLiteStatus: { argv: ['channel', 'mm-lite'], method: 'messaging.getMmLiteStatus' },
  getCommerce: { argv: ['catalog', 'get'], method: 'catalog.getCommerce' },
  createCommerce: {
    argv: ['catalog', 'set', '--cart', '--visible'],
    method: 'catalog.createCommerce',
  },
  getConversationalAutomation: {
    argv: ['channel', 'automation'],
    method: 'channel.getConversationalAutomation',
  },
  setConversationalAutomation: {
    argv: ['channel', 'automation', 'set', '--welcome'],
    method: 'channel.setConversationalAutomation',
  },
  blockUser: { argv: ['user', 'block', '--to', PHONE], method: 'users.blockUser' },
  unblockUser: { argv: ['user', 'unblock', '--to', PHONE], method: 'users.unblockUser' },
  listBlockedUsers: { argv: ['user', 'blocked'], method: 'users.listBlockedUsers' },
  createGroups: { argv: ['group', 'create', '--name', 'Support'], method: 'groups.createGroups' },
  listGroups: { argv: ['group', 'list'], method: 'groups.listGroups' },
  getGroupsGroupId: { argv: ['group', 'get', GID], method: 'groups.getGroupsGroupId' },
  createGroupsGroupId: {
    argv: ['group', 'update', GID, '--subject', 'Support'],
    method: 'groups.createGroupsGroupId',
  },
  deleteGroupsGroupId: { argv: ['group', 'delete', GID], method: 'groups.deleteGroupsGroupId' },
  getGroupsGroupIdInvitelink: {
    argv: ['group', 'invite-link', GID],
    method: 'groups.getGroupsGroupIdInvitelink',
  },
  createGroupsGroupIdInvitelink: {
    argv: ['group', 'invite-link', 'reset', GID],
    method: 'groups.createGroupsGroupIdInvitelink',
  },
  createFlows: {
    argv: ['flow', 'create', '--name', 'lead', '--category', 'LEAD_GENERATION'],
    method: 'flows.createFlows',
  },
  listFlows: { argv: ['flow', 'list'], method: 'flows.listFlows' },
  getFlowsFlowId: { argv: ['flow', 'get', FLOW], method: 'flows.getFlowsFlowId' },
  deleteFlowsFlowId: { argv: ['flow', 'delete', FLOW], method: 'flows.deleteFlowsFlowId' },
  patchFlowsFlowIdMetadata: {
    argv: ['flow', 'metadata', FLOW, '--name', 'lead'],
    method: 'flows.patchFlowsFlowIdMetadata',
  },
  patchFlowsFlowIdAssets: {
    argv: ['flow', 'assets', FLOW, '--json-file', './flow.json'],
    method: 'flows.patchFlowsFlowIdAssets',
    files: { 'flow.json': '{}' },
  },
  getFlowsFlowIdPreview: { argv: ['flow', 'preview', FLOW], method: 'flows.getFlowsFlowIdPreview' },
  createFlowsFlowIdPublish: {
    argv: ['flow', 'publish', FLOW],
    method: 'flows.createFlowsFlowIdPublish',
  },
  createFlowsFlowIdDeprecate: {
    argv: ['flow', 'deprecate', FLOW],
    method: 'flows.createFlowsFlowIdDeprecate',
  },
  getCallingSettings: { argv: ['call', 'settings'], method: 'calling.getCallingSettings' },
  updateCallingSettings: {
    argv: ['call', 'settings', 'set', '--from-file', './calling.json'],
    method: 'calling.updateCallingSettings',
    files: { 'calling.json': JSON.stringify({ status: 'ENABLED' }) },
  },
  initiateCall: {
    argv: ['call', 'hangup', '--call-id', 'wacid.1'],
    method: 'calling.initiateCall',
  },
  getWhatsappBusinessEncryption: {
    argv: ['flow', 'encryption'],
    method: 'flows.getWhatsappBusinessEncryption',
  },
  setWhatsappBusinessEncryption: {
    argv: ['flow', 'encryption', 'set', '--pem-file', './key.pem'],
    method: 'flows.setWhatsappBusinessEncryption',
    files: { 'key.pem': '-----BEGIN PUBLIC KEY-----\nM\n-----END PUBLIC KEY-----\n' },
  },
};

function setup(files?: Record<string, string>) {
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
  if (files) {
    for (const [name, contents] of Object.entries(files)) {
      made.ctx.fs.writeFileSync(path.join(made.ctx.cwd, name), contents);
    }
  }
  return { ...made, bundle };
}

describe('mapped operation handlers', () => {
  it('has a live command for every public operationId', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(OPERATION_COMMANDS).sort());
  });

  it.each(Object.entries(CASES))('%s calls %s', async (op, spec) => {
    const { ctx, stdout, stderr, bundle } = setup(spec.files);
    const code = await runCli(spec.argv, ctx);
    expect({
      op,
      code,
      stderr: stderr.toString(),
      stdout: stdout.toString().slice(0, 200),
      methods: bundle.calls.map((c) => c.method),
    }).toMatchObject({ op, code: 0 });
    expect(bundle.calls.some((c) => c.method === spec.method)).toBe(true);
  });

  it('webhook clear uses createSettings', async () => {
    const { ctx, bundle } = setup();
    const code = await runCli(['webhook', 'clear'], ctx);
    expect(code).toBe(0);
    expect(bundle.calls.some((c) => c.method === 'channel.createSettings')).toBe(true);
  });

  it('channel status aliases getStatus', async () => {
    const { ctx, bundle } = setup();
    const code = await runCli(['channel', 'status'], ctx);
    expect(code).toBe(0);
    expect(bundle.calls.some((c) => c.method === 'channel.getStatus')).toBe(true);
  });
});
