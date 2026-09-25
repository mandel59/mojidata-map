import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

// Grid navigation works with visible positions, for both scalar characters and sequences.
export function useGridNavigation({
  container,
  columns,
  count,
  selectedIndex,
  pageKey,
  active = true,
  onSelect,
  onInsert,
  onMove,
}: {
  container: RefObject<HTMLDivElement | null>;
  columns: number;
  count: number;
  selectedIndex: number;
  pageKey: number | string | undefined;
  active?: boolean;
  onSelect(index: number): void;
  onInsert(index: number): void;
  onMove?(index: number, delta: number): boolean;
}) {
  const focusAfterMove = useRef(false);
  useEffect(() => {
    if (!active) return;
    const cell = container.current?.children.item(selectedIndex) as HTMLElement | null;
    if (focusAfterMove.current) {
      cell?.focus({ preventScroll: true });
      focusAfterMove.current = false;
    }
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, selectedIndex, pageKey, columns, container]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (
      !active ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.getModifierState('AltGraph')
    )
      return;
    const rowStart = index - (index % columns);
    const delta = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowUp: -columns,
      ArrowDown: columns,
      Home: rowStart - index,
      End: Math.min(rowStart + columns - 1, count - 1) - index,
    }[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const next = index + delta;
      if (next >= 0 && next < count) {
        onSelect(next);
        (container.current?.children.item(next) as HTMLElement | null)?.focus();
      } else if (onMove) {
        focusAfterMove.current = onMove(index, delta);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onInsert(index);
    }
  }
  return {
    onKeyDown,
    tabIndex: (index: number) => (index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1),
  };
}
