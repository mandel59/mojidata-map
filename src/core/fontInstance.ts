import { tr } from '../intl/i18n';
import type { Font } from 'fontkit';
import { statStyle } from './fontStatNames';

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
  let matchedStyle: Record<string, string> | undefined;
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
          const prefix = records?.['25']?.en ?? family.replace(/[^A-Za-z0-9]/g, '');
          const generated = `${prefix}-${style.replace(/[^A-Za-z0-9]/g, '')}`;
          return (
            alias === postscriptName ||
            generated === postscriptName ||
            (style === 'Regular' &&
              (family.replace(/\s+/g, '-') === postscriptName || prefix === postscriptName))
          );
        })
      : [];
    if (aliases.length === 1) instance = aliases[0];
  }
  if (!instance) {
    const family = records?.preferredFamily?.en ?? records?.fontFamily?.en;
    const matches = family
      ? instances.flatMap((entry) => {
          const coordinates = Object.fromEntries(
            variable.fvar!.axis.map((axis, i) => [axis.axisTag.trim(), entry.coord[i]]),
          );
          const style = statStyle(font, coordinates);
          const alias = style && `${family} ${style.alias}`.trim().replace(/\s+/g, '-');
          return alias === postscriptName ? [{ entry, style: style!.full }] : [];
        })
      : [];
    if (matches.length === 1) {
      instance = matches[0].entry;
      matchedStyle = { en: matches[0].style };
    }
  }
  if (!instance) return null;
  const coordinates = Object.fromEntries(
    variable.fvar!.axis.map((axis, i) => [axis.axisTag.trim(), instance.coord[i]]),
  );
  return {
    coordinates,
    style:
      matchedStyle ??
      instance.name ??
      (instance.nameID === 2 ? records?.fontSubfamily : records?.preferredSubfamily) ??
      {},
  };
}

export function resolveFontInstance(font: Font, postscriptName: string): Font {
  const instance = fontInstance(font, postscriptName);
  if (!instance) {
    if ((font as VariableFont).fvar && font.postscriptName !== postscriptName)
      throw new Error(tr('選択した可変フォントのインスタンスが見つかりません。'));
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
