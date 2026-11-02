import fs from 'node:fs';
import path from 'node:path';

const CLI_SRC = path.resolve(__dirname, '..');

const FORBIDDEN_HTTP_PATTERNS = [
  /\bfrom\s+['"]axios['"]/,
  /\bfrom\s+['"]node-fetch['"]/,
  /\brequire\s*\(\s*['"]axios['"]\s*\)/,
  /\bfetch\s*\(/,
  /\bhttps\.request\s*\(/,
  /\bhttp\.request\s*\(/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Protect the package boundary against introducing a second HTTP transport alongside the shared SDK. */
describe('CLI SDK-only architecture', () => {
  /** Inspect the committed dependency manifest rather than relying on locally installed transitive modules. */
  it('depends on @1msg/sdk and not on HTTP clients', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(deps['@1msg/sdk']).toBeDefined();
    expect(deps).not.toHaveProperty('axios');
    expect(deps).not.toHaveProperty('node-fetch');
    expect(deps).not.toHaveProperty('got');
    expect(deps).not.toHaveProperty('undici');
  });

  it('hand-written sources do not import or call HTTP directly', () => {
    const files = walk(CLI_SRC);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_HTTP_PATTERNS) {
        expect(`${path.relative(CLI_SRC, file)}: ${content}`).not.toMatch(pattern);
      }
    }
  });

  it('creates the SDK client via createClient', () => {
    const content = fs.readFileSync(path.join(CLI_SRC, 'context.ts'), 'utf8');
    expect(content).toContain('createClient');
    expect(content).toContain('@1msg/sdk');
  });
});
