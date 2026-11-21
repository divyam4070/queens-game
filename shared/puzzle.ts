import type { Cell } from './rules';

export interface Puzzle {
  size: number;
  regions: number[]; // size*size region ids 0..size-1
  solution: Cell[];
}

const rand = (n: number) => Math.floor(Math.random() * n);

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Counts solutions of a puzzle (stops early at `limit`). Uses forward checking on regions. */
export function countSolutions(regions: number[], n: number, limit = 2, out?: number[][]): number {
  // rc[g * n + r] = bitmask of columns in row r that belong to region g
  const rc = new Array(n * n).fill(0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) rc[regions[r * n + c] * n + r] |= 1 << c;
  const full = (1 << n) - 1;
  let count = 0;
  const path: number[] = [];
  const rec = (r: number, cols: number, regs: number, prev: number) => {
    if (r === n) {
      count++;
      if (out) out.push([...path]);
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols & (1 << c)) continue;
      if (prev >= 0 && Math.abs(c - prev) <= 1) continue;
      const g = regions[r * n + c];
      if (regs & (1 << g)) continue;
      const nc = cols | (1 << c);
      const nr = regs | (1 << g);
      // every unused region must still have a free column in a later row
      let ok = true;
      const free = full & ~nc;
      for (let h = 0; h < n && ok; h++) {
        if (nr & (1 << h)) continue;
        let any = 0;
        for (let k = r + 1; k < n; k++) any |= rc[h * n + k];
        if (!(any & free)) ok = false;
      }
      if (!ok) continue;
      path[r] = c;
      rec(r + 1, nc, nr, c);
      if (count >= limit) return;
    }
  };
  rec(0, 0, 0, -1);
  return count;
}

/** Random column-per-row placement with no two queens touching. */
function randomQueens(n: number): number[] {
  const cols: number[] = [];
  const used = new Array(n).fill(false);
  const rec = (r: number): boolean => {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()])) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(c - cols[r - 1]) <= 1) continue;
      used[c] = true;
      cols[r] = c;
      if (rec(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  rec(0);
  return cols;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function neighbours(i: number, n: number): number[] {
  const r = Math.floor(i / n), c = i % n;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < n && nc < n) out.push(nr * n + nc);
  }
  return out;
}

/** Grows N contiguous regions outward from the queen cells. */
function growRegions(n: number, queenCells: number[]): number[] {
  const regions: number[] = new Array(n * n).fill(-1);
  const frontier: number[][] = queenCells.map(() => []);
  queenCells.forEach((cell, g) => {
    regions[cell] = g;
    frontier[g].push(...neighbours(cell, n));
  });
  let remaining = n * n - n;
  while (remaining > 0) {
    const open: number[] = [];
    for (let g = 0; g < n; g++) {
      frontier[g] = frontier[g].filter((i) => regions[i] === -1);
      if (frontier[g].length) open.push(g);
    }
    const g = open[rand(open.length)];
    const cell = frontier[g][rand(frontier[g].length)];
    regions[cell] = g;
    remaining--;
    frontier[g].push(...neighbours(cell, n));
  }
  return regions;
}

function staysConnected(regions: number[], n: number, cell: number, g: number, anchor: number): boolean {
  const seen = new Set<number>([anchor]);
  const stack = [anchor];
  let size = 0;
  for (let i = 0; i < regions.length; i++) if (regions[i] === g && i !== cell) size++;
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nb of neighbours(cur, n)) {
      if (nb !== cell && regions[nb] === g && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === size;
}

/**
 * Makes the solution unique: repeatedly finds a rival solution and moves one of its
 * cells into a region that already holds another of its queens, which invalidates it.
 */
function makeUnique(regions: number[], n: number, cols: number[], queenCells: number[], iterations: number): boolean {
  for (let it = 0; it < iterations; it++) {
    const sols: number[][] = [];
    if (countSolutions(regions, n, 2, sols) === 1) return true;
    const rival = sols.find((s) => s.some((c, r) => c !== cols[r]));
    if (!rival) return false;
    const rivalCells = rival.map((c, r) => r * n + c);
    const rivalRegion = new Map<number, number>(rivalCells.map((cell) => [regions[cell], cell]));
    let moved = false;
    for (const x of shuffle(rivalCells.filter((cell) => !queenCells.includes(cell)))) {
      const g = regions[x];
      const options = neighbours(x, n)
        .map((nb) => regions[nb])
        .filter((h) => h !== g && rivalRegion.has(h) && rivalRegion.get(h) !== x);
      if (!options.length) continue;
      if (!staysConnected(regions, n, x, g, queenCells[g])) continue;
      regions[x] = options[rand(options.length)];
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return false;
}

/** Generates a puzzle with contiguous regions and exactly one solution. */
export function generatePuzzle(n: number): Puzzle {
  for (;;) {
    const cols = randomQueens(n);
    const queenCells = cols.map((c, r) => r * n + c);
    const regions = growRegions(n, queenCells);
    if (!makeUnique(regions, n, cols, queenCells, n * n * 4)) continue;
    if (countSolutions(regions, n, 2) !== 1) continue;
    // Shuffle region ids so colours don't correlate with queen rows.
    const perm = shuffle([...Array(n).keys()]);
    return {
      size: n,
      regions: regions.map((g) => perm[g]),
      solution: cols.map((c, r) => [r, c] as Cell),
    };
  }
}
