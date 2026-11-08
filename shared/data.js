// Static game data shared by server and client.
// Names, card text and art are original to "Market Rivals".

export const GAME_NAME = 'Market Rivals';
export const START_CASH = 1500;
export const PASS_START = 100;
export const JAIL_POS = 10;
export const JAIL_FEE = 50;

export const ROLES = {
  competitor: { label: 'Competitor', corner: 'Price War' },
  monopolist: { label: 'Monopolist', corner: 'Prison' },
};

// Pawn colours: competitors are green shades, monopolists blue shades (rules §6).
export const PAWN_COLORS = {
  competitor: ['#2fa84f', '#7cc242', '#14806b'],
  monopolist: ['#2f6fdb', '#58a6ff', '#1f3f9e'],
};

export const CITIES = {
  Memphis: { color: '#4fae9f', streets: [1, 3] },
  Denver: { color: '#d4955b', streets: [6, 8, 9] },
  Seattle: { color: '#e57a93', streets: [11, 13, 14] },
  Austin: { color: '#9aa846', streets: [16, 18, 19] },
  Atlanta: { color: '#5b8fd6', streets: [21, 23, 24] },
  Miami: { color: '#9b6fd0', streets: [26, 27, 29] },
  'Las Vegas': { color: '#e8b923', streets: [31, 32, 34] },
  'Palo Alto': { color: '#e8663d', streets: [37, 39] },
};

const S = (name, city, price, house) => ({ type: 'street', name, city, price, house });
const T = (name, icon) => ({ type: 'transport', name, price: 200, icon });
const U = (name, icon) => ({ type: 'utility', name, price: 150, icon });
const CARD = { type: 'card', name: 'Market Card' };

export const SPACES = [
  { type: 'start', name: 'START' },
  S('Beale St.', 'Memphis', 60, 50),
  CARD,
  S('Overton Sq.', 'Memphis', 60, 50),
  { type: 'incomeTax', name: 'Income Tax' },
  T('Rail Line', 'rail'),
  S('Colfax Ave.', 'Denver', 100, 50),
  CARD,
  S('Larimer Sq.', 'Denver', 100, 50),
  S('Cherry Creek', 'Denver', 120, 50),
  { type: 'jail', name: 'Prison / Price War' },
  S('Pike St.', 'Seattle', 140, 100),
  U('Power Grid', 'power'),
  S('Pine St.', 'Seattle', 140, 100),
  S('Queen Anne', 'Seattle', 160, 100),
  T('Bus Line', 'bus'),
  S('Congress Ave.', 'Austin', 180, 100),
  CARD,
  S('Rainey St.', 'Austin', 180, 100),
  S('Barton Hills', 'Austin', 200, 100),
  { type: 'fund', name: 'Fair Competition Fund' },
  S('Auburn Ave.', 'Atlanta', 220, 150),
  CARD,
  S('Peachtree St.', 'Atlanta', 220, 150),
  S('Buckhead', 'Atlanta', 240, 150),
  T('Air Line', 'air'),
  S('Calle Ocho', 'Miami', 260, 150),
  S('Brickell Ave.', 'Miami', 260, 150),
  U('Water Works', 'water'),
  S('Ocean Dr.', 'Miami', 280, 150),
  { type: 'goToJail', name: 'Go to Prison / Price War' },
  S('Fremont St.', 'Las Vegas', 300, 200),
  S('Paradise Rd.', 'Las Vegas', 300, 200),
  CARD,
  S('The Strip', 'Las Vegas', 320, 200),
  T('Freight Line', 'freight'),
  CARD,
  S('University Ave.', 'Palo Alto', 350, 200),
  { type: 'propertyTax', name: 'Property Tax', amount: 75 },
  S('Sand Hill Rd.', 'Palo Alto', 400, 200),
].map((s, pos) => ({ ...s, pos }));

export const OWNABLE = SPACES.filter((s) => ['street', 'transport', 'utility'].includes(s.type)).map((s) => s.pos);
export const TRANSPORTS = SPACES.filter((s) => s.type === 'transport').map((s) => s.pos);
export const UTILITIES = SPACES.filter((s) => s.type === 'utility').map((s) => s.pos);

// Card effects:
//  collect N | pay N | collectAll N (every player of the drawer's role) | rollCollect (2 dice >= min -> collect N)
//  jail | move <pos> | none
const M = (text, action, effect) => ({ deck: 'monopolist', text, action, effect });
const C = (text, action, effect) => ({ deck: 'competitor', text, action, effect });

export const CARDS = [
  M('A garage startup built something better than your bestseller. You bought the patent and locked it in a vault.', 'Collect $75', { kind: 'collect', amount: 75 }),
  M('You paid for a new wing at the art museum. It has your name on it in very large letters.', 'Good press!', { kind: 'none' }),
  M('The "revolutionary" gadget you patented turned out to be on display in a history museum. The patent is void.', 'Pay $75', { kind: 'pay', amount: 75 }),
  M('Your old college roommate was just named head of the regulatory agency. Old friends look after each other.', 'All Monopolists collect $25', { kind: 'collectAll', amount: 25 }),
  M('Reporters got hold of your no-bid government contract. Roll the dice: 8 or more and the story fades away.', 'Roll: 8+ collect $75', { kind: 'rollCollect', min: 8, amount: 75 }),
  M('Regulators made you resign from the board of the company that was supposed to be your rival.', 'Pay $25', { kind: 'pay', amount: 25 }),
  M('Lobbying trip! Head over to see your friends on Ocean Drive.', 'Go to Ocean Dr.', { kind: 'move', to: 29 }),
  M('A brand-new judge believes that whatever is good for giant firms is good for everyone.', 'Collect $25', { kind: 'collect', amount: 25 }),
  M('Your generous donation was remembered. The emission limits that cut into your margins have been dropped.', 'Collect $75', { kind: 'collect', amount: 75 }),
  M('With no rivals at home your products got sloppy, and imports are eating your market share.', 'Pay $25', { kind: 'pay', amount: 25 }),
  M('Discovery turned up your price-fixing group chat with the other "competitors".', 'Go to Prison', { kind: 'jail' }),
  M('You undercut every rival until they folded, then raised prices higher than before.', 'Collect $50', { kind: 'collect', amount: 50 }),
  M('Despite three antitrust settlements, a magazine named you "Philanthropist of the Year".', 'Congratulations!', { kind: 'none' }),
  M('Your donation to a senator landed in a consumer-rights group\'s account by mistake. Plead no contest.', 'Pay a $50 fine', { kind: 'pay', amount: 50 }),
  M('You slipped an envelope to a merger reviewer. The intern saw everything.', 'Go to Prison', { kind: 'jail' }),
  M('You and the other "rivals" split the country into territories during a round of golf.', 'Collect $50', { kind: 'collect', amount: 50 }),
  M('Company retreat! Take the executives to Overton Square.', 'Go to Overton Sq.', { kind: 'move', to: 3 }),
  M('You tried to trademark sunshine. The lawyers still sent their bills.', 'Pay $50', { kind: 'pay', amount: 50 }),
  M('A whistleblower handed your secret supply-quota memo to prosecutors.', 'Go to Prison', { kind: 'jail' }),
  M('Your lobbyists tucked a tax break into a 900-page bill nobody read.', 'Collect $50', { kind: 'collect', amount: 50 }),
  M('A class action over your inflated prices was finally settled.', 'Pay $75', { kind: 'pay', amount: 75 }),
  M('Record quarter. Fly back to headquarters for the victory party.', 'Advance to START', { kind: 'move', to: 0 }),
  M('Your struggling division was "too big to fail" and received a bailout.', 'Collect $25', { kind: 'collect', amount: 25 }),
  M('Inspectors fined you for hiding a known product defect.', 'Pay $25', { kind: 'pay', amount: 25 }),
  M('You were on a business magazine cover as "Tycoon of the Year".', 'Smile for the camera!', { kind: 'none' }),

  C('A monopolist opened next door and sold everything below cost to drive you out.', 'Go to Price War', { kind: 'jail' }),
  C('A monopolist-funded ad blitz is spreading rumours about your product.', 'Go to Price War', { kind: 'jail' }),
  C('Your cheaper, better product won over a monopolist\'s customers.', 'Collect $75', { kind: 'collect', amount: 75 }),
  C('Your antitrust lawsuit went to trial. Roll the dice: 8 or more and you win damages.', 'Roll: 8+ collect $75', { kind: 'rollCollect', min: 8, amount: 75 }),
  C('The small-business alliance won a grant programme for independent firms.', 'All Competitors collect $25', { kind: 'collectAll', amount: 25 }),
  C('Loyal neighbourhood customers keep coming back.', 'Collect $50', { kind: 'collect', amount: 50 }),
  C('An independent inventor licensed her new product to you instead of selling out.', 'Collect $50', { kind: 'collect', amount: 50 }),
  C('A consumer magazine rated your product "Best Buy".', 'Collect $25', { kind: 'collect', amount: 25 }),
  C('A monopolist bought your supplier and raised your prices.', 'Pay $50', { kind: 'pay', amount: 50 }),
  C('The bank charges small firms higher interest than giant ones.', 'Pay $25', { kind: 'pay', amount: 25 }),
  C('A mountain of licensing paperwork and filing fees.', 'Pay $25', { kind: 'pay', amount: 25 }),
  C('Your main machine broke down and had to be replaced.', 'Pay $50', { kind: 'pay', amount: 50 }),
  C('A monopolist sued you over a bogus patent. The legal fees add up.', 'Pay $75', { kind: 'pay', amount: 75 }),
  C('Time to restock and start fresh.', 'Advance to START', { kind: 'move', to: 0 }),
  C('You shipped your goods by rail to reach new markets.', 'Go to Rail Line', { kind: 'move', to: 5 }),
  C('Shoppers thanked you for keeping prices fair.', 'Keep up the good work!', { kind: 'none' }),
  C('You were elected head of the local chamber of commerce.', 'Well deserved!', { kind: 'none' }),
  C('You cut costs with a smarter process.', 'Collect $25', { kind: 'collect', amount: 25 }),
  C('Your new branch opened to strong sales.', 'Collect $50', { kind: 'collect', amount: 50 }),
  C('A monopolist cornered the market for a raw material you need.', 'Pay $50', { kind: 'pay', amount: 50 }),
  C('You won a government contract in fair, open bidding.', 'Collect $75', { kind: 'collect', amount: 75 }),
  C('Your insurance premium went up again.', 'Pay $25', { kind: 'pay', amount: 25 }),
  C('Monopolists are dumping cheap goods into your market.', 'Go to Price War', { kind: 'jail' }),
  C('Word of mouth from happy customers brought in new business.', 'Collect $25', { kind: 'collect', amount: 25 }),
  C('You recalled a faulty batch and refunded every customer.', 'Pay $75', { kind: 'pay', amount: 75 }),
].map((c, id) => ({ ...c, id }));

export const DECK_IDS = {
  monopolist: CARDS.filter((c) => c.deck === 'monopolist').map((c) => c.id),
  competitor: CARDS.filter((c) => c.deck === 'competitor').map((c) => c.id),
};
