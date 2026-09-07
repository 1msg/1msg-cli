import { usage } from './errors';

export interface DestOpts {
  to?: string;
  chatId?: string;
  quote?: string;
}

export interface DestFields {
  phone?: number;
  chatId?: string;
  quotedMsgId?: string;
}

export function requireDest(
  opts: DestOpts,
  help = '1msg send --help',
  options: { allowChatId?: boolean; toOnly?: boolean } = {},
): DestFields {
  const allowChatId = options.toOnly ? false : options.allowChatId !== false;
  if (options.toOnly && opts.chatId) {
    usage('this command accepts --to only (no --chat-id)', help);
  }
  if (opts.to && opts.chatId) {
    usage('pass exactly one of --to or --chat-id', help);
  }
  if (!opts.to && !opts.chatId) {
    usage(
      allowChatId ? 'missing destination: pass --to or --chat-id' : 'missing destination: pass --to',
      help,
    );
  }
  return destFields(opts);
}

export function destFields(opts: DestOpts): DestFields {
  const out: DestFields = {};
  if (opts.chatId) out.chatId = opts.chatId;
  if (opts.to) out.phone = parsePhone(opts.to);
  if (opts.quote) out.quotedMsgId = opts.quote;
  return out;
}

export function destStringPhone(opts: DestOpts): {
  phone?: string;
  chatId?: string;
  quotedMsgId?: string;
} {
  const out: { phone?: string; chatId?: string; quotedMsgId?: string } = {};
  if (opts.chatId) out.chatId = opts.chatId;
  if (opts.to) out.phone = String(parsePhone(opts.to));
  if (opts.quote) out.quotedMsgId = opts.quote;
  return out;
}

export function parsePhone(to: string): number {
  const cleaned = to.trim().replace(/^\+/, '');
  if (!/^\d+$/.test(cleaned)) {
    usage('invalid --to: expected phone with country code, no +');
  }
  const n = Number(cleaned);
  if (!Number.isSafeInteger(n)) usage('invalid --to: phone number out of range');
  return n;
}

export function mergeDest(
  body: Record<string, unknown>,
  dest: DestFields | { phone?: string | number; chatId?: string; quotedMsgId?: string },
): Record<string, unknown> {
  const out = { ...body };
  if (dest.phone !== undefined && out.phone === undefined) out.phone = dest.phone;
  if (dest.chatId && out.chatId === undefined) out.chatId = dest.chatId;
  if ('quotedMsgId' in dest && dest.quotedMsgId && out.quotedMsgId === undefined) {
    out.quotedMsgId = dest.quotedMsgId;
  }
  return out;
}
