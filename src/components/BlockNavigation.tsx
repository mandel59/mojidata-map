import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { hex, type UnicodeDatabase } from '../core/unicode';

interface Props {
  db: UnicodeDatabase;
  plane: number;
  selectedBlock: string;
  allPlanes: boolean;
  planeNames: Record<number, string>;
  onLocate(cp: number): void;
  onAllPlanesChange(value: boolean): void;
}

export const BlockNavigation = memo(function BlockNavigation({
  db,
  plane,
  selectedBlock,
  allPlanes,
  planeNames,
  onLocate,
  onAllPlanesChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const planeBlocks = useMemo(
    () => db.data.properties.Block.filter(([start]) => start >>> 16 === plane),
    [db, plane],
  );
  const blockOptions = useMemo(
    () =>
      planeBlocks.map(([start, , name]) => (
        <option key={start} value={start}>
          {name}
        </option>
      )),
    [planeBlocks],
  );
  const planeOptions = useMemo(
    () =>
      Array.from({ length: 17 }, (_, i) => i)
        .filter((i) => allPlanes || planeNames[i])
        .map((i) => (
          <option value={i} key={i}>
            {i.toString().padStart(2, '0')} · {planeNames[i] ?? '予約面'}
          </option>
        )),
    [allPlanes, planeNames],
  );
  // The list spans every plane; only the toolbar dropdown follows the current plane.
  const blocks = useMemo(
    () =>
      open
        ? db.data.properties.Block.filter(([, , name]) =>
            name.toLowerCase().includes(filter.toLowerCase()),
          )
        : [],
    [db, open, filter],
  );
  useEffect(() => {
    const active = list.current?.querySelector<HTMLButtonElement>('button.active');
    if (list.current && active)
      list.current.scrollTop = active.offsetTop - list.current.clientHeight / 2;
  }, [open, selectedBlock, filter]);
  return (
    <>
      <select
        aria-label="Unicode 面"
        value={plane}
        onChange={(event) => onLocate(Number(event.target.value) * 0x10000)}
      >
        {planeOptions}
      </select>
      <select
        className="block-select"
        aria-label="ブロックへ移動"
        value={planeBlocks.find(([, , name]) => name === selectedBlock)?.[0] ?? ''}
        onChange={(event) => {
          if (event.target.value) onLocate(Number(event.target.value));
        }}
      >
        <option value="">ブロックを選択…</option>
        {blockOptions}
      </select>
      <button popoverTarget="block-browser" aria-label="ブロック一覧">
        ブロック一覧
      </button>
      <div
        id="block-browser"
        popover="auto"
        className="utility-popover block-browser"
        aria-label="ブロック一覧"
        onToggle={(event) => setOpen(event.currentTarget.matches(':popover-open'))}
      >
        {open && (
          <>
            <h2>ブロック一覧</h2>
            <input
              aria-label="ブロックを絞り込み"
              placeholder="名前で絞り込み…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={allPlanes}
                onChange={(event) => onAllPlanesChange(event.target.checked)}
              />
              予約面も表示
            </label>
            <div className="block-list" ref={list} aria-label="Unicode ブロック">
              {blocks.map(([start, end, name]) => (
                <button
                  key={start}
                  className={selectedBlock === name ? 'active' : ''}
                  onClick={() => {
                    onLocate(start);
                    document.getElementById('block-browser')?.hidePopover();
                  }}
                >
                  <span>{name}</span>
                  <small>
                    {hex(start)}–{hex(end)}
                  </small>
                </button>
              ))}
              {!blocks.length && <p className="muted">一致するブロックはありません。</p>}
            </div>
          </>
        )}
      </div>
    </>
  );
});
