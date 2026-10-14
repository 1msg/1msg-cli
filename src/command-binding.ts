import { Command, Option } from 'commander';

import type { CliContext } from './context';

import { CliExit } from './errors';
import { writeHelp } from './local';

/** Preserve each Commander action's parsed argument tuple while awaiting its result. */
export function wrap<Args extends unknown[]>(fn: (this: Command, ...args: Args) => unknown) {
  /** Await the selected action with its original Commander receiver and parsed argument tuple. */
  return /** Preserve the receiver and arguments while awaiting the selected command. */ async function (
    this: Command,
    ...args: Args
  ): Promise<void> {
    await fn.apply(this, args);
  };
}

/** Bind a typed application handler to Commander's untyped action boundary, retaining parsed positional/options tuples. */
export function bindCommandAction<Args extends unknown[]>(
  command: Command,
  ctx: CliContext,
  handler: (context: CliContext, command: Command, ...args: Args) => unknown,
): void {
  /** Commander supplies the parsed argument tuple only when the command runs; async failure remains observed by wrap. */
  command.action(wrap((...args: Args) => handler(ctx, command, ...args)));
}

/** Derive the display path from the Commander parent chain without including the executable name. */
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

/** Apply channel/credential/output flags and a pre-action help hook consistently to every command. */
export function applyCommon(cmd: Command, ctx: CliContext, helpPath?: string): Command {
  cmd.helpOption(false);
  cmd.addHelpCommand(false);
  cmd.option('-c, --channel <name>');
  cmd.option('--instance-id <id>');
  cmd.option('--base-url <url>');
  cmd.option('--token <token>');
  cmd.option('--json');
  cmd.addOption(new Option('--no-color'));
  cmd.option('-h, --help');
  /** Short-circuit help before any command action can access an API or configuration. */
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
