import { useEffect, useState } from 'react';
import type { PublicPlayer } from '../../shared/types';

export const PALETTE = [
  '#f4a6a0', '#f7c97a', '#f2e58f', '#b5dc8d', '#7fd1b0', '#7ec8e3',
  '#8fa8f0', '#c3a1ec', '#ee9fd0', '#c9b99a', '#a0a8b3', '#f2a96b',
];

export function formatTime(ms: number): string {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${Math.floor((t % 1000) / 100)}`;
}

export function Avatar({ p, size = 36 }: { p: Pick<PublicPlayer, 'emoji' | 'color'>; size?: number }) {
  return (
    <span className="avatar" style={{ background: p.color, width: size, height: size, fontSize: size * 0.55 }}>
      {p.emoji}
    </span>
  );
}

/** Ticks while `active`; returns server-synchronised epoch ms. */
export function useServerNow(offset: number, active: boolean): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setT(Date.now());
    const i = setInterval(() => setT(Date.now()), 100);
    return () => clearInterval(i);
  }, [active]);
  return t + offset;
}

export function Confetti() {
  const bits = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div className="confetti" aria-hidden>
      {bits.map((i) => (
        <i
          key={i}
          style={{
            left: `${(i * 97) % 100}%`,
            background: ['#f4a6a0', '#f7c97a', '#7fd1b0', '#8fa8f0', '#c3a1ec'][i % 5],
            animationDelay: `${(i % 9) * 0.08}s`,
            animationDuration: `${1.6 + (i % 5) * 0.25}s`,
            ['--dx' as string]: `${((i * 37) % 120) - 60}px`,
          }}
        />
      ))}
    </div>
  );
}

export const Crown = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <path d="M3 8l4.5 4L12 4.5 16.5 12 21 8l-2 10.5H5L3 8z" />
    <rect x="5" y="19.6" width="14" height="2.2" rx="1.1" />
  </svg>
);
