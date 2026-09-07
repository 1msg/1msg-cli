import fs from 'fs';
import path from 'path';
import { HELP_TEXT } from '../help-text';

const RFC = path.resolve(__dirname, '../../../../docs/CLI.md');
const IN_MONOREPO = fs.existsSync(RFC);

(IN_MONOREPO ? describe : describe.skip)('help text stays aligned with RFC', () => {
  it('every frozen --help page appears in docs/CLI.md', () => {
    const md = fs.readFileSync(RFC, 'utf8');
    for (const [key, text] of Object.entries(HELP_TEXT)) {
      const snippet = text.trim().slice(0, 80);
      expect({ key, contained: md.includes(snippet) }).toEqual({ key, contained: true });
    }
  });
});
