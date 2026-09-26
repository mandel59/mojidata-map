import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

const GlyphSize = createContext(30);

// Only this small style host subscribes to size changes; its cells keep their JSX identity.
export function CharacterGridSurface({
  children,
  containerRef,
  columns,
  className = 'character-grid',
  scrollClassName = 'grid-scroll',
  label = '文字一覧',
}: {
  columns: number;
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
  className?: string;
  scrollClassName?: string;
  label?: string;
}) {
  const { t } = useTranslation('common');
  const size = useContext(GlyphSize);
  return (
    <div className={scrollClassName}>
      <div
        className={className}
        ref={containerRef}
        aria-label={t(label)}
        style={{ '--glyph-size': `${size}px`, '--grid-columns': columns } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

interface Props {
  searchBar?: ReactNode;
  navigation?: ReactNode;
  showSettings: boolean;
  size: number;
  onSizeCommit(size: number): void;
  fontControls: ReactNode;
  colorControl: ReactNode;
  children: ReactNode;
}

export function CharacterDisplay({
  searchBar,
  navigation,
  showSettings,
  size,
  onSizeCommit,
  fontControls,
  colorControl,
  children,
}: Props) {
  const { t } = useTranslation('common');
  const [previewSize, setPreviewSize] = useState(size);
  const slider = useRef<HTMLInputElement>(null);
  useEffect(() => setPreviewSize(size), [size]);
  useEffect(() => {
    const input = slider.current!;
    // React's onChange fires on every range input. The native change event commits
    // a drag on release and also supports keyboard / assistive-technology changes.
    const commit = () => {
      const next = Number(input.value);
      if (next !== size) onSizeCommit(next);
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('pointercancel', commit);
    return () => {
      input.removeEventListener('change', commit);
      input.removeEventListener('blur', commit);
      input.removeEventListener('pointercancel', commit);
    };
  }, [size, onSizeCommit]);

  // Local preview state changes only the inherited CSS size. JSX supplied by App
  // keeps its identity, so neither the character cells nor other tools re-render.
  return (
    <GlyphSize value={previewSize}>
      <main className="main-content">
        {searchBar}
        {(navigation || showSettings) && (
          <div className="display-toolbar">
            {navigation}
            {showSettings && <button popoverTarget="display-options">{t('表示設定')}</button>}
          </div>
        )}
        <div
          id="display-options"
          popover="auto"
          className="utility-popover display-options"
          aria-label={t('表示設定')}
        >
          <h2>{t('表示設定')}</h2>
          {fontControls}
          <label className="size-control">
            {t('文字サイズ')}{' '}
            <input
              ref={slider}
              type="range"
              min="16"
              max="64"
              value={previewSize}
              onChange={(event) => setPreviewSize(Number(event.target.value))}
            />
          </label>
          {colorControl}
        </div>
        {children}
      </main>
    </GlyphSize>
  );
}
