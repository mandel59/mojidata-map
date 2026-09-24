import { useEffect, useRef, useState, type ReactNode } from 'react';
import { version as appVersion } from '../../package.json';
import type { UnicodeDatabase } from '../core/unicode';
import type { AboutSection } from '../platform';

interface Library {
  name: string;
  version: string;
  license: string;
  author?: string;
  url?: string;
  scope: 'shared' | 'desktop';
  notices: { file: string; text: string }[];
}
interface Props {
  db: UnicodeDatabase;
  section: AboutSection;
  onSection(section: AboutSection): void;
  onClose(): void;
}

export function AboutDialog({ db, section, onSection, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [credits, setCredits] = useState<{ libraries: Library[]; unicode: string }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (section !== 'credits' || credits) return;
    const controller = new AbortController();
    setError('');
    const fetchAsset = async (path: string) => {
      const response = await fetch(`${import.meta.env.BASE_URL}${path}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      return response;
    };
    void Promise.all([
      fetchAsset('credits.json').then(
        (response) => response.json() as Promise<{ libraries: Library[] }>,
      ),
      fetchAsset('data/LICENSE-UNICODE.txt').then((response) => response.text()),
    ])
      .then(([data, unicode]) => {
        if (!controller.signal.aborted) setCredits({ libraries: data.libraries, unicode });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('クレジットを読み込めませんでした。');
      });
    return () => controller.abort();
  }, [section, credits, attempt]);
  function close() {
    dialog.current?.close();
    onClose();
  }
  function link(href: string, children: ReactNode) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (window.mojidata) {
            event.preventDefault();
            void window.mojidata
              .openExternal(href)
              .catch(() => setError('リンクを開けませんでした。'));
          }
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="about-dialog"
      aria-labelledby="about-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="about-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            字
          </span>
          <div>
            <span className="eyebrow">MOJIDATA MAP</span>
            <h2 id="about-title">アプリ情報</h2>
          </div>
        </div>
        <button type="button" onClick={close} aria-label="アプリ情報を閉じる">
          閉じる
        </button>
      </header>
      <div className="about-tabs" role="tablist" aria-label="アプリ情報の表示">
        {(['about', 'credits'] as const).map((value, index) => (
          <button
            key={value}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`about-tab-${value}`}
            aria-controls={`about-panel-${value}`}
            aria-selected={section === value}
            tabIndex={section === value ? 0 : -1}
            onClick={() => onSection(value)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 1
                    : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                      ? 1 - index
                      : undefined;
              if (next !== undefined) {
                event.preventDefault();
                onSection(next === 0 ? 'about' : 'credits');
                tabs.current[next]?.focus();
              }
            }}
          >
            {value === 'about' ? 'アプリについて' : 'クレジット'}
          </button>
        ))}
      </div>
      <section
        className="about-content"
        role="tabpanel"
        id="about-panel-about"
        aria-labelledby="about-tab-about"
        hidden={section !== 'about'}
        tabIndex={0}
      >
        <h3>Mojidata Map</h3>
        <p>文字の世界を、ひとつの地図に。</p>
        <p>Unicode の文字を探し、属性やフォントを調べ、必要な文字を集めて使う文字マップです。</p>
        <dl className="about-properties">
          <div>
            <dt>アプリのバージョン</dt>
            <dd>{appVersion}</dd>
          </div>
          <div>
            <dt>Unicode / Unihan</dt>
            <dd>{db.data.version}</dd>
          </div>
          <div>
            <dt>Emoji</dt>
            <dd>{db.data.emojiVersion}</dd>
          </div>
          <div>
            <dt>実行環境</dt>
            <dd>{window.mojidata ? 'デスクトップ版' : 'Web 版'}</dd>
          </div>
          <div>
            <dt>アプリ本体のライセンス</dt>
            <dd>未設定</dd>
          </div>
        </dl>
        <p className="muted">設定・ブックマーク・編集テキストは、この端末に保存します。</p>
      </section>
      <section
        className="about-content"
        role="tabpanel"
        id="about-panel-credits"
        aria-labelledby="about-tab-credits"
        hidden={section !== 'credits'}
        tabIndex={0}
      >
        <h3>クレジット</h3>
        <p>文字データとオープンソースソフトウェアの提供者に感謝します。</p>
        <article className="credit-card">
          <h4>Unicode データ</h4>
          <p>{link('https://www.unicode.org/', 'Unicode Consortium')} — UCD・Unihan・Emoji</p>
          <p className="muted">
            {credits?.unicode.match(/^Copyright .+$/m)?.[0] ?? 'Unicode, Inc.'} · Unicode License v3
          </p>
          {credits && (
            <details>
              <summary>Unicode ライセンス全文</summary>
              <pre className="license-text">{credits.unicode}</pre>
            </details>
          )}
        </article>
        <article className="credit-card">
          <h4>着想・機能の参考</h4>
          <p>
            {link('https://www.babelstone.co.uk/Software/BabelMap.html', 'BabelMap')} — Andrew West
          </p>
          <p>
            文字マップと豊富な文字・フォント関連機能を、Mojidata Map
            の開発にあたり参考にしています。
          </p>
        </article>
        <h4 className="credits-heading">利用ライブラリ</h4>
        {!credits && !error && <p role="status">クレジットを読み込み中…</p>}
        {credits?.libraries.map((library) => (
          <article className="credit-card" key={`${library.name}@${library.version}`}>
            <h4>
              {library.url ? link(library.url, library.name) : library.name}{' '}
              <small>{library.version}</small>
            </h4>
            <p className="muted">
              {library.author && `${library.author} · `}
              {library.license}
              {library.scope === 'desktop' && ' · デスクトップ実行環境'}
            </p>
            {library.notices.length ? (
              <details>
                <summary>{library.name} のライセンス・著作権表示</summary>
                {library.notices.map((notice) => (
                  <pre className="license-text" key={notice.file}>
                    {notice.text}
                  </pre>
                ))}
              </details>
            ) : (
              <p className="muted">
                ライセンス名は配布元の表記です。本文はプロジェクトの配布元を参照してください。
              </p>
            )}
            {library.scope === 'desktop' && (
              <p className="muted">
                Chromium 等の著作権表示は、デスクトップ版に付属する LICENSES.chromium.html
                に収録されています。
              </p>
            )}
          </article>
        ))}
      </section>
      {error && section === 'credits' && (
        <div className="about-error">
          <p role="alert">{error}</p>
          {!credits && <button onClick={() => setAttempt((value) => value + 1)}>再試行</button>}
        </div>
      )}
    </dialog>
  );
}
