import { useLayoutEffect, useRef, type CSSProperties } from 'react';

// Measure the browser's shaped text, including fallback fonts and feature settings.
// A CSS line box alone cannot detect ink extending beyond a tall glyph's em.
export function FittedCharacter({
  text,
  className,
  style,
}: {
  text: string;
  className: string;
  style: CSSProperties;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = ref.current!;
    const glyph = svg.querySelector('text')!;
    const fit = () => {
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      if (!width || !height) return;
      const size = parseFloat(getComputedStyle(svg).fontSize);
      const scale = 100 / size;
      const w = width * scale;
      const h = height * scale;
      // Keep a normal em-based size; enlarge only for ink outside the frame.
      const box = glyph.getBBox();
      let left = -w / 2;
      let top = -110;
      let right = w / 2;
      let bottom = top + h;
      if (box.x < left || box.x + box.width > right || box.y < top || box.y + box.height > bottom) {
        left = Math.min(left, box.x - 8);
        right = Math.max(right, box.x + box.width + 8);
        top = Math.min(top, box.y - 8);
        bottom = Math.max(bottom, box.y + box.height + 8);
      }
      svg.setAttribute('viewBox', `${left} ${top} ${right - left} ${bottom - top}`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(svg);
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [text, style.fontFamily, style.fontFeatureSettings]);
  return (
    <svg ref={ref} className={`${className} fitted-character`} style={style} aria-hidden="true">
      <text x="0" y="0" textAnchor="middle" fontSize="100" fill="currentColor">
        {text}
      </text>
    </svg>
  );
}
