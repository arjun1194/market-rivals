// Small inline SVG icon set (24×24, stroke = currentColor).
const gearTeeth = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((a) => `<rect x="10.4" y="1.6" width="3.2" height="5" rx="1" fill="currentColor" stroke="none" transform="rotate(${a} 12 12)"/>`)
  .join('');

const ICONS = {
  gear: `${gearTeeth}<circle cx="12" cy="12" r="6.3" stroke-width="2.6"/><circle cx="12" cy="12" r="2.2"/>`,
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  seat: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  top: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  fast: '<path d="M4 6.5 10.5 12 4 17.5zM12.5 6.5 19 12l-6.5 5.5z"/>',
  log: '<path d="M7 6h12M7 12h12M7 18h8"/><circle cx="3.6" cy="6" r=".9" fill="currentColor"/><circle cx="3.6" cy="12" r=".9" fill="currentColor"/><circle cx="3.6" cy="18" r=".9" fill="currentColor"/>',
  book: '<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5z"/><path d="M4.5 20.5A2.5 2.5 0 0 0 7 23h12.5v-5"/>',
  leave: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
  trade: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  deeds: '<rect x="3.5" y="7" width="12" height="14" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V17"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  flip: '<path d="M4 11a8 8 0 0 1 14.3-4.9L20 8"/><path d="M20 3.5V8h-4.5"/><path d="M20 13a8 8 0 0 1-14.3 4.9L4 16"/><path d="M4 20.5V16h4.5"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  hammer: '<path d="M14 6.5 17.5 3 21 6.5 17.5 10z"/><path d="M15.7 8.3 5 19a1.4 1.4 0 0 1-2-2L13.7 6.3"/>',
  alert: '<path d="M12 3.5 22 20.5H2z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".9" fill="currentColor"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9.5 18h5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  start: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  house: '<path d="M4 11 12 4l8 7v9.5H4z"/><path d="M10 20.5V15h4v5.5"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6"/>',
  goto: '<path d="M6 6l12 12M18 9.5V18H9.5"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10.5h12M9 21l1.5-4M15 21l-1.5-4"/>',
  bolt: '<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12z"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16.5 15h.01"/><path d="M6 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4"/>',
  chat: '<path d="M4 5h16a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
};

export function icon(name, size = 18, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** A chess-style pawn silhouette filled with `color`. */
export function pawnSvg(color, size = 22) {
  return `<svg class="pawn-svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="6" r="4" fill="${color}"/><path d="M9 10.5h6l1.4 8H7.6z" fill="${color}"/><rect x="5" y="18" width="14" height="3.6" rx="1.8" fill="${color}"/><circle cx="10.6" cy="4.8" r="1.2" fill="#fff" opacity=".45"/></svg>`;
}

/** n little houses (and optionally an apartment block) in `color`, for rules illustrations. */
export function housesSvg(n, color, withApartment = true) {
  const house = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M2 9.5 10 3l8 6.5V18H2z" fill="${color}"/><rect x="8" y="12" width="4" height="6" fill="rgba(0,0,0,.25)"/></svg>`;
  const apt = `<svg viewBox="0 0 20 26" width="20" height="26" aria-hidden="true"><rect x="2" y="2" width="16" height="23" rx="1.5" fill="${color}"/>${[6, 11, 16]
    .map((y) => `<rect x="5" y="${y}" width="3.5" height="3" fill="rgba(255,255,255,.55)"/><rect x="11.5" y="${y}" width="3.5" height="3" fill="rgba(255,255,255,.55)"/>`)
    .join('')}<rect x="8" y="20.5" width="4" height="4.5" fill="rgba(0,0,0,.3)"/></svg>`;
  return `<span class="houses">${house.repeat(n)}${withApartment ? `<span class="arrow">→</span>${apt}` : ''}</span>`;
}
