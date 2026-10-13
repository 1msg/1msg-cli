import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const inputs = path.resolve(__dirname, '../../quality/contracts');
type ContractInput = 'openapi.yaml' | 'CLI.md';

/** Read a byte-pinned producer input; absent files or invalid provenance fail rather than skip distribution tests. */
export function readContractInput(name: ContractInput, directory = inputs): string {
  const value: unknown = JSON.parse(readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
  if (typeof value !== 'object' || value === null) throw new Error('Invalid contract provenance');
  const metadata = value as Record<string, unknown>;
  if (
    metadata['sourceRepository'] !== 'https://github.com/1msg/1msg-api' ||
    typeof metadata['sourceCommit'] !== 'string' ||
    !/^[a-f0-9]{40}$/.test(metadata['sourceCommit']) ||
    typeof metadata['sha256'] !== 'object' ||
    metadata['sha256'] === null
  )
    throw new Error('Invalid contract provenance');
  const hashes = metadata['sha256'] as Record<string, unknown>;
  const expected = hashes[name];
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    throw new Error(`Missing contract checksum: ${name}`);
  const bytes = readFileSync(path.join(directory, name));
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error(`Contract checksum mismatch: ${name}`);
  return bytes.toString('utf8');
}
