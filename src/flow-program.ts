import type { Command } from 'commander';

import type { CliContext } from './context';

import { applyCommon, bindCommandAction, wrap } from './command-binding';
import { collect } from './io';
import { missingSubcommand } from './local';
import {
  handleFlowAssets,
  handleFlowCreate,
  handleFlowEncryption,
  handleFlowEncryptionSet,
  handleFlowIdOp,
  handleFlowList,
  handleFlowMetadata,
} from './rest';

/** Register the flow lifecycle command family and its shared account scoping without executing handlers. */
export function registerFlowCommands(program: Command, ctx: CliContext): void {
  const flow = applyCommon(program.command('flow'), ctx, 'flow');
  /** A missing operation prints domain help without issuing an API call. */
  flow.action(wrap(() => missingSubcommand(ctx, 'flow')));
  /** Scope flow operations to an optional WABA account consistently. */
  const flowWaba = (c: Command) => c.option('--waba-account-id <id>');
  const flowList = applyCommon(flow.command('list'), ctx, 'flow');
  flowWaba(flowList);
  flowList.option('--fields <csv>');
  bindCommandAction(flowList, ctx, handleFlowList);
  const flowCreate = applyCommon(flow.command('create'), ctx, 'flow');
  flowWaba(flowCreate);
  flowCreate.option('--name <name>');
  flowCreate.option('--category <ENUM>', 'repeatable', collect, [] as string[]);
  flowCreate.option('--endpoint <uri>');
  flowCreate.option('--publish');
  flowCreate.option('--json-file <path>');
  bindCommandAction(flowCreate, ctx, handleFlowCreate);
  for (const operation of ['get', 'delete', 'preview', 'publish', 'deprecate'] as const) {
    const command = applyCommon(flow.command(operation), ctx, 'flow');
    flowWaba(command);
    command.argument('[flow-id]');
    /** Bind each immutable operation value to its parsed flow ID and options. */
    command.action(
      wrap((id: string | undefined, opts: Parameters<typeof handleFlowIdOp>[4]) =>
        handleFlowIdOp(ctx, command, id, operation, opts),
      ),
    );
  }
  const flowMetadata = applyCommon(flow.command('metadata'), ctx, 'flow');
  flowWaba(flowMetadata);
  flowMetadata.argument('[flow-id]');
  flowMetadata.option('--name <name>');
  flowMetadata.option('--category <ENUM>', 'repeatable', collect, [] as string[]);
  flowMetadata.option('--endpoint <uri>');
  /** Preserve parsed metadata options and flow ID at the Commander boundary. */
  flowMetadata.action(
    wrap((id: string | undefined, opts: Parameters<typeof handleFlowMetadata>[3]) =>
      handleFlowMetadata(ctx, flowMetadata, id, opts),
    ),
  );
  const flowAssets = applyCommon(flow.command('assets'), ctx, 'flow');
  flowWaba(flowAssets);
  flowAssets.argument('[flow-id]');
  flowAssets.option('--json-file <path>');
  /** Preserve the flow ID and asset file options for upload/download selection. */
  flowAssets.action(
    wrap((id: string | undefined, opts: Parameters<typeof handleFlowAssets>[3]) =>
      handleFlowAssets(ctx, flowAssets, id, opts),
    ),
  );
  const encryption = applyCommon(flow.command('encryption'), ctx, 'flow');
  bindCommandAction(encryption, ctx, handleFlowEncryption);
  const encryptionSet = applyCommon(encryption.command('set'), ctx, 'flow');
  encryptionSet.option('--pem-file <path>');
  bindCommandAction(encryptionSet, ctx, handleFlowEncryptionSet);
}
