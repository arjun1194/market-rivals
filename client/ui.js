// All HTML UI: lobby, HUD, modals. Game actions go through app.act(); lobby messages through app.send().
import { SPACES, CITIES, CARDS, TRANSPORTS, UTILITIES, GAME_NAME } from '/shared/data.js';
import * as R from '/shared/rules.js';
import { store } from './net.js';
import { icon, pawnSvg } from './icons.js';
import { rulesHTML } from './rules.js';

const $ = (sel) => document.querySelector(sel);
/** Phone layout: the log/chat and property lists open as sheets above the action bar. */
const isPhone = () => matchMedia('(max-width: 760px), (max-height: 520px)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const spColor = (sp) => (sp.type === 'street' ? CITIES[sp.city].color : sp.type === 'utility' ? '#d77a1f' : '#1d2b45');
const roleLabel = (r) => (r === 'monopolist' ? 'Monopolist' : 'Competitor');
const cornerName = (p) => (p.role === 'monopolist' ? 'Prison' : 'Price War');

export class UI {
  constructor(app) {
    this.app = app;
    this.view = app.view;
    this.tradeDraft = null;
    this.modalKind = null;
    this.settingsOpen = false;
    this.deedFlipped = false;
    this.rulesSec = 'idea';
    this.prefs = { fast: store.get('mr-fast') === 'on', log: store.get('mr-log') !== 'off' };
    this.prevCash = new Map();
    $('#btn-settings').innerHTML = icon('gear', 20);
    $('#recenter').innerHTML = `${icon('target', 18)}<span>Follow turn</span>`;
    $('#log-close').innerHTML = icon('close', 16);
    this.applyPrefs();
    this.bind();
    this.observeHud();
  }

  applyPrefs() {
    this.app.setSpeed?.(this.prefs.fast ? 2 : 1);
    this.applyLogVisibility();
  }

  /** Desktop: the log/chat panel follows the setting. Phones: it's a sheet opened from the action bar. */
  applyLogVisibility() {
    const sp = $('#sidepanel');
    const phone = isPhone();
    sp.hidden = phone ? !this.view.logOpen : !this.prefs.log;
    sp.classList.toggle('sheet-open', phone && !!this.view.logOpen);
  }

  // ---------- HUD measurement: keeps the 3D board centred in the space the HUD leaves free ----------
  observeHud() {
    const schedule = () => {
      if (this.measureQueued) return;
      this.measureQueued = true;
      requestAnimationFrame(() => {
        this.measureQueued = false;
        this.measureInsets();
      });
    };
    this.scheduleMeasure = schedule;
    const ro = new ResizeObserver(schedule);
    ['#actionbar', '#topbar', '#players'].forEach((sel) => ro.observe($(sel)));
    window.addEventListener('resize', () => {
      this.applyLogVisibility();
      schedule();
    });
  }

  measureInsets() {
    const root = document.documentElement.style;
    if ($('#hud').hidden) return this.app.world.setInsets(0, 0);
    const pl = $('#players');
    const strip = getComputedStyle(pl).flexDirection === 'row';
    const top = Math.max($('#topbar').getBoundingClientRect().bottom, strip ? pl.getBoundingClientRect().bottom : 0);
    const ab = $('#actionbar').getBoundingClientRect();
    const bottom = ab.height ? Math.max(0, window.innerHeight - ab.top) : 0;
    root.setProperty('--ab-h', `${Math.round(bottom)}px`);
    root.setProperty('--top-h', `${Math.round(top)}px`);
    this.app.world.setInsets(top, bottom);
  }

  // ---------- camera ----------
  renderCameraUI() {
    this.renderSettings();
    const show = this.app.cameraMode() === 'follow' && this.app.director.paused && !!this.view.room?.started;
    $('#recenter').hidden = !show;
  }

  // ---------- event wiring ----------
  bind() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act],[data-ui],[data-lobby]');
      // Clicking anywhere outside the settings menu closes it.
      if (this.settingsOpen && !e.target.closest('#settings-menu, #btn-settings')) this.toggleSettings(false);
      if (!el || el.disabled) return;
      if (el.tagName === 'A') e.preventDefault();
      if (el.dataset.act) {
        const args = {};
        if (el.dataset.pos !== undefined) args.pos = Number(el.dataset.pos);
        this.app.act(el.dataset.act, args);
        if (el.dataset.close) this.closeModal();
      } else if (el.dataset.ui) this.uiAction(el.dataset.ui, el);
      else this.lobbyAction(el.dataset.lobby, el);
    });
    $('#modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') this.closeModal();
    });
    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
        $('#tab-log').hidden = t.dataset.tab !== 'log';
        $('#tab-chat').hidden = t.dataset.tab !== 'chat';
        if (t.dataset.tab === 'chat') {
          this.view.chatUnread = 0;
          this.renderChatBadge();
        }
      }),
    );
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      if (input.value.trim()) this.app.send({ t: 'chat', text: input.value });
      input.value = '';
    });
  }

  uiAction(kind, el) {
    const v = this.view;
    switch (kind) {
      case 'settings':
        return this.toggleSettings();
      case 'cam':
        this.toggleSettings(false);
        return this.app.setCameraMode(el.dataset.mode);
      case 'recenter':
        return this.app.recenter();
      case 'log-sheet': {
        v.logOpen = !v.logOpen;
        if (v.logOpen) {
          v.propsOpen = false;
          if (v.chatUnread) document.querySelector('.tab[data-tab="chat"]').click();
        }
        this.applyLogVisibility();
        return this.render();
      }
      case 'pref': {
        const k = el.dataset.pref;
        if (k === 'sound') this.app.sound.toggle();
        else {
          this.prefs[k] = !this.prefs[k];
          store.set(`mr-${k}`, this.prefs[k] ? 'on' : 'off');
          this.applyPrefs();
        }
        return this.renderSettings();
      }
      case 'rules':
        this.toggleSettings(false);
        return this.openRules();
      case 'rules-sec':
        return this.openRules(el.dataset.sec);
      case 'flip': {
        const card = $('#modal-card .deed-flip');
        if (!card) return;
        this.deedFlipped = !this.deedFlipped;
        card.classList.toggle('flipped', this.deedFlipped);
        this.app.sound.play('card');
        return;
      }
      case 'leave':
        this.toggleSettings(false);
        if (v.state?.status === 'ended') return this.app.send({ t: 'leave' }); // nothing to lose
        return this.showModal(`<div class="confirm">
            <div class="confirm-ico">${icon('leave', 26)}</div>
            <h2>${v.room?.started ? 'Leave this game?' : 'Leave this room?'}</h2>
            <p>${v.room?.started ? 'A CPU player takes over your seat and keeps playing for you.' : 'You can join again with the room code.'}</p>
            <div class="modal-actions center"><button class="btn ghost" data-ui="close">Stay</button><button class="btn red" data-ui="leave-confirm">Leave</button></div>
          </div>`, 'confirm', 'narrow');
      case 'leave-confirm':
        this.closeModal();
        return this.app.send({ t: 'leave' });
      case 'props':
        v.propsOpen = !v.propsOpen;
        if (v.propsOpen && isPhone()) {
          v.logOpen = false;
          this.applyLogVisibility();
        }
        return this.render();
      case 'trade':
        return this.openTrade();
      case 'offers':
        return this.openOffers();
      case 'deed':
        return this.openDeed(Number(el.dataset.pos));
      case 'player':
        return this.openPlayer(el.dataset.id);
      case 'close':
        return this.closeModal();
      case 'standings':
        return this.openGameOver();
      case 'propose':
        return this.submitTrade();
      case 'respond':
        this.app.act('respondTrade', { id: Number(el.dataset.id), accept: el.dataset.accept === '1' });
        return this.closeModal();
      case 'cancel-offer':
        this.app.act('cancelTrade', { id: Number(el.dataset.id) });
        return this.closeModal();
      case 'trade-partner':
        return;
    }
  }

  lobbyAction(kind, el) {
    const name = $('#name-input')?.value.trim() || store.get('mr-name') || '';
    if (['create', 'join'].includes(kind)) {
      if (!name) return this.toast('Enter your name first', 'error');
      store.set('mr-name', name);
    }
    switch (kind) {
      case 'create':
        return this.app.send({ t: 'create', name });
      case 'join': {
        const code = $('#code-input').value.trim().toUpperCase();
        if (code.length !== 4) return this.toast('Room codes have 4 letters', 'error');
        return this.app.send({ t: 'join', code, name });
      }
      case 'role':
        return this.app.send({ t: 'setRole', role: el.dataset.role });
      case 'cpu-role':
        return this.app.send({ t: 'cpuRole', playerId: el.dataset.id, role: el.dataset.role });
      case 'add-cpu':
        return this.app.send({ t: 'addCpu', role: el.dataset.role });
      case 'kick':
        return this.app.send({ t: 'kick', playerId: el.dataset.id });
      case 'mode':
        return this.app.send({ t: 'settings', settings: { mode: el.dataset.mode } });
      case 'time':
        return this.app.send({ t: 'settings', settings: { timeLimitMin: Number(el.dataset.time) } });
      case 'start':
        return this.app.send({ t: 'start' });
      case 'copy': {
        const link = `${location.origin}/?room=${this.view.room.code}`;
        navigator.clipboard?.writeText(link).then(
          () => this.toast('Invite link copied!'),
          () => this.toast(link),
        );
        return;
      }
      case 'leave':
        return this.app.send({ t: 'leave' });
    }
  }

  // ---------- settings menu ----------
  toggleSettings(open = !this.settingsOpen) {
    this.settingsOpen = open;
    $('#settings-menu').hidden = !open;
    $('#btn-settings').classList.toggle('on', open);
    $('#btn-settings').setAttribute('aria-expanded', String(open));
    if (open) this.renderSettings();
  }

  renderSettings() {
    if (!this.settingsOpen) return;
    const sw = (key, ico, label, on, hint) => `
      <button class="sm-item" role="menuitemcheckbox" aria-checked="${on}" data-ui="pref" data-pref="${key}">
        ${icon(ico, 18)}<span class="sm-label">${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="switch ${on ? 'on' : ''}"></span>
      </button>`;
    $('#settings-menu').innerHTML = `
      <div class="sm-title">Settings</div>
      <div class="sm-section">Camera</div>
      <div class="sm-views">${[
        ['follow', 'target', 'Follow turn', 'F'],
        ['seat', 'seat', 'My seat', 'S'],
        ['top', 'top', 'Top view', 'T'],
      ]
        .map(([mode, ico, label, key]) => {
          const on = this.app.cameraMode() === mode;
          return `<button class="sm-view ${on ? 'on' : ''}" data-ui="cam" data-mode="${mode}" aria-pressed="${on}">${icon(ico, 20)}<span>${label}</span><kbd>${key}</kbd></button>`;
        })
        .join('')}</div>
      <div class="sm-section">Preferences</div>
      ${sw('sound', 'sound', 'Sound effects', this.app.sound.enabled)}
      ${sw('fast', 'fast', 'Quick animations', this.prefs.fast, 'Pawns and dice move twice as fast')}
      ${sw('log', 'log', 'Game log & chat', this.prefs.log)}
      <div class="sm-sep"></div>
      <button class="sm-item" data-ui="rules">${icon('book', 18)}<span class="sm-label">How to play</span></button>
      <button class="sm-item danger" data-ui="leave">${icon('leave', 18)}<span class="sm-label">Leave game</span></button>`;
  }

  /** Esc: close the innermost open thing. */
  escape() {
    if (this.settingsOpen) return this.toggleSettings(false);
    this.closeModal();
  }

  /** A chat message arrived: count it as unread unless the chat is on screen, and toast it if the panel is closed. */
  onChat(msg) {
    if (msg?.from && msg.from !== this.view.you && !this.chatOnScreen()) {
      this.view.chatUnread++;
      this.renderChatBadge();
    }
    this.notifyChat(msg);
  }

  chatOnScreen() {
    return getComputedStyle($('#sidepanel')).display !== 'none' && !$('#tab-chat').hidden;
  }

  /** With the log/chat panel hidden, surface chat messages as toasts. */
  notifyChat(msg) {
    if (!msg?.from || msg.from === this.view.you || !this.view.room?.started) return;
    if (getComputedStyle($('#sidepanel')).display !== 'none') return; // chat tab is on screen (hidden by setting or on phones otherwise)
    this.toast(`${msg.name}: ${msg.text}`);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 4200 : 3000);
  }

  // ---------- lobby ----------
  renderLobby() {
    const v = this.view;
    const inGame = v.room?.started && v.state;
    $('#lobby').hidden = !!inGame;
    $('#hud').hidden = !inGame;
    if (inGame) return;
    const body = $('#lobby-body');
    if (!v.room) {
      const params = new URLSearchParams(location.search);
      const code = params.get('room') || '';
      const prevName = esc(store.get('mr-name') || '');
      if (body.dataset.screen === 'home') return; // keep typed input
      body.dataset.screen = 'home';
      body.innerHTML = `
        <div class="lobby-grid">
          <div class="panel">
            <h3>Play</h3>
            <div class="field"><label for="name-input">Your name</label><input id="name-input" class="input" maxlength="18" value="${prevName}" placeholder="e.g. Sam" /></div>
            <div class="row" style="margin-bottom:18px"><button class="btn primary big grow" data-lobby="create">Create a table</button></div>
            <div class="field"><label for="code-input">Or join with a room code</label>
              <div class="row"><input id="code-input" class="input grow" maxlength="4" value="${esc(code)}" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:.2em" /><button class="btn" data-lobby="join">Join</button></div>
            </div>
            <p class="rules-mini">Friends on your network open the same address and join with the code. Fill empty seats with CPU players.</p>
          </div>
          ${this.rolesPanel()}
        </div>`;
      setTimeout(() => (code ? $('#code-input') : $('#name-input'))?.focus(), 50);
      $('#code-input').addEventListener('keydown', (e) => e.key === 'Enter' && this.lobbyAction('join'));
      $('#name-input').addEventListener('keydown', (e) => e.key === 'Enter' && this.lobbyAction(code ? 'join' : 'create'));
      return;
    }
    body.dataset.screen = 'room';
    const r = v.room;
    const host = r.hostId === v.you;
    const players = r.players
      .map((p) => {
        const canSet = (p.id === v.you || (host && p.cpu)) && !r.started;
        const act = p.id === v.you ? 'role' : 'cpu-role';
        const tog = ['competitor', 'monopolist']
          .map((role) => `<button class="${role} ${p.role === role ? 'on' : ''}" ${canSet ? '' : 'disabled'} data-lobby="${act}" data-role="${role}" data-id="${p.id}">${role === 'competitor' ? 'Competitor' : 'Monopolist'}</button>`)
          .join('');
        return `<div class="lp">
          <div class="pawn-dot" style="background:${p.role === 'monopolist' ? '#2f6fdb' : '#2fa84f'}">${p.role === 'monopolist' ? 'M' : 'C'}</div>
          <div class="name">${esc(p.name)}${p.id === v.you ? '<span class="tag">you</span>' : ''}${p.id === r.hostId ? '<span class="tag">host</span>' : ''}${!p.connected ? '<span class="tag">away</span>' : ''}</div>
          <div class="role-toggle">${tog}</div>
          ${host && p.id !== v.you ? `<button class="icon-btn" title="Remove" data-lobby="kick" data-id="${p.id}">✕</button>` : ''}
        </div>`;
      })
      .join('');
    const seg = (items, cur, attr, kind) =>
      `<div class="seg">${items.map(([val, label]) => `<button class="${String(cur) === String(val) ? 'on' : ''}" ${host ? '' : 'disabled'} data-lobby="${kind}" data-${attr}="${val}">${label}</button>`).join('')}</div>`;
    body.innerHTML = `
      <div class="lobby-grid">
        <div class="panel">
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <div><div class="rules-mini">Room code</div><div class="room-code">${esc(r.code)}</div></div>
            <div class="row"><button class="btn ghost small" data-lobby="copy">Copy invite link</button><button class="btn ghost small" data-lobby="leave">Leave</button></div>
          </div>
          <h3>Players (${r.players.length}/6)</h3>
          <div class="lobby-players">${players}</div>
          ${host && r.players.length < 6 ? `<div class="row" style="margin-top:10px"><button class="btn small green" data-lobby="add-cpu" data-role="competitor">+ CPU Competitor</button><button class="btn small blue" data-lobby="add-cpu" data-role="monopolist">+ CPU Monopolist</button></div>` : ''}
          <h3 style="margin-top:18px">Game settings</h3>
          <div class="field"><label>Victory</label>${seg([['A', 'A · Last player standing'], ['B', 'B · Richest of the surviving role']], r.settings.mode, 'mode', 'mode')}</div>
          <div class="field"><label>Time limit (Two-Hour Game scoring)</label>${seg([[0, 'Off'], [30, '30m'], [60, '60m'], [90, '90m'], [120, '2h']], r.settings.timeLimitMin, 'time', 'time')}</div>
          ${r.balanceProblem ? `<div class="warn">⚠ ${esc(r.balanceProblem)}</div>` : '<div class="ok">✓ Roles are balanced — ready to play</div>'}
          <div class="row" style="margin-top:14px">
            ${host ? `<button class="btn primary big grow" data-lobby="start" ${r.balanceProblem ? 'disabled' : ''}>Start game</button>` : '<div class="rules-mini">Waiting for the host to start…</div>'}
          </div>
        </div>
        ${this.rolesPanel()}
      </div>`;
  }

  rolesPanel() {
    const role = (cls, color, name, sub, items) => `
      <div class="role-card ${cls}">
        <div class="rc-head">${pawnSvg(color, 26)}<div><div class="rc-name">${name}</div><div class="rc-sub">${sub}</div></div></div>
        <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      </div>`;
    return `<div class="panel roles-panel">
      <h3>Two roles, one board</h3>
      ${role('competitor', '#2fa84f', 'Competitor', 'Green pawn · plays fair', ['Build on any street you own', 'Fair, market-rate rents', 'Still collect rent in a Price War'])}
      ${role('monopolist', '#2f6fdb', 'Monopolist', 'Blue pawn · corners the market', ['Own 2 streets of a city to build', 'Double rent in cities you control', 'No rent while in Prison'])}
      <button class="btn rules-btn" data-ui="rules">${icon('book', 18)}<span>How to play</span></button>
    </div>`;
  }

  // ---------- HUD ----------
  render() {
    this.renderLobby();
    this.scheduleMeasure?.();
    const v = this.view;
    const s = v.state;
    if (!v.room?.started || !s) return;
    this.renderCameraUI();
    $('#tb-room').textContent = `Room ${v.room.code}`;
    $('#tb-mode').textContent = s.settings.mode === 'B' ? 'Victory B · richest survivor' : 'Victory A · last standing';
    this.renderPlayers();
    this.renderActions();
    this.renderLog();
    this.renderProps();
    this.checkPrompts();
  }

  me() {
    return this.view.state?.players.find((p) => p.id === this.view.you);
  }

  renderPlayers() {
    const s = this.view.state;
    const cur = s.players[s.turn.idx];
    $('#players').innerHTML = s.players
      .map((p) => {
        const props = R.propertiesOf(s, p.id);
        const roomP = this.view.room.players.find((x) => x.id === p.id);
        const chips = [
          `<span class="role-badge ${p.role}">${roleLabel(p.role)}</span>`,
          p.cpu ? '<span class="status">CPU</span>' : '',
          roomP && !roomP.connected && !p.cpu ? '<span class="status off">away</span>' : '',
          p.jail ? `<span class="status ${p.role === 'monopolist' ? 'jail' : 'war'}">${cornerName(p)}</span>` : '',
          p.bankrupt ? '<span class="status war">Bankrupt</span>' : '',
        ].join('');
        return `<div class="pcard ${cur.id === p.id && s.status === 'playing' ? 'turn' : ''} ${p.bankrupt ? 'out' : ''}" data-ui="player" data-id="${p.id}">
          <div class="pawn-dot" style="background:${p.color}">${p.role === 'monopolist' ? 'M' : 'C'}</div>
          <div class="pname">${p.jail ? `<span class="pjail" title="${cornerName(p)}">${icon('lock', 11)}</span>` : ''}${esc(p.name)}${p.id === this.view.you ? ' (you)' : ''}</div>
          <div class="pcash">${money(p.cash)}</div>
          <div class="pmeta">${chips}</div>
          <div class="pprops">${props.length} deed${props.length === 1 ? '' : 's'}</div>
        </div>`;
      })
      .join('');
    // Money changes float up from the player's card (the 3D seats are off screen on phones).
    for (const p of s.players) {
      const prev = this.prevCash.get(p.id);
      if (prev !== undefined && prev !== p.cash) this.flashCash(p.id, p.cash - prev);
      this.prevCash.set(p.id, p.cash);
    }
    // Phones: keep the active player's chip in view in the scrolling strip.
    const strip = $('#players');
    const chip = strip.querySelector('.pcard.turn');
    if (chip && strip.scrollWidth > strip.clientWidth) {
      const l = chip.offsetLeft - strip.offsetLeft;
      if (l < strip.scrollLeft || l + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: l - 8, behavior: 'smooth' });
    }
  }

  flashCash(id, delta) {
    const card = $(`#players .pcard[data-id="${id}"]`);
    if (!card || !delta) return;
    const r = card.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `cash-fx ${delta > 0 ? 'up' : 'down'}`;
    el.textContent = `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`;
    el.style.left = `${r.right - 8}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }

  renderActions() {
    const v = this.view;
    const s = v.state;
    const t = s.turn;
    const cur = s.players[t.idx];
    const me = this.me();
    const mine = me && cur.id === me.id && s.status === 'playing';
    const busy = v.busy ? 'disabled' : '';
    const btn = (cls, attrs, label, ico) => `<button class="btn ${cls}" ${attrs}>${ico ? icon(ico, 18) : ''}<span>${label}</span></button>`;

    // Tools on the right: same size as the main buttons, always in the same place.
    let tools = '';
    if (me && !me.bankrupt && s.status === 'playing') {
      const inbox = s.trades.filter((tr) => tr.to === v.you).length;
      const sent = s.trades.filter((tr) => tr.from === v.you).length;
      const owned = R.propertiesOf(s, me.id).length;
      tools = `
        ${inbox || sent ? `<button class="btn tool ${inbox ? 'attention' : ''}" data-ui="offers" title="Trade offers">${icon('mail', 18)}<span class="lbl">Offers</span><span class="count">${inbox + sent}</span></button>` : ''}
        <button class="btn tool" data-ui="trade" title="Propose a trade">${icon('trade', 18)}<span class="lbl">Trade</span></button>
        <button class="btn tool ${v.propsOpen ? 'on' : ''}" data-ui="props" title="My properties">${icon('deeds', 18)}<span class="lbl">Properties</span><span class="count">${owned}</span></button>`;
    }
    // Phones: the game log & chat open from here instead of a side panel.
    tools += `<button class="btn tool phone-only ${v.logOpen ? 'on' : ''}" data-ui="log-sheet" title="Game log & chat">${icon('chat', 18)}<span class="lbl">Chat</span><span class="count alert" ${v.chatUnread ? '' : 'hidden'}>${v.chatUnread}</span></button>`;

    let kicker = '';
    let title = '';
    let sub = '';
    let buttons = '';
    let thumb = '';
    if (s.status === 'ended') {
      const w = s.players.find((p) => p.id === s.winner);
      kicker = 'Game over';
      title = `${icon('trophy', 20)}<span>${w ? `${esc(w.name)} wins!` : 'Game over'}</span>`;
      sub = esc(s.endReason || '');
      buttons = btn('primary', 'data-ui="standings"', 'Final standings') + btn('ghost', 'data-ui="leave"', 'Back to lobby');
    } else if (!mine) {
      const what = {
        roll: () => 'is about to roll',
        jail: () => `is deciding how to leave ${cornerName(cur)}`,
        buy: () => `is deciding whether to buy ${esc(SPACES[t.pending?.pos]?.name || 'a property')}`,
        tax: () => 'is choosing how to pay Income Tax',
        debt: () => `must raise cash to pay ${money(t.pending?.amount ?? 0)}`,
        manage: () => 'is building, mortgaging or trading',
      }[t.phase]?.() || '';
      kicker = `${roleLabel(cur.role)}${cur.cpu ? ' · CPU' : ''}`;
      title = `<span class="pawn-dot sm" style="background:${cur.color}"></span><span>${esc(cur.name)}'s turn</span>`;
      sub = me?.bankrupt ? "You're bankrupt and watching the rest of the game." : `${esc(cur.name)} ${what}.`;
    } else {
      switch (t.phase) {
        case 'roll':
          kicker = 'Your turn';
          title = t.isExtra ? 'Doubles! Roll again' : 'Roll the dice';
          sub = t.isExtra ? 'This is your one extra turn for rolling doubles.' : 'Move clockwise by the total of both dice.';
          buttons = btn('primary', `data-act="roll" ${busy}`, 'Roll dice <kbd>Space</kbd>', 'dice');
          break;
        case 'jail': {
          const prison = me.role === 'monopolist';
          kicker = `Your turn · try ${me.jail.turns + 1} of 2`;
          title = prison ? "You're in Prison" : "You're in a Price War";
          sub = `${prison ? 'Monopolists collect no rent here.' : 'Competitors keep collecting rent here.'} Roll doubles to leave, or pay $50 and roll normally.`;
          buttons = btn('primary', `data-act="payJail" ${busy || (me.cash < 50 ? 'disabled' : '')}`, 'Pay $50 and roll') + btn('secondary', `data-act="rollJail" ${busy}`, 'Roll for doubles', 'dice');
          break;
        }
        case 'buy': {
          const sp = SPACES[t.pending.pos];
          const short = me.cash < sp.price;
          kicker = `Unowned · ${sp.type === 'street' ? esc(sp.city) : sp.type === 'utility' ? 'Utility' : 'Transport line'}`;
          title = esc(sp.name);
          sub = short
            ? `You have ${money(me.cash)}. Mortgage something to afford it, or leave it with the Treasurer.`
            : `You have ${money(me.cash)}. If you don't buy it, it stays with the Treasurer (no auction).`;
          thumb = this.miniDeed(sp);
          buttons = btn('primary', `data-act="buy" ${busy || (short ? 'disabled' : '')}`, `Buy for ${money(sp.price)}`) + btn('secondary', `data-act="decline" ${busy}`, "Don't buy") + btn('ghost view-deed', `data-ui="deed" data-pos="${sp.pos}" title="View deed"`, 'View deed', 'deeds');
          break;
        }
        case 'tax': {
          const pct = t.pending.percent;
          kicker = 'Your turn';
          title = 'Income Tax';
          sub = `Pay a flat $200, or ${me.role === 'monopolist' ? '20%' : '10%'} of your cash + 10% of your property and buildings.`;
          const pctCheaper = pct < 200;
          buttons = btn(pctCheaper ? 'secondary' : 'primary', `data-act="taxFlat" ${busy}`, 'Flat $200') + btn(pctCheaper ? 'primary' : 'secondary', `data-act="taxPercent" ${busy}`, `Percentage ${money(pct)}`);
          break;
        }
        case 'debt': {
          const creditor = t.pending.creditor ? s.players.find((p) => p.id === t.pending.creditor) : null;
          const short = t.pending.amount - me.cash;
          const raisable = R.liquidationValue(s, me);
          kicker = `You owe · ${esc(t.pending.reason)}`;
          title = `${icon('alert', 20)}<span>Pay ${money(t.pending.amount)} to ${creditor ? esc(creditor.name) : 'the Treasurer'}</span>`;
          sub =
            short <= 0
              ? 'You have enough cash now.'
              : raisable >= short
                ? `Raise ${money(short)} more by selling buildings or mortgaging. You could raise up to ${money(raisable)}.`
                : `You're ${money(short)} short and selling everything raises only ${money(raisable)}. You'll have to declare bankruptcy.`;
          buttons = btn('primary', `data-act="payDebt" ${busy || (short > 0 ? 'disabled' : '')}`, `Pay ${money(t.pending.amount)}`) + btn('danger', `data-act="bankrupt" ${busy}`, 'Declare bankruptcy');
          if (!v.propsOpen) {
            v.propsOpen = true;
            if (isPhone() && v.logOpen) {
              v.logOpen = false;
              this.applyLogVisibility();
            }
          }
          break;
        }
        case 'manage':
          kicker = 'Your turn';
          title = 'Build or trade';
          sub = 'Build, mortgage or trade, then end your turn. Buildings can only be bought on your own turn.';
          buttons = btn('primary', `data-act="endTurn" ${busy}`, 'End turn <kbd>E</kbd>', 'check');
          break;
      }
    }
    $('#actionbar').innerHTML = `<div class="ab ${thumb ? 'has-thumb' : ''}">
      ${thumb}
      <div class="ab-main">
        <div class="ab-text">
          ${kicker ? `<div class="ab-kicker">${kicker}</div>` : ''}
          <div class="ab-title">${title}</div>
          ${sub ? `<div class="ab-sub">${sub}</div>` : ''}
        </div>
        <div class="ab-row">
          <div class="ab-primary">${buttons}</div>
          ${tools ? `<div class="ab-tools">${tools}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  miniDeed(sp) {
    const kind = sp.type === 'street' ? sp.city : sp.type === 'utility' ? 'Utility' : 'Transport';
    return `<button class="mini-deed" data-ui="deed" data-pos="${sp.pos}" title="View deed">
      <span class="hd" style="background:${spColor(sp)}"><span class="k">${esc(kind)}</span><span class="n">${esc(sp.name)}</span></span>
      <span class="pr">${money(sp.price)}</span>
    </button>`;
  }

  renderLog() {
    const log = this.view.state.log;
    const el = $('#tab-log');
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = log.map((l) => `<div class="log-line ${l.kind}">${esc(l.text)}</div>`).join('');
    if (atBottom || !this.logInit) el.scrollTop = el.scrollHeight;
    this.logInit = true;
  }

  renderChat() {
    const chat = this.view.room?.chat || [];
    const el = $('#chat-list');
    el.innerHTML = chat
      .map((m) => (m.from ? `<div class="chat-line"><span class="who">${esc(m.name)}:</span> ${esc(m.text)}</div>` : `<div class="chat-line sys">${esc(m.text)}</div>`))
      .join('');
    el.scrollTop = el.scrollHeight;
  }

  renderChatBadge() {
    const n = this.view.chatUnread;
    const b = $('#chat-badge');
    b.hidden = !n;
    b.textContent = n;
    const c = $('#actionbar [data-ui="log-sheet"] .count');
    if (c) {
      c.hidden = !n;
      c.textContent = n;
    }
  }

  renderProps() {
    const v = this.view;
    const s = v.state;
    const me = this.me();
    const panel = $('#propspanel');
    panel.hidden = !v.propsOpen || !me;
    if (panel.hidden) return;
    const myTurn = s.players[s.turn.idx].id === me.id && s.status === 'playing';
    const mine = R.propertiesOf(s, me.id).sort((a, b) => a - b);
    const rows = mine
      .map((pos) => {
        const sp = SPACES[pos];
        const pr = s.props[pos];
        const b = R.canBuild(s, me, pos);
        const canBuildNow = b.ok && myTurn && s.turn.phase !== 'debt';
        const m = R.canMortgage(s, me, pos);
        const u = R.canUnmortgage(s, me, pos);
        const lvl = sp.type === 'street' ? (R.isApartment(me.role, pr.level) ? '🏢' : '🏠'.repeat(pr.level)) : '';
        const buildBtn = sp.type === 'street' ? `<button class="btn small green" data-act="build" data-pos="${pos}" title="${esc(b.ok ? (myTurn ? `Build for ${money(b.cost)}` : 'Only on your turn') : b.reason)}" ${canBuildNow && !v.busy ? '' : 'disabled'}>+${b.apartment ? 'Apt' : '🏠'}</button>` : '';
        const sellBtn = pr.level ? `<button class="btn small" data-act="sell" data-pos="${pos}" title="Sell one level back for ${money(sp.house / 2)}" ${v.busy ? 'disabled' : ''}>−</button>` : '';
        const mortBtn = pr.mortgaged
          ? `<button class="btn small" data-act="unmortgage" data-pos="${pos}" title="${esc(u.ok ? '' : u.reason)}" ${u.ok && !v.busy ? '' : 'disabled'}>Redeem ${money(R.redeemPrice(pos))}</button>`
          : `<button class="btn small ghost" data-act="mortgage" data-pos="${pos}" title="${esc(m.ok ? `Get ${money(m.value)}` : m.reason)}" ${m.ok && !v.busy ? '' : 'disabled'}>Mortgage</button>`;
        return `<div class="prop-row ${pr.mortgaged ? 'mort' : ''}">
          <div class="sw" style="background:${spColor(sp)}"></div>
          <div><div class="nm" data-ui="deed" data-pos="${pos}">${esc(sp.name)} <span class="lvl">${lvl}</span></div>
            <div class="sub">${pr.mortgaged ? 'Mortgaged — no rent' : `Rent now: ${R.rentLabel(s, pos)}`}${sp.type === 'street' ? ` · ${esc(sp.city)}` : ''}</div></div>
          <div class="acts">${buildBtn}${sellBtn}${mortBtn}</div>
        </div>`;
      })
      .join('');
    panel.innerHTML = `<div class="pp-head"><span>My properties · ${money(me.cash)}</span><button class="icon-btn" data-ui="props" title="Close">✕</button></div>
      <div class="pp-body">${rows || '<div class="rules-mini" style="padding:8px">You don\'t own anything yet. Land on an unowned property to buy it.</div>'}
      ${me.role === 'monopolist' ? '<div class="rules-mini" style="padding:4px 6px">Monopolists build only in cities where they own 2 unmortgaged streets.</div>' : '<div class="rules-mini" style="padding:4px 6px">Competitors can build on any street they own.</div>'}</div>`;
  }

  /** Auto-open incoming offers and the game-over screen once. */
  checkPrompts() {
    const v = this.view;
    const s = v.state;
    v.seenTrades ??= new Set();
    for (const tr of s.trades) {
      if (tr.to === v.you && !v.seenTrades.has(tr.id)) {
        v.seenTrades.add(tr.id);
        if (!this.modalKind) this.openOffers();
        else this.toast(`New trade offer from ${s.players.find((p) => p.id === tr.from)?.name}`);
        this.app.sound.play('turn');
      }
    }
    if (s.status === 'ended' && !v.shownGameOver) {
      v.shownGameOver = true;
      this.openGameOver();
      this.app.sound.play('win');
    }
    if (this.modalKind === 'deed' && this.modalPos !== undefined) this.openDeed(this.modalPos, true);
    if (this.modalKind === 'offers') this.openOffers(true);
  }

  // ---------- modals ----------
  showModal(html, kind, cls = '') {
    this.modalKind = kind;
    $('#modal-card').className = `modal-card ${cls}`;
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
  }

  closeModal() {
    $('#modal').hidden = true;
    this.modalKind = null;
    this.modalPos = undefined;
  }

  /** Two-sided title deed: rents on the front, mortgage terms on the back. */
  deedHTML(pos, flipped) {
    const s = this.view.state;
    const sp = SPACES[pos];
    const pr = s?.props[pos];
    const owner = pr?.owner ? s.players.find((p) => p.id === pr.owner) : null;
    const ownCol = owner && !pr.mortgaged ? (owner.role === 'monopolist' ? 'm' : 'c') : '';
    const dash = '<span class="na">—</span>';
    const cell = (val, col) => `<span class="v ${col} ${ownCol === col ? 'own' : ''}">${val ?? dash}</span>`;
    const row = (key, label, c, m, cur) => `<div class="dd-row ${key === cur ? 'cur' : ''}"><span class="lbl">${label}</span>${cell(c, 'c')}${cell(m, 'm')}</div>`;
    const head = `<div class="dd-row dd-cols"><span class="lbl"></span><span class="v c">Competitor</span><span class="v m">Monopolist</span></div>`;

    let kicker = 'Title deed';
    let stats = '';
    let rows = '';
    let note = '';
    if (sp.type === 'street') {
      const { comp, mono } = R.streetRents(pos);
      let cur = null;
      if (ownCol === 'c') cur = ['land', 'h1', 'h2', 'h3', 'h4', 'apt'][pr.level];
      else if (ownCol === 'm') cur = pr.level === 0 ? (R.hasMonopoly(s, owner, sp.city) ? 'mland' : 'land') : ['land', 'h1', 'h2', 'h3', 'apt'][pr.level];
      stats = `<div class="dd-stat"><span>Price</span><b>${money(sp.price)}</b></div><div class="dd-stat"><span>Each house</span><b>${money(sp.house)}</b></div>`;
      rows = [
        row('land', 'Land only', money(comp[0]), money(mono[0]), cur),
        row('mland', 'Land only · monopoly', null, money(mono[1]), cur),
        row('h1', 'With 1 house', money(comp[1]), money(mono[2]), cur),
        row('h2', 'With 2 houses', money(comp[2]), money(mono[3]), cur),
        row('h3', 'With 3 houses', money(comp[3]), money(mono[4]), cur),
        row('h4', 'With 4 houses', money(comp[4]), null, cur),
        row('apt', 'With an apartment', money(comp[5]), money(mono[5]), cur),
      ].join('');
      note = 'Competitors build 4 houses, then an apartment. Monopolists build 3, then an apartment.';
    } else if (sp.type === 'transport') {
      kicker = 'Transport line';
      const n = owner ? R.countOwned(s, owner.id, TRANSPORTS) : 0;
      stats = `<div class="dd-stat"><span>Price</span><b>${money(sp.price)}</b></div><div class="dd-stat"><span>Lines on the board</span><b>4</b></div>`;
      rows = [1, 2, 3, 4].map((k) => row(k, `${k} line${k > 1 ? 's' : ''} owned`, '$20', money(40 * 2 ** (k - 1)), ownCol ? n : null)).join('');
      note = 'Competitor fares are regulated. Monopolist fares double with every line they own.';
    } else if (sp.type === 'utility') {
      kicker = 'Utility';
      const n = owner ? R.countOwned(s, owner.id, UTILITIES) : 0;
      stats = `<div class="dd-stat"><span>Price</span><b>${money(sp.price)}</b></div><div class="dd-stat"><span>Utilities on the board</span><b>2</b></div>`;
      rows = [row(1, '1 utility owned', '4× dice', '4× dice', ownCol ? n : null), row(2, 'Both owned', '4× dice', '10× dice', ownCol ? n : null)].join('');
      note = 'The visitor rolls the dice and pays that total times the multiplier.';
    }
    const band = (cls) => `<div class="dd-band ${cls}" style="--c:${spColor(sp)}">
        <div class="dd-kicker">${kicker}</div>
        <div class="dd-name">${esc(sp.name)}</div>
        ${sp.type === 'street' ? `<div class="dd-city">${esc(sp.city)}</div>` : ''}
      </div>`;
    const front = `<div class="deed-face deed-front">
        ${band('')}
        <div class="dd-stats">${stats}</div>
        <div class="dd-table">${head}${rows}</div>
        <p class="dd-note">${note}</p>
        <div class="dd-hint">${icon('flip', 14)} Tap the card to flip it</div>
      </div>`;
    const back = `<div class="deed-face deed-back" style="--c:${spColor(sp)}">
        <div class="dd-back-frame">
          <div class="dd-kicker">Mortgage terms</div>
          <div class="dd-name">${esc(sp.name)}</div>
          ${sp.type === 'street' ? `<div class="dd-city">${esc(sp.city)}</div>` : ''}
          <div class="dd-mort">
            <span>Mortgage value</span>
            <b>${money(R.mortgageValue(pos))}</b>
            <small>half the price of ${money(sp.price)}</small>
          </div>
          <div class="dd-redeem"><span>Redeem for</span><b>${money(R.redeemPrice(pos))}</b><small>mortgage + 10%</small></div>
          <p>Keep this side up while the property is mortgaged. It collects no rent and can't hold buildings.${sp.house ? ` Sell any buildings first: they go back to the Treasurer for ${money(sp.house / 2)} each.` : ''}</p>
          ${pr?.mortgaged ? '<div class="dd-stamp">Mortgaged</div>' : ''}
        </div>
      </div>`;
    return `<div class="deed-stage"><div class="deed-flip ${flipped ? 'flipped' : ''}" data-ui="flip" role="button" aria-label="Flip the card" tabindex="0">${front}${back}</div></div>`;
  }

  deedStatus(pos) {
    const s = this.view.state;
    const sp = SPACES[pos];
    const pr = s?.props[pos];
    if (!s || !pr) return '';
    const owner = pr.owner ? s.players.find((p) => p.id === pr.owner) : null;
    if (!owner) return `<div class="deed-status"><span class="ds-dot empty"></span><span><b>Unowned</b> · land on it to buy it for ${money(sp.price)}</span></div>`;
    return `<div class="deed-status">
      <span class="ds-dot" style="background:${owner.color}"></span>
      <span><b>${esc(owner.name)}</b> · ${roleLabel(owner.role)}</span>
      <span class="ds-right ${pr.mortgaged ? 'bad' : ''}">${pr.mortgaged ? 'Mortgaged · no rent' : `Rent now <b>${esc(R.rentLabel(s, pos))}</b>`}</span>
    </div>`;
  }

  openDeed(pos, refresh = false) {
    if (refresh && this.modalKind !== 'deed') return;
    const sp = SPACES[pos];
    const s = this.view.state;
    if (!['street', 'transport', 'utility'].includes(sp.type)) return this.openSpaceInfo(pos);
    const me = this.me();
    const pr = s?.props[pos];
    // Mortgaged deeds lie face down, like on a real table. Re-flip when the mortgage state changes.
    if (!refresh || this.modalPos !== pos || this.deedMortgaged !== !!pr?.mortgaged) this.deedFlipped = !!pr?.mortgaged;
    this.deedMortgaged = !!pr?.mortgaged;
    let actions = '';
    // Deciding whether to buy this very property: offer the choice right here.
    const t = s?.turn;
    if (me && t?.phase === 'buy' && t.pending?.pos === pos && s.players[t.idx].id === me.id && s.status === 'playing') {
      const short = me.cash < sp.price;
      actions += `<button class="btn primary" data-act="buy" ${short || this.view.busy ? 'disabled' : ''} data-close="1"><span>Buy for ${money(sp.price)}</span></button>`;
      actions += `<button class="btn secondary" data-act="decline" ${this.view.busy ? 'disabled' : ''} data-close="1"><span>Don't buy</span></button>`;
    }
    if (me && pr?.owner === me.id && s.status === 'playing') {
      const myTurn = s.players[s.turn.idx].id === me.id;
      const b = R.canBuild(s, me, pos);
      const m = R.canMortgage(s, me, pos);
      const u = R.canUnmortgage(s, me, pos);
      const busy = this.view.busy;
      if (sp.type === 'street' && !pr.mortgaged) {
        const ok = b.ok && myTurn && s.turn.phase !== 'debt' && !busy;
        const why = !b.ok ? b.reason : !myTurn ? 'Only on your turn' : '';
        actions += `<button class="btn green" data-act="build" data-pos="${pos}" ${ok ? '' : 'disabled'} title="${esc(why)}">${icon('hammer', 17)}<span>${b.ok ? `Build ${b.apartment ? 'apartment' : 'house'} · ${money(b.cost)}` : 'Build'}</span></button>`;
      }
      if (pr.level) actions += `<button class="btn secondary" data-act="sell" data-pos="${pos}" ${busy ? 'disabled' : ''}><span>Sell building · +${money(sp.house / 2)}</span></button>`;
      actions += pr.mortgaged
        ? `<button class="btn secondary" data-act="unmortgage" data-pos="${pos}" ${u.ok && !busy ? '' : 'disabled'} title="${esc(u.ok ? '' : u.reason)}"><span>Redeem · ${money(R.redeemPrice(pos))}</span></button>`
        : `<button class="btn secondary" data-act="mortgage" data-pos="${pos}" ${m.ok && !busy ? '' : 'disabled'} title="${esc(m.ok ? '' : m.reason)}"><span>Mortgage · +${money(R.mortgageValue(pos))}</span></button>`;
    }
    this.modalPos = pos;
    this.showModal(
      `${this.deedHTML(pos, this.deedFlipped)}
      ${this.deedStatus(pos)}
      ${actions ? `<div class="deed-actions">${actions}</div>` : ''}
      <div class="modal-actions spread"><button class="btn ghost" data-ui="flip">${icon('flip', 17)}<span>Flip card</span></button><button class="btn ghost" data-ui="close">Close</button></div>`,
      'deed',
      'deed-modal',
    );
  }

  openSpaceInfo(pos) {
    const sp = SPACES[pos];
    const text = {
      start: 'Collect $100 every time you land on or pass START.',
      card: 'Draw the top card of YOUR role’s deck (Competitor or Monopolist), follow it, and put it on the bottom.',
      incomeTax: 'Pay $200, or a percentage: Monopolists 20% of cash, Competitors 10% of cash — plus 10% of the price of your unmortgaged property and buildings.',
      propertyTax: 'Everyone pays $75 to the Treasurer.',
      jail: 'Landing here normally = just visiting. Players sent here go to PRISON (Monopolists — no rent collected) or PRICE WAR (Competitors — still collect rent). Leave by rolling doubles on one of your next two turns, or pay $50; on the third turn you must pay $50.',
      fund: 'Competitors roll one die: a 1 collects $25, a 2 collects $50. Monopolists pay $160 into the Fund.',
      goToJail: 'Monopolists go straight to Prison, Competitors to Price War. Do not pass START.',
    }[sp.type];
    this.showModal(`<h2>${esc(sp.name)}</h2><p class="rules-mini" style="font-size:15px;color:var(--text)">${esc(text)}</p><div class="modal-actions"><button class="btn ghost" data-ui="close">Close</button></div>`, 'info');
  }

  openPlayer(id) {
    const s = this.view.state;
    const p = s.players.find((x) => x.id === id);
    const props = R.propertiesOf(s, id).sort((a, b) => a - b);
    const list = props
      .map((pos) => {
        const sp = SPACES[pos];
        const pr = s.props[pos];
        return `<div class="prop-row ${pr.mortgaged ? 'mort' : ''}"><div class="sw" style="background:${spColor(sp)}"></div>
          <div><div class="nm" data-ui="deed" data-pos="${pos}">${esc(sp.name)} ${sp.type === 'street' ? (R.isApartment(p.role, pr.level) ? '🏢' : '🏠'.repeat(pr.level)) : ''}</div>
          <div class="sub">${pr.mortgaged ? 'Mortgaged' : `Rent ${esc(R.rentLabel(s, pos))}`}</div></div><div></div></div>`;
      })
      .join('');
    this.showModal(`<h2><span class="pawn-dot" style="display:inline-grid;background:${p.color};width:22px;height:22px;vertical-align:middle"></span> ${esc(p.name)} <span class="role-badge ${p.role}">${roleLabel(p.role)}</span></h2>
      <p>Cash: <b>${money(p.cash)}</b> · ${props.length} properties${p.jail ? ` · in ${cornerName(p)}` : ''}${p.bankrupt ? ' · BANKRUPT' : ''}</p>
      <div class="pp-body" style="padding:0">${list || '<div class="rules-mini">No properties.</div>'}</div>
      <div class="modal-actions">${p.id !== this.view.you && !p.bankrupt && this.me() && !this.me().bankrupt && s.status === 'playing' ? `<button class="btn" data-ui="trade" data-id="${p.id}">Propose trade</button>` : ''}<button class="btn ghost" data-ui="close">Close</button></div>`, 'player');
    const tb = $('#modal-card [data-ui="trade"]');
    if (tb) tb.addEventListener('click', () => (this.tradeDraft = { to: p.id }), { capture: true });
  }

  openTrade() {
    const s = this.view.state;
    const me = this.me();
    if (!me || me.bankrupt) return;
    const others = s.players.filter((p) => !p.bankrupt && p.id !== me.id);
    if (!others.length) return;
    const draft = this.tradeDraft && others.some((p) => p.id === this.tradeDraft.to) ? this.tradeDraft : { to: others[0].id };
    this.tradeDraft = draft;
    const partner = s.players.find((p) => p.id === draft.to);
    const col = (owner, side) => {
      const props = R.propertiesOf(s, owner.id).sort((a, b) => a - b);
      const items = props
        .map((pos) => {
          const sp = SPACES[pos];
          const pr = s.props[pos];
          const blocked = pr.level > 0;
          return `<label class="check ${blocked ? 'disabled' : ''}" title="${blocked ? 'Sell its buildings first' : ''}"><input type="checkbox" data-side="${side}" value="${pos}" ${blocked ? 'disabled' : ''}/><span class="sw" style="background:${spColor(sp)}"></span>${esc(sp.name)}${pr.mortgaged ? ' <small>(mortgaged)</small>' : ''}</label>`;
        })
        .join('');
      return `${items || '<div class="rules-mini">No properties</div>'}
        <div class="field" style="margin-top:10px"><label>Cash (has ${money(owner.cash)})</label><input class="input" type="number" min="0" max="${owner.cash}" step="1" value="0" data-cash="${side}" /></div>`;
    };
    this.showModal(`<h2>Propose a trade</h2>
      <div class="field"><label>Trade with</label><select class="input" id="trade-to">${others.map((p) => `<option value="${p.id}" ${p.id === draft.to ? 'selected' : ''}>${esc(p.name)} (${roleLabel(p.role)})</option>`).join('')}</select></div>
      <div class="trade-grid">
        <div class="trade-col"><h4>You give</h4>${col(me, 'give')}</div>
        <div class="trade-col"><h4>${esc(partner.name)} gives</h4>${col(partner, 'get')}</div>
      </div>
      <p class="rules-mini">Buildings must be sold before a property can change hands. Mortgaged properties transfer still mortgaged. No loans between players.</p>
      <div class="modal-actions"><button class="btn ghost" data-ui="close">Cancel</button><button class="btn primary" data-ui="propose">Send offer</button></div>`, 'trade', 'wide');
    $('#trade-to').addEventListener('change', (e) => {
      this.tradeDraft = { to: e.target.value };
      this.openTrade();
    });
  }

  submitTrade() {
    const pick = (side) => [...document.querySelectorAll(`input[data-side="${side}"]:checked`)].map((i) => Number(i.value));
    const cash = (side) => Math.max(0, Math.floor(Number(document.querySelector(`input[data-cash="${side}"]`).value) || 0));
    const args = { to: this.tradeDraft.to, give: { props: pick('give'), cash: cash('give') }, get: { props: pick('get'), cash: cash('get') } };
    if (!args.give.props.length && !args.get.props.length && !args.give.cash && !args.get.cash) return this.toast('Add something to the offer', 'error');
    this.app.act('proposeTrade', args);
    this.closeModal();
    this.toast('Offer sent');
  }

  describeSide(side) {
    const parts = [...side.props.map((pos) => `<b>${esc(SPACES[pos].name)}</b>`), ...(side.cash ? [`<b>${money(side.cash)}</b>`] : [])];
    return parts.join(' + ') || 'nothing';
  }

  openOffers(refresh = false) {
    if (refresh && this.modalKind !== 'offers') return;
    const s = this.view.state;
    const incoming = s.trades.filter((tr) => tr.to === this.view.you);
    const outgoing = s.trades.filter((tr) => tr.from === this.view.you);
    if (refresh && !incoming.length && !outgoing.length) return this.closeModal();
    const name = (id) => esc(s.players.find((p) => p.id === id)?.name);
    const html = [
      ...incoming.map((tr) => `<div class="offer"><b>${name(tr.from)}</b> offers ${this.describeSide(tr.give)}<br>in exchange for your ${this.describeSide(tr.get)}
        <div class="modal-actions"><button class="btn red small" data-ui="respond" data-id="${tr.id}" data-accept="0">Decline</button><button class="btn green small" data-ui="respond" data-id="${tr.id}" data-accept="1">Accept</button></div></div>`),
      ...outgoing.map((tr) => `<div class="offer">You offered <b>${name(tr.to)}</b> ${this.describeSide(tr.give)} for ${this.describeSide(tr.get)} — waiting…
        <div class="modal-actions"><button class="btn small ghost" data-ui="cancel-offer" data-id="${tr.id}">Withdraw</button></div></div>`),
    ].join('');
    this.showModal(`<h2>Trade offers</h2>${html || '<p class="rules-mini">No open offers.</p>'}<div class="modal-actions"><button class="btn ghost" data-ui="close">Close</button></div>`, 'offers');
  }

  openGameOver() {
    const s = this.view.state;
    const w = s.players.find((p) => p.id === s.winner);
    const rows = (s.standings || [])
      .map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${roleLabel(r.role)}</td><td>${money(r.cash)}</td><td>${money(r.income)}</td><td><b>${money(r.score)}</b></td></tr>`)
      .join('');
    this.showModal(`<h2>🏆 ${w ? `${esc(w.name)} wins!` : 'Game over'}</h2><p>${esc(s.endReason || '')}</p>
      ${rows ? `<table class="standings"><tr><th>#</th><th>Player</th><th>Role</th><th>Cash</th><th>Rent income</th><th>Score</th></tr>${rows}</table>` : ''}
      <div class="modal-actions"><button class="btn ghost" data-ui="close">Look at the board</button><button class="btn primary" data-ui="leave">Back to lobby</button></div>`, 'gameover', 'wide');
  }

  openRules(sec = this.rulesSec) {
    this.rulesSec = sec;
    this.showModal(rulesHTML(sec, GAME_NAME), 'rules', 'rules-modal');
    $('.rules-nav .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ---------- tooltip ----------
  showTooltip(pos, x, y) {
    const tip = $('#tooltip');
    if (pos === null || pos === undefined) {
      tip.hidden = true;
      return;
    }
    const sp = SPACES[pos];
    const s = this.view.state;
    let extra = '';
    if (s && s.props[pos]) {
      const pr = s.props[pos];
      const owner = pr.owner && s.players.find((p) => p.id === pr.owner);
      extra = owner
        ? `<br>Owner: <b style="color:${owner.color}">${esc(owner.name)}</b>${pr.mortgaged ? ' (mortgaged)' : ` · rent ${esc(R.rentLabel(s, pos))}`}`
        : `<br>Unowned · ${money(sp.price)}`;
    }
    tip.innerHTML = `<b>${esc(sp.name)}</b>${sp.city ? ` <span style="color:${CITIES[sp.city].color}">● ${esc(sp.city)}</span>` : ''}${extra}<br><small style="color:var(--muted)">Click for details</small>`;
    tip.hidden = false;
    tip.style.left = `${Math.min(window.innerWidth - 270, x + 14)}px`;
    tip.style.top = `${y + 14}px`;
  }

  updateTimer() {
    const s = this.view.state;
    const el = $('#tb-timer');
    if (!s?.endsAt || s.status !== 'playing') {
      el.hidden = true;
      return;
    }
    const left = Math.max(0, s.endsAt - Date.now());
    const m = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    el.hidden = false;
    el.textContent = `⏱ ${m}:${String(sec).padStart(2, '0')}`;
  }
}

export { esc };
