import { HELP_TEXT } from '../help-text';
import { runCli } from '../run';
import { makeCtx } from './helpers';

function argvForHelpKey(key: string): string[] {
  if (key === 'root') return ['--help'];
  return [...key.split(' '), '--help'];
}

describe('RFC --help snapshots', () => {
  it('prints frozen help for every RFC page', async () => {
    const keys = Object.keys(HELP_TEXT);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      const { ctx, stdout } = makeCtx();
      const code = await runCli(argvForHelpKey(key), ctx);
      expect({ key, code }).toEqual({ key, code: 0 });
      expect({ key, out: stdout.toString() }).toEqual({ key, out: HELP_TEXT[key] });
    }
  });

  it('root --help matches RFC root page', async () => {
    const { ctx, stdout } = makeCtx();
    const code = await runCli(['--help'], ctx);
    expect(code).toBe(0);
    expect(stdout.toString()).toBe(HELP_TEXT.root);
    expect(stdout.toString()).toContain('1msg — command-line client');
    expect(stdout.toString()).not.toContain('not implemented yet');
  });
});
