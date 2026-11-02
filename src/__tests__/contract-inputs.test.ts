import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readContractInput } from './contract-inputs';

/** Corrupt disposable copies only; production snapshots must remain untouched after every failure assertion. */
describe('standalone producer contract inputs', () => {
  /** Both contract formats reject missing bytes, altered bytes and invalid provenance rather than disabling their suites. */
  it.each(['openapi.yaml', 'CLI.md'] as const)('rejects unavailable or corrupt %s', (name) => {
    const directory = mkdtempSync(path.join(tmpdir(), '1msg-cli-contract-'));
    try {
      cpSync(path.resolve(__dirname, '../../quality/contracts'), directory, { recursive: true });
      const file = path.join(directory, name);
      const original = readFileSync(file);
      expect(readContractInput(name, directory)).toBe(original.toString('utf8'));
      writeFileSync(file, Buffer.concat([original, Buffer.from('\nchanged\n')]));
      expect(() => readContractInput(name, directory)).toThrow('Contract checksum mismatch');
      rmSync(file);
      expect(() => readContractInput(name, directory)).toThrow(/ENOENT/);
      writeFileSync(file, original);
      const metadata = path.join(directory, 'provenance.json');
      writeFileSync(metadata, '{}');
      expect(() => readContractInput(name, directory)).toThrow('Invalid contract provenance');
      rmSync(metadata);
      expect(() => readContractInput(name, directory)).toThrow(/ENOENT/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
