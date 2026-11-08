// Authoritative game engine. One instance per running game.
// Section numbers (§) refer to the sections of the original rulebook the mechanics come from.
import { SPACES, CARDS, CITIES, DECK_IDS, PAWN_COLORS, START_CASH, PASS_START, JAIL_POS, JAIL_FEE, OWNABLE, ROLES } from '../shared/data.js';
import * as R from '../shared/rules.js';

export class GameError extends Error {}

const shuffle = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const money = (n) => `$${n}`;

export class Game {
  /**
   * @param {{players: {id,name,role,cpu}[], settings?: {mode?: 'A'|'B', timeLimitMin?: number}, rng?: () => number, now?: () => number}} opts
   */
  constructor({ players, settings = {}, rng = Math.random, now = () => Date.now() }) {
    this.rng = rng;
    this.now = now;
    this.events = [];
    const mode = settings.mode === 'B' ? 'B' : 'A';
    const timeLimitMin = Number(settings.timeLimitMin) || 0;

    // §6: the opening dice roll sets the order of play.
    const rolls = players.map((p) => ({ p, r: this.d6() + this.d6(), tie: rng() }));
    rolls.sort((a, b) => b.r - a.r || b.tie - a.tie);
    const colorIdx = { competitor: 0, monopolist: 0 };

    this.state = {
      status: 'playing',
      settings: { mode, timeLimitMin },
      startedAt: now(),
      endsAt: timeLimitMin ? now() + timeLimitMin * 60000 : null,
      players: rolls.map(({ p }, i) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        cpu: !!p.cpu,
        color: PAWN_COLORS[p.role][colorIdx[p.role]++ % 3],
        cash: START_CASH,
        pos: 0,
        jail: null, // { turns } while in Prison / Price War
        bankrupt: false,
        seat: i,
      })),
      props: Object.fromEntries(OWNABLE.map((pos) => [pos, { owner: null, level: 0, mortgaged: false }])),
      turn: null,
      decks: { monopolist: shuffle(DECK_IDS.monopolist, rng), competitor: shuffle(DECK_IDS.competitor, rng) },
      trades: [],
      tradeSeq: 0,
      log: [],
      logSeq: 0,
      lastCard: null,
      winner: null,
      standings: null,
      endReason: null,
    };
    this.state.turn = this.freshTurn(0, 1);
    this.log(`Turn order by dice: ${rolls.map((x) => `${x.p.name} (${x.r})`).join(', ')}`, 'system');
    this.emit({ type: 'turn', player: this.cur.id });
    this.startTurn();
  }

  // ---------- helpers ----------
  d6() {
    return 1 + Math.floor(this.rng() * 6);
  }
  get cur() {
    return this.state.players[this.state.turn.idx];
  }
  player(id) {
    return this.state.players.find((p) => p.id === id);
  }
  alive() {
    return this.state.players.filter((p) => !p.bankrupt);
  }
  cornerName(p) {
    return ROLES[p.role].corner;
  }
  freshTurn(idx, number) {
    return { idx, number, phase: 'roll', pending: null, extraPending: false, isExtra: false, jailed: false, dice: null };
  }
  log(text, kind = 'info') {
    this.state.log.push({ id: ++this.state.logSeq, text, kind });
    if (this.state.log.length > 150) this.state.log.shift();
  }
  emit(ev) {
    this.events.push(ev);
  }
  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  publicState() {
    const { decks, ...rest } = this.state;
    return { ...rest, deckCounts: { monopolist: decks.monopolist.length, competitor: decks.competitor.length } };
  }

  requireTurn(p, phases) {
    if (this.cur.id !== p.id) throw new GameError("It's not your turn");
    if (phases && !phases.includes(this.state.turn.phase)) throw new GameError("You can't do that right now");
  }

  // ---------- public entry point ----------
  act(playerId, action, args = {}) {
    if (this.state.status !== 'playing') throw new GameError('The game is over');
    const p = this.player(playerId);
    if (!p) throw new GameError('Unknown player');
    if (p.bankrupt) throw new GameError('You are bankrupt');
    const t = this.state.turn;
    switch (action) {
      case 'roll':
        this.requireTurn(p, ['roll']);
        return this.doRoll(p);
      case 'payJail':
        this.requireTurn(p, ['jail']);
        if (p.cash < JAIL_FEE) throw new GameError(`You need ${money(JAIL_FEE)} — mortgage or sell something first`);
        this.transfer(p, JAIL_FEE, null, 'release fee');
        this.log(`${p.name} paid ${money(JAIL_FEE)} to leave ${this.cornerName(p)}`);
        this.releaseJail(p);
        t.phase = 'roll';
        return;
      case 'rollJail':
        this.requireTurn(p, ['jail']);
        return this.doJailRoll(p);
      case 'buy':
        this.requireTurn(p, ['buy']);
        return this.doBuy(p);
      case 'decline': {
        this.requireTurn(p, ['buy']);
        const pos = t.pending.pos;
        this.log(`${p.name} declined to buy ${SPACES[pos].name}; it stays with the Treasury`);
        t.pending = null;
        return this.finishLanding();
      }
      case 'taxFlat':
      case 'taxPercent': {
        this.requireTurn(p, ['tax']);
        const amount = action === 'taxFlat' ? t.pending.flat : t.pending.percent;
        t.pending = null;
        this.log(`${p.name} pays Income Tax: ${money(amount)}${action === 'taxPercent' ? ' (percentage option)' : ''}`);
        if (this.charge(p, amount, null, 'Income Tax')) this.finishLanding();
        return;
      }
      case 'payDebt':
        this.requireTurn(p, ['debt']);
        return this.payDebt(p);
      case 'bankrupt':
        this.requireTurn(p, ['debt']);
        return this.declareBankrupt(p, t.pending.creditor);
      case 'endTurn':
        this.requireTurn(p, ['manage']);
        return this.nextTurn();
      case 'build':
        this.requireTurn(p, ['roll', 'jail', 'buy', 'tax', 'manage']);
        return this.build(p, Number(args.pos));
      case 'sell':
        return this.sell(p, Number(args.pos));
      case 'mortgage':
        return this.mortgage(p, Number(args.pos));
      case 'unmortgage':
        return this.unmortgage(p, Number(args.pos));
      case 'proposeTrade':
        return this.proposeTrade(p, args);
      case 'respondTrade':
        return this.respondTrade(p, args);
      case 'cancelTrade':
        return this.cancelTrade(p, args);
      default:
        throw new GameError(`Unknown action: ${action}`);
    }
  }

  // ---------- turn flow ----------
  startTurn() {
    const p = this.cur;
    const t = this.state.turn;
    t.phase = 'roll';
    if (!p.jail) return;
    if (p.jail.turns >= 2) {
      // §15 C1: no doubles in two tries -> pay before the third turn, then move normally.
      this.log(`${p.name} must pay ${money(JAIL_FEE)} to leave ${this.cornerName(p)} (third turn)`);
      if (this.charge(p, JAIL_FEE, null, 'release fee', 'jailFee')) {
        this.releaseJail(p);
        t.phase = 'roll';
      }
    } else {
      t.phase = 'jail';
    }
  }

  nextTurn() {
    if (this.state.endsAt && this.now() >= this.state.endsAt) return this.endTimed();
    const n = this.state.players.length;
    let idx = this.state.turn.idx;
    do idx = (idx + 1) % n;
    while (this.state.players[idx].bankrupt);
    this.state.turn = this.freshTurn(idx, this.state.turn.number + 1);
    this.emit({ type: 'turn', player: this.cur.id });
    this.startTurn();
  }

  doRoll(p) {
    const t = this.state.turn;
    const d = [this.d6(), this.d6()];
    const doubles = d[0] === d[1];
    t.dice = d;
    this.emit({ type: 'dice', player: p.id, dice: d });
    this.log(`${p.name} rolled ${d[0]} + ${d[1]}${doubles && !t.isExtra ? ' — doubles, one extra turn!' : ''}`);
    // §7: doubles give exactly one extra turn; doubles on the extra turn are ordinary.
    if (doubles && !t.isExtra) t.extraPending = true;
    this.moveSteps(p, d[0] + d[1]);
    this.landAndFinish(p);
  }

  doJailRoll(p) {
    const t = this.state.turn;
    const d = [this.d6(), this.d6()];
    t.dice = d;
    this.emit({ type: 'dice', player: p.id, dice: d });
    if (d[0] === d[1]) {
      // §15 C1 + D: doubles free you, you move, and doubles still earn the extra turn.
      this.log(`${p.name} rolled doubles (${d[0]} + ${d[1]}) and leaves ${this.cornerName(p)}!`);
      this.releaseJail(p);
      t.extraPending = true;
      this.moveSteps(p, d[0] + d[1]);
      return this.landAndFinish(p);
    }
    p.jail.turns += 1;
    this.log(`${p.name} rolled ${d[0]} + ${d[1]} — no doubles, stays in ${this.cornerName(p)} (try ${p.jail.turns} of 2)`);
    t.phase = 'manage';
  }

  releaseJail(p) {
    p.jail = null;
    this.emit({ type: 'release', player: p.id });
  }

  moveSteps(p, steps) {
    const from = p.pos;
    const to = (from + steps) % 40;
    p.pos = to;
    this.emit({ type: 'move', player: p.id, from, to, steps });
    if (from + steps >= 40) {
      // §14: collect $100 for landing on or passing START.
      p.cash += PASS_START;
      this.emit({ type: 'pay', from: null, to: p.id, amount: PASS_START, reason: 'START' });
      this.log(`${p.name} passed START and collected ${money(PASS_START)}`);
    }
  }

  sendToJail(p) {
    const t = this.state.turn;
    const from = p.pos;
    p.pos = JAIL_POS;
    p.jail = { turns: 0 };
    t.jailed = true;
    t.extraPending = false;
    this.emit({ type: 'move', player: p.id, from, to: JAIL_POS, direct: true });
    this.emit({ type: 'jail', player: p.id });
    this.log(
      p.role === 'monopolist'
        ? `${p.name} goes to PRISON — no rent collected while inside`
        : `${p.name} goes to PRICE WAR — still collects rent`,
      'alert',
    );
  }

  landAndFinish(p) {
    if (this.land(p) === 'done') this.finishLanding();
  }

  /** Resolve the space the current player is on. Returns 'done' or 'wait' (needs a decision). */
  land(p) {
    const sp = SPACES[p.pos];
    const t = this.state.turn;
    switch (sp.type) {
      case 'street':
      case 'transport':
      case 'utility':
        return this.landOwnable(p, sp);
      case 'card':
        return this.drawCard(p);
      case 'incomeTax':
        t.phase = 'tax';
        t.pending = { flat: 200, percent: R.incomeTaxPercent(this.state, p) };
        return 'wait';
      case 'propertyTax':
        this.log(`${p.name} pays Property Tax: ${money(sp.amount)}`);
        return this.charge(p, sp.amount, null, 'Property Tax') ? 'done' : 'wait';
      case 'fund':
        if (p.role === 'competitor') {
          // §21: competitors roll one die: 1 -> $25, 2 -> $50.
          const die = this.d6();
          this.emit({ type: 'die', player: p.id, value: die });
          const grant = die === 1 ? 25 : die === 2 ? 50 : 0;
          if (grant) {
            p.cash += grant;
            this.emit({ type: 'pay', from: null, to: p.id, amount: grant, reason: 'Fund grant' });
          }
          this.log(`${p.name} rolled a ${die} at the Fund${grant ? ` and receives a ${money(grant)} grant` : ' — no grant'}`);
          return 'done';
        }
        this.log(`${p.name} pays ${money(160)} into the Fair Competition Fund`);
        return this.charge(p, 160, null, 'Fair Competition Fund') ? 'done' : 'wait';
      case 'goToJail':
        this.sendToJail(p);
        return 'done';
      default:
        return 'done';
    }
  }

  landOwnable(p, sp) {
    const t = this.state.turn;
    const pr = this.state.props[sp.pos];
    if (!pr.owner) {
      t.phase = 'buy';
      t.pending = { pos: sp.pos };
      return 'wait';
    }
    if (pr.owner === p.id) return 'done';
    const owner = this.player(pr.owner);
    if (pr.mortgaged) {
      this.log(`${sp.name} is mortgaged — no rent`);
      return 'done';
    }
    let dice = 7;
    if (sp.type === 'utility') {
      // §20: the visitor throws the dice to set the charge.
      const d = [this.d6(), this.d6()];
      dice = d[0] + d[1];
      this.emit({ type: 'dice', player: p.id, dice: d, purpose: 'utility' });
    }
    const amount = R.rentFor(this.state, sp.pos, dice);
    if (amount === 0) {
      this.log(`${owner.name} is in Prison and cannot collect rent on ${sp.name}`);
      return 'done';
    }
    this.log(`${p.name} owes ${owner.name} ${money(amount)} for ${sp.name}`);
    return this.charge(p, amount, owner.id, `${sp.name}`) ? 'done' : 'wait';
  }

  drawCard(p) {
    const deck = this.state.decks[p.role];
    const id = deck.shift();
    deck.push(id); // §16: card goes to the bottom of the deck
    const card = CARDS[id];
    this.state.lastCard = { id, player: p.id, n: (this.state.lastCard?.n || 0) + 1 };
    this.emit({ type: 'card', player: p.id, card: id });
    this.log(`${p.name} drew a ${ROLES[p.role].label} card: ${card.action}`, 'card');
    const e = card.effect;
    switch (e.kind) {
      case 'collect':
        p.cash += e.amount;
        this.emit({ type: 'pay', from: null, to: p.id, amount: e.amount, reason: 'card' });
        return 'done';
      case 'pay':
        return this.charge(p, e.amount, null, 'card') ? 'done' : 'wait';
      case 'collectAll':
        for (const q of this.alive().filter((q) => q.role === p.role)) {
          q.cash += e.amount;
          this.emit({ type: 'pay', from: null, to: q.id, amount: e.amount, reason: 'card' });
        }
        return 'done';
      case 'rollCollect': {
        const d = [this.d6(), this.d6()];
        this.emit({ type: 'dice', player: p.id, dice: d, purpose: 'card' });
        const ok = d[0] + d[1] >= e.min;
        this.log(`${p.name} rolled ${d[0] + d[1]} — ${ok ? `collects ${money(e.amount)}` : 'nothing happens'}`);
        if (ok) {
          p.cash += e.amount;
          this.emit({ type: 'pay', from: null, to: p.id, amount: e.amount, reason: 'card' });
        }
        return 'done';
      }
      case 'jail':
        this.sendToJail(p);
        return 'done';
      case 'move': {
        const steps = (e.to - p.pos + 40) % 40;
        this.moveSteps(p, steps);
        return this.land(p);
      }
      default:
        return 'done';
    }
  }

  finishLanding() {
    if (this.state.status !== 'playing') return;
    const t = this.state.turn;
    t.pending = null;
    if (t.jailed) {
      t.phase = 'manage';
    } else if (t.extraPending) {
      t.extraPending = false;
      t.isExtra = true;
      t.phase = 'roll';
    } else {
      t.phase = 'manage';
    }
  }

  // ---------- money ----------
  transfer(p, amount, creditorId, reason) {
    p.cash -= amount;
    if (creditorId) this.player(creditorId).cash += amount;
    this.emit({ type: 'pay', from: p.id, to: creditorId || null, amount, reason });
  }

  /** Pay or enter the debt phase. `after` says how to continue once the debt is paid. */
  charge(p, amount, creditorId, reason, after = 'finish') {
    if (p.cash >= amount) {
      this.transfer(p, amount, creditorId, reason);
      return true;
    }
    const t = this.state.turn;
    t.phase = 'debt';
    t.pending = { amount, creditor: creditorId || null, reason, after };
    this.log(`${p.name} owes ${money(amount)} (${reason}) but has only ${money(p.cash)} — must raise cash or go bankrupt`, 'alert');
    return false;
  }

  payDebt(p) {
    const t = this.state.turn;
    const { amount, creditor, reason, after } = t.pending;
    if (p.cash < amount) throw new GameError(`You still need ${money(amount - p.cash)} more`);
    this.transfer(p, amount, creditor, reason);
    this.log(`${p.name} paid ${money(amount)} (${reason})`);
    t.pending = null;
    if (after === 'jailFee') {
      this.releaseJail(p);
      t.phase = 'roll';
    } else {
      this.finishLanding();
    }
  }

  declareBankrupt(p, creditorId) {
    // §24: buildings go back to the Treasurer at half price first.
    let raised = 0;
    const owned = R.propertiesOf(this.state, p.id);
    for (const pos of owned) {
      const pr = this.state.props[pos];
      if (pr.level) {
        raised += (pr.level * SPACES[pos].house) / 2;
        pr.level = 0;
        this.emit({ type: 'build', pos, level: 0 });
      }
    }
    p.cash += raised;
    const cred = creditorId ? this.player(creditorId) : null;
    if (cred && !cred.bankrupt) {
      cred.cash += p.cash;
      this.emit({ type: 'pay', from: p.id, to: cred.id, amount: p.cash, reason: 'bankruptcy' });
      for (const pos of owned) this.state.props[pos].owner = cred.id; // mortgages stay in effect
      this.log(`${p.name} is BANKRUPT — ${cred.name} takes their cash and ${owned.length} properties`, 'alert');
    } else {
      for (const pos of owned) Object.assign(this.state.props[pos], { owner: null, mortgaged: false, level: 0 });
      this.log(`${p.name} is BANKRUPT — the Treasurer takes everything; properties return to the market`, 'alert');
    }
    p.cash = 0;
    p.bankrupt = true;
    p.jail = null;
    this.state.trades = this.state.trades.filter((tr) => tr.from !== p.id && tr.to !== p.id);
    this.emit({ type: 'bankrupt', player: p.id });
    if (!this.checkEnd()) this.nextTurn();
  }

  // ---------- buildings & mortgages ----------
  doBuy(p) {
    const t = this.state.turn;
    const pos = t.pending.pos;
    const sp = SPACES[pos];
    if (p.cash < sp.price) throw new GameError(`You need ${money(sp.price)} — mortgage or sell something first`);
    this.transfer(p, sp.price, null, `bought ${sp.name}`);
    this.state.props[pos].owner = p.id;
    this.emit({ type: 'buy', player: p.id, pos });
    this.log(`${p.name} bought ${sp.name} for ${money(sp.price)}`);
    t.pending = null;
    this.finishLanding();
  }

  build(p, pos) {
    const chk = R.canBuild(this.state, p, pos);
    if (!chk.ok) throw new GameError(chk.reason);
    const pr = this.state.props[pos];
    p.cash -= chk.cost;
    pr.level += 1;
    this.emit({ type: 'build', pos, level: pr.level, player: p.id });
    this.log(`${p.name} built ${chk.apartment ? 'an APARTMENT' : `house #${pr.level}`} on ${SPACES[pos].name} (${money(chk.cost)})`);
  }

  sell(p, pos) {
    const chk = R.canSell(this.state, p, pos);
    if (!chk.ok) throw new GameError(chk.reason);
    const pr = this.state.props[pos];
    pr.level -= 1;
    p.cash += chk.refund;
    this.emit({ type: 'build', pos, level: pr.level, player: p.id });
    this.log(`${p.name} sold a building on ${SPACES[pos].name} back to the Treasurer for ${money(chk.refund)}`);
  }

  mortgage(p, pos) {
    const chk = R.canMortgage(this.state, p, pos);
    if (!chk.ok) throw new GameError(chk.reason);
    this.state.props[pos].mortgaged = true;
    p.cash += chk.value;
    this.emit({ type: 'mortgage', pos, mortgaged: true });
    this.log(`${p.name} mortgaged ${SPACES[pos].name} for ${money(chk.value)}`);
  }

  unmortgage(p, pos) {
    const chk = R.canUnmortgage(this.state, p, pos);
    if (!chk.ok) throw new GameError(chk.reason);
    this.state.props[pos].mortgaged = false;
    p.cash -= chk.cost;
    this.emit({ type: 'mortgage', pos, mortgaged: false });
    this.log(`${p.name} paid off the mortgage on ${SPACES[pos].name} (${money(chk.cost)})`);
  }

  // ---------- trading (§23) ----------
  normalizeSide(side = {}) {
    const cash = Math.max(0, Math.floor(Number(side.cash) || 0));
    const props = [...new Set((side.props || []).map(Number))].filter((n) => this.state.props[n]);
    return { cash, props };
  }

  validateTrade(tr) {
    const from = this.player(tr.from);
    const to = this.player(tr.to);
    if (!from || !to || from.bankrupt || to.bankrupt) return 'Player is no longer in the game';
    if (from.id === to.id) return 'You cannot trade with yourself';
    if (!tr.give.cash && !tr.give.props.length && !tr.get.cash && !tr.get.props.length) return 'Empty offer';
    for (const [side, owner] of [
      [tr.give, from],
      [tr.get, to],
    ]) {
      for (const pos of side.props) {
        const pr = this.state.props[pos];
        if (pr.owner !== owner.id) return `${owner.name} no longer owns ${SPACES[pos].name}`;
        if (pr.level > 0) return `Sell the buildings on ${SPACES[pos].name} before trading it`;
      }
    }
    if (from.cash < tr.give.cash) return `${from.name} doesn't have ${money(tr.give.cash)}`;
    if (to.cash < tr.get.cash) return `${to.name} doesn't have ${money(tr.get.cash)}`;
    // A monopolist may not end up with buildings in a city they no longer monopolize.
    const props = structuredClone(this.state.props);
    for (const pos of tr.give.props) props[pos].owner = to.id;
    for (const pos of tr.get.props) props[pos].owner = from.id;
    const sim = { ...this.state, props };
    for (const pl of [from, to]) {
      if (pl.role !== 'monopolist') continue;
      for (const city of Object.keys(CITIES)) {
        if (R.cityHasBuildings(sim, pl.id, city) && !R.hasMonopoly(sim, pl, city))
          return `${pl.name} would keep buildings in ${city} without a monopoly — sell them first`;
      }
    }
    return null;
  }

  proposeTrade(p, args) {
    const tr = {
      id: ++this.state.tradeSeq,
      from: p.id,
      to: String(args.to),
      give: this.normalizeSide(args.give),
      get: this.normalizeSide(args.get),
    };
    const err = this.validateTrade(tr);
    if (err) throw new GameError(err);
    // One open offer per pair: a new one replaces the old.
    this.state.trades = this.state.trades.filter((x) => !(x.from === tr.from && x.to === tr.to));
    this.state.trades.push(tr);
    this.emit({ type: 'trade', trade: tr.id });
    this.log(`${p.name} offered a trade to ${this.player(tr.to).name}: ${this.describeTrade(tr)}`, 'trade');
    return tr;
  }

  describeTrade(tr) {
    const side = (s) => [...s.props.map((pos) => SPACES[pos].name), ...(s.cash ? [money(s.cash)] : [])].join(' + ') || 'nothing';
    return `gives ${side(tr.give)} for ${side(tr.get)}`;
  }

  respondTrade(p, { id, accept }) {
    const tr = this.state.trades.find((x) => x.id === Number(id));
    if (!tr || tr.to !== p.id) throw new GameError('That offer is no longer available');
    this.state.trades = this.state.trades.filter((x) => x !== tr);
    const from = this.player(tr.from);
    if (!accept) {
      this.log(`${p.name} declined ${from.name}'s offer`, 'trade');
      return;
    }
    const err = this.validateTrade(tr);
    if (err) throw new GameError(err);
    for (const pos of tr.give.props) this.state.props[pos].owner = p.id;
    for (const pos of tr.get.props) this.state.props[pos].owner = from.id;
    from.cash += tr.get.cash - tr.give.cash;
    p.cash += tr.give.cash - tr.get.cash;
    this.emit({ type: 'tradeDone', from: from.id, to: p.id });
    this.log(`${p.name} accepted ${from.name}'s offer: ${from.name} ${this.describeTrade(tr)}`, 'trade');
    // Drop other offers that can no longer be honoured.
    this.state.trades = this.state.trades.filter((x) => !this.validateTrade(x));
  }

  cancelTrade(p, { id }) {
    const tr = this.state.trades.find((x) => x.id === Number(id));
    if (!tr || tr.from !== p.id) throw new GameError('No such offer');
    this.state.trades = this.state.trades.filter((x) => x !== tr);
    this.log(`${p.name} withdrew their offer`, 'trade');
  }

  // ---------- game end ----------
  checkEnd() {
    const alive = this.alive();
    if (alive.length <= 1) {
      return this.endGame(alive[0] || null, 'Every other player went bankrupt', this.standings(alive));
    }
    if (this.state.settings.mode === 'B') {
      const comps = alive.filter((p) => p.role === 'competitor');
      const monos = alive.filter((p) => p.role === 'monopolist');
      if (!comps.length || !monos.length) {
        const st = this.standings(alive);
        const reason = comps.length ? 'All monopolists are bankrupt — richest competitor wins' : 'All competitors are eliminated — richest monopolist wins';
        return this.endGame(this.player(st[0].id), reason, st);
      }
    }
    return false;
  }

  /** §25 scoring (cash + income from unmortgaged property). `keep` scales cash for the timed game. */
  standings(players, keep = null) {
    return players
      .map((p) => {
        const income = R.richness(this.state, p, () => this.d6() + this.d6()) - p.cash;
        const cashPart = keep ? Math.round(p.cash * keep[p.role]) : p.cash;
        return { id: p.id, name: p.name, role: p.role, cash: cashPart, income, score: cashPart + income };
      })
      .sort((a, b) => b.score - a.score);
  }

  endTimed() {
    // Two-Hour Game: competitors keep 10% of cash, monopolists 20%, then collect one round of rent.
    const st = this.standings(this.alive(), { competitor: 0.1, monopolist: 0.2 });
    return this.endGame(this.player(st[0].id), 'Time is up — Two-Hour Game scoring', st);
  }

  endGame(winner, reason, standings) {
    this.state.status = 'ended';
    this.state.turn.phase = 'ended';
    this.state.winner = winner ? winner.id : null;
    this.state.endReason = reason;
    this.state.standings = standings;
    this.emit({ type: 'gameOver', winner: this.state.winner });
    this.log(`GAME OVER — ${winner ? `${winner.name} wins!` : 'no winner'} (${reason})`, 'system');
    return true;
  }
}
