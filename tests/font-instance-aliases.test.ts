import { test, expect } from 'vitest';
import type { Font } from 'fontkit';
import { fontInstance } from '../src/core/fontInstance';
import { statStyle } from '../src/core/fontStatNames';

function sample() {
  const buffer = new Uint8Array(92),
    d = new DataView(buffer.buffer);
  d.setUint16(0, 1);
  d.setUint16(2, 1);
  d.setUint16(4, 8);
  d.setUint16(6, 2);
  d.setUint32(8, 20);
  d.setUint16(12, 4);
  d.setUint32(14, 36);
  for (const [i, tag] of ['wght', 'opsz'].entries()) {
    [...tag].forEach((c, j) => d.setUint8(20 + i * 8 + j, c.charCodeAt(0)));
    d.setUint16(26 + i * 8, i);
  }
  for (const [i, [axis, value, name, flags]] of [
    [0, 400, 17, 2],
    [0, 700, 256, 0],
    [1, 10.5, 257, 0],
    [1, 36, 258, 0],
  ].entries()) {
    const at = 44 + i * 12;
    d.setUint16(36 + i * 2, at - 36);
    d.setUint16(at, 1);
    d.setUint16(at + 2, axis);
    d.setUint16(at + 4, flags);
    d.setUint16(at + 6, name);
    d.setInt32(at + 8, value * 65536);
  }
  return {
    postscriptName: 'ExampleVariable',
    stream: { buffer },
    directory: { tables: { STAT: { offset: 0, length: 92 } } },
    name: {
      records: {
        preferredFamily: { en: 'Example Variable' },
        preferredSubfamily: { en: 'Regular' },
        '25': { en: 'ExampleRoman' },
        fontFeatures: { 256: { en: 'Bold' }, 257: { en: 'Text' }, 258: { en: 'Display' } },
      },
    },
    fvar: {
      axis: [{ axisTag: 'wght' }, { axisTag: 'opsz' }],
      instance: [
        { nameID: 17, coord: [400, 10.5] },
        { nameID: 256, name: { en: 'Bold Text' }, coord: [700, 10.5] },
        { nameID: 259, name: { en: 'Regular Display' }, coord: [400, 36] },
        { nameID: 260, name: { en: 'Bold Display' }, coord: [700, 36] },
      ],
    },
  };
}

test('resolves prefix names, omitted Regular, and optical-size WWS names', () => {
  const f = sample();
  for (const [name, wght, opsz] of [
    ['ExampleRoman', 400, 10.5],
    ['ExampleRoman-BoldText', 700, 10.5],
    ['Example-Variable-Text', 400, 10.5],
    ['Example-Variable-Text-Bold', 700, 10.5],
    ['Example-Variable-Display', 400, 36],
    ['Example-Variable-Display-Bold', 700, 36],
  ] as const)
    expect(fontInstance(f as unknown as Font, name)?.coordinates).toEqual({ wght, opsz });
  expect(fontInstance(f as unknown as Font, 'Unrelated-Display-Bold')).toBeNull();
  expect(fontInstance(f as unknown as Font, 'Example-Variable-Text')?.style.en).toContain('Text');
});

test('rejects ambiguous candidates and malformed or unsupported STAT data', () => {
  const f = sample();
  f.fvar.instance.push({ ...f.fvar.instance[0], coord: [450, 10.5] });
  expect(fontInstance(f as unknown as Font, 'ExampleRoman')).toBeNull();
  f.directory.tables.STAT.length = 10;
  expect(statStyle(f as unknown as Font, { wght: 400, opsz: 10.5 })).toBeNull();
  f.directory.tables.STAT.length = 92;
  new DataView(f.stream.buffer.buffer).setUint16(44, 4);
  expect(statStyle(f as unknown as Font, { wght: 400, opsz: 10.5 })).toBeNull();
});

test('matches STAT range values and linked values without selecting a linked coordinate', () => {
  const f = sample();
  const data = new DataView(f.stream.buffer.buffer);
  data.setUint16(6, 1);
  data.setUint16(12, 1);
  data.setUint16(44, 2);
  data.setInt32(56, 300 * 65536);
  data.setInt32(60, 500 * 65536);
  expect(statStyle(f as unknown as Font, { wght: 450 })?.full).toBe('Regular');
  expect(statStyle(f as unknown as Font, { wght: 600 })).toBeNull();
  data.setUint16(44, 3);
  data.setInt32(56, 700 * 65536);
  expect(statStyle(f as unknown as Font, { wght: 400 })?.full).toBe('Regular');
  expect(statStyle(f as unknown as Font, { wght: 700 })).toBeNull();
});
