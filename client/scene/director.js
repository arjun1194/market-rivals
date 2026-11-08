// Camera director: in "follow" mode the camera tracks whoever's turn it is, gliding along with
// their pawn, swinging round the corners of the board and glancing at the dice or at a property
// being built on. The player can grab the camera at any time; following resumes on the next turn
// or when they tap "Follow".
import * as THREE from 'three';
import { posAt } from './world.js';

const TAU = Math.PI * 2;
const wrap = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
/** Camera azimuth that looks at a board side from outside, so its labels read upright. */
const sideAz = (pos) => -(((Math.floor(pos / 10) + 1) % 4) * (Math.PI / 2));
export function azimuthFor(pos) {
  if (pos % 10 !== 0) return sideAz(pos);
  const a = sideAz(pos);
  return a + wrap(sideAz((pos + 39) % 40) - a) / 2; // corners: look in diagonally
}
const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

export class CameraDirector {
  constructor(world, pieces) {
    this.world = world;
    this.pieces = pieces;
    this.mode = 'seat';
    this.active = false; // false in the lobby
    this.paused = false; // the player took the camera over
    this.target = new THREE.Vector3();
    this.az = 0;
    this.dist = 24;
    this.lastPos = 0;
    this.glanceAt = null; // { point, pos, until }
    this.last = 0;
    this.onPauseChange = null;
    world.controls.addEventListener('start', () => {
      if (this.active && this.mode === 'follow' && !this.paused) this.setPaused(true);
    });
    world.onFrame.push((now) => this.update(now));
  }

  /** Distance/tilt suited to the screen shape: closer on tall phone screens. */
  framing() {
    const a = this.world.viewAspect;
    // `lead`: aim this far inside the pawn, so the pawn sits low on screen with the board ahead of it.
    if (a < 0.75) return { dist: 24, polar: 0.74, lead: 3.6 };
    if (a < 1.3) return { dist: 22, polar: 0.8, lead: 2.8 };
    // Phones held sideways have little height to spare: come in closer.
    if (this.world.container.clientHeight < 520) return { dist: 15.5, polar: 0.84, lead: 1.2 };
    return { dist: 20, polar: 0.86, lead: 2.6 };
  }

  setMode(mode) {
    this.mode = mode;
    this.setPaused(false);
    if (mode === 'follow') this.syncFromCamera();
  }

  setPaused(p) {
    if (this.paused === p) return;
    this.paused = p;
    if (!p) this.syncFromCamera();
    this.onPauseChange?.(p);
  }

  /** Start smoothing from wherever the camera is now, so mode changes glide instead of jump. */
  syncFromCamera() {
    const cam = this.world.camera.position;
    const t = this.world.controls.target;
    this.target.copy(t);
    this.az = Math.atan2(cam.x - t.x, cam.z - t.z);
    this.dist = cam.distanceTo(t);
  }

  /** A new player's turn: pick the camera back up if the player had taken it over. */
  onTurn() {
    if (this.mode === 'follow' && this.paused) this.setPaused(false);
  }

  /** Look at a point for a moment (dice landing, a new building), then return to the pawn. */
  glance(point, ms, pos = null) {
    this.glanceAt = { point: new THREE.Vector3(point.x, 0, point.z), pos, until: performance.now() + ms };
  }

  subject(now) {
    if (this.glanceAt && now < this.glanceAt.until) return { point: this.glanceAt.point, pos: this.glanceAt.pos };
    this.glanceAt = null;
    const pawn = this.pieces.turnId && this.pieces.pawns.get(this.pieces.turnId);
    if (!pawn) return null;
    const pos = posAt(pawn.position.x, pawn.position.z);
    if (pos !== null) this.lastPos = pos;
    return { point: pawn.position, pos: this.lastPos };
  }

  update(now) {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.active || this.mode !== 'follow' || this.paused) return;
    const subj = this.subject(now);
    if (!subj) return;
    const { dist, polar, lead } = this.framing();
    // Aim a little inside the subject (away from the camera), so less empty table shows.
    const goal = new THREE.Vector3(subj.point.x - Math.sin(this.az) * lead, 0, subj.point.z - Math.cos(this.az) * lead);
    this.target.lerp(goal, smooth(4.5, dt));
    if (subj.pos !== null && subj.pos !== undefined) this.az += wrap(azimuthFor(subj.pos) - this.az) * smooth(2.6, dt);
    this.dist += (dist - this.dist) * smooth(3, dt);
    const h = Math.sin(polar) * this.dist;
    const v = Math.cos(polar) * this.dist;
    this.world.controls.target.copy(this.target);
    this.world.camera.position.set(this.target.x + Math.sin(this.az) * h, this.target.y + v, this.target.z + Math.cos(this.az) * h);
  }
}
