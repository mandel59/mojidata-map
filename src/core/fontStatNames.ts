import type { Font } from 'fontkit';

// Compose a WWS-compatible name using the font's own STAT labels. Unsupported
// or malformed tables produce no alias rather than guessing axis coordinates.
export function statStyle(font: Font, coordinates: Record<string, number>) {
  const raw = font as unknown as {
    stream: { buffer: Uint8Array };
    directory: { tables: { STAT?: { offset: number; length: number } } };
    name: {
      records: Record<string, Record<string, string>> & {
        fontFeatures?: Record<number, Record<string, string>>;
      };
    };
  };
  try {
    const table = raw.directory.tables.STAT;
    if (!table) return null;
    const bytes = raw.stream.buffer;
    const data = new DataView(bytes.buffer, bytes.byteOffset + table.offset, table.length);
    if (data.getUint16(0) !== 1) return null;
    const axes: { tag: string; order: number }[] = [];
    const size = data.getUint16(4),
      count = data.getUint16(6),
      start = data.getUint32(8);
    if (size < 8 || count > 64) return null;
    for (let i = 0; i < count; i++) {
      const at = start + i * size;
      axes.push({
        tag: String.fromCharCode(...[0, 1, 2, 3].map((n) => data.getUint8(at + n))),
        order: data.getUint16(at + 6),
      });
    }
    const values = data.getUint16(12),
      offsets = data.getUint32(14);
    const labels = new Map<number, { text: string; elide: boolean }>();
    const records = raw.name.records;
    for (let i = 0; i < values; i++) {
      const at = offsets + data.getUint16(offsets + i * 2);
      const format = data.getUint16(at);
      if (format < 1 || format > 3) return null;
      const axis = data.getUint16(at + 2),
        flags = data.getUint16(at + 4),
        name = data.getUint16(at + 6);
      const tag = axes[axis]?.tag;
      if (!tag) return null;
      const value = coordinates[tag];
      const nominal = data.getInt32(at + 8) / 65536;
      const matches =
        format === 2
          ? value >= data.getInt32(at + 12) / 65536 && value <= data.getInt32(at + 16) / 65536
          : value === nominal;
      if (!matches) continue;
      const text = (
        name === 2
          ? records.fontSubfamily
          : name === 17
            ? records.preferredSubfamily
            : records.fontFeatures?.[name]
      )?.en;
      if (!text || labels.has(axis)) return null;
      labels.set(axis, { text, elide: !!(flags & 2) });
    }
    if (axes.some((axis, i) => coordinates[axis.tag] !== undefined && !labels.has(i))) return null;
    const ordered = [...labels].sort(([a], [b]) => {
      const wws = (tag: string) => (['wght', 'wdth', 'ital', 'slnt'].includes(tag) ? 1 : 0);
      return wws(axes[a].tag) - wws(axes[b].tag) || axes[a].order - axes[b].order;
    });
    return {
      alias: ordered
        .filter(([, label]) => !label.elide)
        .map(([, label]) => label.text)
        .join(' '),
      full: ordered.map(([, label]) => label.text).join(' '),
    };
  } catch {
    return null;
  }
}
