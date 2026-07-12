/**
 * End-to-end tests over the real MCP surface.
 *
 * A client and the server are linked by an in-memory transport, so every test
 * exercises the actual registered tools exactly as an agent would call them —
 * tools/list and tools/call, real PDFs written to and read from a temp dir.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createServer } from '../src/server.js';

let client: Client;
let tmp: string;

const p = (name: string) => path.join(tmp, name);

/** Call a tool and return its first text block; fail loudly on tool errors. */
async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const res: any = await client.callTool({ name, arguments: args });
  const text = res.content?.map((c: any) => c.text).join('\n') ?? '';
  if (res.isError) throw new Error(`${name} errored: ${text}`);
  return text;
}

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pdftk-'));
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('tool surface', () => {
  it('advertises all 37 tools with schemas', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(37);
    for (const t of tools) {
      expect(t.name).toMatch(/^pdf_/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema).toBeTruthy();
    }
    const names = tools.map((t) => t.name);
    for (const core of ['pdf_create', 'pdf_read_text', 'pdf_info', 'pdf_merge', 'pdf_split']) {
      expect(names).toContain(core);
    }
  });
});

describe('create → read round trip', () => {
  it('creates a PDF and reads its text back', async () => {
    const out = await call('pdf_create', {
      outputPath: p('hello.pdf'),
      content: '# Heading\nThe quick brown fox jumps over the lazy dog.',
      title: 'Test Doc',
      author: 'vitest',
    });
    expect(out).toMatch(/hello\.pdf/);
    await expect(fs.stat(p('hello.pdf'))).resolves.toBeTruthy();

    const text = await call('pdf_read_text', { filePath: p('hello.pdf') });
    expect(text).toContain('quick brown fox');
  });

  it('reports accurate info', async () => {
    const info = await call('pdf_info', { filePath: p('hello.pdf') });
    expect(info).toMatch(/page/i);
    expect(info).toMatch(/Test Doc|vitest/);
  });
});

describe('manipulation', () => {
  beforeAll(async () => {
    // a 3-page document to split/merge/reorder
    await call('pdf_create', {
      outputPath: p('multi.pdf'),
      content: 'Page one content.\n\f\nPage two content.\n\f\nPage three content.',
    });
  });

  it('merges two PDFs into one', async () => {
    const out = await call('pdf_merge', {
      filePaths: [p('hello.pdf'), p('multi.pdf')],
      outputPath: p('merged.pdf'),
    });
    expect(out).toMatch(/merged\.pdf/);
    const info = await call('pdf_info', { filePath: p('merged.pdf') });
    // hello(>=1) + multi(>=1) pages
    const m = info.match(/Total pages:\s*(\d+)|(\d+)\s*page/i);
    expect(m).toBeTruthy();
  });

  it('splits a PDF and produces output', async () => {
    const out = await call('pdf_split', {
      filePath: p('merged.pdf'),
      outputDir: p('split'),
    });
    expect(out.length).toBeGreaterThan(0);
    const files = await fs.readdir(p('split'));
    expect(files.some((f) => f.endsWith('.pdf'))).toBe(true);
  });

  it('sets and preserves metadata', async () => {
    await call('pdf_set_metadata', {
      filePath: p('hello.pdf'),
      outputPath: p('meta.pdf'),
      title: 'Renamed',
      author: 'Someone',
    });
    const info = await call('pdf_info', { filePath: p('meta.pdf') });
    expect(info).toMatch(/Renamed|Someone/);
  });
});

describe('overlay', () => {
  it('watermarks without corrupting the file', async () => {
    await call('pdf_watermark', {
      filePath: p('hello.pdf'),
      outputPath: p('wm.pdf'),
      text: 'DRAFT',
    });
    // still a readable PDF afterwards
    const text = await call('pdf_read_text', { filePath: p('wm.pdf') });
    expect(text).toContain('quick brown fox');
  });
});

describe('error handling', () => {
  it('returns a tool error (not a crash) for a missing file', async () => {
    const res: any = await client.callTool({
      name: 'pdf_read_text',
      arguments: { filePath: p('does-not-exist.pdf') },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Error/i);
  });
});
