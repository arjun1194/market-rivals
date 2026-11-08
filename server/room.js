// A lobby + running game shared by up to 6 players (humans and CPUs).
import { randomUUID } from 'node:crypto';
import { Game, GameError } from './game.js';
import { nextCpuStep } from './ai.js';

const MAX_PLAYERS = 6;
const DISCONNECT_GRACE_MS = 20000; // a disconnected human's turn is played by the CPU after this
// Scales CPU thinking/animation pauses (tests set MR_CPU_DELAY_SCALE=0 to play at full speed).
const DELAY_SCALE = Number(process.env.MR_CPU_DELAY_SCALE ?? 1);
const CPU_NAMES = ['Ada', 'Bram', 'Cleo', 'Dex', 'Esme', 'Finn', 'Gus', 'Hana', 'Ivo', 'Juno'];

/** Rough client animation time for a batch of events, so CPU moves stay watchable. */
function animationMs(events) {
  let ms = 0;
  for (const e of events) {
    if (e.type === 'dice') ms += 1400;
    else if (e.type === 'die') ms += 1100;
    else if (e.type === 'move') ms += e.direct ? 1000 : 250 + e.steps * 200;
    else if (e.type === 'card') ms += 2800;
    else if (e.type === 'build' || e.type === 'buy') ms += 250;
  }
  return ms;
}

export class Room {
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.hostId = null;
    this.players = []; // {id, name, role, cpu, connected, disconnectedAt}
    this.sockets = new Map(); // playerId -> Set<ws>
    this.settings = { mode: 'A', timeLimitMin: 0 };
    this.game = null;
    this.mem = {};
    this.timer = null;
    this.chat = [];
    this.lastActivity = Date.now();
  }

  // ---------- membership ----------
  defaultRole() {
    const c = this.players.filter((p) => p.role === 'competitor').length;
    const m = this.players.filter((p) => p.role === 'monopolist').length;
    return c <= m ? 'competitor' : 'monopolist';
  }

  addHuman(name) {
    if (this.game) throw new GameError('This game has already started');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('Room is full (6 players max)');
    const p = { id: randomUUID().slice(0, 8), name: cleanName(name), role: this.defaultRole(), cpu: false, connected: true };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.system(`${p.name} joined`);
    return p;
  }

  addCpu(role) {
    if (this.game) throw new GameError('Game already started');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('Room is full (6 players max)');
    const used = new Set(this.players.map((p) => p.name));
    const name = `${CPU_NAMES.find((n) => !used.has(`${n} (CPU)`)) || 'Bot'} (CPU)`;
    const p = { id: randomUUID().slice(0, 8), name, role: role === 'monopolist' || role === 'competitor' ? role : this.defaultRole(), cpu: true, connected: true };
    this.players.push(p);
    this.broadcastRoom();
  }

  removePlayer(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    if (this.game) {
      // Mid-game: a leaving human is handed to the CPU so the game can continue.
      const gp = this.game.player(id);
      if (gp && !gp.bankrupt) {
        gp.cpu = true;
        p.cpu = true;
        this.game.log(`${p.name} left — a CPU takes over their seat`, 'system');
        this.broadcastState([]);
      }
    } else {
      this.players = this.players.filter((x) => x.id !== id);
      this.system(`${p.name} left`);
    }
    if (this.hostId === id) this.hostId = this.players.find((x) => !x.cpu && x.connected && x.id !== id)?.id || null;
    this.broadcastRoom();
    this.schedule();
    this.checkEmpty();
  }

  attach(playerId, ws) {
    if (!this.sockets.has(playerId)) this.sockets.set(playerId, new Set());
    this.sockets.get(playerId).add(ws);
    const p = this.players.find((x) => x.id === playerId);
    if (p) {
      p.connected = true;
      p.disconnectedAt = null;
    }
    if (!this.hostId) this.hostId = playerId;
    this.lastActivity = Date.now();
    this.broadcastRoom();
    if (this.game) this.sendState(ws, []);
    this.schedule();
  }

  detach(playerId, ws) {
    const set = this.sockets.get(playerId);
    if (set) {
      set.delete(ws);
      if (set.size) return;
      this.sockets.delete(playerId);
    }
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (!this.game) {
      // In the lobby, a closed tab leaves after a short grace period (a page reload re-attaches in time).
      setTimeout(() => {
        if (!this.game && !p.connected) this.removePlayer(playerId);
      }, 15000);
      this.broadcastRoom();
      return;
    }
    if (this.hostId === playerId) this.hostId = this.players.find((x) => !x.cpu && x.connected)?.id || playerId;
    this.broadcastRoom();
    this.schedule();
    this.checkEmpty();
  }

  checkEmpty() {
    if (!this.players.some((p) => !p.cpu && p.connected)) this.onEmpty(this);
  }

  // ---------- lobby controls ----------
  setRole(playerId, role) {
    if (this.game) throw new GameError('Roles cannot change during the game (§4)');
    const p = this.players.find((x) => x.id === playerId);
    if (!p || !['competitor', 'monopolist'].includes(role)) throw new GameError('Bad role');
    p.role = role;
    this.broadcastRoom();
  }

  setSettings(settings) {
    if (this.game) throw new GameError('Game already started');
    if (settings.mode === 'A' || settings.mode === 'B') this.settings.mode = settings.mode;
    if ([0, 30, 60, 90, 120].includes(Number(settings.timeLimitMin))) this.settings.timeLimitMin = Number(settings.timeLimitMin);
    this.broadcastRoom();
  }

  balanceProblem() {
    const n = this.players.length;
    if (n < 2) return 'Need at least 2 players (add a CPU!)';
    const c = this.players.filter((p) => p.role === 'competitor').length;
    const m = n - c;
    if (c > 3 || m > 3) return 'At most 3 players per role (3 green and 3 blue pawns)';
    if (Math.abs(c - m) > (n % 2)) return n % 2 ? 'Role balance: the two roles may differ by at most one player' : 'Role balance: with an even number of players, roles must be split evenly';
    return null;
  }

  start(byId) {
    if (byId !== this.hostId) throw new GameError('Only the host can start the game');
    if (this.game) throw new GameError('Already started');
    const problem = this.balanceProblem();
    if (problem) throw new GameError(problem);
    this.game = new Game({ players: this.players.map(({ id, name, role, cpu }) => ({ id, name, role, cpu })), settings: this.settings });
    this.system('The game has started!');
    this.broadcastRoom();
    this.broadcastState(this.game.takeEvents());
    this.schedule(1500);
  }

  // ---------- game actions ----------
  act(playerId, action, args) {
    if (!this.game) throw new GameError('The game has not started');
    this.game.act(playerId, action, args);
    this.lastActivity = Date.now();
    const events = this.game.takeEvents();
    this.broadcastState(events);
    this.schedule(animationMs(events) + 500);
  }

  isCpuControlled(gp) {
    if (gp.cpu) return true;
    const p = this.players.find((x) => x.id === gp.id);
    return !!p && !p.connected && Date.now() - (p.disconnectedAt || 0) > DISCONNECT_GRACE_MS;
  }

  schedule(delay = 700) {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.game || this.game.state.status !== 'playing') return;
    const step = nextCpuStep(this.game, (p) => this.isCpuControlled(p), (id) => (this.mem[id] ??= {}));
    if (!step) {
      // Waiting on a human. If they're disconnected, check again when the grace period ends.
      const waiting = this.players.find((x) => x.id === this.game.cur.id);
      if (waiting && !waiting.connected) this.timer = setTimeout(() => this.schedule(), DISCONNECT_GRACE_MS + 200);
      return;
    }
    const quick = ['build', 'sell', 'mortgage', 'unmortgage', 'respondTrade'].includes(step.action);
    this.timer = setTimeout(() => this.runCpu(), Math.max(quick ? 350 : 650, delay) * DELAY_SCALE);
  }

  runCpu() {
    this.timer = null;
    if (!this.game || this.game.state.status !== 'playing') return;
    const step = nextCpuStep(this.game, (p) => this.isCpuControlled(p), (id) => (this.mem[id] ??= {}));
    if (!step) return;
    try {
      this.game.act(step.playerId, step.action, step.args);
    } catch (err) {
      // Should not happen (the simulator checks this), but never let a CPU stall the table.
      console.error(`[room ${this.code}] CPU action failed:`, step, err.message);
      const fallback = { buy: 'decline', proposeTrade: 'endTurn' }[step.action];
      if (fallback) {
        try { this.game.act(step.playerId, fallback, {}); } catch { /* ignore */ }
      } else if (step.action === 'respondTrade') {
        this.game.state.trades = this.game.state.trades.filter((t) => t.id !== step.args.id);
      }
    }
    const events = this.game.takeEvents();
    this.broadcastState(events);
    this.schedule(animationMs(events) + 500);
  }

  // ---------- messaging ----------
  system(text) {
    this.pushChat({ from: null, text });
  }

  pushChat(msg) {
    msg.id = (this.chat.at(-1)?.id || 0) + 1;
    this.chat.push(msg);
    if (this.chat.length > 60) this.chat.shift();
    this.broadcast({ t: 'chat', msg });
  }

  say(playerId, text) {
    const p = this.players.find((x) => x.id === playerId);
    const clean = String(text || '').trim().slice(0, 200);
    if (p && clean) this.pushChat({ from: p.id, name: p.name, text: clean });
  }

  snapshot() {
    return {
      code: this.code,
      hostId: this.hostId,
      settings: this.settings,
      started: !!this.game,
      players: this.players.map(({ id, name, role, cpu, connected }) => ({ id, name, role, cpu, connected })),
      balanceProblem: this.game ? null : this.balanceProblem(),
      chat: this.chat,
    };
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const set of this.sockets.values()) for (const ws of set) if (ws.readyState === 1) ws.send(data);
  }

  broadcastRoom() {
    for (const [pid, set] of this.sockets) {
      const data = JSON.stringify({ t: 'room', room: this.snapshot(), you: pid });
      for (const ws of set) if (ws.readyState === 1) ws.send(data);
    }
  }

  sendState(ws, events) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'state', state: this.game.publicState(), events }));
  }

  broadcastState(events) {
    this.broadcast({ t: 'state', state: this.game.publicState(), events });
  }

  dispose() {
    clearTimeout(this.timer);
  }
}

export function cleanName(name) {
  const n = String(name || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 18);
  return n || 'Player';
}
