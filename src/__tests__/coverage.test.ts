import fs from 'node:fs';
import path from 'node:path';

import { OPERATION_COMMANDS, SKIPPED_OPERATION_IDS } from '../commands';

const SPEC = path.resolve(__dirname, '../../../../public/openapi.bundled.yaml');
const IN_MONOREPO = fs.existsSync(SPEC);

/** Collect unique declared operations so the CLI coverage test detects missing command bindings. */
function operationIdsFromSpec(yaml: string): string[] {
  const ids = new Set<string>();
  for (const match of yaml.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)) {
    if (match[1] !== undefined) ids.add(match[1]);
  }
  return [...ids].sort();
}

(IN_MONOREPO ? describe : describe.skip)('public operationId coverage', () => {
  it('maps 61 public operations and skips deleteMediaLegacy (62 total)', () => {
    expect(fs.existsSync(SPEC)).toBe(true);
    const specIds = operationIdsFromSpec(fs.readFileSync(SPEC, 'utf8'));
    const mapped = Object.keys(OPERATION_COMMANDS).sort();
    const skipped = [...SKIPPED_OPERATION_IDS];

    expect(specIds).toHaveLength(62);
    expect(mapped).toHaveLength(61);
    expect(skipped).toEqual(['deleteMediaLegacy']);
    expect(new Set([...mapped, ...skipped])).toEqual(new Set(specIds));
    expect(mapped).not.toContain('deleteMediaLegacy');
  });
});
