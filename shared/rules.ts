export const MIN_SIZE = 5;
export const MAX_SIZE = 12;

export type Cell = [number, number];

/** Server-side authoritative validation of a full solution. */
export function validateSolution(regions: number[], n: number, queens: unknown): boolean {
  if (!Array.isArray(queens) || queens.length !== n || regions.length !== n * n) return false;
  const rows = new Set<number>();
  const cols = new Set<number>();
  const regs = new Set<number>();
  const pts: Cell[] = [];
  for (const q of queens) {
    if (!Array.isArray(q) || q.length !== 2) return false;
    const [r, c] = q as number[];
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= n || c >= n) return false;
    rows.add(r);
    cols.add(c);
    regs.add(regions[r * n + c]);
    pts.push([r, c]);
  }
  if (rows.size !== n || cols.size !== n || regs.size !== n) return false;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.abs(pts[i][0] - pts[j][0]) <= 1 && Math.abs(pts[i][1] - pts[j][1]) <= 1) return false;
    }
  }
  return true;
}

/** Client helper: cell indexes of queens that break a rule with another queen. */
export function findConflicts(regions: number[], n: number, queens: number[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const a = queens[i];
      const b = queens[j];
      const ar = Math.floor(a / n), ac = a % n, br = Math.floor(b / n), bc = b % n;
      if (
        ar === br ||
        ac === bc ||
        regions[a] === regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}

/** Cells eliminated by a queen at `q` (row, column, region, 8 neighbours). */
export function eliminatedBy(regions: number[], n: number, q: number): number[] {
  const r = Math.floor(q / n), c = q % n;
  const out: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (i === q) continue;
    const ir = Math.floor(i / n), ic = i % n;
    if (ir === r || ic === c || regions[i] === regions[q] || (Math.abs(ir - r) <= 1 && Math.abs(ic - c) <= 1)) {
      out.push(i);
    }
  }
  return out;
}
