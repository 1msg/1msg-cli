import { CommanderError } from 'commander';
import { createDefaultContext, type CliContext } from './context';
import { CliExit, EXIT_OK, normalizeThrown } from './errors';
import { emitError } from './execute';
import { createProgram, translateCommanderError } from './program';

export async function runCli(
  argv: string[],
  context: Partial<CliContext> = {},
): Promise<number> {
  const ctx = createDefaultContext(context);
  const program = createProgram(ctx);
  try {
    await program.parseAsync(argv, { from: 'user' });
    return EXIT_OK;
  } catch (error) {
    if (error instanceof CliExit) return error.exitCode;
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        return EXIT_OK;
      }
      const flags = { json: argv.includes('--json'), color: !argv.includes('--no-color') };
      return emitError(ctx, flags, translateCommanderError(error));
    }
    const flags = { json: argv.includes('--json'), color: !argv.includes('--no-color') };
    const normalized = await normalizeThrown(error);
    if (normalized instanceof CliExit) return normalized.exitCode;
    return emitError(ctx, flags, normalized);
  }
}
