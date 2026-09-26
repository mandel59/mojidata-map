import { tr } from '../intl/i18n';
// OpenType collection tables use file-relative offsets. Rebuild one complete
// sfnt, retaining layout/color/variation tables and original glyph IDs.
// https://learn.microsoft.com/en-us/typography/opentype/spec/otff
export const FONT_SIZE_LIMIT = 64 * 1024 * 1024;
const TTC = 0x74746366;
const HEAD = 0x68656164;
const DSIG = 0x44534947;
const aligned = (length: number) => Math.ceil(length / 4) * 4;

function checksum(view: DataView, offset: number, length: number) {
  let sum = 0;
  for (let i = offset; i < offset + length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

export function fontFaceData(bytes: ArrayBuffer, index: number): ArrayBuffer {
  const input = new DataView(bytes);
  function check(offset: number, length: number) {
    if (offset < 0 || length < 0 || offset + length > bytes.byteLength)
      throw new Error(tr('フォントのテーブルがファイルの範囲外です。'));
  }
  check(0, 4);
  if (input.getUint32(0) !== TTC) {
    if (index !== 0) throw new Error(tr('この形式のフェイスの抽出には対応していません。'));
    return bytes;
  }
  check(0, 12);
  const version = input.getUint32(4);
  if (version !== 0x10000 && version !== 0x20000)
    throw new Error(tr('未対応のフォントコレクションです。'));
  const count = input.getUint32(8);
  check(12, count * 4 + (version === 0x20000 ? 12 : 0));
  if (!Number.isInteger(index) || index < 0 || index >= count)
    throw new Error(tr('コレクションのフェイスが存在しません。'));
  const directory = input.getUint32(12 + index * 4);
  check(directory, 12);
  const countTables = input.getUint16(directory + 4);
  check(directory + 12, countTables * 16);
  const tables: { tag: number; offset: number; length: number }[] = [];
  for (let i = 0; i < countTables; i++) {
    const record = directory + 12 + i * 16;
    const tag = input.getUint32(record);
    const offset = input.getUint32(record + 8);
    const length = input.getUint32(record + 12);
    check(offset, length);
    // A signature of the collection is no longer valid for this extracted face.
    if (tag !== DSIG) tables.push({ tag, offset, length });
  }
  tables.sort((a, b) => a.tag - b.tag);
  if (
    !tables.length ||
    tables.length > 4095 ||
    new Set(tables.map((t) => t.tag)).size !== tables.length
  )
    throw new Error(tr('フォントのテーブル構成が不正です。'));
  let offset = 12 + tables.length * 16;
  const size = offset + tables.reduce((sum, table) => sum + aligned(table.length), 0);
  if (size > FONT_SIZE_LIMIT) throw new Error(tr('表示用フォントが64 MBを超えています。'));
  const result = new ArrayBuffer(size);
  const view = new DataView(result);
  const output = new Uint8Array(result);
  view.setUint32(0, input.getUint32(directory));
  view.setUint16(4, tables.length);
  const power = Math.floor(Math.log2(tables.length));
  view.setUint16(6, 2 ** power * 16);
  view.setUint16(8, power);
  view.setUint16(10, tables.length * 16 - 2 ** power * 16);
  let head = 0;
  tables.forEach((table, i) => {
    output.set(new Uint8Array(bytes, table.offset, table.length), offset);
    if (table.tag === HEAD) {
      if (table.length < 12) throw new Error(tr('head テーブルが不正です。'));
      head = offset;
      view.setUint32(head + 8, 0);
    }
    const record = 12 + i * 16;
    view.setUint32(record, table.tag);
    view.setUint32(record + 4, checksum(view, offset, aligned(table.length)));
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    offset += aligned(table.length);
  });
  if (head) view.setUint32(head + 8, (0xb1b0afba - checksum(view, 0, size)) >>> 0);
  return result;
}
