import { describe, expect, it } from 'vitest';
import fs from 'fs';

describe('MCP Registry manifest', () => {
  it('uses the current schema and matches the package release', () => {
    const manifest = JSON.parse(
      fs.readFileSync(new URL('../server.json', import.meta.url), 'utf8'),
    );

    expect(manifest.$schema).toMatch(/\/2025-12-11\/server\.schema\.json$/);
    expect(manifest.name).toBe('io.github.beepboop2025/pdf-suite-mcp');
    expect(manifest.version).toBe('2.1.2');
    expect(manifest.packages[0].version).toBe('2.1.2');
  });
});
