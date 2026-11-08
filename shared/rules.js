// Pure rule helpers shared by the server engine and the client UI.
// Section numbers (§) refer to the sections of the original rulebook the mechanics come from.
import { SPACES, CITIES, TRANSPORTS, UTILITIES } from './data.js';

export const space = (pos) => SPACES[pos];
export const playerById = (state, id) => state.players.find((p) => p.id === id);

/** Competitor: up to 4 houses then an apartment (level 5). Monopolist: up to 3 houses then an apartment (level 4). §11 */
export const maxLevel = (role) => (role === 'competitor' ? 5 : 4);
export const isApartment = (role, level) => level === maxLevel(role);
export const houseCount = (role, level) => (isApartment(role, level) ? 0 : level);

export const mortgageValue = (pos) => SPACES[pos].price / 2;
/** Redemption = mortgage value + 10%, rounded (matches every printed mortgage note). §12 */
export const redeemPrice = (pos) => Math.round(mortgageValue(pos) * 1.1);

/** Rent tables derived from the title-card formula (verified against all 22 cards). */
export function streetRents(pos) {
  const { price: P, house: H } = SPACES[pos];
  const base = P / 10;
  const comp = [0, 1, 2, 3, 4, 5].map((k) => base + (k * H) / 10);
  // mono[0] = base (not monopolized), mono[1] = doubled base; then 1-3 houses, then apartment
  const mono = [base, 2 * base, 2 * comp[1], 2 * comp[2], 2 * comp[3], 2 * comp[4]];
  return { comp, mono };
}

export function ownedStreetsInCity(state, playerId, city, unmortgagedOnly = false) {
  return CITIES[city].streets.filter((pos) => {
    const pr = state.props[pos];
    return pr.owner === playerId && (!unmortgagedOnly || !pr.mortgaged);
  });
}

/** A monopolist has monopolized a city when they own >=2 of its streets, unmortgaged. §10, §12 */
export function hasMonopoly(state, player, city) {
  return player.role === 'monopolist' && ownedStreetsInCity(state, player.id, city, true).length >= 2;
}

export function countOwned(state, playerId, list) {
  return list.filter((pos) => state.props[pos].owner === playerId).length;
}

/** Amount owed when landing on `pos`. diceTotal is needed for utilities. §9, §10, §19, §20 */
export function rentFor(state, pos, diceTotal = 7) {
  const sp = SPACES[pos];
  const pr = state.props[pos];
  if (!pr || !pr.owner || pr.mortgaged) return 0;
  const owner = playerById(state, pr.owner);
  if (!owner || owner.bankrupt) return 0;
  // Monopolists in Prison collect nothing (§15). Competitors in Price War still collect.
  if (owner.jail && owner.role === 'monopolist') return 0;
  if (sp.type === 'street') {
    const { comp, mono } = streetRents(pos);
    if (owner.role === 'competitor') return comp[pr.level];
    if (!hasMonopoly(state, owner, sp.city)) return mono[0];
    return pr.level === 0 ? mono[1] : mono[pr.level + 1];
  }
  if (sp.type === 'transport') {
    if (owner.role === 'competitor') return 20;
    return 40 * 2 ** (countOwned(state, owner.id, TRANSPORTS) - 1);
  }
  if (sp.type === 'utility') {
    if (owner.role === 'competitor') return 4 * diceTotal;
    return (countOwned(state, owner.id, UTILITIES) >= 2 ? 10 : 4) * diceTotal;
  }
  return 0;
}

/** Human-readable rent description for title cards / tooltips. */
export function rentLabel(state, pos) {
  const sp = SPACES[pos];
  if (sp.type === 'utility') {
    const pr = state.props[pos];
    const owner = pr.owner && playerById(state, pr.owner);
    if (!owner || pr.mortgaged) return '—';
    if (owner.role === 'competitor') return '4× dice';
    return countOwned(state, owner.id, UTILITIES) >= 2 ? '10× dice' : '4× dice';
  }
  return `$${rentFor(state, pos)}`;
}

/** Can `player` add one improvement level to `pos`? §10, §11 */
export function canBuild(state, player, pos) {
  const sp = SPACES[pos];
  const pr = state.props[pos];
  if (sp.type !== 'street') return { ok: false, reason: 'Only streets can be built on' };
  if (pr.owner !== player.id) return { ok: false, reason: 'You do not own it' };
  if (pr.mortgaged) return { ok: false, reason: 'Property is mortgaged' };
  if (pr.level >= maxLevel(player.role)) return { ok: false, reason: 'Already has an apartment' };
  if (player.role === 'monopolist' && !hasMonopoly(state, player, sp.city))
    return { ok: false, reason: `Monopolize ${sp.city} first (own 2 unmortgaged streets)` };
  if (player.cash < sp.house) return { ok: false, reason: `Need $${sp.house}` };
  const next = pr.level + 1;
  return { ok: true, cost: sp.house, apartment: isApartment(player.role, next) };
}

/** Selling one level back to the Treasurer returns half its cost. §13 */
export function canSell(state, player, pos) {
  const pr = state.props[pos];
  if (!pr || pr.owner !== player.id || pr.level === 0) return { ok: false, reason: 'Nothing to sell' };
  return { ok: true, refund: SPACES[pos].house / 2 };
}

export function cityHasBuildings(state, playerId, city) {
  return CITIES[city].streets.some((pos) => state.props[pos].owner === playerId && state.props[pos].level > 0);
}

/** §12: no buildings on the lot; monopolists may not break a monopoly that still has buildings. */
export function canMortgage(state, player, pos) {
  const sp = SPACES[pos];
  const pr = state.props[pos];
  if (!pr || pr.owner !== player.id) return { ok: false, reason: 'You do not own it' };
  if (pr.mortgaged) return { ok: false, reason: 'Already mortgaged' };
  if (pr.level > 0) return { ok: false, reason: 'Sell its buildings first' };
  if (sp.type === 'street' && player.role === 'monopolist' && cityHasBuildings(state, player.id, sp.city)) {
    const after = ownedStreetsInCity(state, player.id, sp.city, true).filter((p) => p !== pos).length;
    if (after < 2) return { ok: false, reason: `Sell all buildings in ${sp.city} first` };
  }
  return { ok: true, value: mortgageValue(pos) };
}

export function canUnmortgage(state, player, pos) {
  const pr = state.props[pos];
  if (!pr || pr.owner !== player.id) return { ok: false, reason: 'You do not own it' };
  if (!pr.mortgaged) return { ok: false, reason: 'Not mortgaged' };
  const cost = redeemPrice(pos);
  if (player.cash < cost) return { ok: false, reason: `Need $${cost}` };
  return { ok: true, cost };
}

/** Original cost of buildings on a lot (an apartment counts as the levels it replaced). */
export const buildingCost = (pos, level) => level * (SPACES[pos].house || 0);

/** Income-tax percentage option. §17 */
export function incomeTaxPercent(state, player) {
  const pct = player.role === 'monopolist' ? 0.2 : 0.1;
  let assets = 0;
  for (const [pos, pr] of Object.entries(state.props)) {
    if (pr.owner !== player.id) continue;
    if (!pr.mortgaged) assets += SPACES[pos].price;
    assets += buildingCost(pos, pr.level);
  }
  return Math.round(pct * player.cash + 0.1 * assets);
}

/** Cash that could be raised right now by selling every building and mortgaging every lot. */
export function liquidationValue(state, player) {
  let total = 0;
  for (const [pos, pr] of Object.entries(state.props)) {
    if (pr.owner !== player.id) continue;
    total += buildingCost(pos, pr.level) / 2; // transports/utilities have no house cost

    if (!pr.mortgaged) total += mortgageValue(pos);
  }
  return total;
}

export function propertiesOf(state, playerId) {
  return Object.keys(state.props)
    .map(Number)
    .filter((pos) => state.props[pos].owner === playerId);
}

/** §25 "richest player": cash + income every unmortgaged property would earn (utilities: owner rolls). */
export function richness(state, player, rollDice) {
  let total = player.cash;
  for (const pos of propertiesOf(state, player.id)) {
    const dice = SPACES[pos].type === 'utility' ? rollDice() : 7;
    // Evaluate as if the owner were free (end-of-game valuation).
    const saved = player.jail;
    player.jail = null;
    total += rentFor(state, pos, dice);
    player.jail = saved;
  }
  return total;
}
