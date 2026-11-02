import { OPERATION_COMMANDS, SKIPPED_OPERATION_IDS } from '../commands';
import { readContractInput } from './contract-inputs';

/** Collect unique declared operations so the CLI coverage test detects missing command bindings. */
function operationIdsFromSpec(yaml: string): string[] {
  const ids = new Set<string>();
  for (const match of yaml.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)) {
    if (match[1] !== undefined) ids.add(match[1]);
  }
  return [...ids].sort();
}

/** Compare the distribution command registry with the pinned public producer contract. */
describe('public operationId coverage', () => {
  /** Every public operation is either mapped or explicitly documented as the one legacy exclusion. */
  it('maps 61 public operations and skips deleteMediaLegacy (62 total)', () => {
    const specIds = operationIdsFromSpec(readContractInput('openapi.yaml'));
    const mapped = Object.keys(OPERATION_COMMANDS).sort();
    const skipped = [...SKIPPED_OPERATION_IDS];

    expect(specIds).toHaveLength(62);
    expect(mapped).toHaveLength(61);
    expect(skipped).toEqual(['deleteMediaLegacy']);
    expect(new Set([...mapped, ...skipped])).toEqual(new Set(specIds));
    expect(mapped).not.toContain('deleteMediaLegacy');
  });
});
