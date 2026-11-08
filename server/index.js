// HTTP static server + WebSocket game server.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { GameError } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const MOUNTS = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
  ['/shared/', path.join(ROOT, 'shared/')],
  ['/', path.join(ROOT, 'client/')],
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// ---------- static files ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(dir, '.' + pathname.slice(prefix.length - 1));
    if (!file.startsWith(dir)) break; // path traversal guard
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

// ---------- rooms ----------
const rooms = new Map(); // code -> Room
const sessions = new Map(); // token -> { code, playerId }

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(code));
  return code;
}

function onRoomEmpty(room) {
  // Keep an abandoned room around for a while so players can reconnect.
  setTimeout(() => {
    if (room.players.some((p) => !p.cpu && p.connected)) return;
    room.dispose();
    rooms.delete(room.code);
    for (const [tok, s] of sessions) if (s.code === room.code) sessions.delete(tok);
  }, 10 * 60 * 1000);
}

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  let token = null;
  let session = null; // { code, playerId }
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const room = () => (session ? rooms.get(session.code) : null);

  const join = (r, playerId) => {
    session = { code: r.code, playerId };
    sessions.set(token, session);
    r.attach(playerId, ws);
  };
  const leave = () => {
    const r = room();
    if (r) {
      r.sockets.get(session.playerId)?.delete(ws);
      r.removePlayer(session.playerId);
    }
    sessions.delete(token);
    session = null;
    send({ t: 'left' });
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      switch (msg.t) {
        case 'hello': {
          token = typeof msg.token === 'string' && msg.token.length >= 16 ? msg.token : randomUUID();
          send({ t: 'welcome', token });
          const s = sessions.get(token);
          const r = s && rooms.get(s.code);
          if (r && r.players.some((p) => p.id === s.playerId)) join(r, s.playerId);
          break;
        }
        case 'create': {
          if (session) leave();
          const r = new Room(newCode(), onRoomEmpty);
          rooms.set(r.code, r);
          const p = r.addHuman(msg.name);
          join(r, p.id);
          break;
        }
        case 'join': {
          if (session) leave();
          const r = rooms.get(String(msg.code || '').toUpperCase().trim());
          if (!r) throw new GameError('No room with that code');
          const p = r.addHuman(msg.name);
          join(r, p.id);
          break;
        }
        case 'leave':
          leave();
          break;
        default: {
          const r = room();
          if (!r) throw new GameError('Join a room first');
          const me = session.playerId;
          const hostOnly = () => {
            if (r.hostId !== me) throw new GameError('Only the host can do that');
          };
          if (msg.t === 'setRole') r.setRole(me, msg.role);
          else if (msg.t === 'settings') (hostOnly(), r.setSettings(msg.settings || {}));
          else if (msg.t === 'addCpu') (hostOnly(), r.addCpu(msg.role));
          else if (msg.t === 'kick') (hostOnly(), r.removePlayer(String(msg.playerId)));
          else if (msg.t === 'cpuRole') {
            hostOnly();
            const p = r.players.find((x) => x.id === msg.playerId && x.cpu);
            if (p) r.setRole(p.id, msg.role);
          } else if (msg.t === 'start') r.start(me);
          else if (msg.t === 'act') r.act(me, String(msg.action), msg.args || {});
          else if (msg.t === 'chat') r.say(me, msg.text);
          else throw new GameError(`Unknown message ${msg.t}`);
        }
      }
    } catch (err) {
      if (err instanceof GameError) send({ t: 'error', msg: err.message });
      else {
        console.error(err);
        send({ t: 'error', msg: 'Server error' });
      }
    }
  });

  ws.on('close', () => {
    const r = room();
    if (r) r.detach(session.playerId, ws);
  });
});

server.listen(PORT, () => {
  console.log(`Market Rivals server running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces()))
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Network: http://${a.address}:${PORT}  (share with players on your Wi-Fi)`);
});
