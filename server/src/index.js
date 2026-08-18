import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json());
app.get('/health', (_, res) => res.json({ ok: true, service: 'gti-nav-server' }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true, methods: ['GET','POST'] } });

const rooms = new Map();
const ensureRoom = (code) => {
  if (!rooms.has(code)) rooms.set(code, new Map());
  return rooms.get(code);
};

io.on('connection', (socket) => {
  socket.on('convoy:join', ({ code, user }) => {
    if (!code || !user?.id) return;
    const roomCode = String(code).toUpperCase();
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.userId = user.id;
    const room = ensureRoom(roomCode);
    room.set(user.id, { ...user, online: true, socketId: socket.id, updatedAt: Date.now() });
    io.to(roomCode).emit('convoy:state', [...room.values()]);
  });

  socket.on('telemetry:update', (payload) => {
    const { roomCode, userId } = socket.data;
    if (!roomCode || !userId) return;
    const room = ensureRoom(roomCode);
    const current = room.get(userId) || { id: userId };
    room.set(userId, { ...current, ...payload, online: true, updatedAt: Date.now() });
    socket.to(roomCode).emit('telemetry:update', room.get(userId));
  });

  socket.on('disconnect', () => {
    const { roomCode, userId } = socket.data;
    if (!roomCode || !userId) return;
    const room = rooms.get(roomCode);
    const current = room?.get(userId);
    if (current) {
      room.set(userId, { ...current, online: false, updatedAt: Date.now() });
      io.to(roomCode).emit('convoy:state', [...room.values()]);
    }
  });
});

setInterval(() => {
  const stale = Date.now() - 120000;
  for (const [code, room] of rooms) {
    for (const [id, user] of room) {
      if (user.updatedAt < stale) room.delete(id);
    }
    if (!room.size) rooms.delete(code);
  }
}, 60000).unref();

const port = process.env.PORT || 3001;
httpServer.listen(port, () => console.log(`GTI Nav server listening on :${port}`));
