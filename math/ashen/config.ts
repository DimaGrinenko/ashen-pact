import type { AshenMathMode } from './contracts';

/** User-confirmed target. Registration, upload and approval remain separate operations. */
export const MATH_PROFILE = 'ashen-pact-math-v2-eclipse';
export const MODES = ['base', 'blue', 'red', 'bonus1', 'bonus2', 'bonus3'] as const satisfies readonly AshenMathMode[];
export const MODE_COST: Readonly<Record<AshenMathMode, number>> = { base: 1, blue: 10, red: 50, bonus1: 100, bonus2: 250, bonus3: 500 };
export const MAX_WIN_MULTIPLIER = 16_666;
export const PAYOUT_SCALE = 100;
export const WEIGHT_TOTAL = 1_000_000_000_000_000n;
export const UINT64_MAX = (1n << 64n) - 1n;
export const TARGET_RTP = { numerator: 24n, denominator: 25n } as const;
export const MIN_RELEASE_BOOKS_PER_MODE = 100_000;
export const MIN_DISTINCT_PAYOUTS = 50;

/** An explicit packaging assumption, NOT the actual authenticated platform configuration. */
export const MAX_BASE_BET_TEMPLATE = 1_000;
export const MIN_BASE_BET_TEMPLATE = .01;

/** Values supplied by the user. Probability unit ambiguity is retained, not silently resolved. */
export const USER_LIMITS = {
  maxExposure: 50_000_000,
  maxPayoutBaseBet: 100_000,
  maxBetCost: 500_000,
  maxCostMultiplier: 2_000,
  baseStd: 60,
  probability5000RawReading: .05,
  probability10000RawReading: .01,
  cvar999PerCost: 700,
  cvar999BaseBet: 50_000,
  tail40Cost: .9,
  tail10000: .8,
  tailSum: 1.5,
} as const;

/** Strict enough for either fraction or percentage reading of the supplied probability limits. */
export const DESIGN_LIMITS = {
  probability5000: .0005,
  probability10000: .0001,
  cvar999PerCost: 700,
  cvar999BaseBet: 50_000,
  tail40Cost: .9,
  tail10000: .8,
  tailSum: 1.5,
  baseStd: 60,
  /** Original support must retain a realistically attainable advertised maximum. */
  minMaxWinProbability: 1.1e-7,
  maxIndividualBookProbability: .0001,
  minHitProbability: .050001,
  numericalSafety: .995,
} as const;

/** Product-design targets, not claimed platform rules. Feasibility fallbacks are explicit. */
export const USEFUL_HIT_TARGETS: Readonly<Record<AshenMathMode, number>> = {
  base: .20, blue: .50, red: 1, bonus1: .95, bonus2: .98, bonus3: 1,
};
export const BASE_STD_TARGET = [35, 49] as const;

export function assertMode(mode: string): asserts mode is AshenMathMode {
  if (!(MODES as readonly string[]).includes(mode)) throw new Error(`Unsupported ASHEN math mode: ${mode}`);
}
