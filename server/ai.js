// CPU player heuristics. Each call returns ONE action ({action, args}) or null.
// Strategy follows the rulebook's advice: competitors buy aggressively to block monopolies;
// monopolists chase 2-of-a-city and transport chains, then build.
import { SPACES, CITIES, TRANSPORTS, UTILITIES } from '../shared/data.js';
import * as R from '../shared/rules.js';

const priceOf = (pos) => SPACES[pos].price;
const ownerOf = (s, pos) => s.props[pos].owner;
const isOpponentMono = (s, me, id) => {
  const q = id && R.playerById(s, id);
  return q && q.id !== me.id && q.role === 'monopolist' && !q.bankrupt;
};

/** Cash to keep in hand, scaled to the worst rent opponents can currently charge. */
function reserveFor(s, me) {
  let worst = 0;
  for (const pos of Object.keys(s.props).map(Number)) {
    const pr = s.props[pos];
    if (!pr.owner || pr.owner === me.id) continue;
    worst = Math.max(worst, R.rentFor(s, pos, 7));
  }
  const factor = me.role === 'competitor' ? 0.55 : 0.75;
  return Math.min(350, Math.max(me.role === 'competitor' ? 120 : 130, Math.round(worst * factor)));
}

/** 'must' = strategically important, 'yes' = nice to have, false = skip. */
function wantsToBuy(s, me, pos) {
  const sp = SPACES[pos];
  if (sp.type === 'street') {
    const others = CITIES[sp.city].streets.filter((x) => x !== pos).map((x) => ownerOf(s, x));
    if (me.role === 'monopolist') {
      if (others.includes(me.id)) return 'must'; // completes a monopoly
      if (others.some((id) => isOpponentMono(s, me, id))) return 'must'; // block a rival monopolist
      // Only worth it if this city can still be monopolized (2 streets not held by others).
      const free = 1 + others.filter((id) => !id).length;
      return free >= 2 ? 'yes' : 'maybe';
    }
    if (others.some((id) => isOpponentMono(s, me, id))) return 'must'; // competitors block monopolies
    return 'yes';
  }
  const group = sp.type === 'transport' ? TRANSPORTS : UTILITIES;
  const groupOwners = group.filter((x) => x !== pos).map((x) => ownerOf(s, x));
  if (me.role === 'monopolist' && groupOwners.includes(me.id)) return 'must';
  if (me.role === 'competitor' && groupOwners.some((id) => isOpponentMono(s, me, id))) return 'must';
  return sp.type === 'transport' ? 'yes' : 'maybe';
}

/** Mortgage candidate that hurts least (no buildings, not part of an active monopoly). */
function cheapestMortgage(s, me, exclude = []) {
  const cands = R.propertiesOf(s, me.id)
    .filter((pos) => !exclude.includes(pos) && R.canMortgage(s, me, pos).ok)
    .map((pos) => {
      const sp = SPACES[pos];
      let keep = priceOf(pos);
      if (sp.type === 'street' && R.hasMonopoly(s, me, sp.city)) keep += 400;
      if (sp.type === 'transport' && me.role === 'monopolist') keep += 150;
      return { pos, keep };
    })
    .sort((a, b) => a.keep - b.keep);
  return cands[0]?.pos ?? null;
}

function decideBuy(s, me) {
  const pos = s.turn.pending.pos;
  const price = priceOf(pos);
  const want = wantsToBuy(s, me, pos);
  const reserve = reserveFor(s, me);
  const after = me.cash - price;
  if (want === 'must') {
    if (after >= 0) return { action: 'buy' };
    if (R.liquidationValue(s, me) + me.cash >= price + 40) {
      const m = cheapestMortgage(s, me);
      if (m !== null) return { action: 'mortgage', args: { pos: m } };
    }
    return { action: 'decline' };
  }
  const need = want === 'yes' ? reserve * (me.role === 'competitor' ? 0.4 : 0.6) : reserve * 1.3;
  return after >= need ? { action: 'buy' } : { action: 'decline' };
}

function decideDebt(s, me) {
  const { amount } = s.turn.pending;
  if (me.cash >= amount) return { action: 'payDebt' };
  // 1) mortgage idle property  2) sell buildings  3) mortgage anything left  4) bankrupt
  const idle = R.propertiesOf(s, me.id).filter((pos) => {
    const sp = SPACES[pos];
    if (!R.canMortgage(s, me, pos).ok) return false;
    return !(sp.type === 'street' && R.cityHasBuildings(s, me.id, sp.city));
  });
  if (idle.length) {
    idle.sort((a, b) => priceOf(a) - priceOf(b));
    return { action: 'mortgage', args: { pos: idle[0] } };
  }
  const built = R.propertiesOf(s, me.id)
    .filter((pos) => s.props[pos].level > 0)
    .sort((a, b) => s.props[b].level - s.props[a].level);
  if (built.length) return { action: 'sell', args: { pos: built[0] } };
  const any = cheapestMortgage(s, me);
  if (any !== null) return { action: 'mortgage', args: { pos: any } };
  return { action: 'bankrupt' };
}

function decideManage(game, me, mem) {
  const s = game.state;
  const reserve = reserveFor(s, me);
  const mine = R.propertiesOf(s, me.id);

  // Pay off mortgages, monopoly-restoring ones first.
  const redeem = mine
    .filter((pos) => s.props[pos].mortgaged)
    .map((pos) => {
      const sp = SPACES[pos];
      const restores = sp.type === 'street' && me.role === 'monopolist' && R.ownedStreetsInCity(s, me.id, sp.city).length >= 2;
      return { pos, cost: R.redeemPrice(pos), score: (restores ? 1000 : 0) + priceOf(pos) };
    })
    .filter((c) => me.cash - c.cost >= reserve + 60)
    .sort((a, b) => b.score - a.score);
  if (redeem.length) return { action: 'unmortgage', args: { pos: redeem[0].pos } };

  // Build: spread evenly, prefer bigger rent jumps.
  const builds = mine
    .map((pos) => ({ pos, chk: R.canBuild(s, me, pos) }))
    .filter((c) => c.chk.ok && me.cash - c.chk.cost >= reserve)
    .sort((a, b) => s.props[a.pos].level - s.props[b.pos].level || priceOf(b.pos) - priceOf(a.pos));
  // Like a person, build a little each turn rather than everything at once.
  if (mem.buildTurn !== s.turn.number) {
    mem.buildTurn = s.turn.number;
    mem.builds = 0;
  }
  if (builds.length && mem.builds < 2) {
    mem.builds++;
    return { action: 'build', args: { pos: builds[0].pos } };
  }

  // Monopolists occasionally try to buy the missing street of a city.
  if (me.role === 'monopolist' && s.turn.number - (mem.lastOfferTurn ?? -99) >= 6) {
    mem.tried ??= {};
    for (const [city, info] of Object.entries(CITIES)) {
      const minePos = info.streets.filter((x) => ownerOf(s, x) === me.id);
      if (minePos.length !== 1) continue;
      for (const pos of info.streets) {
        const owner = ownerOf(s, pos);
        if (!owner || owner === me.id || s.props[pos].level > 0) continue;
        const key = `${pos}:${owner}`;
        if ((mem.tried[key] ?? -99) > s.turn.number - 20) continue;
        const offer = Math.round(priceOf(pos) * 1.6);
        if (me.cash - offer < reserve) continue;
        mem.tried[key] = s.turn.number;
        const args = { to: owner, give: { cash: offer, props: [] }, get: { cash: 0, props: [pos] } };
        if (game.validateTrade({ from: me.id, ...args })) continue;
        mem.lastOfferTurn = s.turn.number;
        return { action: 'proposeTrade', args };
      }
    }
  }
  return { action: 'endTurn' };
}

/** Decide the next action for the CPU whose turn it is. */
export function decideTurn(game, me, mem = {}) {
  const s = game.state;
  switch (s.turn.phase) {
    case 'jail':
      // Monopolists earn nothing in Prison, so they pay to get out; competitors keep earning in Price War.
      if (me.role === 'monopolist' && me.cash >= 50 + reserveFor(s, me) * 0.5) return { action: 'payJail' };
      return { action: 'rollJail' };
    case 'roll':
      return { action: 'roll' };
    case 'buy':
      return decideBuy(s, me);
    case 'tax':
      return { action: s.turn.pending.percent < s.turn.pending.flat ? 'taxPercent' : 'taxFlat' };
    case 'debt':
      return decideDebt(s, me);
    case 'manage':
      return decideManage(game, me, mem);
    default:
      return null;
  }
}

/** Should the CPU accept a trade offered to it? */
export function evaluateTrade(game, me, tr) {
  const s = game.state;
  const from = R.playerById(s, tr.from);
  const val = (pos) => (s.props[pos].mortgaged ? priceOf(pos) * 0.45 : priceOf(pos));
  let gain = tr.give.cash + tr.give.props.reduce((a, pos) => a + val(pos), 0);
  let loss = tr.get.cash + tr.get.props.reduce((a, pos) => a + val(pos), 0);

  const props = structuredClone(s.props);
  for (const pos of tr.give.props) props[pos].owner = me.id;
  for (const pos of tr.get.props) props[pos].owner = from.id;
  const after = { ...s, props };

  for (const pos of tr.give.props) {
    const sp = SPACES[pos];
    if (sp.type === 'street' && me.role === 'monopolist' && R.hasMonopoly(after, me, sp.city) && !R.hasMonopoly(s, me, sp.city))
      gain += priceOf(pos);
    if (sp.type === 'transport' && me.role === 'monopolist') gain += 50 * R.countOwned(s, me.id, TRANSPORTS);
  }
  for (const pos of tr.get.props) {
    const sp = SPACES[pos];
    if (sp.type === 'street') {
      if (R.hasMonopoly(s, me, sp.city) && !R.hasMonopoly(after, me, sp.city)) loss += priceOf(pos) * 3;
      if (from.role === 'monopolist' && R.hasMonopoly(after, from, sp.city) && !R.hasMonopoly(s, from, sp.city))
        loss += priceOf(pos) * (me.role === 'competitor' ? 2 : 1.2);
    }
    if (sp.type === 'transport' && from.role === 'monopolist') loss += 60 * (R.countOwned(s, from.id, TRANSPORTS) + 1);
  }
  if (me.cash - tr.get.cash < 40) return false;
  return gain >= loss * 1.15;
}

/**
 * Next CPU step for the whole table: pending trade replies first, then the current player's move.
 * Returns {playerId, action, args} or null when a human must act.
 */
export function nextCpuStep(game, isCpuControlled, memFor) {
  const s = game.state;
  if (s.status !== 'playing') return null;
  for (const tr of s.trades) {
    const target = R.playerById(s, tr.to);
    if (target && isCpuControlled(target)) {
      return { playerId: target.id, action: 'respondTrade', args: { id: tr.id, accept: evaluateTrade(game, target, tr) } };
    }
  }
  const cur = game.cur;
  if (!isCpuControlled(cur)) return null;
  const d = decideTurn(game, cur, memFor(cur.id));
  return d && { playerId: cur.id, ...d };
}
