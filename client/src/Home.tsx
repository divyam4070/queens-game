import { useState } from 'react';
import { call, ERRORS } from './socket';
import { Crown } from './ui';

export default function Home({ onEnter }: { onEnter: (data: any) => void }) {
  const [name, setName] = useState(() => localStorage.getItem('queens:name') ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState('');

  const go = async (kind: 'create' | 'join') => {
    setError('');
    if (!name.trim()) return setError(ERRORS.NAME_REQUIRED);
    localStorage.setItem('queens:name', name.trim());
    setBusy(kind);
    const res = await call(kind === 'create' ? 'room:create' : 'room:join', { name, code });
    setBusy(null);
    if (!res.ok) return setError(ERRORS[res.error ?? ''] ?? 'Something went wrong. Try again.');
    onEnter(res.data);
  };

  return (
    <main className="home">
      <div className="hero">
        <Crown className="hero-crown" />
        <h1>Queens Duel</h1>
        <p>Race your friends to solve the same Queens puzzle. First correct board wins.</p>
      </div>
      <div className="card form">
        <label>
          Nickname
          <input value={name} maxLength={16} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!!busy} onClick={() => go('create')}>
          {busy === 'create' ? 'Creating…' : 'Create a room'}
        </button>
        <div className="or"><span>or join with a code</span></div>
        <div className="row">
          <input
            className="code-input"
            value={code}
            maxLength={5}
            placeholder="ABCDE"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && go('join')}
          />
          <button className="btn" disabled={!!busy || code.length < 5} onClick={() => go('join')}>
            {busy === 'join' ? 'Joining…' : 'Join'}
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
