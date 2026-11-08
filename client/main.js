import { World, setFastForward, setSpeed, wait, spaceCenter, LOW_POWER } from './scene/world.js';
import { Pieces } from './scene/pieces.js';
import { CameraDirector } from './scene/director.js';
import { Net, store } from './net.js';
import { UI } from './ui.js';
import { Sound } from './sound.js';
import { CARDS } from '/shared/data.js';

const world = new World(document.getElementById('scene'));
const pieces = new Pieces(world);
const director = new CameraDirector(world, pieces);
const sound = new Sound();
const view = { room: null, you: null, state: null, busy: false, propsOpen: false, logOpen: false, chatUnread: 0 };

// Camera: phones follow the action by default; bigger screens sit at your seat.
const CAMERA_MODES = ['follow', 'seat', 'top'];
const isPhoneish = () => LOW_POWER || matchMedia('(max-width: 760px), (max-height: 520px)').matches;
let cameraMode = store.get('mr-cam');
if (!CAMERA_MODES.includes(cameraMode)) cameraMode = isPhoneish() ? 'follow' : 'seat';
pieces.onFocus = (point, ms) => director.glance(point, ms);

const app = {
  view,
  world,
  pieces,
  sound,
  send: (m) => net.send(m),
  act: (action, args = {}) => net.send({ t: 'act', action, args }),
  viewSeat: () => world.viewFrom(pieces.seatAngle(view.you)),
  setSpeed,
  director,
  cameraMode: () => cameraMode,
  /** Switch camera mode (and remember it). Re-selecting the current mode re-applies it. */
  setCameraMode(mode, remember = true) {
    if (!CAMERA_MODES.includes(mode)) return;
    cameraMode = mode;
    if (remember) store.set('mr-cam', mode);
    director.setMode(mode);
    if (mode === 'seat') app.viewSeat();
    else if (mode === 'top') world.viewFrom(pieces.seatAngle(view.you), { top: true });
    ui.renderCameraUI();
  },
  recenter: () => director.setPaused(false),
};
director.onPauseChange = () => ui.renderCameraUI();
const ui = new UI(app);

// ---------- state queue & animation ----------
const queue = [];
let processing = false;
let hadState = false;

function sfx(name) {
  sound.play(name);
}

async function playEvent(ev, state) {
  const name = (id) => state.players.find((p) => p.id === id)?.name || '';
  switch (ev.type) {
    case 'turn':
      pieces.setTurn(ev.player);
      director.onTurn(ev.player);
      if (ev.player === view.you) {
        sfx('turn');
        ui.toast('Your turn!');
      }
      return;
    case 'dice':
      await pieces.rollDice(ev.dice, pieces.seatAngle(ev.player), sfx);
      if (ev.purpose === 'utility') ui.toast(`${name(ev.player)} rolled ${ev.dice[0] + ev.dice[1]} for the utility charge`);
      return;
    case 'die':
      await pieces.rollDice([ev.value], pieces.seatAngle(ev.player), sfx);
      return;
    case 'move':
      await pieces.movePawn(ev.player, ev, state, sfx);
      return;
    case 'card': {
      const card = CARDS[ev.card];
      ui.toast(`${name(ev.player)}: ${card.action}`);
      await pieces.showCard(ev.card, world.camera, sfx);
      return;
    }
    case 'pay':
      if (ev.to) pieces.floatText(ev.to, `+$${ev.amount}`, '#1f8a4c');
      if (ev.from) pieces.floatText(ev.from, `−$${ev.amount}`, '#c0392b');
      sfx(ev.to === view.you ? 'cash' : 'pay');
      await wait(ev.reason === 'START' ? 300 : 180);
      return;
    case 'buy':
    case 'build':
    case 'mortgage':
    case 'tradeDone':
      if (ev.pos !== undefined && ev.type !== 'buy') {
        director.glance(spaceCenter(ev.pos), 1300, ev.pos);
      }
      pieces.syncBoard(state);
      sfx(ev.type === 'build' ? 'build' : 'cash');
      return;
    case 'jail':
      sfx('jail');
      return;
    case 'bankrupt':
      ui.toast(`${name(ev.player)} is bankrupt!`, 'error');
      return;
  }
}

function applyState(state) {
  view.state = state;
  pieces.syncPlayers(state);
  pieces.placePawns(state);
  pieces.syncBoard(state);
  pieces.syncSeats(state);
  pieces.setTurn(state.status === 'playing' ? state.players[state.turn.idx].id : null);
  ui.render();
}

async function processQueue() {
  processing = true;
  view.busy = true;
  try {
    if (view.state) ui.render();
    while (queue.length) {
      const { state, events } = queue.shift();
      try {
        pieces.syncPlayers(state);
        if (!hadState) {
          hadState = true;
          applyState(state);
          world.controls.enabled = true;
          director.active = true;
          app.setCameraMode(cameraMode, false);
          continue;
        }
        // Catch up instantly if we're far behind or the tab is hidden.
        setFastForward(queue.length > 3 || document.hidden);
        for (const ev of events) await playEvent(ev, state);
      } catch (err) {
        console.error(err);
      }
      setFastForward(false);
      try {
        applyState(state);
      } catch (err) {
        console.error(err);
      }
    }
  } finally {
    processing = false;
    view.busy = false;
    try {
      ui.render();
    } catch (err) {
      console.error(err);
    }
  }
}

// ---------- network ----------
const net = new Net({
  open() {
    document.getElementById('conn').hidden = true;
  },
  close() {
    document.getElementById('conn').hidden = false;
  },
  welcome() {
    if (!view.room) ui.renderLobby();
  },
  room(m) {
    const wasStarted = view.room?.started;
    view.room = m.room;
    view.you = m.you;
    if (!m.room.started) ui.renderLobby();
    ui.renderChat();
    if (m.room.started && !wasStarted && view.state) ui.render();
    if (view.state) ui.render();
  },
  state(m) {
    queue.push(m);
    if (!processing) processQueue();
  },
  chat(m) {
    if (!view.room) return;
    view.room.chat = [...(view.room.chat || []), m.msg].slice(-60);
    ui.renderChat();
    ui.onChat(m.msg);
  },
  error(m) {
    ui.toast(m.msg, 'error');
  },
  left() {
    try {
      history.replaceState(null, '', '/');
    } catch {
      /* ignore */
    }
    location.reload();
  },
});

// ---------- lobby attract mode: slow orbit ----------
world.controls.enabled = false;
world.onFrame.push((now) => {
  if (hadState) return;
  const a = now / 14000;
  world.camera.position.set(Math.sin(a) * 30, 24, Math.cos(a) * 30);
  world.controls.target.set(0, 0, 0);
});

// ---------- pointer: hover + click on spaces and deed cards ----------
const canvas = world.renderer.domElement;
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointermove', (e) => {
  if (!hadState || e.buttons) {
    ui.showTooltip(null);
    world.setHover(null);
    return;
  }
  const pos = world.pick(e.clientX, e.clientY);
  world.setHover(pos);
  ui.showTooltip(pos, e.clientX, e.clientY);
  canvas.style.cursor = pos !== null ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => {
  ui.showTooltip(null);
  world.setHover(null);
});
canvas.addEventListener('click', (e) => {
  if (!hadState || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  // deed cards on the table first
  const r = canvas.getBoundingClientRect();
  world.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  world.raycaster.setFromCamera(world.pointer, world.camera);
  const hit = world.raycaster.intersectObjects(pieces.deedMeshes(), false)[0];
  if (hit) return ui.openDeed(hit.object.userData.pos);
  const pos = world.pick(e.clientX, e.clientY);
  if (pos !== null) ui.openDeed(pos);
});

// ---------- keyboard ----------
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.key === 'Escape') return ui.escape();
  const s = view.state;
  if (!s || !hadState) return;
  const mine = s.status === 'playing' && s.players[s.turn.idx].id === view.you && !view.busy;
  const k = e.key.toLowerCase();
  if ((k === ' ' || k === 'r') && mine && s.turn.phase === 'roll') {
    e.preventDefault();
    app.act('roll');
  } else if (k === 'e' && mine && s.turn.phase === 'manage') app.act('endTurn');
  else if (k === 't') app.setCameraMode('top');
  else if (k === 's') app.setCameraMode('seat');
  else if (k === 'f') app.setCameraMode('follow');
});

setInterval(() => ui.updateTimer(), 1000);
window.__marketRivals = { app, ui, queue, isProcessing: () => processing }; // debugging handle
ui.renderLobby();
