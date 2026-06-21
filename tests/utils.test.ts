import { describe, it, expect } from 'vitest';
import {
  resolvePageIndices,
  parseColor,
  toRadians,
  formatBytes,
  errMsg,
  toolResult,
  toolError,
  getPageSize,
} from '../src/utils.js';

// Helper: compare a pdf-lib RGB object's channels to expected 0..1 floats.
function expectRgb(
  color: { type: string; red: number; green: number; blue: number },
  r: number,
  g: number,
  b: number,
) {
  expect(color.type).toBe('RGB');
  expect(color.red).toBeCloseTo(r, 5);
  expect(color.green).toBeCloseTo(g, 5);
  expect(color.blue).toBeCloseTo(b, 5);
}

describe('resolvePageIndices', () => {
  it('returns every 0-based index when pages is undefined', () => {
    expect(resolvePageIndices(undefined, 3)).toEqual([0, 1, 2]);
  });

  it('returns every 0-based index when pages is an empty array', () => {
    expect(resolvePageIndices([], 4)).toEqual([0, 1, 2, 3]);
  });

  it('returns an empty array when there are zero total pages', () => {
    expect(resolvePageIndices(undefined, 0)).toEqual([]);
  });

  it('converts 1-based page numbers to 0-based indices', () => {
    expect(resolvePageIndices([1, 3, 5], 10)).toEqual([0, 2, 4]);
  });

  it('drops out-of-range pages (too high and non-positive)', () => {
    // page 0 -> index -1 (dropped), page 99 -> out of range (dropped)
    expect(resolvePageIndices([0, 1, 2, 99], 3)).toEqual([0, 1]);
  });

  it('preserves caller order and duplicates rather than sorting/deduping', () => {
    expect(resolvePageIndices([3, 1, 1], 3)).toEqual([2, 0, 0]);
  });

  it('drops the exact upper-boundary page (page === totalPages is valid, page > is not)', () => {
    // totalPages = 2 -> valid pages are 1,2 -> indices 0,1; page 3 dropped.
    expect(resolvePageIndices([2, 3], 2)).toEqual([1]);
  });
});

describe('parseColor', () => {
  it('defaults to black when input is undefined', () => {
    expectRgb(parseColor(undefined), 0, 0, 0);
  });

  it('parses a full 6-char hex with leading hash', () => {
    expectRgb(parseColor('#ff0000'), 1, 0, 0);
  });

  it('parses a full 6-char hex without a leading hash', () => {
    expectRgb(parseColor('00ff00'), 0, 1, 0);
  });

  it('expands 3-char shorthand hex correctly', () => {
    // "#f00" -> "ff0000"
    expectRgb(parseColor('#f00'), 1, 0, 0);
    // "0f0" (no hash) -> "00ff00"
    expectRgb(parseColor('0f0'), 0, 1, 0);
  });

  it('resolves named colors case-insensitively', () => {
    expectRgb(parseColor('red'), 1, 0, 0);
    expectRgb(parseColor('RED'), 1, 0, 0);
    expectRgb(parseColor('Navy'), 0, 0, 128 / 255);
  });

  it('treats grey and gray as the same value', () => {
    const grey = parseColor('grey');
    const gray = parseColor('gray');
    expect(grey.red).toBeCloseTo(gray.red, 5);
    expect(grey.green).toBeCloseTo(gray.green, 5);
    expect(grey.blue).toBeCloseTo(gray.blue, 5);
    expectRgb(grey, 128 / 255, 128 / 255, 128 / 255);
  });

  it('computes intermediate channel values from hex correctly', () => {
    // #804020 -> 128/255, 64/255, 32/255
    expectRgb(parseColor('#804020'), 128 / 255, 64 / 255, 32 / 255);
  });

  it('coerces non-finite parsed channels to 0 (garbage hex)', () => {
    // "zz" parses to NaN -> guarded to 0 for every channel.
    expectRgb(parseColor('zzzzzz'), 0, 0, 0);
  });
});

describe('toRadians', () => {
  it('maps 0 degrees to 0 radians', () => {
    expect(toRadians(0)).toBe(0);
  });

  it('maps 180 degrees to pi', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 10);
  });

  it('maps 90 degrees to pi/2', () => {
    expect(toRadians(90)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('handles negative angles', () => {
    expect(toRadians(-45)).toBeCloseTo(-Math.PI / 4, 10);
  });
});

describe('formatBytes', () => {
  it('formats sub-kilobyte values in plain bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('switches to KB at exactly 1024 bytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('switches to MB at exactly 1 MiB with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('rounds KB values to a single decimal place', () => {
    // 1234 / 1024 = 1.2050... -> "1.2 KB"
    expect(formatBytes(1234)).toBe('1.2 KB');
  });
});

describe('errMsg', () => {
  it('extracts the message from an Error instance', () => {
    expect(errMsg(new Error('boom'))).toBe('boom');
  });

  it('extracts the message from Error subclasses', () => {
    expect(errMsg(new TypeError('bad type'))).toBe('bad type');
  });

  it('stringifies non-Error values', () => {
    expect(errMsg('plain string')).toBe('plain string');
    expect(errMsg(42)).toBe('42');
    expect(errMsg(null)).toBe('null');
    expect(errMsg(undefined)).toBe('undefined');
  });
});

describe('toolResult / toolError', () => {
  it('wraps text in the MCP content envelope without an error flag', () => {
    const r = toolResult('hello');
    expect(r).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect('isError' in r).toBe(false);
  });

  it('prefixes error text and sets isError true', () => {
    const r = toolError('something failed');
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
    expect(r.content[0]).toEqual({ type: 'text', text: 'Error: something failed' });
  });
});

describe('getPageSize', () => {
  it('returns exact known dimensions for named sizes', () => {
    expect(getPageSize('A4')).toEqual([595.28, 841.89]);
    expect(getPageSize('Letter')).toEqual([612, 792]);
    expect(getPageSize('Legal')).toEqual([612, 1008]);
    expect(getPageSize('A3')).toEqual([841.89, 1190.55]);
    expect(getPageSize('Tabloid')).toEqual([792, 1224]);
  });

  it('falls back to A4 for unknown size names', () => {
    expect(getPageSize('NotARealSize')).toEqual([595.28, 841.89]);
    expect(getPageSize('')).toEqual([595.28, 841.89]);
  });

  it('is case-sensitive (lowercase "a4" is unknown -> A4 fallback, still A4 values)', () => {
    // "a4" is not a key, so it falls through to the A4 default anyway.
    expect(getPageSize('a4')).toEqual([595.28, 841.89]);
    // But a real distinct size in wrong case falls back to A4, not Letter.
    expect(getPageSize('letter')).toEqual([595.28, 841.89]);
  });
});
