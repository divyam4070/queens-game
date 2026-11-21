import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomState } from '../../shared/types';
import { eliminatedBy, findConflicts } from '../../shared/rules';
import { call } from './socket';
import { Avatar, Crown, PALETTE, formatTime, useServerNow } from './ui';

interface Snapshot {
  queens: number[];
  manual: number[];
}
interface Saved extends Snapshot {
  history: Snapshot[];
}
const EMPTY: Saved = { queens: [], manual: [], history: [] };
const X_LABEL = { OFF: 'X markers off', MANUAL: 'Manual X', AUTO: 'Auto X' } as const;

export default function Game({ room, me, offset, online }: { room: RoomState; me: string; offset: number; online: boolean }) {
  const countdown = room.phase === 'countdown';
  const now = useServerNow(offset, true);

  if (countdown || !room.regions) {
    const secs = Math.max(1, Math.ceil((room.startedAt - now) / 1000));
    return (
      <main className="game center">
        <div className="countdown" key={secs} aria-live="assertive">{secs}</div>
        <p className="muted">Get ready. Same puzzle for everyone.</p>
      </main>
    );
  }

  return (
    <main className="game">
      <header className="game-head">
        <div className="timer" aria-label="Elapsed time">{formatTime(now - room.startedAt)}</div>
        <div className="meta">
          <span className="pill live">{online ? 'Racing' : 'Reconnecting…'}</span>
          <span className="pill">{room.size}×{room.size}</span>
          <span className="pill">{X_LABEL[room.settings.xMode]}</span>
          <span className="pill">{room.players.filter((p) => p.connected).length} playing</span>
        </div>
      </header>
      <ul className="strip">
        {room.players.map((p) => (
          <li key={p.id} className={`${p.id === me ? 'me' : ''} ${p.connected ? '' : 'offline'}`}>
            <Avatar p={p} size={28} />
            <span className="sname">{p.id === me ? 'You' : p.name}</span>
            {p.progress !== null && (
              <span className="prog" title="Queens placed">
                <span className="bar"><i style={{ width: `${(p.progress / room.size) * 100}%`, background: p.color }} /></span>
                {p.progress}/{room.size}
              </span>
            )}
          </li>
        ))}
      </ul>
      <PlayBoard key={room.round} room={room} regions={room.regions} />
    </main>
  );
}

function loadSaved(key: string): Saved {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

function PlayBoard({ room, regions }: { room: RoomState; regions: number[] }) {
  const n = room.size;
  const xMode = room.settings.xMode;
  const key = `queens:board:${room.code}:${room.round}`;
  const locked = room.phase !== 'playing';

  const [state, setState] = useState<Saved>(() => loadSaved(key));
  const [stroke, setStroke] = useState<number[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const drag = useRef<{ start: number; moved: boolean; mode: 'add' | 'remove' | null; last: number; manual: Set<number> } | null>(null);
  const submitted = useRef('');

  // persist for refresh/reconnect; drop boards from older rounds
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)!;
        if (k.startsWith('queens:board:') && k !== key) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [key, state]);

  const queenSet = useMemo(() => new Set(state.queens), [state.queens]);
  const manualSet = useMemo(() => new Set(stroke ?? state.manual), [stroke, state.manual]);
  // Auto X is derived from the queens on the board, so removing/undoing a queen removes its X markers.
  const autoSet = useMemo(() => {
    const s = new Set<number>();
    if (xMode === 'AUTO') for (const q of state.queens) for (const c of eliminatedBy(regions, n, q)) s.add(c);
    return s;
  }, [state.queens, xMode, regions, n]);
  const conflicts = useMemo(() => findConflicts(regions, n, state.queens), [state.queens, regions, n]);

  // progress count (never positions) + automatic submission
  useEffect(() => {
    if (!locked) call('game:progress', { count: state.queens.length });
  }, [state.queens.length, locked]);
  useEffect(() => {
    if (locked || state.queens.length !== n || conflicts.size > 0) return;
    const queens = state.queens.map((q) => [Math.floor(q / n), q % n]);
    const sig = JSON.stringify(queens);
    if (submitted.current === sig) return;
    submitted.current = sig;
    call('game:submit', { queens });
  }, [state.queens, conflicts, locked, n]);

  const commit = useCallback(
    (queens: number[], manual: number[]) =>
      setState((s) => ({ queens, manual, history: [...s.history, { queens: s.queens, manual: s.manual }] })),
    [],
  );

  // Tap cycle: empty -> X -> queen -> empty (auto X counts as an X, so the cycle looks the same in every mode)
  const click = (i: number) => {
    if (locked) return;
    const { queens, manual } = state;
    if (queenSet.has(i)) return commit(queens.filter((q) => q !== i), manual);
    const hasX = manual.includes(i) || autoSet.has(i);
    if (xMode !== 'OFF' && !hasX) return commit(queens, [...manual, i]);
    commit([...queens, i], manual.filter((m) => m !== i));
  };
  const toggleX = (i: number) => {
    if (locked || xMode === 'OFF' || queenSet.has(i)) return;
    const { queens, manual } = state;
    commit(queens, manual.includes(i) ? manual.filter((m) => m !== i) : [...manual, i]);
  };

  const cellAt = (x: number, y: number): number | null => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-i]') as HTMLElement | null;
    return el ? Number(el.dataset.i) : null;
  };
  const apply = (i: number) => {
    const d = drag.current;
    if (!d?.mode || queenSet.has(i)) return;
    if (d.mode === 'add') d.manual.add(i);
    else d.manual.delete(i);
    setStroke([...d.manual]);
  };
  const onDown = (e: React.PointerEvent) => {
    if (locked || e.button !== 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { start: i, moved: false, mode: null, last: i, manual: new Set(state.manual) };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || i === d.last) return;
    d.last = i;
    if (!d.moved) {
      d.moved = true;
      if (xMode === 'OFF') return;
      d.mode = d.manual.has(d.start) ? 'remove' : 'add';
      apply(d.start);
    }
    apply(i);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return click(d.start);
    setStroke(null);
    const next = [...d.manual];
    if (d.mode && (next.length !== state.manual.length || next.some((m) => !state.manual.includes(m)))) commit(state.queens, next);
  };
  const onCancel = () => {
    drag.current = null;
    setStroke(null);
  };

  const undo = () =>
    setState((s) => {
      const prev = s.history[s.history.length - 1];
      return prev ? { queens: prev.queens, manual: prev.manual, history: s.history.slice(0, -1) } : s;
    });
  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setConfirmReset(false);
    submitted.current = '';
    setState(EMPTY);
  };

  const cells = [];
  const thick = n <= 7 ? 3 : 2;
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n, g = regions[i];
    const edge = (ok: boolean) => (ok ? thick : 1);
    const diff = {
      t: r === 0 || regions[i - n] !== g,
      b: r === n - 1 || regions[i + n] !== g,
      l: c === 0 || regions[i - 1] !== g,
      r: c === n - 1 || regions[i + 1] !== g,
    };
    const isQueen = queenSet.has(i);
    const bad = isQueen && conflicts.has(i);
    const isX = !isQueen && (manualSet.has(i) || autoSet.has(i));
    cells.push(
      <button
        key={i}
        type="button"
        data-i={i}
        data-letter={String.fromCharCode(65 + g)}
        aria-label={`Row ${r + 1}, column ${c + 1}${isQueen ? ', queen' : isX ? ', marked' : ''}`}
        className={`cell ${bad ? 'bad' : ''}`}
        style={{
          background: PALETTE[g],
          borderTopWidth: edge(diff.t),
          borderBottomWidth: edge(diff.b),
          borderLeftWidth: edge(diff.l),
          borderRightWidth: edge(diff.r),
          borderTopColor: diff.t ? 'var(--ink)' : 'var(--hair)',
          borderBottomColor: diff.b ? 'var(--ink)' : 'var(--hair)',
          borderLeftColor: diff.l ? 'var(--ink)' : 'var(--hair)',
          borderRightColor: diff.r ? 'var(--ink)' : 'var(--hair)',
        }}
        onClick={(e) => e.detail === 0 && click(i)}
        onKeyDown={(e) => (e.key === 'x' || e.key === 'X') && toggleX(i)}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleX(i);
        }}
      >
        {isQueen && <Crown className="queen" />}
        {isX && (
          <svg className="xmark" viewBox="0 0 24 24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        )}
      </button>,
    );
  }

  return (
    <>
      <div
        className={`board ${locked ? 'locked' : ''}`}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}
        role="grid"
        aria-label={`${n} by ${n} Queens board`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        {cells}
      </div>
      <div className="toolbar">
        <button className="btn" onClick={undo} disabled={locked || state.history.length === 0}>Undo</button>
        <button className={`btn ${confirmReset ? 'danger' : ''}`} onClick={reset} disabled={locked}>
          {confirmReset ? 'Tap again to reset' : 'Reset'}
        </button>
        <span className="count">{state.queens.length}/{n} queens</span>
      </div>
      <p className="hint center-text">
        {xMode === 'OFF' ? 'Tap a cell to place or remove a queen.' : 'Tap a cell: X, then queen, then clear. Drag across cells to mark many X at once.'}
      </p>
    </>
  );
}
