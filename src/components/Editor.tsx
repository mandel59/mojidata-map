import { useRef, useState, type RefObject } from 'react';
import {
  encodeText,
  encodeFile,
  formats,
  scalarText,
  textStats,
  type OutputFormat,
} from '../core/encoding';
import { codeLabel, type UnicodeDatabase } from '../core/unicode';
import { copyText, download } from '../platform';

export interface EditorHandle {
  insert(text: string): void;
}
interface Props {
  db: UnicodeDatabase;
  text: string;
  onChange(text: string): void;
  font: string;
  onLocate(cp: number): void;
  notify(message: string): void;
  handle: RefObject<EditorHandle | null>;
}
export function Editor({ db, text, onChange, font, onLocate, notify, handle }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [format, setFormat] = useState<OutputFormat>('text');
  const [direction, setDirection] = useState<'auto' | 'ltr' | 'rtl'>('auto');
  const [encoding, setEncoding] = useState<'utf8' | 'utf16le' | 'utf16be'>('utf8');
  const [bom, setBom] = useState(false);
  const [preview, setPreview] = useState(false);
  const history = useRef<string[]>([]);
  const valid = scalarText(text);
  const output = valid ? encodeText(text, format) : '';
  const stats = textStats(text);
  function change(value: string) {
    history.current.push(text);
    if (history.current.length > 50) history.current.shift();
    onChange(value);
  }
  handle.current = {
    insert(value) {
      const start = textarea.current?.selectionStart ?? text.length;
      const end = textarea.current?.selectionEnd ?? start;
      change(text.slice(0, start) + value + text.slice(end));
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(start + value.length, start + value.length);
      });
    },
  };
  async function copy(cut = false) {
    try {
      await copyText(output);
      if (cut) change('');
      notify('コピーしました');
    } catch (error) {
      notify(String(error));
    }
  }
  function locate() {
    let offset = textarea.current?.selectionStart ?? 0;
    if (offset >= text.length) offset = 0;
    if (
      offset > 0 &&
      /[\uDC00-\uDFFF]/.test(text[offset]) &&
      /[\uD800-\uDBFF]/.test(text[offset - 1])
    )
      offset--;
    const cp = text.codePointAt(offset);
    if (cp !== undefined) onLocate(cp);
  }
  return (
    <section className="editor-panel" aria-label="編集バッファ">
      <div className="editor-heading">
        <h2>
          編集バッファ <span>文字を集めて、使う</span>
        </h2>
        <span className="muted">
          {stats.graphemes} 書記素 · {stats.codePoints} コードポイント · {stats.utf8} bytes
        </span>
      </div>
      <textarea
        ref={textarea}
        aria-label="編集テキスト"
        placeholder="文字をダブルクリックして追加。または、ここに貼り付けて調べる。"
        value={text}
        dir={direction}
        style={{ fontFamily: font }}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'F2') {
            event.preventDefault();
            locate();
          }
        }}
      />
      <div className="editor-toolbar">
        <div className="button-row">
          <button disabled={!text} onClick={locate}>
            文字を探す <kbd>F2</kbd>
          </button>
          <select
            aria-label="正規化"
            value=""
            onChange={(event) => {
              if (event.target.value) change(text.normalize(event.target.value));
            }}
          >
            <option value="">正規化…</option>
            {['NFC', 'NFD', 'NFKC', 'NFKD'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="大小文字変換"
            value=""
            onChange={(event) => {
              if (event.target.value)
                change(event.target.value === 'upper' ? text.toUpperCase() : text.toLowerCase());
            }}
          >
            <option value="">大小文字…</option>
            <option value="upper">大文字に変換</option>
            <option value="lower">小文字に変換</option>
          </select>
          <select
            aria-label="テキスト方向"
            value={direction}
            onChange={(event) => setDirection(event.target.value as typeof direction)}
          >
            <option value="auto">方向: 自動</option>
            <option value="ltr">左から右</option>
            <option value="rtl">右から左</option>
          </select>
          <button
            onClick={() => {
              const previous = history.current.pop();
              if (previous !== undefined) onChange(previous);
            }}
          >
            元に戻す
          </button>
          <button disabled={!text} onClick={() => change('')}>
            クリア
          </button>
        </div>
        <div className="button-row">
          <label>
            出力{' '}
            <select
              aria-label="出力形式"
              value={format}
              onChange={(event) => setFormat(event.target.value as OutputFormat)}
            >
              {formats.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!valid || !text} onClick={() => void copy(true)}>
            切り取り
          </button>
          <button className="primary" disabled={!valid || !text} onClick={() => void copy()}>
            コピー
          </button>
        </div>
      </div>
      {!valid && (
        <p role="alert" className="error">
          単独のサロゲートが含まれています。文字を修正してからコピー・保存してください。
        </p>
      )}
      {format !== 'text' && (
        <textarea className="encoded-output" aria-label="変換された出力" value={output} readOnly />
      )}
      <details>
        <summary>保存・文字単位の確認</summary>
        <div className="button-row">
          <select
            aria-label="保存エンコーディング"
            value={encoding}
            onChange={(event) => setEncoding(event.target.value as typeof encoding)}
          >
            <option value="utf8">UTF-8</option>
            <option value="utf16le">UTF-16 LE</option>
            <option value="utf16be">UTF-16 BE</option>
          </select>
          <label className="check">
            <input
              type="checkbox"
              checked={bom}
              onChange={(event) => setBom(event.target.checked)}
            />
            BOM
          </label>
          <button
            disabled={!valid}
            onClick={() => {
              try {
                download(
                  'mojidata-map.txt',
                  encodeFile(output, encoding, bom) as Uint8Array<ArrayBuffer>,
                  'application/octet-stream',
                );
              } catch (error) {
                notify(String(error));
              }
            }}
          >
            テキストを保存
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={preview}
              onChange={(event) => setPreview(event.target.checked)}
            />
            文字単位で表示
          </label>
        </div>
        {preview && (
          <div className="buffer-characters">
            {[...text].slice(0, 500).map((char, index) => (
              <button
                key={index}
                title={db.name(char.codePointAt(0)!)}
                onClick={() => onLocate(char.codePointAt(0)!)}
              >
                <span style={{ fontFamily: font }}>{db.glyph(char.codePointAt(0)!)}</span>
                <small>{codeLabel(char.codePointAt(0)!)}</small>
              </button>
            ))}
            {[...text].length > 500 && <p>先頭 500 コードポイントを表示しています。</p>}
          </div>
        )}
      </details>
    </section>
  );
}
