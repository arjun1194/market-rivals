// Procedural 2D artwork (canvas) for the board, cards, dice and table.
import { SPACES, CITIES, GAME_NAME } from '/shared/data.js';

export const BOARD = 20; // world units, board is BOARD x BOARD centred on the origin
export const CORNER = 2.6;
export const CELL = (BOARD - 2 * CORNER) / 9;

// globalThis.MR_TEST_FONT lets tests draw the artwork with another (e.g. much wider) font.
const FONT = globalThis.MR_TEST_FONT || `'Avenir Next', 'Futura', 'Trebuchet MS', 'Helvetica Neue', Arial, sans-serif`;
const INK = '#1f2533';
const PAPER = '#f6f0e1';
const NAVY = '#1d2b45';
export const DECK_COLORS = { competitor: '#1f8a4c', monopolist: '#2456b8' };

const font = (weight, px) => `${weight} ${px}px ${FONT}`;

// All artwork is laid out for these canvas sizes and scaled to whatever resolution is drawn, and every
// label is measured and shrunk to fit its box, so it reads the same with any device's fonts.
const DESIGN = 4096;

/** Largest font size <= px (>= minPx) at which every one of `lines` fits maxW. Sets ctx.font. */
function fitAll(ctx, lines, maxW, weight, px, minPx = 12) {
  let size = px;
  ctx.font = font(weight, size);
  while (lines.some((l) => ctx.measureText(l).width > maxW) && size > minPx) {
    size -= 1;
    ctx.font = font(weight, size);
  }
  return size;
}

function fitText(ctx, text, maxW, weight, px, minPx = 12) {
  return fitAll(ctx, [text], maxW, weight, px, minPx);
}

/** Wrap `text` into at most maxLines lines that fit maxW, shrinking the font as needed. Sets ctx.font. */
function fitLines(ctx, text, maxW, maxLines, weight, px, minPx = 12) {
  for (let size = px; ; size -= 1) {
    ctx.font = font(weight, size);
    const lines = wrap(ctx, text, maxW);
    if ((lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) || size <= minPx) return { lines, size };
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(ctx, lines, x, y, lh) {
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- icons (drawn centred at 0,0 in a box of size `s`) ----------
function icon(ctx, kind, cx, cy, s, color = INK) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'rail': {
      roundRect(ctx, -45, -30, 70, 42, 6); ctx.fill();
      ctx.fillRect(15, -48, 14, 20);
      ctx.fillRect(-45, 12, 90, 8);
      ctx.fillStyle = PAPER;
      ctx.fillRect(-36, -22, 16, 14); ctx.fillRect(-14, -22, 16, 14);
      ctx.fillStyle = color;
      for (const x of [-30, -6, 18, 38]) { ctx.beginPath(); ctx.arc(x, 28, 10, 0, 7); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(25, 12); ctx.lineTo(50, 30); ctx.lineTo(25, 30); ctx.fill();
      break;
    }
    case 'bus': {
      roundRect(ctx, -50, -32, 100, 52, 10); ctx.fill();
      ctx.fillStyle = PAPER;
      for (let i = 0; i < 4; i++) ctx.fillRect(-42 + i * 22, -24, 16, 16);
      ctx.fillStyle = color;
      for (const x of [-28, 28]) { ctx.beginPath(); ctx.arc(x, 24, 11, 0, 7); ctx.fill(); }
      break;
    }
    case 'air': {
      ctx.beginPath();
      ctx.moveTo(0, -50); ctx.quadraticCurveTo(8, -44, 8, -20); ctx.lineTo(50, 6); ctx.lineTo(50, 16); ctx.lineTo(8, 4);
      ctx.lineTo(6, 32); ctx.lineTo(20, 44); ctx.lineTo(20, 50); ctx.lineTo(0, 44); ctx.lineTo(-20, 50); ctx.lineTo(-20, 44);
      ctx.lineTo(-6, 32); ctx.lineTo(-8, 4); ctx.lineTo(-50, 16); ctx.lineTo(-50, 6); ctx.lineTo(-8, -20); ctx.quadraticCurveTo(-8, -44, 0, -50);
      ctx.fill();
      break;
    }
    case 'freight': {
      ctx.fillRect(-50, -34, 62, 50);
      roundRect(ctx, 14, -18, 34, 34, 6); ctx.fill();
      ctx.fillStyle = PAPER; ctx.fillRect(22, -12, 18, 12);
      ctx.fillStyle = color;
      for (const x of [-34, -10, 32]) { ctx.beginPath(); ctx.arc(x, 24, 10, 0, 7); ctx.fill(); }
      break;
    }
    case 'power': {
      ctx.beginPath();
      ctx.moveTo(12, -50); ctx.lineTo(-30, 8); ctx.lineTo(-2, 8); ctx.lineTo(-14, 50); ctx.lineTo(30, -10); ctx.lineTo(2, -10); ctx.closePath();
      ctx.fill();
      break;
    }
    case 'water': {
      ctx.beginPath();
      ctx.moveTo(0, -50); ctx.bezierCurveTo(10, -30, 38, 0, 38, 18); ctx.arc(0, 18, 38, 0, Math.PI); ctx.bezierCurveTo(-38, 0, -10, -30, 0, -50);
      ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.ellipse(-14, 18, 7, 14, 0.3, 0, 7); ctx.fill();
      break;
    }
    case 'card': {
      ctx.rotate(-0.18);
      ctx.lineWidth = 7;
      roundRect(ctx, -30, -42, 60, 84, 8); ctx.fillStyle = PAPER; ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.font = font(800, 56); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', 0, 4);
      break;
    }
    case 'tax': {
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 28 - i * 16, 34, 11, 0, 0, 7); ctx.fill(); ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.fillStyle = PAPER; ctx.font = font(800, 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, -20);
      break;
    }
    case 'scale': {
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, 40); ctx.moveTo(-26, 44); ctx.lineTo(26, 44); ctx.moveTo(-44, -30); ctx.lineTo(44, -30); ctx.stroke();
      for (const x of [-44, 44]) {
        ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x - 18, 6); ctx.moveTo(x, -30); ctx.lineTo(x + 18, 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, 6, 20, 0, Math.PI); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -48, 7, 0, 7); ctx.fill();
      break;
    }
    case 'bars': {
      ctx.lineWidth = 8;
      roundRect(ctx, -42, -42, 84, 84, 8); ctx.stroke();
      for (const x of [-21, 0, 21]) { ctx.beginPath(); ctx.moveTo(x, -42); ctx.lineTo(x, 42); ctx.stroke(); }
      break;
    }
    case 'tag': {
      ctx.beginPath(); ctx.moveTo(-40, -20); ctx.lineTo(10, -20); ctx.lineTo(42, 0); ctx.lineTo(10, 20); ctx.lineTo(-40, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = PAPER; ctx.beginPath(); ctx.arc(18, 0, 6, 0, 7); ctx.fill();
      ctx.font = font(800, 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('−%', -14, 1);
      break;
    }
    case 'arrow': {
      ctx.beginPath(); ctx.moveTo(-50, -14); ctx.lineTo(10, -14); ctx.lineTo(10, -36); ctx.lineTo(50, 0); ctx.lineTo(10, 36); ctx.lineTo(10, 14); ctx.lineTo(-50, 14); ctx.closePath(); ctx.fill();
      break;
    }
    case 'crown': {
      ctx.beginPath(); ctx.moveTo(-44, 30); ctx.lineTo(-48, -24); ctx.lineTo(-22, 2); ctx.lineTo(0, -34); ctx.lineTo(22, 2); ctx.lineTo(48, -24); ctx.lineTo(44, 30); ctx.closePath(); ctx.fill();
      break;
    }
    case 'shop': {
      ctx.fillRect(-40, -6, 80, 46);
      ctx.beginPath(); ctx.moveTo(-48, -6); ctx.lineTo(-40, -34); ctx.lineTo(40, -34); ctx.lineTo(48, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = PAPER; ctx.fillRect(-10, 10, 20, 30); ctx.fillRect(-32, 6, 14, 14); ctx.fillRect(18, 6, 14, 14);
      break;
    }
  }
  ctx.restore();
}

// ---------- board ----------
const sideAngle = (pos) => ((Math.floor(pos / 10) + 1) % 4) * (Math.PI / 2);

function drawSpace(ctx, sp, x0, y0, w, h, s) {
  // Local frame: inner edge at y0 (top), outer edge at y0+h (bottom), text upright.
  ctx.fillStyle = PAPER;
  ctx.fillRect(x0, y0, w, h);
  const cx = x0 + w / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  const pad = w * 0.08;
  if (sp.type === 'street') {
    const band = h * 0.24;
    ctx.fillStyle = CITIES[sp.city].color;
    ctx.fillRect(x0, y0, w, band);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x0, y0, w, band * 0.18);
    ctx.fillStyle = '#fff';
    fitText(ctx, sp.city.toUpperCase(), w - pad * 2, 800, 34);
    ctx.textBaseline = 'middle';
    ctx.fillText(sp.city.toUpperCase(), cx, y0 + band * 0.62);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = INK;
    const name = fitLines(ctx, sp.name.toUpperCase(), w - pad * 2, 2, 700, 44, 20);
    drawLines(ctx, name.lines, cx, y0 + band + 26 + name.size, name.size * 1.1);
    icon(ctx, 'shop', cx, y0 + h * 0.66, 46, 'rgba(31,37,51,0.18)');
    fitText(ctx, `$${sp.price}`, w - pad * 2, 800, 50, 24);
    ctx.fillText(`$${sp.price}`, cx, y0 + h - 58);
  } else if (sp.type === 'transport' || sp.type === 'utility') {
    const name = fitLines(ctx, sp.name.toUpperCase(), w - pad * 2, 2, 800, 40, 20);
    drawLines(ctx, name.lines, cx, y0 + 30 + name.size, name.size * 1.1);
    icon(ctx, sp.icon, cx, y0 + h * 0.48, 140, sp.type === 'utility' ? '#d77a1f' : NAVY);
    ctx.fillStyle = INK;
    fitText(ctx, `$${sp.price}`, w - pad * 2, 800, 50, 24);
    ctx.fillText(`$${sp.price}`, cx, y0 + h - 58);
  } else if (sp.type === 'card') {
    const t = fitAll(ctx, ['MARKET', 'CARD'], w - pad * 2, 800, 42, 18);
    drawLines(ctx, ['MARKET', 'CARD'], cx, y0 + 30 + t, t * 1.05);
    icon(ctx, 'card', cx, y0 + h * 0.52, 150, '#b2453a');
    ctx.fillStyle = INK;
    const note = fitLines(ctx, 'Draw from your role’s deck', w - pad * 2, 3, 600, 25, 14);
    drawLines(ctx, note.lines, cx, y0 + h - 64 - (note.lines.length - 1) * note.size * 1.15, note.size * 1.15);
  } else if (sp.type === 'incomeTax') {
    const t = fitAll(ctx, ['INCOME', 'TAX'], w - pad * 2, 800, 42, 18);
    drawLines(ctx, ['INCOME', 'TAX'], cx, y0 + 30 + t, t * 1.05);
    icon(ctx, 'tax', cx, y0 + h * 0.47, 110, '#7a5b16');
    ctx.fillStyle = INK;
    const note = fitLines(ctx, 'Pay $200 or a % of your assets', w - pad * 2, 3, 600, 25, 14);
    drawLines(ctx, note.lines, cx, y0 + h - 70 - (note.lines.length - 1) * note.size * 1.15, note.size * 1.15);
  } else if (sp.type === 'propertyTax') {
    const t = fitAll(ctx, ['PROPERTY', 'TAX'], w - pad * 2, 800, 40, 18);
    drawLines(ctx, ['PROPERTY', 'TAX'], cx, y0 + 30 + t, t * 1.05);
    icon(ctx, 'tax', cx, y0 + h * 0.48, 110, '#7a5b16');
    ctx.fillStyle = INK;
    fitText(ctx, 'PAY $75', w - pad * 2, 800, 50, 22);
    ctx.fillText('PAY $75', cx, y0 + h - 58);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, y0, w, h);
}

function drawCorner(ctx, sp, x0, y0, c) {
  // Local frame: the corner occupies [x0,x0+c]x[y0,y0+c]; outer edges are bottom and right.
  const cx = x0 + c / 2;
  const cy = y0 + c / 2;
  // Width available for a line drawn along the corner's diagonal, offset d from its centre.
  const chord = (d, margin = 46) => 2 * (c / Math.SQRT2 - Math.abs(d)) - margin * 2;
  const say = (text, d, weight, px, minPx = 12) => {
    fitText(ctx, text, chord(d), weight, px, minPx);
    ctx.fillText(text, 0, d);
  };
  ctx.fillStyle = PAPER;
  ctx.fillRect(x0, y0, c, c);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (sp.type === 'start') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#c0392b';
    say('START', -10, 900, 128, 60);
    ctx.fillStyle = INK;
    say('COLLECT $100', 92, 700, 32);
    say('when you land on or pass', 130, 600, 26);
    ctx.restore();
    // movement arrow along the outer bottom edge, pointing to the next space (local left)
    ctx.save();
    ctx.translate(x0 + c * 0.72, y0 + c * 0.87); // outer corner, clear of the diagonal text
    ctx.scale(-1, 1);
    icon(ctx, 'arrow', 0, 0, 130, '#c0392b');
    ctx.restore();
  } else if (sp.type === 'jail') {
    // Outer L = Just Visiting; inner square split diagonally: Prison / Price War.
    const inner = c * 0.7;
    const ix = x0;
    const iy = y0;
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(x0, y0, c, c);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ix, iy); ctx.lineTo(ix + inner, iy); ctx.lineTo(ix, iy + inner); ctx.closePath();
    ctx.fillStyle = '#3c4658';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ix + inner, iy); ctx.lineTo(ix + inner, iy + inner); ctx.lineTo(ix, iy + inner); ctx.closePath();
    ctx.fillStyle = '#c94a3b';
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.strokeRect(ix, iy, inner, inner);
    ctx.beginPath(); ctx.moveTo(ix + inner, iy); ctx.lineTo(ix, iy + inner); ctx.stroke();
    icon(ctx, 'bars', ix + inner * 0.3, iy + inner * 0.3, 90, '#e9e2cf');
    icon(ctx, 'tag', ix + inner * 0.72, iy + inner * 0.7, 90, '#fff3e0');
    ctx.save();
    ctx.translate(ix + inner / 2, iy + inner / 2);
    ctx.rotate(-Math.PI / 4);
    // Lines parallel to the split diagonal: usable length shrinks towards each triangle's corner.
    const diag = inner * Math.SQRT2;
    const tri = inner / Math.SQRT2;
    const t = fitAll(ctx, ['PRISON', 'PRICE WAR'], Math.min(diag * (1 - 44 / tri), diag * (1 - 52 / tri)) - 70, 900, 46, 20);
    ctx.font = font(900, t);
    ctx.fillStyle = '#f1ead6';
    ctx.fillText('PRISON', 0, -44);
    ctx.fillStyle = '#fff';
    ctx.fillText('PRICE WAR', 0, 52);
    ctx.restore();
    ctx.fillStyle = INK;
    fitText(ctx, 'JUST VISITING', c * 0.78, 800, 34, 16);
    ctx.fillText('JUST VISITING', x0 + c * 0.42, y0 + c * 0.86);
    ctx.save();
    ctx.translate(x0 + c * 0.86, y0 + c * 0.42);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('JUST VISITING', 0, 0);
    ctx.restore();
  } else if (sp.type === 'fund') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    icon(ctx, 'scale', 0, -70, 150, '#8a6a1f');
    ctx.fillStyle = INK;
    const t = fitAll(ctx, ['FAIR COMPETITION'], chord(40), 900, 40, 18);
    ctx.font = font(900, t);
    ctx.fillText('FAIR COMPETITION', 0, 40);
    ctx.fillText('FUND', 0, 84);
    const n = fitAll(ctx, ['Competitors roll 1 die: 1 = $25, 2 = $50'], chord(130), 600, 24, 12);
    ctx.font = font(600, Math.min(n, fitText(ctx, 'Monopolists pay $160', chord(160), 600, 24, 12)));
    ctx.fillText('Competitors roll 1 die: 1 = $25, 2 = $50', 0, 130);
    ctx.fillText('Monopolists pay $160', 0, 160);
    ctx.restore();
  } else if (sp.type === 'goToJail') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = INK;
    say('GO TO', -110, 900, 64, 30);
    const t = fitAll(ctx, ['MONOPOLISTS → PRISON', 'COMPETITORS → PRICE WAR'], chord(30), 800, 34, 16);
    ctx.font = font(800, t);
    ctx.fillStyle = DECK_COLORS.monopolist;
    ctx.fillText('MONOPOLISTS → PRISON', 0, -30);
    ctx.fillStyle = DECK_COLORS.competitor;
    ctx.fillText('COMPETITORS → PRICE WAR', 0, 20);
    ctx.fillStyle = INK;
    say('Do not pass START', 70, 600, 24);
    icon(ctx, 'arrow', 0, 140, 110, '#c0392b');
    ctx.restore();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.strokeRect(x0, y0, c, c);
}

function drawCenter(ctx, N, s, rng) {
  const c = CORNER * s;
  const x0 = c;
  const size = N - 2 * c;
  // Pale "city map" backdrop
  const g = ctx.createRadialGradient(N / 2, N / 2, 100, N / 2, N / 2, size * 0.75);
  g.addColorStop(0, '#f3efe2');
  g.addColorStop(1, '#e4dcc6');
  ctx.fillStyle = g;
  ctx.fillRect(x0, x0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, x0, size, size);
  ctx.clip();
  const block = size / 9;
  const palette = ['#e9e1cb', '#e3d9bf', '#dfe6d6', '#e6dccd', '#dde3e8'];
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) {
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
      roundRect(ctx, x0 + i * block + 16, x0 + j * block + 16, block - 32, block - 32, 18);
      ctx.fill();
    }
  // a winding river and a park
  ctx.strokeStyle = '#c9dbe6';
  ctx.lineWidth = 70;
  ctx.beginPath();
  ctx.moveTo(x0 - 50, x0 + size * 0.18);
  ctx.bezierCurveTo(x0 + size * 0.3, x0 + size * 0.05, x0 + size * 0.45, x0 + size * 0.45, x0 + size * 0.2, x0 + size * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#d3e2c7';
  roundRect(ctx, x0 + size * 0.68, x0 + size * 0.7, block * 2 - 32, block * 2 - 32, 30);
  ctx.fill();
  ctx.restore();

  // Diagonal title banner from SW to NE
  ctx.save();
  ctx.translate(N / 2, N / 2);
  ctx.rotate(-Math.PI / 4);
  const bw = size * 0.92;
  const bh = 300;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 40);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#d9b44a';
  ctx.lineWidth = 10;
  roundRect(ctx, -bw / 2 + 22, -bh / 2 + 22, bw - 44, bh - 44, 26);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6f0e1';
  fitText(ctx, GAME_NAME.toUpperCase(), bw - 200, 900, 170);
  ctx.fillText(GAME_NAME.toUpperCase(), 0, -22);
  ctx.fillStyle = '#d9b44a';
  fitText(ctx, 'COMPETITORS  vs.  MONOPOLISTS', bw - 200, 700, 50, 20);
  ctx.fillText('COMPETITORS  vs.  MONOPOLISTS', 0, 92);
  ctx.restore();

  // Deck trays (positions mirrored in world.js DECK_POS)
  for (const [role, wx, wz] of [
    ['competitor', -4.3, -4.3],
    ['monopolist', 4.3, 4.3],
  ]) {
    ctx.save();
    ctx.translate((wx + BOARD / 2) * s, (wz + BOARD / 2) * s);
    ctx.rotate(-Math.PI / 4);
    const w = 3.7 * s;
    const h = 2.5 * s;
    roundRect(ctx, -w / 2, -h / 2, w, h, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.setLineDash([30, 20]);
    ctx.lineWidth = 10;
    ctx.strokeStyle = DECK_COLORS[role];
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = DECK_COLORS[role];
    ctx.textAlign = 'center';
    fitText(ctx, `${role.toUpperCase()} DECK`, w, 900, 56, 24);
    ctx.fillText(`${role.toUpperCase()} DECK`, 0, h / 2 + 80);
    ctx.restore();
  }
}

export function drawBoard(px = DESIGN) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const ctx = cv.getContext('2d');
  ctx.scale(px / DESIGN, px / DESIGN); // phones draw a smaller texture with exactly the same layout
  const size = DESIGN;
  const s = size / BOARD;
  const c = CORNER * s;
  const w = CELL * s;
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(0, 0, size, size);
  drawCenter(ctx, size, s, rng);

  for (const sp of SPACES) {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(sideAngle(sp.pos));
    ctx.translate(-size / 2, -size / 2);
    if (sp.pos % 10 === 0) drawCorner(ctx, sp, size - c, size - c, c);
    else {
      const k = (sp.pos % 10) - 1;
      drawSpace(ctx, sp, size - c - (k + 1) * w, size - c, w, c, s);
    }
    ctx.restore();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.strokeRect(c, c, size - 2 * c, size - 2 * c);
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, size - 14, size - 14);
  return cv;
}

// ---------- cards ----------
export function drawCardFace(card, w = 1100, h = 720) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const col = DECK_COLORS[card.deck];
  ctx.fillStyle = '#fbf8f0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, w, 110);
  icon(ctx, card.deck === 'monopolist' ? 'crown' : 'shop', 80, 55, 70, '#ffffff');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  fitText(ctx, `${card.deck.toUpperCase()} CARD`, w - 140 - 300, 900, 50, 24);
  ctx.fillText(`${card.deck.toUpperCase()} CARD`, 140, 58);
  ctx.textAlign = 'right';
  fitText(ctx, GAME_NAME, 260, 700, 28, 14);
  ctx.fillText(GAME_NAME, w - 40, 58);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  const body = fitLines(ctx, card.text, w - 140, 5, 500, 40, 22);
  drawLines(ctx, body.lines, w / 2, 160 + body.size, body.size * 1.3);
  ctx.strokeStyle = 'rgba(31,37,51,0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(120, h - 220);
  ctx.lineTo(w - 120, h - 220);
  ctx.stroke();
  ctx.fillStyle = col;
  fitText(ctx, card.action.toUpperCase(), w - 120, 900, 92, 40);
  ctx.textBaseline = 'middle';
  ctx.fillText(card.action.toUpperCase(), w / 2, h - 115);
  ctx.strokeStyle = col;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  return cv;
}

export function drawCardBack(deck, w = 1100, h = 720) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const col = DECK_COLORS[deck];
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 6;
  for (let i = -h; i < w; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f6f0e1';
  ctx.lineWidth = 10;
  roundRect(ctx, 30, 30, w - 60, h - 60, 30);
  ctx.stroke();
  icon(ctx, deck === 'monopolist' ? 'crown' : 'shop', w / 2, h / 2 - 90, 160, '#f6f0e1');
  ctx.fillStyle = '#f6f0e1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, deck.toUpperCase(), w - 160, 900, 88, 30);
  ctx.fillText(deck.toUpperCase(), w / 2, h / 2 + 70);
  fitText(ctx, GAME_NAME.toUpperCase(), w - 160, 700, 36, 16);
  ctx.fillText(GAME_NAME.toUpperCase(), w / 2, h / 2 + 150);
  return cv;
}

/** Small deed card for the 3D seat areas. */
export function drawDeedCard(sp, mortgaged, w = 300, h = 420) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = mortgaged ? '#d8d4ca' : '#fbf8f0';
  ctx.fillRect(0, 0, w, h);
  const col = sp.type === 'street' ? CITIES[sp.city].color : sp.type === 'utility' ? '#d77a1f' : NAVY;
  ctx.fillStyle = col;
  ctx.fillRect(14, 14, w - 28, 120);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const kind = sp.type === 'street' ? sp.city.toUpperCase() : sp.type === 'utility' ? 'UTILITY' : 'TRANSPORT';
  fitText(ctx, kind, w - 50, 700, 26, 14);
  ctx.fillText(kind, w / 2, 46);
  fitText(ctx, sp.name.toUpperCase(), w - 50, 800, 36, 18);
  ctx.fillText(sp.name.toUpperCase(), w / 2, 96);
  ctx.fillStyle = INK;
  if (sp.icon) icon(ctx, sp.icon, w / 2, 240, 120, col);
  else icon(ctx, 'shop', w / 2, 240, 110, col);
  fitText(ctx, `$${sp.price}`, w - 50, 800, 44, 20);
  ctx.fillText(`$${sp.price}`, w / 2, 360);
  if (mortgaged) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.5);
    ctx.fillStyle = 'rgba(192,57,43,0.85)';
    fitText(ctx, 'MORTGAGED', w * 0.92, 900, 46, 20);
    ctx.fillText('MORTGAGED', 0, 0);
    ctx.restore();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  return cv;
}

// ---------- dice ----------
export function drawDieFace(value, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(0, 0, size, size);
  const pip = (x, y) => {
    ctx.beginPath();
    ctx.arc(x * size, y * size, size * 0.085, 0, 7);
    ctx.fill();
  };
  ctx.fillStyle = value === 1 ? '#b3261e' : '#1b1b1f';
  const L = 0.27, M = 0.5, H = 0.73;
  const layout = {
    1: [[M, M]],
    2: [[L, L], [H, H]],
    3: [[L, L], [M, M], [H, H]],
    4: [[L, L], [H, L], [L, H], [H, H]],
    5: [[L, L], [H, L], [M, M], [L, H], [H, H]],
    6: [[L, L], [H, L], [L, M], [H, M], [L, H], [H, H]],
  };
  for (const [x, y] of layout[value]) pip(x, y);
  return cv;
}

// ---------- table ----------
export function drawWood(size = 2048) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4a2c1a';
  ctx.fillRect(0, 0, size, size);
  let seed = 11;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // planks
  const planks = 6;
  const ph = size / planks;
  for (let p = 0; p < planks; p++) {
    const base = 52 + rng() * 18;
    ctx.fillStyle = `hsl(22, 45%, ${base / 3.3}%)`;
    ctx.fillRect(0, p * ph, size, ph);
    for (let i = 0; i < 140; i++) {
      const y = p * ph + rng() * ph;
      const amp = 4 + rng() * 14;
      const freq = 0.002 + rng() * 0.006;
      const phase = rng() * 10;
      ctx.strokeStyle = `rgba(${rng() < 0.5 ? '20,10,4' : '120,74,40'},${0.06 + rng() * 0.12})`;
      ctx.lineWidth = 1 + rng() * 3;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const yy = y + Math.sin(x * freq + phase) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // knots
    for (let k = 0; k < 2; k++) {
      const kx = rng() * size;
      const ky = p * ph + ph * (0.3 + rng() * 0.4);
      for (let r = 26; r > 2; r -= 4) {
        ctx.strokeStyle = `rgba(30,15,6,${0.08 + (26 - r) * 0.008})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 2.4, r, 0, 0, 7);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, p * ph, size, 3);
  }
  return cv;
}

/** Name plate for a player seat. */
export function drawNameplate(name, role, color, w = 720, h = 160) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  roundRect(ctx, 6, 6, w - 12, h - 12, 30);
  ctx.fillStyle = '#f6f0e1';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(80, h / 2, 42, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = font(900, 46);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(role === 'monopolist' ? 'M' : 'C', 80, h / 2 + 2);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  fitText(ctx, name, w - 180, 800, 60, 24);
  ctx.fillText(name, 145, h / 2 - 16);
  fitText(ctx, role === 'monopolist' ? 'Monopolist' : 'Competitor', w - 180, 600, 32, 16);
  ctx.fillStyle = '#5a5f6b';
  ctx.fillText(role === 'monopolist' ? 'Monopolist' : 'Competitor', 147, h / 2 + 36);
  return cv;
}
