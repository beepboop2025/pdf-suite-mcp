import { describe, expect, it } from 'vitest';
import fs from 'fs';

describe('MCP Registry manifest', () => {
  it('uses the current schema and pins the published package release', () => {
    const manifest = JSON.parse(
      fs.readFileSync(new URL('../server.json', import.meta.url), 'utf8'),
    );

    expect(manifest.$schema).toMatch(/\/2025-12-11\/server\.schema\.json$/);
    expect(manifest.name).toBe('io.github.beepboop2025/pdf-suite-mcp');
    // Registry records are immutable, so 2.1.3 is the metadata revision that
    // migrates the card while npm 2.1.2 remains the installable implementation.
    expect(manifest.version).toBe('2.1.3');
    expect(manifest.packages[0].version).toBe('2.1.2');
  });

  it('keeps the renamed toolkit identity installable through the maintained package', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        new URL('../registry/pdf-toolkit-mcp.server.json', import.meta.url),
        'utf8',
      ),
    );
    const workflow = fs.readFileSync(
      new URL('../.github/workflows/publish.yml', import.meta.url),
      'utf8',
    );

    expect(manifest.$schema).toMatch(/\/2025-12-11\/server\.schema\.json$/);
    expect(manifest.name).toBe('io.github.beepboop2025/pdf-toolkit-mcp');
    expect(manifest.version).toBe('2.1.2');
    expect(manifest.repository.url).toBe(
      'https://github.com/beepboop2025/pdf-suite-mcp',
    );
    expect(manifest.packages[0]).toMatchObject({
      identifier: 'pdf-suite-mcp',
      // npm 2.1.1 is the final immutable package whose embedded mcpName owns
      // the legacy identity; 2.1.2 correctly owns the renamed suite identity.
      version: '2.1.1',
    });
    expect(workflow).toContain('registry/pdf-toolkit-mcp.server.json');
    expect(workflow).toContain('./mcp-publisher publish "$MCP_MANIFEST"');
  });
});
