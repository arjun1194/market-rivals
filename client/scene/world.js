// Renderer, camera, lighting, table, board mesh, coordinate helpers, picking and tweens.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARD, CORNER, CELL, drawBoard, drawWood } from './art.js';

export const BOARD_TOP = 0.3;
const HALF = BOARD / 2;

// ---------- tweens ----------
const tweens = new Set();
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};
/** Run fn(easedT) every frame for `ms`; resolves when done. */
export function tween(ms, fn, easing = ease.inOut) {
  return new Promise((resolve) => {
    // Background tabs get no animation frames: finish instantly so the game never stalls.
    if (document.hidden) {
      fn(easing(1), 1);
      return resolve();
    }
    tweens.add({ start: performance.now(), ms: Math.max(1, ms / speed), fn, easing, resolve });
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  for (const tw of tweens) {
    tweens.delete(tw);
    try {
      tw.fn(tw.easing(1), 1);
    } finally {
      tw.resolve();
    }
  }
});
export const wait = (ms) => tween(ms, () => {}, ease.linear);
let fastForward = false;
export function setFastForward(v) {
  fastForward = v;
}
let speed = 1;
/** Player preference: 1 = normal, 2 = quick animations. */
export function setSpeed(v) {
  speed = v > 0 ? v : 1;
}
function stepTweens(now) {
  for (const tw of tweens) {
    let t = fastForward ? 1 : Math.min(1, (now - tw.start) / tw.ms);
    try {
      tw.fn(tw.easing(t), t);
    } catch (err) {
      console.error(err);
      t = 1; // never let one broken animation freeze the table
    }
    if (t >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }
}

// ---------- board geometry helpers ----------
const sideAngle = (pos) => ((Math.floor(pos / 10) + 1) % 4) * (Math.PI / 2);

/** Map a point in the "south side" local frame of `pos` to world x/z. */
export function localToWorld(pos, lx, lz) {
  const a = sideAngle(pos);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: lx * c - lz * s, z: lx * s + lz * c, yaw: -a };
}

/** Local-frame centre x of the space (south side). */
function localCenterX(pos) {
  if (pos % 10 === 0) return HALF - CORNER / 2;
  const k = (pos % 10) - 1;
  return HALF - CORNER - (k + 0.5) * CELL;
}

export function spaceCenter(pos) {
  return localToWorld(pos, localCenterX(pos), HALF - (pos % 10 === 0 ? CORNER / 2 : CORNER / 2));
}

/** Where pawn #slot (0..5) stands on a space. kind: 'visit' | 'prison' | 'pricewar' for the jail corner. */
export function pawnSpot(pos, slot, kind = 'visit') {
  const off = [
    [-0.32, -0.25],
    [0.32, -0.25],
    [-0.32, 0.3],
    [0.32, 0.3],
    [0, -0.75],
    [0, 0.75],
  ][slot % 6];
  if (pos === 10) {
    const C = CORNER;
    const inner = C * 0.7;
    const base = HALF - C;
    if (kind === 'prison') return localToWorld(pos, base + inner * 0.3 + off[0] * 0.5, base + inner * 0.3 + off[1] * 0.4);
    if (kind === 'pricewar') return localToWorld(pos, base + inner * 0.72 + off[0] * 0.5, base + inner * 0.72 + off[1] * 0.4);
    // Just visiting: along the outer L
    const spots = [
      [base + 0.35, HALF - 0.4],
      [base + 0.95, HALF - 0.4],
      [base + 1.55, HALF - 0.4],
      [HALF - 0.4, base + 0.35],
      [HALF - 0.4, base + 0.95],
      [HALF - 0.4, base + 1.55],
    ][slot % 6];
    return localToWorld(pos, spots[0], spots[1]);
  }
  const lx = localCenterX(pos) + off[0] * (pos % 10 === 0 ? 1.6 : 1);
  const lz = HALF - CORNER * (pos % 10 === 0 ? 0.5 : 0.42) + off[1];
  return localToWorld(pos, lx, lz);
}

/** Building slot on a street's colour band. */
export function buildingSpot(pos, i, n) {
  const span = CELL * 0.8;
  const lx = localCenterX(pos) + (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1));
  return localToWorld(pos, lx, HALF - CORNER + CORNER * 0.12);
}

/** Owner strip along the outer edge of a space. */
export function ownerStripFrame(pos) {
  return localToWorld(pos, localCenterX(pos), HALF - 0.07);
}

export function posAt(x, z) {
  const C = CORNER;
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
  const inW = x < -HALF + C;
  const inE = x > HALF - C;
  const inN = z < -HALF + C;
  const inS = z > HALF - C;
  if (!inW && !inE && !inN && !inS) return null;
  if (inW && inS) return 0;
  if (inW && inN) return 10;
  if (inE && inN) return 20;
  if (inE && inS) return 30;
  const k = (v) => Math.max(0, Math.min(8, Math.floor(v / CELL)));
  if (inW) return 1 + k(HALF - C - z);
  if (inN) return 11 + k(x + HALF - C);
  if (inE) return 21 + k(z + HALF - C);
  return 31 + k(HALF - C - x);
}

// ---------- world ----------
/** Phones and small tablets: lighter textures and shadows. */
export const LOW_POWER = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;

export class World {
  constructor(container) {
    this.container = container;
    this.baseFov = 42;
    this.viewAspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.insets = { top: 0, bottom: 0 }; // screen space covered by the HUD (px), eased
    this.insetGoal = { top: 0, bottom: 0 };
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#17110d');
    scene.fog = new THREE.Fog('#17110d', 55, 110);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(this.baseFov, this.viewAspect, 0.1, 300);
    camera.position.set(0, 30, 27);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.32;
    controls.minDistance = 7;
    controls.maxDistance = 70;
    controls.target.set(0, 0, 0);
    this.controls = controls;

    this.addLights();
    this.addTable();
    this.addBoard();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoverMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffd54a', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.visible = false;
    scene.add(this.hoverMesh);

    this.onFrame = [];
    window.addEventListener('resize', () => this.resize());
    renderer.setAnimationLoop((t) => this.frame(t));
  }

  addLights() {
    const hemi = new THREE.HemisphereLight('#fff4e0', '#3a2414', 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.3);
    sun.position.set(-14, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOW_POWER ? 1024 : 2048, LOW_POWER ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    const lamp = new THREE.PointLight('#ffcf8a', 260, 70, 2);
    lamp.position.set(10, 20, -12);
    this.scene.add(lamp);
  }

  addTable() {
    const tex = new THREE.CanvasTexture(drawWood());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.0 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(64, 2, 64), mat);
    table.position.y = -1;
    table.receiveShadow = true;
    this.scene.add(table);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#120c08', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -18;
    this.scene.add(floor);
  }

  addBoard() {
    const tex = new THREE.CanvasTexture(drawBoard(LOW_POWER ? 2048 : 4096));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = true;
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 });
    const side = new THREE.MeshStandardMaterial({ color: '#1d2b45', roughness: 0.7 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD, BOARD_TOP, BOARD), [side, side, top, side, side, side]);
    board.position.y = BOARD_TOP / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    this.scene.add(board);
    this.board = board;
  }

  resize() {
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.applyView();
  }

  /** Tell the camera how much of the screen the HUD covers, so the board centres in what's left. */
  setInsets(top, bottom) {
    this.insetGoal = { top, bottom };
  }

  applyView() {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.viewAspect = w / h;
    const shift = (this.insets.top - this.insets.bottom) / 2; // px; negative = centre moves up
    const cam = this.camera;
    if (Math.abs(shift) < 0.5) {
      cam.clearViewOffset();
      cam.fov = this.baseFov;
      cam.aspect = w / h;
    } else {
      // Render a window of a taller virtual frame whose optical centre sits in the free area.
      const H = h + 2 * Math.abs(shift);
      cam.fov = (2 * Math.atan(Math.tan((this.baseFov * Math.PI) / 360) * (H / h)) * 180) / Math.PI;
      cam.aspect = w / H;
      cam.setViewOffset(w, H, 0, Math.abs(shift) - shift, w, h);
    }
    cam.updateProjectionMatrix();
  }

  easeInsets() {
    const g = this.insetGoal;
    const c = this.insets;
    if (Math.abs(g.top - c.top) < 0.5 && Math.abs(g.bottom - c.bottom) < 0.5) {
      if (g.top === c.top && g.bottom === c.bottom) return;
      c.top = g.top;
      c.bottom = g.bottom;
    } else {
      c.top += (g.top - c.top) * 0.18;
      c.bottom += (g.bottom - c.bottom) * 0.18;
    }
    this.applyView();
  }

  /** Board space under a client pixel, or null. */
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.board, false)[0];
    if (!hit || hit.point.y < BOARD_TOP - 0.01) return null;
    return posAt(hit.point.x, hit.point.z);
  }

  setHover(pos) {
    if (pos === null || pos === undefined) {
      this.hoverMesh.visible = false;
      return;
    }
    const corner = pos % 10 === 0;
    const c = spaceCenter(pos);
    this.hoverMesh.visible = true;
    this.hoverMesh.position.set(c.x, BOARD_TOP + 0.012, c.z);
    this.hoverMesh.rotation.set(-Math.PI / 2, 0, c.yaw);
    this.hoverMesh.scale.set(corner ? CORNER : CELL, CORNER, 1);
  }

  /** Smoothly move the camera to look from a seat angle (radians around the table). */
  async viewFrom(angle, { top = false } = {}) {
    const from = this.camera.position.clone();
    const fromT = this.controls.target.clone();
    // Seated view: sit behind your own seat area, looking slightly past the board centre.
    const a = this.viewAspect;
    const wide = a < 1 ? Math.min(2.8, 1.1 / a) : a < 1.25 ? 1.3 : 1; // pull back on portrait screens
    const to = top
      ? new THREE.Vector3(Math.sin(angle) * 0.01, 38 * wide, Math.cos(angle) * 0.01) // straight down, square to the seat
      : new THREE.Vector3(Math.sin(angle) * 23 * wide, 23 * wide, Math.cos(angle) * 23 * wide);
    const toT = top ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(Math.sin(angle) * 3.2, 0, Math.cos(angle) * 3.2);
    await tween(900, (t) => {
      this.camera.position.lerpVectors(from, to, t);
      this.controls.target.lerpVectors(fromT, toT, t);
    });
  }

  frame(now) {
    this.easeInsets();
    stepTweens(now);
    for (const fn of this.onFrame) fn(now);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
