import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/rooms';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const peek = (m: RoomManager, code: string) => (m as any).rooms.get(code);

test('full room lifecycle', async () => {
  const m = new RoomManager(() => {});
  const a = m.create('Ann', 's1');
  assert.ok(a.ok);
  const { code, playerId: host, token } = (a as any).data;

  assert.deepEqual((m.join('bad', 'X', 's9') as any).error, 'INVALID_CODE');
  assert.deepEqual((m.join('ZZZZZ', 'X', 's9') as any).error, 'NOT_FOUND');
  const b = m.join(code.toLowerCase(), 'Bob', 's2') as any;
  assert.ok(b.ok);

  assert.equal(((await m.start(code, b.data.playerId)) as any).error, 'NOT_HOST');
  assert.equal((m.updateSettings(code, b.data.playerId, { size: 6 }) as any).error, 'NOT_HOST');
  assert.ok(m.updateSettings(code, host, { size: 6, xMode: 'AUTO' }).ok);
  assert.equal((m.updateSettings(code, host, { size: 13 }) as any).error, 'BAD_SIZE');

  assert.ok((await m.start(code, host)).ok);
  assert.equal((m.join(code, 'Cy', 's3') as any).error, 'STARTED');
  assert.equal((m.submit(code, host, []) as any).error, 'ROUND_OVER'); // still counting down
  await sleep(3200);

  const room = peek(m, code);
  assert.equal(room.phase, 'playing');
  const state = m.snapshot(code)!;
  assert.equal(state.size, 6);
  assert.ok(!JSON.stringify(state).includes('solution'));

  // wrong answers rejected
  assert.equal((m.submit(code, b.data.playerId, [[0, 0]]) as any).error, 'INVALID');
  const sol = room.puzzle.solution;
  const bad = sol.map(([r, c]: number[]) => [r, c]);
  bad[0] = [bad[0][0], (bad[0][1] + 1) % 6];
  assert.equal((m.submit(code, b.data.playerId, bad) as any).error, 'INVALID');

  // simultaneous correct submissions: only one wins
  const r1 = m.submit(code, b.data.playerId, sol);
  const r2 = m.submit(code, host, sol);
  assert.ok(r1.ok);
  assert.equal((r2 as any).error, 'ROUND_OVER');
  assert.equal(m.snapshot(code)!.winner!.name, 'Bob');
  assert.equal(m.snapshot(code)!.phase, 'finished');
  assert.equal(m.snapshot(code)!.players.find((p) => p.id === b.data.playerId)!.wins, 1);

  // room survives; settings change; next round has fresh puzzle, same players/code
  assert.ok(m.updateSettings(code, host, { size: 5 }).ok);
  const oldRegions = [...room.puzzle.regions];
  assert.ok((await m.start(code, host)).ok);
  assert.equal(m.snapshot(code)!.round, 2);
  assert.equal(m.snapshot(code)!.players.length, 2);
  assert.equal(m.snapshot(code)!.size, 5);
  assert.notEqual(room.puzzle.regions.length, oldRegions.length);

  // reconnect keeps the seat
  m.disconnect(code, host, 's1');
  assert.equal(m.snapshot(code)!.players[0].connected, false);
  assert.ok(m.resume(code, token, 's1b').ok);
  assert.equal(m.snapshot(code)!.players[0].connected, true);
  assert.equal((m.resume(code, 'nope', 's5') as any).error, 'NOT_FOUND');

  // host leaves -> host transfers
  m.remove(code, host);
  assert.equal(m.snapshot(code)!.hostId, b.data.playerId);
  for (const t of [room.cleanupTimer]) clearTimeout(t);
  process.exit(0);
});
