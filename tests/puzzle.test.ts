import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePuzzle, countSolutions } from '../shared/puzzle';
import { validateSolution } from '../shared/rules';

for (let n = 5; n <= 12; n++) {
  test(`generates valid unique ${n}x${n} puzzle`, () => {
    const t = Date.now();
    const p = generatePuzzle(n);
    console.log(`  ${n}x${n}: ${Date.now() - t}ms`);
    assert.equal(new Set(p.regions).size, n);
    assert.equal(countSolutions(p.regions, n, 2), 1);
    assert.ok(validateSolution(p.regions, n, p.solution));
  });
}

test('validator rejects bad boards', () => {
  const p = generatePuzzle(6);
  assert.equal(validateSolution(p.regions, 6, p.solution.slice(1)), false);
  assert.equal(validateSolution(p.regions, 6, [...p.solution.slice(1), p.solution[1]]), false);
  assert.equal(validateSolution(p.regions, 6, 'x'), false);
  assert.equal(validateSolution(p.regions, 6, p.solution.map(([r, c]) => [r, c + 0.5])), false);
});
