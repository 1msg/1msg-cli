import fs from 'node:fs';
import path from 'node:path';

import { HELP_TEXT } from '../help-text';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const RFC = path.join(REPO_ROOT, 'docs/CLI.md');
const IN_MONOREPO =
  fs.existsSync(RFC) && fs.existsSync(path.join(REPO_ROOT, 'packages/cli/package.json'));

function normalizeHelp(text: string): string {
  return `${text.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
}

function headingKeys(line: string): string[] {
  const keys: string[] = [];
  const re = /`1msg(?: ([^`]+))? --help`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    keys.push(m[1] ?? 'root');
  }
  return keys;
}

/** Unlabeled ``` fences in a slice (skip ```json / ```yaml / ```bash). */
function unlabeledFences(slice: string): string[] {
  const fences: string[] = [];
  const re = /```\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) {
    if (m[1] !== undefined) fences.push(normalizeHelp(m[1]));
  }
  return fences;
}

function extraFenceKey(text: string): string | undefined {
  const first = text.trim().split('\n')[0] ?? '';
  const m = first.match(/^1msg ((?:message|channel|template) \S+|\S+)/);
  return m?.[1];
}

/** Extract each RFC help block and its aliases; reject headings without a help fence instead of silently dropping coverage. */
function rfcHelpPages(md: string): Map<string, string> {
  const headingRe = /^#{2,4} .*(`1msg(?: [^`]+)? --help`)/gm;
  const headings: { index: number; keys: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(md))) {
    const line = md.slice(m.index, md.indexOf('\n', m.index));
    headings.push({ index: m.index, keys: headingKeys(line) });
  }
  const pages = new Map<string, string>();
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (heading === undefined) throw new Error('Missing RFC heading');
    const end = headings[i + 1]?.index ?? md.length;
    const fences = unlabeledFences(md.slice(heading.index, end));
    expect({ keys: heading.keys, fenceCount: fences.length > 0 }).toEqual({
      keys: heading.keys,
      fenceCount: true,
    });
    const firstFence = fences[0];
    if (firstFence === undefined) throw new Error('RFC heading has no help block');
    for (const key of heading.keys) {
      pages.set(key, firstFence);
    }
    for (const fence of fences.slice(1)) {
      const key = extraFenceKey(fence);
      if (key) pages.set(key, fence);
    }
  }
  return pages;
}

(IN_MONOREPO ? describe : describe.skip)('help text stays aligned with RFC', () => {
  it('every RFC 1msg --help page matches HELP_TEXT', () => {
    const md = fs.readFileSync(RFC, 'utf8');
    const pages = rfcHelpPages(md);
    expect(pages.size).toBeGreaterThan(20);
    const assigned = new Set(pages.values());
    for (const [key, text] of Object.entries(HELP_TEXT)) {
      const frozen = normalizeHelp(text);
      const rfc = pages.get(key);
      if (rfc !== undefined) {
        expect({ key, out: frozen }).toEqual({ key, out: rfc });
      } else {
        expect({ key, aliasOfRfcPage: assigned.has(frozen) }).toEqual({
          key,
          aliasOfRfcPage: true,
        });
      }
    }
    for (const key of pages.keys()) {
      expect({ key, inHelpText: HELP_TEXT[key] !== undefined }).toEqual({
        key,
        inHelpText: true,
      });
    }
  });
});
