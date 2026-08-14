/**
 * 《出包魔法师》联机服务端入口。
 * - Socket.IO 房间制对战（断线自动托管）
 * - 生产环境同端口托管 apps/web 的构建产物
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@tm/rules';
import { Room, RoomSocket, genRoomCode, sanitizeName } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = express();
const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: true, credentials: true },
});

const rooms = new Map<string, Room>();

// 健康检查（部署探活用）
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
});

function uniqueCode(): string {
  for (let i = 0; i < 20; i++) {
    const code = genRoomCode();
    if (!rooms.has(code)) return code;
  }
  throw new Error('房间号生成失败');
}

io.on('connection', (socket: RoomSocket) => {
  socket.data = {};

  socket.on('listRooms', (cb) => {
    try {
      cb({ rooms: [...rooms.values()].map((r) => r.listItem()) });
    } catch (err) {
      cb({ rooms: [] });
    }
  });

  socket.on('createRoom', (payload, cb) => {
    try {
      const name = sanitizeName(payload?.name);
      const playerId = randomUUID();
      const code = uniqueCode();
      const room = new Room(
        code,
        playerId,
        name,
        payload?.settings,
        payload?.password,
        payload?.botCount,
        io,
        (c) => rooms.delete(c),
      );
      rooms.set(code, room);
      socket.join(code);
      socket.data = { roomCode: code, playerId };
      room.attach(socket.id, playerId);
      cb({ ok: true, code, playerId });
      room.broadcastLobby();
    } catch (err) {
      cb({ ok: false, error: `创建房间失败：${(err as Error).message}` });
    }
  });

  socket.on('joinRoom', (payload, cb) => {
    try {
      const code = String(payload?.code ?? '').trim().toUpperCase();
      const name = sanitizeName(payload?.name);
      const room = rooms.get(code);
      if (!room) {
        cb({ ok: false, error: '房间不存在，请检查房间码' });
        return;
      }
      const res = room.join(name, payload?.token, socket.id, payload?.password);
      if (!res.ok) {
        cb({ ok: false, error: res.error });
        return;
      }
      socket.join(code);
      socket.data = { roomCode: code, playerId: res.playerId };
      room.attach(socket.id, res.playerId);
      cb({ ok: true, code, playerId: res.playerId, rejoin: res.rejoin });
      if (room.status === 'playing') {
        room.emitViewTo(socket.id, res.playerId);
        room.broadcastViews();
      } else {
        room.broadcastLobby();
      }
    } catch (err) {
      cb({ ok: false, error: `加入失败：${(err as Error).message}` });
    }
  });

  socket.on('setBots', (payload) => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.setBots(d.playerId, payload?.count ?? 0, socket.id);
  });

  socket.on('updateSettings', (payload) => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.updateSettings(d.playerId, payload?.settings ?? {}, socket.id);
  });

  socket.on('setPassword', (payload) => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.setPassword(d.playerId, payload?.password ?? '', socket.id);
  });

  socket.on('startGame', () => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.start(d.playerId, socket.id);
  });

  socket.on('nextRound', () => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.nextRound(d.playerId, socket.id);
  });

  socket.on('declareSpell', (payload) => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId || !payload?.magic) return;
    rooms.get(d.roomCode)?.declareSpell(d.playerId, payload.magic, socket.id);
  });

  socket.on('endTurn', () => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.endTurn(d.playerId, socket.id);
  });

  socket.on('leaveRoom', () => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.onLeave(d.playerId);
    socket.leave(d.roomCode);
    socket.data = {};
  });

  socket.on('disconnect', () => {
    const d = socket.data;
    if (!d.roomCode || !d.playerId) return;
    rooms.get(d.roomCode)?.onDisconnect(d.playerId);
  });
});

// ---- 静态资源（生产模式：托管 web 构建产物） ----
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA 回退
  app.use((_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send('出包魔法师服务端运行中 ✅（web 前端未构建，请先 pnpm build）');
  });
}

server.listen(PORT, HOST, () => {
  console.log(`🧙 出包魔法师服务端已启动：http://${HOST}:${PORT}`);
  console.log(`   静态资源：${fs.existsSync(webDist) ? '已托管 apps/web/dist' : '未构建'}`);
});
