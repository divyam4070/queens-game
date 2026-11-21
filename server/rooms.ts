import { randomBytes } from 'node:crypto';
import type { Puzzle } from '../shared/puzzle';
import { generateAsync } from './generator';
import { MAX_SIZE, MIN_SIZE, validateSolution } from '../shared/rules';
import type { PublicPlayer, RoomState, Phase, Settings, XMode } from '../shared/types';

export const MAX_PLAYERS = 8;
const COUNTDOWN_MS = 3000;
const HOST_GRACE_MS = 30_000;
const REMOVE_GRACE_MS = 60_000;
const EMPTY_ROOM_MS = 10 * 60_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMOJIS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐧', '🦁', '🐨', '🐳', '🦋', '🐢', '🦖', '🐝', '🦔'];
const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#a9e34b'];

interface Player {
  id: string;
  token: string;
  name: string;
  emoji: string;
  color: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  wins: number;
  progress: number;
  joinedAt: number;
  dcTimer?: NodeJS.Timeout;
  hostTimer?: NodeJS.Timeout;
}

interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  settings: Settings;
  players: Player[];
  round: number;
  puzzle: Puzzle | null;
  startedAt: number;
  winner: { id: string; name: string; timeMs: number } | null;
  cleanupTimer?: NodeJS.Timeout;
  starting?: boolean;
}

type Emit = (code: string, state: (now: number) => RoomState) => void;
type Result<T = {}> = { ok: true; data: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const id = (bytes = 6) => randomBytes(bytes).toString('hex');

// ---- puzzle buffer: pre-generate the next puzzle per size (off-thread) so rounds start instantly ----
const buffer = new Map<number, Puzzle>();
const pending = new Set<number>();
function prefetch(size: number) {
  if (buffer.has(size) || pending.has(size)) return;
  pending.add(size);
  generateAsync(size).then((p) => {
    buffer.set(size, p);
    pending.delete(size);
  });
}
async function takePuzzle(size: number): Promise<Puzzle> {
  const p = buffer.get(size) ?? (await generateAsync(size));
  buffer.delete(size);
  prefetch(size);
  return p;
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private emit: Emit) {}

  // ---------- lookups ----------
  private room(code: string): Room | undefined {
    return this.rooms.get(code);
  }
  private find(code: string, playerId: string): { room: Room; player: Player } | null {
    const room = this.room(code);
    const player = room?.players.find((p) => p.id === playerId);
    return room && player ? { room, player } : null;
  }

  // ---------- state ----------
  state(room: Room, now = Date.now()): RoomState {
    const showAll = room.phase === 'finished' || room.settings.showProgress;
    const players: PublicPlayer[] = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      color: p.color,
      connected: p.connected,
      ready: p.ready,
      wins: p.wins,
      progress: showAll && (room.phase === 'playing' || room.phase === 'finished') ? p.progress : null,
    }));
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      settings: room.settings,
      players,
      round: room.round,
      startedAt: room.startedAt,
      now,
      size: room.puzzle?.size ?? room.settings.size,
      regions: room.phase === 'playing' || room.phase === 'finished' ? room.puzzle?.regions ?? null : null,
      winner: room.winner,
    };
  }
  private broadcast(room: Room) {
    this.emit(room.code, (now) => this.state(room, now));
  }
  snapshot(code: string): RoomState | null {
    const r = this.room(code);
    return r ? this.state(r) : null;
  }

  // ---------- membership ----------
  private newPlayer(room: Room, name: string, socketId: string): Player {
    const takenE = new Set(room.players.map((p) => p.emoji));
    const takenC = new Set(room.players.map((p) => p.color));
    const emojis = EMOJIS.filter((e) => !takenE.has(e));
    const colors = COLORS.filter((c) => !takenC.has(c));
    const pick = <T>(a: T[], all: T[]) => (a.length ? a : all)[Math.floor(Math.random() * (a.length || all.length))];
    return {
      id: id(4),
      token: id(16),
      name: name.slice(0, 16),
      emoji: pick(emojis, EMOJIS),
      color: pick(colors, COLORS),
      socketId,
      connected: true,
      ready: false,
      wins: 0,
      progress: 0,
      joinedAt: Date.now(),
    };
  }

  create(name: string, socketId: string): Result<{ code: string; playerId: string; token: string }> {
    let code = '';
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      code,
      hostId: '',
      phase: 'lobby',
      settings: { size: 7, xMode: 'MANUAL', showProgress: true },
      players: [],
      round: 0,
      puzzle: null,
      startedAt: 0,
      winner: null,
    };
    const player = this.newPlayer(room, name, socketId);
    room.players.push(player);
    room.hostId = player.id;
    this.rooms.set(code, room);
    prefetch(room.settings.size);
    this.broadcast(room);
    return { ok: true, data: { code, playerId: player.id, token: player.token } };
  }

  join(code: string, name: string, socketId: string): Result<{ code: string; playerId: string; token: string }> {
    code = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) return fail('INVALID_CODE');
    const room = this.room(code);
    if (!room) return fail('NOT_FOUND');
    if (room.phase === 'countdown' || room.phase === 'playing') return fail('STARTED');
    if (room.players.length >= MAX_PLAYERS) return fail('FULL');
    const player = this.newPlayer(room, name, socketId);
    room.players.push(player);
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    if (!room.players.some((p) => p.id === room.hostId)) room.hostId = player.id;
    this.broadcast(room);
    return { ok: true, data: { code, playerId: player.id, token: player.token } };
  }

  resume(code: string, token: string, socketId: string): Result<{ code: string; playerId: string }> {
    const room = this.room(code?.toUpperCase?.() ?? '');
    const player = room?.players.find((p) => p.token === token);
    if (!room || !player) return fail('NOT_FOUND');
    clearTimeout(player.dcTimer);
    clearTimeout(player.hostTimer);
    player.socketId = socketId;
    player.connected = true;
    this.broadcast(room);
    return { ok: true, data: { code: room.code, playerId: player.id } };
  }

  disconnect(code: string, playerId: string, socketId: string) {
    const f = this.find(code, playerId);
    if (!f || f.player.socketId !== socketId) return; // stale socket
    const { room, player } = f;
    player.connected = false;
    player.socketId = null;
    player.dcTimer = setTimeout(() => this.remove(room.code, player.id), REMOVE_GRACE_MS);
    if (room.hostId === player.id) {
      player.hostTimer = setTimeout(() => this.reassignHost(room), HOST_GRACE_MS);
    }
    this.broadcast(room);
  }

  private reassignHost(room: Room) {
    const host = room.players.find((p) => p.id === room.hostId);
    if (host?.connected) return;
    const next = [...room.players].filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) room.hostId = next.id;
    this.broadcast(room);
  }

  remove(code: string, playerId: string) {
    const f = this.find(code, playerId);
    if (!f) return;
    const { room, player } = f;
    clearTimeout(player.dcTimer);
    clearTimeout(player.hostTimer);
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      room.cleanupTimer = setTimeout(() => this.rooms.delete(room.code), EMPTY_ROOM_MS);
      return;
    }
    if (room.hostId === playerId) {
      const next = [...room.players].sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt)[0];
      room.hostId = next.id;
    }
    this.broadcast(room);
  }

  // ---------- lobby actions ----------
  updateSettings(code: string, playerId: string, patch: Partial<Settings>): Result {
    const f = this.find(code, playerId);
    if (!f) return fail('NOT_FOUND');
    const { room } = f;
    if (room.hostId !== playerId) return fail('NOT_HOST');
    if (room.phase === 'countdown' || room.phase === 'playing') return fail('ROUND_IN_PROGRESS');
    const next = { ...room.settings };
    if (patch.size !== undefined) {
      if (!Number.isInteger(patch.size) || patch.size < MIN_SIZE || patch.size > MAX_SIZE) return fail('BAD_SIZE');
      next.size = patch.size;
    }
    if (patch.xMode !== undefined) {
      if (!['OFF', 'MANUAL', 'AUTO'].includes(patch.xMode)) return fail('BAD_XMODE');
      next.xMode = patch.xMode as XMode;
    }
    if (patch.showProgress !== undefined) next.showProgress = !!patch.showProgress;
    room.settings = next;
    prefetch(next.size);
    this.broadcast(room);
    return { ok: true, data: {} };
  }

  setReady(code: string, playerId: string, ready: boolean): Result {
    const f = this.find(code, playerId);
    if (!f) return fail('NOT_FOUND');
    if (f.room.phase === 'countdown' || f.room.phase === 'playing') return fail('ROUND_IN_PROGRESS');
    f.player.ready = !!ready;
    this.broadcast(f.room);
    return { ok: true, data: {} };
  }

  // ---------- round flow ----------
  async start(code: string, playerId: string): Promise<Result> {
    const f = this.find(code, playerId);
    if (!f) return fail('NOT_FOUND');
    const { room } = f;
    if (room.hostId !== playerId) return fail('NOT_HOST');
    if ((room.phase !== 'lobby' && room.phase !== 'finished') || room.starting) return fail('ROUND_IN_PROGRESS');
    room.starting = true;
    const puzzle = await takePuzzle(room.settings.size);
    room.starting = false;
    if (room.phase !== 'lobby' && room.phase !== 'finished') return fail('ROUND_IN_PROGRESS');
    room.puzzle = puzzle;
    room.round++;
    room.phase = 'countdown';
    room.winner = null;
    room.startedAt = Date.now() + COUNTDOWN_MS;
    for (const p of room.players) {
      p.progress = 0;
      p.ready = false;
    }
    const round = room.round;
    this.broadcast(room);
    setTimeout(() => {
      if (room.round !== round || room.phase !== 'countdown') return;
      room.phase = 'playing';
      this.broadcast(room);
    }, COUNTDOWN_MS);
    return { ok: true, data: {} };
  }

  progress(code: string, playerId: string, count: number) {
    const f = this.find(code, playerId);
    if (!f || f.room.phase !== 'playing') return;
    if (!Number.isInteger(count) || count < 0 || count > f.room.puzzle!.size) return;
    f.player.progress = count;
    this.broadcast(f.room);
  }

  /** Authoritative winner check. Node is single-threaded, so the first valid call wins atomically. */
  submit(code: string, playerId: string, queens: unknown): Result<{ timeMs: number }> {
    const f = this.find(code, playerId);
    if (!f) return fail('NOT_FOUND');
    const { room, player } = f;
    if (room.phase !== 'playing' || !room.puzzle) return fail('ROUND_OVER');
    if (!validateSolution(room.puzzle.regions, room.puzzle.size, queens)) return fail('INVALID');
    const timeMs = Date.now() - room.startedAt;
    room.phase = 'finished';
    room.winner = { id: player.id, name: player.name, timeMs };
    player.wins++;
    player.progress = room.puzzle.size;
    this.broadcast(room);
    return { ok: true, data: { timeMs } };
  }
}
