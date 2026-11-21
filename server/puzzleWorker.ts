import { parentPort } from 'node:worker_threads';
import { generatePuzzle } from '../shared/puzzle';

parentPort!.on('message', ({ id, size }: { id: number; size: number }) => {
  parentPort!.postMessage({ id, puzzle: generatePuzzle(size) });
});
