import { useCallback, useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types';
import { call, socket } from './socket';
import Home from './Home';
import Lobby from './Lobby';
import Game from './Game';
import { Crown } from './ui';

interface Session {
  code: string;
  token: string;
  playerId: string;
}
const SESSION_KEY = 'queens:session';
const readSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
};

export default function App() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [me, setMe] = useState<string | null>(() => readSession()?.playerId ?? null);
  const [offset, setOffset] = useState(0);
  const [online, setOnline] = useState(false);
  const [booting, setBooting] = useState(() => !!readSession());
  const [theme, setTheme] = useState(() => localStorage.getItem('queens:theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [letters, setLetters] = useState(() => localStorage.getItem('queens:letters') === 'on');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.letters = letters ? 'on' : 'off';
    localStorage.setItem('queens:theme', theme);
    localStorage.setItem('queens:letters', letters ? 'on' : 'off');
  }, [theme, letters]);

  const apply = useCallback((s: RoomState) => {
    setOffset(s.now - Date.now());
    setRoom(s);
  }, []);

  const forget = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setRoom(null);
    setMe(null);
  }, []);

  useEffect(() => {
    const onState = (s: RoomState) => apply(s);
    const onConnect = async () => {
      setOnline(true);
      const sess = readSession();
      if (sess) {
        const res = await call<{ state: RoomState }>('room:resume', { code: sess.code, token: sess.token });
        if (res.ok && res.data) apply(res.data.state);
        else forget();
      }
      setBooting(false);
    };
    const onDisconnect = () => setOnline(false);
    socket.on('room:state', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.connect();
    return () => {
      socket.off('room:state', onState);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [apply, forget]);

  // Removed from the room server-side (e.g. offline too long)
  useEffect(() => {
    if (room && me && !room.players.some((p) => p.id === me)) forget();
  }, [room, me, forget]);

  const enter = (data: { code: string; token: string; playerId: string; state: RoomState }) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code: data.code, token: data.token, playerId: data.playerId }));
    setMe(data.playerId);
    apply(data.state);
  };
  const leave = async () => {
    await call('room:leave');
    forget();
  };

  let view;
  if (booting) view = <main className="home center"><p className="muted">Connecting…</p></main>;
  else if (!room || !me) view = <Home onEnter={enter} />;
  else if (room.phase === 'lobby' || room.phase === 'finished') view = <Lobby room={room} me={me} onLeave={leave} />;
  else view = <Game room={room} me={me} offset={offset} online={online} />;

  return (
    <>
      <nav className="topbar">
        <span className="brand"><Crown className="brand-crown" /> Queens Duel</span>
        <span className="tools">
          {!online && <span className="pill warn">Offline</span>}
          <button className="icon-btn" title="Show region letters (colour-blind aid)" aria-pressed={letters} onClick={() => setLetters((v) => !v)}>Aa</button>
          <button className="icon-btn" title="Toggle theme" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>{theme === 'dark' ? '☀' : '☾'}</button>
          {room && me && room.phase === 'playing' && <button className="icon-btn" onClick={leave}>Leave</button>}
        </span>
      </nav>
      {view}
    </>
  );
}
