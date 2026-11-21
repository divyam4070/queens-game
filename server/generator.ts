import { Worker } from 'node:worker_threads';
import { generatePuzzle, type Puzzle } from '../shared/puzzle';

/** Runs puzzle generation on a worker thread so the event loop (sockets, pings) never blocks. */
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (p: Puzzle) => void; size: number }>();

function spawn(): Worker {
  const w = new Worker(new URL('./puzzleWorker.ts', import.meta.url));
  w.on('message', ({ id, puzzle }: { id: number; puzzle: Puzzle }) => {
    pending.get(id)?.resolve(puzzle);
    pending.delete(id);
  });
  const crashed = () => {
    worker = null;
    // fall back to in-process generation for anything still waiting
    for (const [id, job] of pending) {
      job.resolve(generatePuzzle(job.size));
      pending.delete(id);
    }
  };
  w.on('error', crashed);
  w.on('exit', () => {
    if (worker === w) crashed();
  });
  return w;
}

export function generateAsync(size: number): Promise<Puzzle> {
  worker ??= spawn();
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, size });
    worker!.postMessage({ id, size });
  });
}
