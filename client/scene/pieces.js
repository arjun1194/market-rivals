// Everything that sits on the table: pawns, dice, buildings, owner strips, decks, cards, seats & money.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SPACES, CARDS } from '/shared/data.js';
import { maxLevel, isApartment } from '/shared/rules.js';
import { BOARD_TOP, tween, wait, ease, pawnSpot, buildingSpot, ownerStripFrame, spaceCenter, localToWorld } from './world.js';
import { CELL, CORNER, drawCardFace, drawCardBack, drawDeedCard, drawDieFace, drawNameplate, DECK_COLORS } from './art.js';

const texCache = new Map();
function canvasTex(key, draw) {
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(draw());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

export const DECK_POS = { competitor: { x: -4.3, z: -4.3 }, monopolist: { x: 4.3, z: 4.3 } };
const CARD_W = 3.2;
const CARD_H = 2.1;

// ---------- pawn ----------
function makePawn(color) {
  const pts = [
    [0, 0], [0.44, 0], [0.46, 0.05], [0.44, 0.12], [0.34, 0.17], [0.25, 0.24], [0.19, 0.4], [0.155, 0.62],
    [0.15, 0.7], [0.25, 0.74], [0.26, 0.79], [0.17, 0.83], [0.12, 0.86], [0, 0.86],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), mat);
  head.position.y = 1.02;
  for (const m of [body, head]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  g.scale.setScalar(1.05);
  return g;
}

// ---------- buildings ----------
const houseGeo = (() => {
  const body = new THREE.BoxGeometry(0.3, 0.22, 0.26);
  body.translate(0, 0.11, 0);
  return body;
})();
const roofGeo = (() => {
  const shape = new THREE.Shape([new THREE.Vector2(-0.19, 0), new THREE.Vector2(0.19, 0), new THREE.Vector2(0, 0.17)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  g.translate(0, 0.22, -0.15);
  return g;
})();
const aptGeo = (() => {
  const g = new THREE.BoxGeometry(0.62, 0.72, 0.42);
  g.translate(0, 0.36, 0);
  return g;
})();
function windowTexture() {
  return canvasTex('apt-windows', () => {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 160);
    c.fillStyle = '#2b3445';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) c.fillRect(16 + k * 36, 14 + r * 36, 22, 24);
    return cv;
  });
}

// ---------- money ----------
const BILLS = [
  { v: 500, color: '#e59a3c' },
  { v: 100, color: '#d9cf8f' },
  { v: 50, color: '#8fb6e0' },
  { v: 10, color: '#f2d24f' },
  { v: 5, color: '#f0a7bf' },
  { v: 1, color: '#f4f1e8' },
];
function billTop(v, color) {
  return canvasTex(`bill-${v}`, () => {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 6;
    c.strokeRect(10, 10, 236, 108);
    c.fillStyle = '#2a2a2a';
    c.font = `900 60px 'Avenir Next', Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(`$${v}`, 128, 66);
    return cv;
  });
}
function breakdown(cash) {
  // Spread cash over denominations the way players actually hold it (lots of small bills too).
  let rest = Math.max(0, Math.floor(cash));
  const share = { 500: 0.65, 100: 0.7, 50: 0.6, 10: 0.75, 5: 0.6, 1: 1 };
  const out = {};
  for (const { v } of BILLS) {
    out[v] = Math.floor((rest * share[v]) / v);
    rest -= out[v] * v;
  }
  return out;
}

export class Pieces {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.pawns = new Map(); // playerId -> group
    this.seats = new Map(); // playerId -> {group, angle, ...}
    this.buildings = new Map(); // pos -> group
    this.strips = new Map(); // pos -> mesh
    this.mortgageMarks = new Map();
    this.displayPos = new Map(); // playerId -> {pos, kind}
    this.onFocus = null; // (point, ms) => void — lets the camera director glance at the dice
    this.makeDice();
    this.makeDecks();
    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.64, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.visible = false;
    this.scene.add(this.turnRing);
    this.turnId = null;
    world.onFrame.push((now) => {
      if (this.turnId && this.pawns.has(this.turnId)) {
        const p = this.pawns.get(this.turnId).position;
        this.turnRing.position.set(p.x, p.y + 0.02, p.z);
        this.turnRing.scale.setScalar(1 + Math.sin(now / 250) * 0.08);
      }
    });
  }

  // ---------- players ----------
  seatSlots(n) {
    if (n <= 4) return [{ a: 0, off: 0 }, { a: Math.PI, off: 0 }, { a: Math.PI / 2, off: 0 }, { a: -Math.PI / 2, off: 0 }];
    return [
      { a: 0, off: -6 }, { a: Math.PI, off: -6 }, { a: Math.PI / 2, off: 0 },
      { a: 0, off: 6 }, { a: Math.PI, off: 6 }, { a: -Math.PI / 2, off: 0 },
    ];
  }

  syncPlayers(state) {
    const slots = this.seatSlots(state.players.length);
    for (const p of state.players) {
      if (!this.pawns.has(p.id)) {
        const pawn = makePawn(p.color);
        this.scene.add(pawn);
        this.pawns.set(p.id, pawn);
      }
      if (!this.seats.has(p.id)) {
        const slot = slots[p.seat % slots.length];
        const group = new THREE.Group();
        const R = 13.5;
        group.position.set(Math.sin(slot.a) * R + Math.cos(slot.a) * slot.off, 0.001, Math.cos(slot.a) * R - Math.sin(slot.a) * slot.off);
        group.rotation.y = slot.a;
        this.scene.add(group);
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(4.2, 0.93),
          new THREE.MeshStandardMaterial({ map: canvasTex(`plate-${p.id}`, () => drawNameplate(p.name, p.role, p.color)), roughness: 0.6 }),
        );
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(0, 0.02, 2.2);
        plate.receiveShadow = true;
        group.add(plate);
        const money = new THREE.Group();
        money.position.set(0, 0, 1.0);
        group.add(money);
        const deeds = new THREE.Group();
        deeds.position.set(0, 0, -0.45);
        group.add(deeds);
        this.seats.set(p.id, { group, angle: slot.a, money, deeds, plate, cash: null, deedKey: '' });
      }
      const pawn = this.pawns.get(p.id);
      pawn.visible = !p.bankrupt;
    }
  }

  seatAngle(id) {
    return this.seats.get(id)?.angle ?? 0;
  }

  /** Target spot (x,z) for every pawn given the state. */
  layout(state) {
    const groups = new Map();
    const res = new Map();
    for (const p of state.players) {
      if (p.bankrupt) continue;
      const kind = p.pos === 10 && p.jail ? (p.role === 'monopolist' ? 'prison' : 'pricewar') : 'visit';
      const key = `${p.pos}:${kind}`;
      const slot = groups.get(key) || 0;
      groups.set(key, slot + 1);
      res.set(p.id, { pos: p.pos, kind, spot: pawnSpot(p.pos, slot, kind) });
    }
    return res;
  }

  placePawns(state) {
    for (const [id, l] of this.layout(state)) {
      const pawn = this.pawns.get(id);
      pawn.position.set(l.spot.x, BOARD_TOP, l.spot.z);
      this.displayPos.set(id, l);
    }
  }

  async movePawn(id, ev, state, sfx) {
    const pawn = this.pawns.get(id);
    if (!pawn) return;
    let final = this.layout(state).get(id);
    if (final && final.pos !== ev.to) final = null;
    if (ev.direct) {
      final ??= { spot: pawnSpot(ev.to, 0, 'visit') };
      const from = pawn.position.clone();
      const to = final ? new THREE.Vector3(final.spot.x, BOARD_TOP, final.spot.z) : from;
      await tween(950, (t) => {
        pawn.position.lerpVectors(from, to, t);
        pawn.position.y = BOARD_TOP + Math.sin(t * Math.PI) * 4;
        pawn.rotation.y = t * Math.PI * 2;
      });
      pawn.rotation.y = 0;
      sfx?.('thud');
      return;
    }
    let pos = ev.from;
    for (let i = 0; i < ev.steps; i++) {
      pos = (pos + 1) % 40;
      const last = i === ev.steps - 1;
      const spot = last && final ? final.spot : pawnSpot(pos, 0, 'visit');
      const from = pawn.position.clone();
      const to = new THREE.Vector3(spot.x, BOARD_TOP, spot.z);
      await tween(last ? 260 : 190, (t) => {
        pawn.position.lerpVectors(from, to, t);
        pawn.position.y = BOARD_TOP + Math.sin(t * Math.PI) * 0.7;
      }, ease.linear);
      sfx?.('step');
    }
  }

  setTurn(id) {
    this.turnId = id;
    this.turnRing.visible = !!id;
  }

  // ---------- dice ----------
  makeDice() {
    const order = [2, 5, 1, 6, 3, 4]; // +x, -x, +y, -y, +z, -z
    const mats = order.map((v) => new THREE.MeshStandardMaterial({ map: canvasTex(`die-${v}`, () => drawDieFace(v)), roughness: 0.35 }));
    const geo = new RoundedBoxGeometry(0.85, 0.85, 0.85, 4, 0.12);
    this.dice = [0, 1].map((i) => {
      const m = new THREE.Mesh(geo, mats);
      m.castShadow = true;
      m.position.set(-1.2 + i * 1.4, BOARD_TOP + 0.425, 1.8);
      m.rotation.y = 0.4 * i;
      this.scene.add(m);
      return m;
    });
  }

  faceQuat(v) {
    const e = {
      1: new THREE.Euler(0, 0, 0),
      6: new THREE.Euler(Math.PI, 0, 0),
      2: new THREE.Euler(0, 0, Math.PI / 2),
      5: new THREE.Euler(0, 0, -Math.PI / 2),
      3: new THREE.Euler(-Math.PI / 2, 0, 0),
      4: new THREE.Euler(Math.PI / 2, 0, 0),
    }[v];
    return new THREE.Quaternion().setFromEuler(e);
  }

  /** Throw the dice from the given seat angle so they land showing `values`. */
  async rollDice(values, fromAngle = 0, sfx) {
    const dice = values.length === 1 ? [this.dice[0]] : this.dice;
    if (values.length === 1) this.dice[1].visible = false;
    const restCenter = new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
    this.onFocus?.(restCenter, 1750);
    const throwFrom = new THREE.Vector3(Math.sin(fromAngle) * 11, 3.5, Math.cos(fromAngle) * 11);
    const jobs = dice.map((d, i) => {
      const lateral = new THREE.Vector3(Math.cos(fromAngle), 0, -Math.sin(fromAngle)).multiplyScalar(i === 0 ? -0.75 : 0.75);
      const start = throwFrom.clone().add(lateral);
      const end = restCenter.clone().add(lateral);
      end.y = BOARD_TOP + 0.425;
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
      const qEnd = yaw.multiply(this.faceQuat(values[i]));
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      const spin = 10 + Math.random() * 6;
      d.visible = true;
      return tween(1250 + i * 90, (t) => {
        d.position.lerpVectors(start, end, ease.out(t));
        const bounce = Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) ** 1.6 * 3;
        d.position.y = end.y + bounce + (1 - t) * (start.y - end.y) * 0.3;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, spin * (1 - ease.out(t)));
        d.quaternion.copy(q.multiply(qEnd));
      }, ease.linear);
    });
    sfx?.('dice');
    await Promise.all(jobs);
    await wait(250);
  }

  // ---------- decks & cards ----------
  makeDecks() {
    this.decks = {};
    for (const role of ['competitor', 'monopolist']) {
      const back = new THREE.MeshStandardMaterial({ map: canvasTex(`back-${role}`, () => drawCardBack(role)), roughness: 0.5 });
      const edge = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.8 });
      const stack = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 0.3, CARD_H), [edge, edge, back, edge, edge, edge]);
      const { x, z } = DECK_POS[role];
      stack.position.set(x, BOARD_TOP + 0.15, z);
      stack.rotation.y = Math.PI / 4;
      stack.castShadow = true;
      stack.receiveShadow = true;
      this.scene.add(stack);
      this.decks[role] = stack;
    }
  }

  async showCard(cardId, camera, sfx) {
    const card = CARDS[cardId];
    const role = card.deck;
    const g = new THREE.Group();
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshStandardMaterial({ map: canvasTex(`face-${cardId}`, () => drawCardFace(card)), roughness: 0.5 }),
    );
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W, CARD_H),
      new THREE.MeshStandardMaterial({ map: canvasTex(`back-${role}`, () => drawCardBack(role)), roughness: 0.5 }),
    );
    back.rotation.y = Math.PI;
    front.castShadow = back.castShadow = true;
    g.add(front, back);
    const deck = this.decks[role];
    g.position.set(deck.position.x, BOARD_TOP + 0.32, deck.position.z);
    // face down, aligned with the deck
    g.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
    this.scene.add(g);
    sfx?.('card');

    const startPos = g.position.clone();
    const startQ = g.quaternion.clone();
    // Hold the card in front of the camera, sized to fit the screen (wider phones vs. tall phones),
    // and keep it there even while the camera is still gliding.
    const tanV = Math.tan((this.world.baseFov * Math.PI) / 360);
    const dist = Math.max(CARD_W / (0.86 * 2 * tanV * this.world.viewAspect), CARD_H / (0.38 * 2 * tanV), 4);
    const dir = new THREE.Vector3();
    const inFront = () => camera.position.clone().add(camera.getWorldDirection(dir).multiplyScalar(dist));
    // lift
    await tween(260, (t) => {
      g.position.y = startPos.y + t * 1.2;
    });
    const liftPos = g.position.clone();
    await tween(700, (t) => {
      g.position.lerpVectors(liftPos, inFront(), t);
      g.quaternion.slerpQuaternions(startQ, camera.quaternion, t);
    }, ease.inOut);
    await tween(2300, () => {
      g.position.copy(inFront());
      g.quaternion.copy(camera.quaternion);
    }, ease.linear);
    const fromPos = g.position.clone();
    const fromQ = g.quaternion.clone();
    const homeQ = startQ;
    await tween(550, (t) => {
      g.position.lerpVectors(fromPos, startPos, t);
      g.quaternion.slerpQuaternions(fromQ, homeQ, t);
      g.scale.setScalar(1 - t * 0.15);
    });
    this.scene.remove(g);
    front.material.dispose();
    back.material.dispose();
  }

  // ---------- buildings, strips, mortgages ----------
  syncBoard(state) {
    for (const [posStr, pr] of Object.entries(state.props)) {
      const pos = Number(posStr);
      const owner = pr.owner && state.players.find((p) => p.id === pr.owner);
      // owner strip
      const key = owner ? `${owner.color}|${pr.mortgaged}` : '';
      let strip = this.strips.get(pos);
      if (!owner) {
        if (strip) strip.visible = false;
      } else {
        if (!strip) {
          const f = ownerStripFrame(pos);
          strip = new THREE.Mesh(new THREE.BoxGeometry(pos % 10 === 0 ? CORNER : CELL * 0.92, 0.04, 0.12), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
          strip.position.set(f.x, BOARD_TOP + 0.02, f.z);
          strip.rotation.y = f.yaw;
          strip.receiveShadow = true;
          this.scene.add(strip);
          this.strips.set(pos, strip);
        }
        strip.visible = true;
        if (strip.userData.key !== key) {
          strip.material.color.set(pr.mortgaged ? '#8b8b8b' : owner.color);
          strip.userData.key = key;
        }
      }
      // mortgage overlay
      let mark = this.mortgageMarks.get(pos);
      if (pr.mortgaged) {
        if (!mark) {
          const c = spaceCenter(pos);
          mark = new THREE.Mesh(
            new THREE.PlaneGeometry(CELL, CORNER),
            new THREE.MeshBasicMaterial({ map: canvasTex('mortgaged', drawMortgaged), transparent: true, depthWrite: false }),
          );
          mark.rotation.set(-Math.PI / 2, 0, c.yaw);
          mark.position.set(c.x, BOARD_TOP + 0.011, c.z);
          this.scene.add(mark);
          this.mortgageMarks.set(pos, mark);
        }
        mark.visible = true;
      } else if (mark) mark.visible = false;
      // buildings
      const bkey = owner && pr.level ? `${owner.id}|${owner.role}|${pr.level}` : '';
      let bg = this.buildings.get(pos);
      if (bg?.userData.key === bkey) continue;
      if (bg) {
        this.scene.remove(bg);
        this.buildings.delete(pos);
      }
      if (!bkey) continue;
      bg = new THREE.Group();
      bg.userData.key = bkey;
      const roofMat = new THREE.MeshStandardMaterial({ color: owner.color, roughness: 0.45 });
      if (isApartment(owner.role, pr.level)) {
        const f = buildingSpot(pos, 0, 1);
        const mats = [
          new THREE.MeshStandardMaterial({ color: owner.color, map: windowTexture(), roughness: 0.5 }),
          new THREE.MeshStandardMaterial({ color: owner.color, map: windowTexture(), roughness: 0.5 }),
          new THREE.MeshStandardMaterial({ color: '#f6f0e1', roughness: 0.6 }),
          roofMat,
          new THREE.MeshStandardMaterial({ color: owner.color, map: windowTexture(), roughness: 0.5 }),
          new THREE.MeshStandardMaterial({ color: owner.color, map: windowTexture(), roughness: 0.5 }),
        ];
        const m = new THREE.Mesh(aptGeo, mats);
        m.position.set(f.x, BOARD_TOP, f.z);
        m.rotation.y = f.yaw;
        m.castShadow = true;
        bg.add(m);
      } else {
        const bodyMat = new THREE.MeshStandardMaterial({ color: '#f6f0e1', roughness: 0.6 });
        for (let i = 0; i < pr.level; i++) {
          const f = buildingSpot(pos, i, Math.max(pr.level, 1));
          const h = new THREE.Group();
          const body = new THREE.Mesh(houseGeo, bodyMat);
          const roof = new THREE.Mesh(roofGeo, roofMat);
          body.castShadow = roof.castShadow = true;
          h.add(body, roof);
          h.position.set(f.x, BOARD_TOP, f.z);
          h.rotation.y = f.yaw;
          bg.add(h);
        }
      }
      this.scene.add(bg);
      this.buildings.set(pos, bg);
      // pop-in animation
      bg.scale.setScalar(0.01);
      tween(350, (t) => bg.scale.setScalar(Math.max(0.01, t)), ease.outBack);
    }
  }

  // ---------- seats: money stacks and deed cards ----------
  syncSeats(state) {
    for (const p of state.players) {
      const seat = this.seats.get(p.id);
      if (!seat) continue;
      seat.plate.material.opacity = p.bankrupt ? 0.4 : 1;
      seat.plate.material.transparent = p.bankrupt;
      if (seat.cash !== p.cash) {
        seat.cash = p.cash;
        seat.money.clear();
        const counts = breakdown(p.cash);
        BILLS.forEach((b, i) => {
          const n = Math.min(30, counts[b.v]);
          const x = -3.4 + i * 1.36;
          if (n === 0) return;
          const side = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.9 });
          const top = new THREE.MeshStandardMaterial({ map: billTop(b.v, b.color), roughness: 0.85 });
          const h = 0.02 + n * 0.028;
          const stack = new THREE.Mesh(new THREE.BoxGeometry(1.25, h, 0.66), [side, side, top, side, side, side]);
          stack.position.set(x, h / 2, 0);
          stack.rotation.y = (Math.sin(i * 12.9 + n) * 0.06);
          stack.castShadow = true;
          stack.receiveShadow = true;
          seat.money.add(stack);
        });
      }
      const mine = Object.entries(state.props)
        .filter(([, pr]) => pr.owner === p.id)
        .map(([pos, pr]) => [Number(pos), pr.mortgaged]);
      mine.sort((a, b) => a[0] - b[0]);
      const key = mine.map(([pos, m]) => `${pos}${m ? 'm' : ''}`).join(',');
      if (key !== seat.deedKey) {
        seat.deedKey = key;
        seat.deeds.clear();
        const cols = 7;
        mine.forEach(([pos, mortgaged], i) => {
          const sp = SPACES[pos];
          const tex = canvasTex(`deed-${pos}-${mortgaged}`, () => drawDeedCard(sp, mortgaged));
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.012, 1.06), [null, null, null, null, null, null].map((_, k) => (k === 2 ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }) : new THREE.MeshStandardMaterial({ color: '#efe8d6' }))));
          const col = i % cols;
          const row = Math.floor(i / cols);
          m.position.set(-2.7 + col * 0.9, 0.007 + row * 0.004, -row * 1.15);
          m.rotation.y = Math.sin(pos * 3.1) * 0.05;
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.pos = pos;
          seat.deeds.add(m);
        });
      }
    }
  }

  // ---------- floating text ----------
  floatText(id, text, color = '#2e7d32') {
    const pawn = this.pawns.get(id);
    if (!pawn) return;
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 160;
    const c = cv.getContext('2d');
    c.font = `900 96px 'Avenir Next', Arial, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.strokeText(text, 256, 80);
    c.fillStyle = color;
    c.fillText(text, 256, 80);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(2.4, 0.75, 1);
    sprite.renderOrder = 10;
    const base = pawn.position.clone();
    this.scene.add(sprite);
    tween(1500, (t) => {
      sprite.position.set(base.x, base.y + 1.6 + t * 1.4, base.z);
      sprite.material.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }, ease.out).then(() => {
      this.scene.remove(sprite);
      tex.dispose();
      sprite.material.dispose();
    });
  }

  /** Deed card meshes (for click-picking in seat areas). */
  deedMeshes() {
    const out = [];
    for (const s of this.seats.values()) out.push(...s.deeds.children);
    return out;
  }
}

function drawMortgaged() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 400;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(40,40,48,0.45)';
  c.fillRect(0, 0, 256, 400);
  c.strokeStyle = 'rgba(255,255,255,0.25)';
  c.lineWidth = 10;
  for (let i = -400; i < 400; i += 40) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i + 400, 400);
    c.stroke();
  }
  c.save();
  c.translate(128, 200);
  c.rotate(-Math.PI / 2.6);
  c.fillStyle = '#fff';
  c.font = `900 50px 'Avenir Next', Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('MORTGAGED', 0, 0);
  c.restore();
  return cv;
}

export { maxLevel, localToWorld, DECK_COLORS };
