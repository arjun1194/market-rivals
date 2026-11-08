// End-to-end: a scripted human plays a full game against CPUs over WebSockets.
// Usage: start the server with MR_CPU_DELAY_SCALE=0 PORT=3999, then `node test/e2e-ws.js 3999`.
import WebSocket from 'ws';
import { SPACES } from '../shared/data.js';
import * as R from '../shared/rules.js';

const port = process.argv[2] || 3999;
const ws = new WebSocket(`ws://localhost:${port}`);
const send = (m) => ws.send(JSON.stringify(m));
const act = (action, args = {}) => send({ t: 'act', action, args });
let me = null;
let started = false;
let lastKey = '';
let turnsPlayed = 0;
const phasesSeen = new Set();
const errors = [];
const t0 = Date.now();

function decide(s) {
  const t = s.turn;
  const p = s.players.find((x) => x.id === me);
  const offer = s.trades.find((tr) => tr.to === me);
  if (offer) return ['respondTrade', { id: offer.id, accept: offer.give.cash >= 300 }];
  if (s.players[t.idx].id !== me) return null;
  phasesSeen.add(t.phase);
  switch (t.phase) {
    case 'roll': return ['roll'];
    case 'jail': return p.cash >= 200 ? ['payJail'] : ['rollJail'];
    case 'buy': return p.cash >= SPACES[t.pending.pos].price + 100 ? ['buy'] : ['decline'];
    case 'tax': return [t.pending.percent < 200 ? 'taxPercent' : 'taxFlat'];
    case 'debt': {
      if (p.cash >= t.pending.amount) return ['payDebt'];
      const mine = R.propertiesOf(s, me);
      const built = mine.find((pos) => s.props[pos].level > 0);
      if (built !== undefined) return ['sell', { pos: built }];
      const m = mine.find((pos) => R.canMortgage(s, p, pos).ok);
      if (m !== undefined) return ['mortgage', { pos: m }];
      return ['bankrupt'];
    }
    case 'manage': {
      const b = R.propertiesOf(s, me).find((pos) => R.canBuild(s, p, pos).ok && p.cash - SPACES[pos].house > 250);
      if (b !== undefined && lastKey !== `b${t.number}${s.props[b].level}`) {
        lastKey = `b${t.number}${s.props[b].level}`;
        return ['build', { pos: b }];
      }
      turnsPlayed++;
      return ['endTurn'];
    }
  }
  return null;
}

ws.on('open', () => send({ t: 'hello' }));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t === 'welcome') send({ t: 'create', name: 'E2E Human' });
  if (m.t === 'error') errors.push(m.msg);
  if (m.t === 'room' && !m.room.started) {
    me = m.you;
    const n = m.room.players.length;
    if (n === 1) send({ t: 'addCpu', role: 'monopolist' });
    else if (n === 2) send({ t: 'addCpu', role: 'competitor' });
    else if (n === 3) send({ t: 'addCpu', role: 'monopolist' });
    else if (n === 4 && !started) {
      started = true;
      send({ t: 'settings', settings: { mode: 'A' } });
      send({ t: 'start' });
    }
  }
  if (m.t === 'state') {
    const s = m.state;
    if (s.status === 'ended') {
      const w = s.players.find((p) => p.id === s.winner);
      console.log(`Game over after ${s.turn.number} turns (${((Date.now() - t0) / 1000).toFixed(1)}s): ${w?.name} (${w?.role}) wins — ${s.endReason}`);
      console.log(`Human turns: ${turnsPlayed}; phases seen: ${[...phasesSeen].join(', ')}`);
      console.log(`Server errors: ${errors.length ? errors.join(' | ') : 'none'}`);
      process.exit(errors.length ? 1 : 0);
    }
    const a = decide(s);
    if (a) act(...a);
  }
});
setTimeout(() => {
  console.log(`TIMEOUT. human turns ${turnsPlayed}; phases ${[...phasesSeen]}; errors: ${errors.join(' | ')}`);
  process.exit(1);
}, 240000);
