// "How to play" popup: sectioned, illustrated rules. Keep it in sync with shared/rules.js and server/game.js.
import { icon, pawnSvg, housesSvg } from './icons.js';

const GREEN = '#2fa84f';
const BLUE = '#2f6fdb';

export const RULE_SECTIONS = [
  ['idea', 'The idea', 'flag'],
  ['turn', 'Your turn', 'dice'],
  ['roles', 'Roles & rent', 'house'],
  ['spaces', 'Board spaces', 'start'],
  ['money', 'Money trouble', 'wallet'],
  ['win', 'Winning', 'trophy'],
  ['controls', 'Controls', 'mouse'],
];

const compareRow = (ico, label, comp, mono) => `
  <div class="cmp-row">
    <div class="cmp-label">${icon(ico, 17)}<span>${label}</span></div>
    <div class="cmp-cell c"><div>${comp}</div></div>
    <div class="cmp-cell m"><div>${mono}</div></div>
  </div>`;

const tile = (ico, color, title, text) => `
  <div class="r-tile">
    <div class="r-tile-ico" style="--c:${color}">${icon(ico, 20)}</div>
    <div><h4>${title}</h4><p>${text}</p></div>
  </div>`;

const SECTIONS = {
  idea: () => `
    <p class="r-lead">Everyone races around the same board buying streets, but every player follows one of <b>two rulebooks</b>. Your rulebook decides where you may build, what rent you charge, and what happens when you're sent to the corner.</p>
    <div class="r-roles">
      <div class="r-role competitor">
        <div class="r-role-head">${pawnSvg(GREEN, 30)}<div><div class="r-role-name">Competitor</div><div class="r-role-sub">Green pawn · plays fair</div></div></div>
        <ul>
          <li>Build on <b>any street</b> you own</li>
          <li>Charge a fair, market-rate rent</li>
          <li>Transport fares fixed at <b>$20</b></li>
          <li>Sent to a <b>Price War</b>: still collect rent</li>
        </ul>
      </div>
      <div class="r-role monopolist">
        <div class="r-role-head">${pawnSvg(BLUE, 30)}<div><div class="r-role-name">Monopolist</div><div class="r-role-sub">Blue pawn · corners the market</div></div></div>
        <ul>
          <li>Build only after owning <b>2 streets of a city</b></li>
          <li>Charge <b>double rent</b> in cities you control</li>
          <li>Transport fares double per line: <b>$40 → $320</b></li>
          <li>Sent to <b>Prison</b>: collect no rent</li>
        </ul>
      </div>
    </div>
    <div class="r-facts">
      <div class="r-fact"><b>$1,500</b><span>starting cash</span></div>
      <div class="r-fact"><b>$100</b><span>each time you pass START</span></div>
      <div class="r-fact"><b>2–6</b><span>players, humans or CPUs</span></div>
      <div class="r-fact"><b>Fixed</b><span>your role never changes</span></div>
    </div>
    <p class="r-note">Teams stay balanced: equal numbers of each role, or one apart when the player count is odd. Money is tight, there are no auctions, and nobody can borrow.</p>`,

  turn: () => `
    <ol class="r-steps">
      <li><span class="r-num">1</span><div><h4>Roll and move</h4><p>Roll two dice and move clockwise. <b>Doubles</b> give you one extra turn, and only one: doubles on the extra turn don't earn another.</p></div></li>
      <li><span class="r-num">2</span><div><h4>Deal with the space you land on</h4>
        <ul>
          <li><b>Unowned property:</b> buy it at the printed price, or leave it with the Treasurer. There are no auctions.</li>
          <li><b>Someone else's property:</b> pay rent. The <i>owner's</i> role decides which column of the deed you pay from.</li>
          <li><b>Any other space:</b> do what it says (see <a href="#" data-ui="rules-sec" data-sec="spaces">Board spaces</a>).</li>
        </ul></div></li>
      <li><span class="r-num">3</span><div><h4>Build, mortgage and trade</h4><p>Buy houses, sell them back, mortgage or redeem property, and trade with other players. Buildings can be bought only on your own turn.</p></div></li>
      <li><span class="r-num">4</span><div><h4>End your turn</h4><p>Press <b>End turn</b> (or <kbd>E</kbd>) and play passes to the next player.</p></div></li>
    </ol>`,

  roles: () => `
    <div class="cmp">
      <div class="cmp-row cmp-head"><div class="cmp-label"></div><div class="cmp-cell c">${pawnSvg(GREEN, 18)} Competitor</div><div class="cmp-cell m">${pawnSvg(BLUE, 18)} Monopolist</div></div>
      ${compareRow('hammer', 'Where you can build', 'On any street you own', 'Only in a city where you own 2 streets (both streets in a 2-street city)')}
      ${compareRow('house', 'Buildings per street', `${housesSvg(4, GREEN)}<small>4 houses, then an apartment</small>`, `${housesSvg(3, BLUE)}<small>3 houses, then an apartment</small>`)}
      ${compareRow('coins', 'Street rent', 'The fair rent in the Competitor column', 'Double rent once the city is monopolized, even with no houses')}
      ${compareRow('train', 'Transport lines', '$20, however many you own', '$40 · $80 · $160 · $320 for 1–4 lines')}
      ${compareRow('bolt', 'Utilities', '4× the dice roll', '4× the roll, 10× when you own both')}
      ${compareRow('lock', 'Sent to the corner', '<b>Price War</b>: you keep collecting rent', '<b>Prison</b>: you collect no rent')}
      ${compareRow('receipt', 'Income tax', '$200, or 10% of cash + 10% of assets', '$200, or 20% of cash + 10% of assets')}
    </div>
    <p class="r-note">Mortgaging one of the two streets that give a monopolist a city ends that monopoly: they can't keep houses anywhere in the city and charge only single rent there.</p>`,

  spaces: () => `
    <div class="r-tiles">
      ${tile('start', '#d9b44a', 'START', 'Collect $100 every time you land on or pass it.')}
      ${tile('card', '#8a5cd6', 'Market Card', "Draw from <b>your role's</b> deck, do what it says, then put it at the bottom of the deck.")}
      ${tile('receipt', '#c0392b', 'Income Tax', 'Pay $200, or the percentage for your role (see Roles & rent). You choose.')}
      ${tile('house', '#c0392b', 'Property Tax', 'Everyone pays $75.')}
      ${tile('coins', '#1f8a4c', 'Fair Competition Fund', 'Competitors roll one die: a 1 wins $25, a 2 wins $50. Monopolists pay $160.')}
      ${tile('goto', '#3c4658', 'Go to Prison / Price War', "Go straight to the corner. You don't collect $100 for START.")}
      ${tile('lock', '#3c4658', 'Prison / Price War corner', "Landing here normally is just sightseeing. If you're sent here, roll doubles on one of your next two turns to leave, or pay $50 before rolling. On the third turn you must pay $50.")}
      ${tile('train', '#1d2b45', 'Transport & utilities', "Four transport lines ($200) and two utilities ($150). What they charge depends on the owner's role and how many they own.")}
    </div>`,

  money: () => `
    <div class="r-tiles two">
      ${tile('wallet', '#d9b44a', 'Mortgage', 'Get <b>half the price</b> from the Treasurer. A mortgaged property earns no rent and can\'t hold buildings. Redeem it for the mortgage value <b>+ 10%</b>. Flip a deed card in the game to see both numbers.')}
      ${tile('hammer', '#1f8a4c', 'Sell buildings', 'Sell houses and apartments back to the Treasurer for <b>half</b> what they cost. A street must be bare before you mortgage or trade it.')}
      ${tile('trade', '#2456b8', 'Trade', 'Swap property and cash with anyone during the game. Mortgaged property changes hands still mortgaged.')}
      ${tile('lock', '#3c4658', 'No borrowing', "You can't borrow from other players. Mortgages, building sales and trades are the only ways to raise cash.")}
    </div>
    <div class="r-callout">
      ${icon('alert', 22)}
      <div><h4>When you can't pay</h4><p>Your turn pauses until you raise the money. If you still can't pay, you're <b>bankrupt</b>. Owe a player, and they take your cash and property (mortgages stay). Owe the Treasurer, and everything goes back on the market.</p></div>
    </div>`,

  win: () => `
    <div class="r-wins">
      <div class="r-win"><div class="r-win-badge">A</div><h4>Last player standing</h4><p>Bankrupt every other player.</p></div>
      <div class="r-win"><div class="r-win-badge">B</div><h4>Richest survivor</h4><p>Once every player of one role is bankrupt, the richest player of the other role wins. <i>Richest</i> = cash + the rent each unmortgaged property would earn right now.</p></div>
      <div class="r-win"><div class="r-win-badge">${icon('clock', 20)}</div><h4>Time limit</h4><p>When the clock runs out, competitors keep 10% of their cash and monopolists 20%. Then each owned property pays its owner one round of rent. Most cash wins.</p></div>
    </div>
    <p class="r-note">The host picks the victory mode and the optional time limit in the lobby before the game starts.</p>`,

  controls: () => `
    <div class="r-keys">
      <div class="r-key"><span class="k">Drag / one finger</span><span>Orbit around the table</span></div>
      <div class="r-key"><span class="k">Scroll / pinch</span><span>Zoom</span></div>
      <div class="r-key"><span class="k">Right-drag / two fingers</span><span>Pan</span></div>
      <div class="r-key"><span class="k">Click / tap</span><span>Inspect a space or a deed card</span></div>
      <div class="r-key"><kbd>Space</kbd><span>Roll the dice</span></div>
      <div class="r-key"><kbd>E</kbd><span>End your turn</span></div>
      <div class="r-key"><kbd>F</kbd><span>Camera follows whoever's turn it is</span></div>
      <div class="r-key"><kbd>S</kbd><span>Camera at your seat</span></div>
      <div class="r-key"><kbd>T</kbd><span>Top-down view</span></div>
      <div class="r-key"><kbd>Esc</kbd><span>Close a window or menu</span></div>
    </div>
    <p class="r-note">On phones the camera follows the player whose turn it is. Move it yourself any time; tap ${icon('target', 14)} <b>Follow turn</b> (or wait for the next turn) to hand it back. Camera, sound and quick animations are in the ${icon('gear', 14)} Settings menu.</p>`,
};

export function rulesHTML(sec, gameName) {
  const idx = Math.max(0, RULE_SECTIONS.findIndex(([k]) => k === sec));
  const [key, label] = RULE_SECTIONS[idx];
  const prev = RULE_SECTIONS[idx - 1];
  const next = RULE_SECTIONS[idx + 1];
  return `<div class="rules">
    <div class="rules-head">
      <div><div class="rules-kicker">${icon('book', 14)} Rulebook</div><h2>How to play ${gameName}</h2></div>
      <button class="icon-btn" data-ui="close" aria-label="Close">${icon('close', 18)}</button>
    </div>
    <div class="rules-body">
      <nav class="rules-nav">${RULE_SECTIONS.map(([k, l, ico]) => `<button class="${k === key ? 'on' : ''}" data-ui="rules-sec" data-sec="${k}">${icon(ico, 16)}<span>${l}</span></button>`).join('')}</nav>
      <div class="rules-content" id="rules-content"><h3>${label}</h3>${SECTIONS[key]()}</div>
    </div>
    <div class="rules-foot">
      ${prev ? `<button class="btn ghost" data-ui="rules-sec" data-sec="${prev[0]}">← ${prev[1]}</button>` : '<span></span>'}
      <span class="rules-count">${idx + 1} / ${RULE_SECTIONS.length}</span>
      ${next ? `<button class="btn primary" data-ui="rules-sec" data-sec="${next[0]}">${next[1]} →</button>` : '<button class="btn primary" data-ui="close">Got it</button>'}
    </div>
  </div>`;
}
