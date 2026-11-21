import { useState } from 'react';
import type { RoomState, XMode } from '../../shared/types';
import { call } from './socket';
import { Avatar, Confetti, Crown, formatTime } from './ui';

const SIZES = [5, 6, 7, 8, 9, 10, 11, 12];
const X_MODES: { id: XMode; label: string; hint: string }[] = [
  { id: 'OFF', label: 'Off', hint: 'No X markers.' },
  { id: 'MANUAL', label: 'Manual', hint: 'Mark cells yourself. Click, right-click or drag.' },
  { id: 'AUTO', label: 'Auto', hint: 'X appears in cells a placed queen rules out.' },
];

export default function Lobby({ room, me, onLeave }: { room: RoomState; me: string; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const isHost = room.hostId === me;
  const finished = room.phase === 'finished';
  const myself = room.players.find((p) => p.id === me)!;
  const others = room.players.filter((p) => p.id !== room.hostId);
  const readyCount = others.filter((p) => p.ready).length;
  const s = room.settings;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const set = (patch: object) => call('room:settings', patch);
  const start = async () => {
    setStarting(true);
    setError('');
    const r = await call('game:start');
    setStarting(false);
    if (!r.ok) setError('Could not start the round. Try again.');
  };

  const winner = room.winner;
  const iWon = winner?.id === me;

  return (
    <main className="lobby">
      {finished && winner && (
        <section className={`card banner ${iWon ? 'won' : ''}`}>
          {iWon && <Confetti />}
          <Crown className="banner-crown" />
          <div>
            <h2>{iWon ? 'You solved it first!' : `${winner.name} solved it first`}</h2>
            <p>Finished in <b>{formatTime(winner.timeMs)}</b> on a {room.size}×{room.size} board.</p>
          </div>
        </section>
      )}

      <section className="card">
        <div className="code-row">
          <div>
            <span className="muted">Room code</span>
            <div className="code">{room.code}</div>
          </div>
          <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Players <span className="muted">{room.players.length}/8</span></h3>
          <ul className="players">
            {room.players.map((p) => (
              <li key={p.id} className={p.connected ? '' : 'offline'}>
                <Avatar p={p} />
                <span className="pname">
                  {p.name}
                  {p.id === me && <em className="tag">You</em>}
                  {p.id === room.hostId && <em className="tag host">Host</em>}
                </span>
                <span className="pmeta">
                  {finished && winner?.id === p.id ? (
                    <span className="solved">Solved {formatTime(winner.timeMs)}</span>
                  ) : finished ? (
                    <span className="muted">{p.progress ?? 0}/{room.size} placed</span>
                  ) : !p.connected ? (
                    <span className="muted">Offline</span>
                  ) : p.id !== room.hostId ? (
                    <span className={p.ready ? 'ready' : 'muted'}>{p.ready ? 'Ready' : 'Not ready'}</span>
                  ) : null}
                  {p.wins > 0 && <span className="wins" title="Rounds won">🏆 {p.wins}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>{finished ? 'Next round' : 'Settings'}</h3>
          <div className="setting">
            <span className="label">Board size</span>
            <div className="chips" role="radiogroup" aria-label="Board size">
              {SIZES.map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={s.size === n}
                  disabled={!isHost}
                  className={`chip ${s.size === n ? 'on' : ''}`}
                  onClick={() => set({ size: n })}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span className="label">X markers</span>
            <div className="segment" role="radiogroup" aria-label="X markers">
              {X_MODES.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={s.xMode === m.id}
                  disabled={!isHost}
                  className={s.xMode === m.id ? 'on' : ''}
                  onClick={() => set({ xMode: m.id })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="hint">{X_MODES.find((m) => m.id === s.xMode)!.hint}</p>
          </div>
          <div className="setting">
            <label className="switch">
              <input type="checkbox" checked={s.showProgress} disabled={!isHost} onChange={(e) => set({ showProgress: e.target.checked })} />
              <span>Show queens placed count</span>
            </label>
            <p className="hint">Players see how many queens others have placed, never where.</p>
          </div>
          {!isHost && <p className="hint">Only the host can change settings.</p>}
        </section>
      </div>

      <div className="actions">
        {isHost ? (
          <div className="start">
            <button className="btn primary big" disabled={starting} onClick={start}>
              {starting ? 'Starting…' : finished ? 'Play again' : 'Start game'}
            </button>
            {others.length > 0 && (
              <span className="muted">{readyCount} of {others.length} ready</span>
            )}
            {others.length === 0 && <span className="muted">Share the code to invite friends. You can also play solo.</span>}
          </div>
        ) : (
          <div className="start">
            <button className={`btn big ${myself.ready ? '' : 'primary'}`} onClick={() => call('room:ready', { ready: !myself.ready })}>
              {myself.ready ? 'Not ready' : "I'm ready"}
            </button>
            <span className="muted">Waiting for the host to start.</span>
          </div>
        )}
        <button className="btn ghost" onClick={onLeave}>Leave room</button>
      </div>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
