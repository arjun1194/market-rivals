// Headless all-CPU simulation: plays many full games and checks rule invariants after every action.
import { Game } from '../server/game.js';
import { nextCpuStep } from '../server/ai.js';
import { SPACES, CITIES } from '../shared/data.js';
import * as R from '../shared/rules.js';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(g) {
  const s = g.state;
  for (const p of s.players) {
    if (p.cash < 0) throw new Error(`${p.name} has negative cash ${p.cash}`);
    if (p.bankrupt && R.propertiesOf(s, p.id).length) throw new Error(`bankrupt ${p.name} still owns property`);
  }
  for (const [pos, pr] of Object.entries(s.props)) {
    const sp = SPACES[pos];
    if (pr.level && !pr.owner) throw new Error(`buildings on unowned ${sp.name}`);
    if (pr.level && pr.mortgaged) throw new Error(`buildings on mortgaged ${sp.name}`);
    if (!pr.owner) { if (pr.mortgaged) throw new Error(`unowned but mortgaged ${sp.name}`); continue; }
    const o = R.playerById(s, pr.owner);
    if (pr.level > R.maxLevel(o.role)) throw new Error(`too many buildings on ${sp.name}`);
    if (pr.level && sp.type !== 'street') throw new Error(`buildings on non-street ${sp.name}`);
    if (pr.level && o.role === 'monopolist' && !R.hasMonopoly(s, o, sp.city))
      throw new Error(`monopolist ${o.name} has buildings in non-monopolized ${sp.city}`);
  }
  if (s.status === 'playing') {
    const t = s.turn;
    if (g.cur.bankrupt) throw new Error('current player is bankrupt');
    if (['buy', 'tax', 'debt'].includes(t.phase) && !t.pending) throw new Error(`phase ${t.phase} without pending`);
  }
}

function playGame(seed, n, mode, timeLimitMin = 0) {
  const rng = mulberry32(seed);
  let clock = 0;
  const roles = [];
  for (let i = 0; i < n; i++) roles.push(i % 2 === 0 ? 'competitor' : 'monopolist');
  const players = roles.map((role, i) => ({ id: `p${i}`, name: `CPU${i}`, role, cpu: true }));
  const g = new Game({ players, settings: { mode, timeLimitMin }, rng, now: () => clock });
  const mem = {};
  let steps = 0;
  while (g.state.status === 'playing') {
    clock += 4000; // each action "takes" 4 seconds
    const step = nextCpuStep(g, () => true, (id) => (mem[id] ??= {}));
    if (!step) throw new Error(`no CPU step in phase ${g.state.turn.phase}`);
    try {
      g.act(step.playerId, step.action, step.args);
    } catch (e) {
      throw new Error(`seed ${seed}: ${step.action} ${JSON.stringify(step.args || {})} failed in phase ${g.state.turn.phase}: ${e.message}`);
    }
    g.takeEvents();
    checkInvariants(g);
    if (++steps > 60000) return { g, steps, stalled: true };
  }
  return { g, steps, stalled: false };
}

const results = { games: 0, stalled: 0, wins: { competitor: 0, monopolist: 0, none: 0 }, turns: [] };
let seed = 1;
const configs = [];
for (const n of [2, 3, 4, 5, 6]) for (const mode of ['A', 'B']) configs.push({ n, mode });
configs.push({ n: 4, mode: 'A', time: 60 }, { n: 6, mode: 'B', time: 120 });
const PER = Number(process.env.GAMES_PER_CONFIG || 20);
const t0 = Date.now();
for (const c of configs) {
  for (let i = 0; i < PER; i++) {
    const { g, stalled } = playGame(seed++, c.n, c.mode, c.time || 0);
    results.games++;
    if (stalled) { results.stalled++; continue; }
    const w = g.state.winner && R.playerById(g.state, g.state.winner);
    results.wins[w ? w.role : 'none']++;
    results.turns.push(g.state.turn.number);
  }
}
const avg = Math.round(results.turns.reduce((a, b) => a + b, 0) / results.turns.length);
console.log(`Played ${results.games} games in ${((Date.now() - t0) / 1000).toFixed(1)}s — stalled: ${results.stalled}`);
console.log(`Winners by role: competitor ${results.wins.competitor}, monopolist ${results.wins.monopolist}, none ${results.wins.none}`);
console.log(`Average turns per finished game: ${avg} (max ${Math.max(...results.turns)})`);
console.log('All invariants held.');
