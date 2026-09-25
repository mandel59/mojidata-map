import { useEffect, useState } from 'react';

// Each visible paged view supplies its own bounds and selection rules.
export function usePageKeys(active: boolean, onPage: (direction: -1 | 1) => void) {
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (
        !['PageUp', 'PageDown'].includes(event.key) ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.getModifierState('AltGraph') ||
        document.querySelector('dialog[open], :popover-open')
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="textbox"], [role="combobox"], [role="slider"], [role="tablist"]',
          ))
      )
        return;
      event.preventDefault();
      onPage(event.key === 'PageUp' ? -1 : 1);
      if (target instanceof HTMLElement && target.closest('.character-grid, .emoji-grid'))
        setFocusRequest((request) => request + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onPage]);
  useEffect(() => {
    if (!focusRequest || !active) return;
    // Focus after React commits the new page, including a shorter final page.
    // Hidden retained views must never receive focus.
    const selected = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.character-cell.selected, .emoji-grid [aria-pressed="true"]',
      ),
    ].find((element) => element.getClientRects().length > 0);
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // Switching back to a retained view must not repeat an old focus request.
  }, [focusRequest]);
}
