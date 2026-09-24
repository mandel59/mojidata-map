import { hex, isScalar } from './unicode';

export type OutputFormat =
  'text' | 'ncr-hex' | 'ncr-dec' | 'html' | 'ucn' | 'js' | 'utf8' | 'utf16' | 'utf32';
export const formats: [OutputFormat, string][] = [
  ['text', '文字'],
  ['ncr-hex', 'NCR 16進'],
  ['ncr-dec', 'NCR 10進'],
  ['html', 'HTML'],
  ['ucn', 'UCN'],
  ['js', 'JavaScript'],
  ['utf8', 'UTF-8'],
  ['utf16', 'UTF-16'],
  ['utf32', 'UTF-32'],
];
export const scalarText = (text: string) =>
  [...text].every((char) => isScalar(char.codePointAt(0)!));

export function encodeText(text: string, format: OutputFormat): string {
  if (!scalarText(text)) throw new Error('単独のサロゲートは Unicode 文字として出力できません。');
  if (format === 'text') return text;
  if (format === 'utf8')
    return [...new TextEncoder().encode(text)].map((byte) => hex(byte, 2)).join(' ');
  if (format === 'utf16')
    return Array.from({ length: text.length }, (_, i) => hex(text.charCodeAt(i))).join(' ');
  const named: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  };
  return [...text]
    .map((char) => {
      const cp = char.codePointAt(0)!;
      switch (format) {
        case 'ncr-hex':
          return `&#x${hex(cp)};`;
        case 'ncr-dec':
          return `&#${cp};`;
        case 'html':
          return named[char] ?? (cp >= 0x20 && cp < 0x7f ? char : `&#x${hex(cp)};`);
        case 'ucn':
          return cp <= 0xffff ? `\\u${hex(cp)}` : `\\U${hex(cp, 8)}`;
        case 'js':
          return cp <= 0xffff ? `\\u${hex(cp)}` : `\\u{${hex(cp)}}`;
        case 'utf32':
          return hex(cp, 8);
      }
    })
    .join(format === 'utf32' ? ' ' : '');
}

export function encodeFile(
  text: string,
  encoding: 'utf8' | 'utf16le' | 'utf16be',
  bom: boolean,
): Uint8Array {
  if (!scalarText(text)) throw new Error('単独のサロゲートは保存できません。');
  if (encoding === 'utf8') {
    const body = new TextEncoder().encode(text);
    return bom ? new Uint8Array([0xef, 0xbb, 0xbf, ...body]) : body;
  }
  const bytes = new Uint8Array((text.length + (bom ? 1 : 0)) * 2);
  const view = new DataView(bytes.buffer);
  const little = encoding === 'utf16le';
  if (bom) view.setUint16(0, 0xfeff, little);
  for (let i = 0; i < text.length; i++)
    view.setUint16((i + (bom ? 1 : 0)) * 2, text.charCodeAt(i), little);
  return bytes;
}

export function textStats(text: string) {
  return {
    codePoints: [...text].length,
    utf16: text.length,
    utf8: new TextEncoder().encode(text).length,
    graphemes: [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].length,
  };
}
