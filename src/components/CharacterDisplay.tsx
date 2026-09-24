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

const GlyphSize = createContext(30);

// Only this small style host subscribes to size changes; its cells keep their JSX identity.
export function CharacterGridSurface({
  children,
  containerRef,
  columns,
}: {
  columns: number;
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const size = useContext(GlyphSize);
  return (
    <div className="grid-scroll">
      <div
        className="character-grid"
        ref={containerRef}
        aria-label="文字一覧"
        style={{ '--glyph-size': `${size}px`, '--grid-columns': columns } as CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

interface Props {
  navigation?: ReactNode;
  showSettings: boolean;
  size: number;
  onSizeCommit(size: number): void;
  fontControls: ReactNode;
  colorControl: ReactNode;
  children: ReactNode;
}

export function CharacterDisplay({
  navigation,
  showSettings,
  size,
  onSizeCommit,
  fontControls,
  colorControl,
  children,
}: Props) {
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
        {(navigation || showSettings) && (
          <div className="display-toolbar">
            {navigation}
            {showSettings && <button popoverTarget="display-options">表示設定</button>}
          </div>
        )}
        <div
          id="display-options"
          popover="auto"
          className="utility-popover display-options"
          aria-label="表示設定"
        >
          <h2>表示設定</h2>
          {fontControls}
          <label className="size-control">
            文字サイズ{' '}
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
