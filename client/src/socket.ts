import { io } from 'socket.io-client';
import type { Ack } from '../../shared/types';

export const socket = io({ autoConnect: false });

export function call<T = any>(event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket as any).timeout(8000).emit(event, payload, (err: Error | null, res: Ack<T>) =>
      resolve(err ? { ok: false, error: 'TIMEOUT' } : res),
    );
  });
}

export const ERRORS: Record<string, string> = {
  INVALID_CODE: 'Room codes have 5 letters or numbers.',
  NOT_FOUND: 'No room with that code. Check it and try again.',
  FULL: 'That room is full (8 players).',
  STARTED: 'A round is in progress. Try again when it ends.',
  NAME_REQUIRED: 'Enter a nickname first.',
  TIMEOUT: "Can't reach the server. Check your connection.",
};
