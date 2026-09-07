import fs from 'fs';
import path from 'path';
import { OPERATION_COMMANDS, SKIPPED_OPERATION_IDS } from '../commands';

const SPEC = path.resolve(__dirname, '../../../../public/openapi.bundled.yaml');
const IN_MONOREPO = fs.existsSync(SPEC);

function operationIdsFromSpec(yaml: string): string[] {
  const ids = new Set<string>();
  for (const match of yaml.matchAll(/^\s+operationId:\s+(\S+)\s*$/gm)) {
    ids.add(match[1]);
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
