/** Local deterministic demonstration model. Probabilities are original and uncertified. */
export const REGULAR_SYMBOLS = ['ten', 'j', 'q', 'k', 'a', 'poison', 'skull', 'raven', 'heart', 'hand'] as const;
export const SYMBOLS = [...REGULAR_SYMBOLS, 'blue-six', 'red-six'] as const;
export type RegularSymbol = (typeof REGULAR_SYMBOLS)[number];
export type SymbolId = (typeof SYMBOLS)[number];
/** Column-major: board[reel][row], with top row = 0. */
export type Board = SymbolId[][];
export type BonusTier = 1 | 2 | 3;
export type FeatureMode = 'base' | 'blue' | 'red';
export type Phase = 'base' | 'deal' | 'free-spins';
export type Celebration = 'none' | 'win' | 'big' | 'mega' | 'epic' | 'max';
export type DealOutcome = 5 | 8 | 12 | 16 | 20 | 'upgrade';
export interface Cell { reel: number; row: number }
export interface LineWin {
  line: number;
  symbol: RegularSymbol;
  count: number;
  cells: Cell[];
  winCents: number;
}
export interface WheelInput extends Cell {
  color: 'blue' | 'red';
  kind: 'add' | 'multiply' | 'free-spins' | 'max';
  value: number;
}
export interface WheelOutcome extends WheelInput {
  beforeCents: number;
  afterCents: number;
}
export interface BonusState {
  tier: BonusTier;
  /** Only the direct Eclipse purchase guarantees two crimson seals per spin. */
  variant?: 'eclipse';
  remaining: number;
  totalSpins: number;
  totalWinCents: number;
  /** Includes the triggering base spin, for the purchased-round maximum. */
  roundWinCents: number;
  dealUsedLevels: BonusTier[];
  source: 'natural' | 'purchase';
}
export interface BonusSummary {
  tier: BonusTier;
  variant?: 'eclipse';
  totalSpins: number;
  totalWinCents: number;
  roundWinCents: number;
  capped: boolean;
}
export interface DealResult {
  decision: 'accept' | 'decline';
  outcome: DealOutcome | null;
  fromTier: BonusTier;
  toTier: BonusTier;
  spins: number;
}
export interface SpinResult {
  board: Board;
  lineWins: LineWin[];
  wheels: WheelOutcome[];
  lineWinCents: number;
  wheelWinCents: number;
  totalWinCents: number;
  bonusTriggered: 0 | BonusTier;
  capped: boolean;
  celebration: Celebration;
  isFreeSpin: boolean;
  roundComplete: boolean;
  spinIndex: number;
}
export interface GameState {
  balanceCents: number;
  betCents: number;
  seed: number;
  board: Board;
  phase: Phase;
  featureMode: FeatureMode;
  bonus: BonusState | null;
  lastSpin: SpinResult | null;
  lastDeal: DealResult | null;
  completedBonus: BonusSummary | null;
  spinIndex: number;
}
export const COLS = 5;
export const ROWS = 4;
export const MAX_WIN_MULTIPLIER = 16_666;
export const MIN_BET_CENTS = 10;
export const MAX_BET_CENTS = 10_000;
export const FEATURE_COSTS: Record<FeatureMode, number> = { base: 1, blue: 10, red: 50 };
export const BONUS_COSTS = { 1: 100, 2: 250, 3: 500 } as const;
export const ECLIPSE_PACT_NAME = 'THE ECLIPSE PACT';
export const BONUS_NAMES: Record<BonusTier, string> = { 1: 'THE FIRST PACT', 2: 'HELL UNBOUND', 3: 'THE FINAL RITE' };
export const PAYLINES: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3],
  [0, 1, 0, 1, 0], [1, 2, 1, 2, 1], [2, 3, 2, 3, 2], [1, 0, 1, 0, 1],
  [2, 1, 2, 1, 2], [3, 2, 3, 2, 3], [0, 1, 2, 1, 0], [1, 2, 3, 2, 1],
  [3, 2, 1, 2, 3], [2, 1, 0, 1, 2],
];
/** Multipliers in tenths, indexed by 3/4/5 matching symbols. */
export const PAYTABLE_TENTHS: Record<RegularSymbol, readonly [number, number, number]> = {
  ten: [2, 10, 30], j: [2, 10, 30], q: [2, 10, 30], k: [2, 10, 30], a: [2, 10, 30],
  poison: [10, 30, 100], skull: [10, 30, 100], raven: [20, 50, 150], heart: [20, 50, 150], hand: [50, 150, 500],
};
export const BLUE_ADD_VALUES = [5, 10, 15, 20, 25, 50, 100] as const;
export const BLUE_MULTIPLY_VALUES = [2, 3, 4, 5, 10] as const;
export const RED_ADD_VALUES = [10, 15, 20, 25, 50, 100, 250, 500] as const;
export const RED_MULTIPLY_VALUES = [3, 4, 5, 10, 15, 20] as const;
export const DEAL_VALUES = [5, 8, 12, 16, 20, 'upgrade'] as const;
export const PRESET_NAMES = ['dead', 'line-win', 'blue-wheel', 'red-wheel', 'two-wheels', 'bonus-1', 'bonus-2', 'bonus-3', 'big-win', 'mega-win', 'epic-win', 'max-win'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
export interface SpinOptions {
  /** Development gallery only; never supplied by the real RGS adapter. */
  preset?: PresetName;
}

/** Exposed honestly for local model review; these are NOT Hacksaw's reel strips. */
export const LOCAL_MODEL = {
  symbolWeights: [16, 16, 16, 16, 16, 7, 7, 4, 4, 2],
  // Independent model: landing rates calibrated by expectation, then sampled.
  // See docs/LOCAL-MATH-AUDIT.md. The final tier is deliberately more valuable.
  wheelChancePerEligibleReel: { base: 0.0225, blue: 0.2448, red: 0.748, bonus1: 0.296, bonus2: 0.4704, bonus3: 0.7 },
  redChanceInFirstBonus: 0.34,
  wheelMaxChance: 0.000005,
  wheelBonusChance: 0.055,
  wheelMultiplyChance: 0.14,
  blueAddWeights: [62, 23, 8, 4, 2, 0.8, 0.2],
  redAddWeights: [55, 22, 12, 7, 3, 0.8, 0.15, 0.05],
  blueMultiplyWeights: [65, 23, 8, 3, 1],
  redMultiplyWeights: [65, 21, 8, 4, 1.5, 0.5],
  dealWeights: [28, 32, 20, 10, 5, 5],
} as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function checkMoney(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative integer in cents`);
}
function checkBet(cents: number): void {
  assert(Number.isSafeInteger(cents) && cents >= MIN_BET_CENTS && cents <= MAX_BET_CENTS && cents % 10 === 0,
    'Bet must be 10–10000 cents in increments of 10 cents');
}
export function validateBoard(board: Board): void {
  assert(Array.isArray(board) && board.length === COLS, 'Board must have five columns');
  for (let reel = 0; reel < COLS; reel++) {
    assert(Array.isArray(board[reel]) && board[reel].length === ROWS, 'Each column must have four rows');
    let sixes = 0;
    for (const symbol of board[reel]) {
      assert((SYMBOLS as readonly string[]).includes(symbol), 'Unknown board symbol');
      if (symbol === 'blue-six' || symbol === 'red-six') sixes++;
    }
    assert(sixes <= 1 && (reel % 2 === 0 || sixes === 0), 'Six symbols may occur once on reels 1, 3, 5 only');
  }
}
function noWinBoard(): Board {
  return Array.from({ length: COLS }, (_, reel) =>
    Array.from({ length: ROWS }, (_, row) => REGULAR_SYMBOLS[(reel * 2 + row) % REGULAR_SYMBOLS.length]));
}
export function initialState(options: { balanceCents?: number; betCents?: number; seed?: number } = {}): GameState {
  const balanceCents = options.balanceCents ?? 100_000;
  const betCents = options.betCents ?? 100;
  checkMoney(balanceCents, 'Balance');
  checkBet(betCents);
  assert(Number.isSafeInteger(options.seed ?? 666), 'Seed must be an integer');
  return {
    balanceCents, betCents, seed: (options.seed ?? 666) >>> 0,
    board: noWinBoard(), phase: 'base', featureMode: 'base', bonus: null,
    lastSpin: null, lastDeal: null, completedBonus: null, spinIndex: 0,
  };
}
export const createInitialState = initialState;
export function setBet(state: GameState, cents: number): GameState {
  assert(state.phase === 'base' && !state.bonus, 'Bet is locked during a bonus');
  checkBet(cents);
  return { ...state, betCents: cents };
}
export function setFeatureMode(state: GameState, mode: FeatureMode): GameState {
  assert(state.phase === 'base' && !state.bonus, 'Feature mode is locked during a bonus');
  assert(mode === 'base' || mode === 'blue' || mode === 'red', 'Invalid feature mode');
  return { ...state, featureMode: mode };
}
/** Mulberry32 with state carried explicitly; no global randomness or clock access. */
function rng(seed: number) {
  let current = seed >>> 0;
  return {
    next: () => {
      current = (current + 0x6D2B79F5) >>> 0;
      let t = Math.imul(current ^ (current >>> 15), 1 | current);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => current,
  };
}
type Rng = ReturnType<typeof rng>;
function weighted<T>(random: Rng, values: readonly T[], weights: readonly number[]): T {
  let position = random.next() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < values.length; index++) {
    position -= weights[index];
    if (position < 0) return values[index];
  }
  return values[values.length - 1];
}
export function evaluateLines(board: Board, betCents: number): LineWin[] {
  validateBoard(board);
  checkBet(betCents);
  const wins: LineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const symbol = board[0][rows[0]];
    if (symbol === 'blue-six' || symbol === 'red-six') return;
    let count = 1;
    while (count < COLS && board[count][rows[count]] === symbol) count++;
    if (count < 3) return;
    wins.push({ line, symbol, count,
      cells: rows.slice(0, count).map((row, reel) => ({ reel, row })),
      winCents: (betCents * PAYTABLE_TENTHS[symbol][count - 3]) / 10,
    });
  });
  return wins;
}
function checkWheel(wheel: WheelInput): void {
  assert(Number.isInteger(wheel.reel) && [0, 2, 4].includes(wheel.reel), 'Wheel on ineligible reel');
  assert(Number.isInteger(wheel.row) && wheel.row >= 0 && wheel.row < ROWS, 'Invalid wheel row');
  assert(wheel.color === 'blue' || wheel.color === 'red', 'Invalid wheel color');
  const additions: readonly number[] = wheel.color === 'blue' ? BLUE_ADD_VALUES : RED_ADD_VALUES;
  const multipliers: readonly number[] = wheel.color === 'blue' ? BLUE_MULTIPLY_VALUES : RED_MULTIPLY_VALUES;
  assert(wheel.kind === 'add' && additions.includes(wheel.value)
    || wheel.kind === 'multiply' && multipliers.includes(wheel.value)
    || wheel.kind === 'free-spins' && wheel.color === 'blue' && wheel.value === 6
    || wheel.kind === 'max' && wheel.value === MAX_WIN_MULTIPLIER, 'Invalid wheel outcome');
}
/** Wheel accumulation is independent of line wins and resets each spin. */
export function resolveWheels(inputs: readonly WheelInput[], betCents: number, availableCents = betCents * MAX_WIN_MULTIPLIER): WheelOutcome[] {
  checkBet(betCents);
  checkMoney(availableCents, 'Available payout');
  const sorted = [...inputs].sort((a, b) => a.reel - b.reel);
  assert(new Set(sorted.map(wheel => wheel.reel)).size === sorted.length, 'Only one wheel per eligible reel');
  let subtotal = 0;
  return sorted.map(wheel => {
    checkWheel(wheel);
    const beforeCents = subtotal;
    if (wheel.kind === 'add') subtotal += wheel.value * betCents;
    else if (wheel.kind === 'multiply') subtotal = Math.max(subtotal, betCents) * wheel.value;
    else if (wheel.kind === 'max') subtotal = availableCents;
    subtotal = Math.min(subtotal, availableCents);
    return { ...wheel, beforeCents, afterCents: subtotal };
  });
}
export function celebrationFor(winCents: number, betCents: number, capped = false): Celebration {
  if (capped) return 'max';
  const multiple = winCents / betCents;
  return multiple >= 500 ? 'epic' : multiple >= 100 ? 'mega' : multiple >= 20 ? 'big' : multiple > 0 ? 'win' : 'none';
}
function randomWheel(random: Rng, reel: number, row: number, color: 'blue' | 'red', allowBonus: boolean): WheelInput {
  const chance = random.next();
  let kind: WheelInput['kind'];
  let value: number;
  if (chance < LOCAL_MODEL.wheelMaxChance) { kind = 'max'; value = MAX_WIN_MULTIPLIER; }
  else if (allowBonus && color === 'blue' && chance < LOCAL_MODEL.wheelMaxChance + LOCAL_MODEL.wheelBonusChance) { kind = 'free-spins'; value = 6; }
  else if (random.next() < LOCAL_MODEL.wheelMultiplyChance) {
    kind = 'multiply';
    value = color === 'blue'
      ? weighted(random, BLUE_MULTIPLY_VALUES, LOCAL_MODEL.blueMultiplyWeights)
      : weighted(random, RED_MULTIPLY_VALUES, LOCAL_MODEL.redMultiplyWeights);
  } else {
    kind = 'add';
    value = color === 'blue'
      ? weighted(random, BLUE_ADD_VALUES, LOCAL_MODEL.blueAddWeights)
      : weighted(random, RED_ADD_VALUES, LOCAL_MODEL.redAddWeights);
  }
  return { reel, row, color, kind, value };
}
function randomSpin(state: GameState, random: Rng): { board: Board; wheels: WheelInput[] } {
  const board: Board = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () =>
    weighted(random, REGULAR_SYMBOLS, LOCAL_MODEL.symbolWeights)));
  const wheels: WheelInput[] = [];
  const tier = state.bonus?.tier;
  const probability = tier ? LOCAL_MODEL.wheelChancePerEligibleReel[`bonus${tier}`] : LOCAL_MODEL.wheelChancePerEligibleReel[state.featureMode];
  const guaranteeRed = tier === 3 || !tier && state.featureMode === 'red';
  const guaranteedReel = guaranteeRed ? [0, 2, 4][Math.floor(random.next() * 3)] : -1;
  // Pick a different guaranteed reel only for Eclipse. Keeping the extra RNG
  // draw inside this branch preserves every pre-existing mode's seeded rounds.
  const eclipseReels = state.bonus?.variant === 'eclipse'
    ? [guaranteedReel, [0, 2, 4].filter(reel => reel !== guaranteedReel)[Math.floor(random.next() * 2)]]
    : [guaranteedReel];
  for (const reel of [0, 2, 4]) {
    if (!eclipseReels.includes(reel) && random.next() >= probability) continue;
    const row = Math.floor(random.next() * ROWS);
    const color: 'blue' | 'red' = tier === 2 || tier === 3 || !tier && state.featureMode === 'red'
      || tier === 1 && random.next() < LOCAL_MODEL.redChanceInFirstBonus ? 'red' : 'blue';
    board[reel][row] = color === 'blue' ? 'blue-six' : 'red-six';
    wheels.push(randomWheel(random, reel, row, color, !tier && state.featureMode !== 'red'));
  }
  return { board, wheels };
}
/** Deterministic authored reveals, explicitly reserved for the local asset/animation lab. */
export function presetReveal(preset: PresetName): { board: Board; wheels: WheelInput[] } {
  assert((PRESET_NAMES as readonly string[]).includes(preset), 'Unknown development preset');
  const board = noWinBoard();
  const wheels: WheelInput[] = [];
  const wheel = (reel: number, color: 'blue' | 'red', kind: WheelInput['kind'], value: number) => {
    board[reel][1] = color === 'blue' ? 'blue-six' : 'red-six';
    wheels.push({ reel, row: 1, color, kind, value });
  };
  if (preset === 'line-win') for (let reel = 0; reel < COLS; reel++) board[reel][0] = 'hand';
  if (preset === 'blue-wheel') wheel(2, 'blue', 'add', 15);
  if (preset === 'red-wheel') wheel(2, 'red', 'add', 50);
  if (preset === 'two-wheels') { wheel(0, 'blue', 'add', 25); wheel(4, 'blue', 'multiply', 4); }
  if (preset.startsWith('bonus-')) for (let index = 0; index < Number(preset.slice(-1)); index++) wheel(index * 2, 'blue', 'free-spins', 6);
  if (preset === 'big-win') wheel(2, 'blue', 'add', 50);
  if (preset === 'mega-win') { wheel(0, 'blue', 'add', 25); wheel(4, 'blue', 'multiply', 10); }
  if (preset === 'epic-win') { wheel(0, 'red', 'add', 100); wheel(2, 'red', 'multiply', 5); wheel(4, 'red', 'multiply', 3); }
  if (preset === 'max-win') wheel(2, 'blue', 'max', MAX_WIN_MULTIPLIER);
  return { board, wheels };
}
function newBonus(tier: BonusTier, source: BonusState['source'], roundWinCents: number): BonusState {
  return { tier, remaining: 10, totalSpins: 10, totalWinCents: 0, roundWinCents, dealUsedLevels: [], source };
}
/** Settle a fully specified local reveal; network books must pass their own adapter validation. */
export function settleReveal(state: GameState, board: Board, inputs: readonly WheelInput[], nextSeed = state.seed): GameState {
  assert(state.phase !== 'deal', 'Resolve the pact offer before spinning');
  assert(state.phase !== 'free-spins' || state.bonus && state.bonus.remaining > 0, 'No free spins remaining');
  checkBet(state.betCents);
  checkMoney(state.balanceCents, 'Balance');
  validateBoard(board);
  const isFreeSpin = state.phase === 'free-spins';
  const cost = isFreeSpin ? 0 : state.betCents * FEATURE_COSTS[state.featureMode];
  assert(state.balanceCents >= cost, 'Insufficient balance');
  const specialCells = board.flatMap((column, reel) => column.flatMap((symbol, row) =>
    symbol === 'blue-six' || symbol === 'red-six' ? [{ reel, row, color: symbol === 'blue-six' ? 'blue' : 'red' }] : []));
  assert(specialCells.length === inputs.length && specialCells.every(cell => inputs.some(wheel =>
    wheel.reel === cell.reel && wheel.row === cell.row && wheel.color === cell.color)), 'Every six must have exactly one matching wheel');
  assert(!isFreeSpin || inputs.every(wheel => wheel.kind !== 'free-spins'), 'Free spins cannot retrigger bonuses');
  const cap = state.betCents * MAX_WIN_MULTIPLIER;
  const remainingCap = Math.max(0, cap - (isFreeSpin ? state.bonus!.roundWinCents : 0));
  const lineWins = evaluateLines(board, state.betCents);
  let lineBudget = remainingCap;
  for (const line of lineWins) { line.winCents = Math.min(line.winCents, lineBudget); lineBudget -= line.winCents; }
  const lineWinCents = lineWins.reduce((sum, line) => sum + line.winCents, 0);
  const wheels = resolveWheels(inputs, state.betCents, remainingCap - lineWinCents);
  const wheelWinCents = wheels.at(-1)?.afterCents ?? 0;
  const totalWinCents = lineWinCents + wheelWinCents;
  const capped = remainingCap <= totalWinCents;
  const bonusTriggered = (isFreeSpin || capped ? 0 : wheels.filter(wheel => wheel.kind === 'free-spins').length) as 0 | BonusTier;
  let bonus: BonusState | null = state.bonus ? { ...state.bonus, dealUsedLevels: [...state.bonus.dealUsedLevels] } : null;
  let phase: Phase = state.phase;
  let completedBonus: BonusSummary | null = null;
  if (isFreeSpin && bonus) {
    bonus.remaining--;
    bonus.totalWinCents += totalWinCents;
    bonus.roundWinCents += totalWinCents;
    if (bonus.remaining === 0 || capped) {
      completedBonus = { tier: bonus.tier, totalSpins: bonus.totalSpins - (capped ? bonus.remaining : 0),
        totalWinCents: bonus.totalWinCents, roundWinCents: bonus.roundWinCents, capped,
        ...(bonus.variant ? { variant: bonus.variant } : {}) };
      bonus = null;
      phase = 'base';
    }
  } else if (bonusTriggered) {
    bonus = newBonus(bonusTriggered, 'natural', totalWinCents);
    phase = bonusTriggered === 3 ? 'free-spins' : 'deal';
  }
  const spinIndex = state.spinIndex + 1;
  const resultBoard = board.map(column => [...column]);
  const lastSpin: SpinResult = {
    board: resultBoard, lineWins, wheels, lineWinCents, wheelWinCents, totalWinCents, bonusTriggered, capped,
    celebration: celebrationFor(totalWinCents, state.betCents, capped), isFreeSpin,
    roundComplete: phase === 'base', spinIndex,
  };
  const balanceCents = state.balanceCents - cost + totalWinCents;
  checkMoney(balanceCents, 'Resulting balance');
  return { ...state, balanceCents, seed: nextSeed >>> 0, board: resultBoard, phase, bonus,
    lastSpin, lastDeal: null, completedBonus, spinIndex };
}
export function spin(state: GameState, options: SpinOptions = {}): GameState {
  assert(state.phase !== 'deal', 'Resolve the pact offer before spinning');
  const random = rng(state.seed);
  const reveal = options.preset ? presetReveal(options.preset) : randomSpin(state, random);
  // Gallery wheel colours follow the active bonus rules; trigger presets require base play.
  if (state.bonus && options.preset) {
    assert(reveal.wheels.every(wheel => wheel.kind !== 'free-spins'), 'Bonus-trigger presets require base play');
    if (state.bonus.tier >= 2) {
      for (const wheel of reveal.wheels) {
        wheel.color = 'red';
        reveal.board[wheel.reel][wheel.row] = 'red-six';
        if (wheel.kind === 'multiply' && !RED_MULTIPLY_VALUES.includes(wheel.value as 3)) wheel.value = 3;
        if (wheel.kind === 'add' && !RED_ADD_VALUES.includes(wheel.value as 10)) wheel.value = 10;
      }
    }
  }
  return settleReveal(state, reveal.board, reveal.wheels, random.state());
}
export function buyBonus(state: GameState, tier: BonusTier): GameState {
  assert(state.phase === 'base' && !state.bonus, 'A bonus is already active');
  assert(tier === 1 || tier === 2 || tier === 3, 'Invalid bonus tier');
  const price = state.betCents * BONUS_COSTS[tier];
  assert(state.balanceCents >= price, 'Insufficient balance');
  const bonus = newBonus(tier, 'purchase', 0);
  if (tier === 3) bonus.variant = 'eclipse';
  return { ...state, balanceCents: state.balanceCents - price, phase: tier === 3 ? 'free-spins' : 'deal',
    bonus, lastSpin: null, lastDeal: null, completedBonus: null };
}
export function deal(state: GameState, decision: 'accept' | 'decline', forcedOutcome?: DealOutcome): GameState {
  assert(state.phase === 'deal' && state.bonus, 'No pact offer is pending');
  const current = state.bonus;
  assert(current.tier !== 3 && !current.dealUsedLevels.includes(current.tier), 'This bonus level cannot be gambled again');
  assert(decision === 'accept' || decision === 'decline', 'Invalid pact decision');
  const bonus: BonusState = { ...current, dealUsedLevels: [...current.dealUsedLevels, current.tier] };
  let phase: Phase = 'free-spins';
  let outcome: DealOutcome | null = null;
  const random = rng(state.seed);
  if (decision === 'accept') {
    if (forcedOutcome !== undefined) assert((DEAL_VALUES as readonly (number | string)[]).includes(forcedOutcome), 'Invalid forced pact outcome');
    outcome = forcedOutcome ?? weighted(random, DEAL_VALUES, LOCAL_MODEL.dealWeights);
    if (outcome === 'upgrade') {
      bonus.tier = (bonus.tier + 1) as BonusTier;
      phase = bonus.tier === 3 ? 'free-spins' : 'deal';
    } else {
      bonus.remaining = outcome;
      bonus.totalSpins = outcome;
    }
  }
  return { ...state, bonus, phase, seed: random.state(), lastDeal: {
    decision, outcome, fromTier: current.tier, toTier: bonus.tier, spins: bonus.remaining,
  } };
}
