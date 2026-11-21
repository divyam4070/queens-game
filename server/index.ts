import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { RoomManager } from './rooms';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10_000, pingTimeout: 10_000 });

const rooms = new RoomManager((code, build) => io.to(code).emit('room:state', build(Date.now())));

interface SocketData {
  code?: string;
  playerId?: string;
}

const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
type Cb = (res: unknown) => void;
const reply = (cb: unknown, res: unknown) => typeof cb === 'function' && (cb as Cb)(res);

function bind(socket: Socket, code: string, playerId: string) {
  const d = socket.data as SocketData;
  if (d.code && d.code !== code) socket.leave(d.code);
  d.code = code;
  d.playerId = playerId;
  socket.join(code);
}

io.on('connection', (socket) => {
  const d = socket.data as SocketData;

  socket.on('room:create', (p: any, cb) => {
    const name = str(p?.name, 16);
    if (!name) return reply(cb, { ok: false, error: 'NAME_REQUIRED' });
    const res = rooms.create(name, socket.id);
    if (res.ok) bind(socket, res.data.code, res.data.playerId);
    reply(cb, res.ok ? { ok: true, data: { ...res.data, state: rooms.snapshot(res.data.code) } } : res);
  });

  socket.on('room:join', (p: any, cb) => {
    const name = str(p?.name, 16);
    if (!name) return reply(cb, { ok: false, error: 'NAME_REQUIRED' });
    const res = rooms.join(str(p?.code, 10), name, socket.id);
    if (res.ok) bind(socket, res.data.code, res.data.playerId);
    reply(cb, res.ok ? { ok: true, data: { ...res.data, state: rooms.snapshot(res.data.code) } } : res);
  });

  socket.on('room:resume', (p: any, cb) => {
    const res = rooms.resume(str(p?.code, 10), str(p?.token, 64), socket.id);
    if (res.ok) bind(socket, res.data.code, res.data.playerId);
    reply(cb, res.ok ? { ok: true, data: { ...res.data, state: rooms.snapshot(res.data.code) } } : res);
  });

  const guarded = (event: string, fn: (code: string, playerId: string, p: any) => unknown) =>
    socket.on(event, (p: any, cb) => {
      if (!d.code || !d.playerId) return reply(cb, { ok: false, error: 'NOT_IN_ROOM' });
      Promise.resolve(fn(d.code, d.playerId, p)).then((res) => reply(cb, res));
    });

  guarded('room:settings', (c, id, p) => rooms.updateSettings(c, id, { size: p?.size, xMode: p?.xMode, showProgress: p?.showProgress }));
  guarded('room:ready', (c, id, p) => rooms.setReady(c, id, !!p?.ready));
  guarded('game:start', (c, id) => rooms.start(c, id));
  guarded('game:progress', (c, id, p) => (rooms.progress(c, id, p?.count), { ok: true }));
  guarded('game:submit', (c, id, p) => rooms.submit(c, id, p?.queens));
  guarded('room:leave', (c, id) => {
    rooms.remove(c, id);
    socket.leave(c);
    d.code = d.playerId = undefined;
    return { ok: true };
  });

  socket.on('disconnect', () => {
    if (d.code && d.playerId) rooms.disconnect(d.code, d.playerId, socket.id);
  });
});

// Serve the built client in production
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, () => console.log(`Queens server listening on :${PORT}`));
