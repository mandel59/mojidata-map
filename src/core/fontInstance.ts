import type { Font } from 'fontkit';

export const instanceNameRecords = new WeakMap<Font, Record<string, Record<string, string>>>();

type Records = Record<string, Record<string, string>>;
type VariableFont = Font & {
  name?: { records: Records & { fontFeatures?: Record<number, Record<string, string>> } };
  fvar?: {
    axis: { axisTag: string }[];
    instance: {
      nameID: number;
      name?: Record<string, string>;
      coord: number[];
      postscriptNameID?: number;
    }[];
  };
};

// Local Font Access can return the same variable font bytes for several faces.
// Match fvar's instance PostScript name before reading the default face names.
export function fontInstance(font: Font, postscriptName: string) {
  const variable = font as VariableFont;
  const records = variable.name?.records;
  const instances = variable.fvar?.instance ?? [];
  let instance = instances.find((entry) => {
    const id = entry.postscriptNameID;
    const names = id === 6 ? records?.postscriptName : records?.fontFeatures?.[id ?? -1];
    return names && Object.values(names).includes(postscriptName);
  });
  if (!instance) {
    // DirectWrite may synthesize a family-style PostScript name instead of
    // returning fvar's name (spaces become hyphens; Regular can be omitted).
    // Accept only a unique alias built from this font's English records.
    const family = records?.preferredFamily?.en ?? records?.fontFamily?.en;
    const aliases = family
      ? instances.filter((entry) => {
          const style =
            entry.name?.en ??
            (entry.nameID === 2 ? records?.fontSubfamily?.en : records?.preferredSubfamily?.en);
          if (!style) return false;
          const alias = `${family} ${style}`.replace(/\s+/g, '-');
          return (
            alias === postscriptName ||
            (style === 'Regular' && family.replace(/\s+/g, '-') === postscriptName)
          );
        })
      : [];
    if (aliases.length === 1) instance = aliases[0];
  }
  if (!instance) return null;
  const coordinates = Object.fromEntries(
    variable.fvar!.axis.map((axis, i) => [axis.axisTag.trim(), instance.coord[i]]),
  );
  return {
    coordinates,
    style:
      instance.name ??
      (instance.nameID === 2 ? records?.fontSubfamily : records?.preferredSubfamily) ??
      {},
  };
}

export function resolveFontInstance(font: Font, postscriptName: string): Font {
  const instance = fontInstance(font, postscriptName);
  if (!instance) {
    if ((font as VariableFont).fvar && font.postscriptName !== postscriptName)
      throw new Error('選択した可変フォントのインスタンスが見つかりません。');
    return font;
  }
  const resolved = font.getVariation(instance.coordinates);
  // fontkit retains the base font's name table after getVariation(). Keep instance
  // labels separate from its shared, non-configurable table properties.
  const records = (font as VariableFont).name?.records ?? {};
  const family = records.preferredFamily ?? records.fontFamily ?? {};
  const fullName = Object.fromEntries(
    Object.entries(instance.style).flatMap(([tag, style]) =>
      family[tag] ? [[tag, `${family[tag]} ${style}`]] : [],
    ),
  );
  Object.defineProperty(resolved, 'postscriptName', { value: postscriptName });
  instanceNameRecords.set(resolved, {
    fullName,
    preferredSubfamily: instance.style,
    fontSubfamily: instance.style,
  });
  return resolved;
}
