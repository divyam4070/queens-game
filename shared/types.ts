export type XMode = 'OFF' | 'MANUAL' | 'AUTO';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'finished';

export interface Settings {
  size: number;
  xMode: XMode;
  showProgress: boolean;
}

export interface PublicPlayer {
  id: string;
  name: string;
  emoji: string;
  color: string;
  connected: boolean;
  ready: boolean;
  wins: number;
  progress: number | null;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  players: PublicPlayer[];
  round: number;
  startedAt: number; // server epoch ms (future during countdown)
  now: number; // server epoch ms when this state was sent
  size: number; // board size of the current/last round
  regions: number[] | null; // only present while playing / finished
  winner: { id: string; name: string; timeMs: number } | null;
}

export interface Ack<T = {}> {
  ok: boolean;
  error?: string;
  data?: T;
}
