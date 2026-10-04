import {
  assertMode, DESIGN_LIMITS, MATH_PROFILE, MAX_BASE_BET_TEMPLATE, MAX_WIN_MULTIPLIER,
  MIN_DISTINCT_PAYOUTS, MIN_RELEASE_BOOKS_PER_MODE, MODE_COST, USER_LIMITS, WEIGHT_TOTAL,
} from './config';
import type { AshenMathMode, StatisticsCheck, StatisticsVerification, WeightedStatistics } from './contracts';

export interface VerifyStatisticsOptions { requireReleaseSize?: boolean; maxBaseBetTemplate?: number }

/** Uses exact integer comparisons for monetary moments and tail boundaries. */
export function verifyStatistics(mode: AshenMathMode, stats: WeightedStatistics, options: VerifyStatisticsOptions = {}): StatisticsVerification {
  assertMode(mode);
  if (stats.mode !== mode || stats.cost !== MODE_COST[mode]) throw new Error('Statistics mode/cost mismatch');
  const c = BigInt(MODE_COST[mode]), e = stats.exact;
  const w = BigInt(e.totalWeight), first = BigInt(e.weightedPayoutHundredths);
  const variance = BigInt(e.varianceNumerator), tail40 = BigInt(e.expectedTail40Hundredths), tail10 = BigInt(e.expectedTail10000Hundredths);
  const p5 = BigInt(e.weightAbove5000), p10 = BigInt(e.weightAbove10000), cv = BigInt(e.fractionalTailPayoutNumerator);
  const maxBaseBet = options.maxBaseBetTemplate ?? MAX_BASE_BET_TEMPLATE;
  if (!Number.isFinite(maxBaseBet) || maxBaseBet <= 0) throw new Error('Invalid max base-bet template');
  const checks: StatisticsCheck[] = [];
  const check = (id: string, passed: boolean, value: number | string, limit: number | string, units: string,
    scope: StatisticsCheck['scope'], required = true, note?: string) => {
    checks.push({ id, passed, required, value, limit, units, scope, ...(note ? { note } : {}) });
  };
  check('positive-weights', stats.positiveWeightBooks === stats.books, stats.positiveWeightBooks, stats.books, 'books', 'format');
  check('weight-total', w === WEIGHT_TOTAL, w.toString(), WEIGHT_TOTAL.toString(), 'integer weight', 'exact-math');
  check('exact-rtp', first === 96n * c * w, first.toString(), (96n * c * w).toString(), 'weighted payout hundredths', 'exact-math');
  check('release-book-count', stats.books >= MIN_RELEASE_BOOKS_PER_MODE, stats.books, MIN_RELEASE_BOOKS_PER_MODE,
    'books per mode, minimum', 'conservative-design', options.requireReleaseSize ?? true);
  check('distinct-payouts', stats.distinctPayouts >= MIN_DISTINCT_PAYOUTS, stats.distinctPayouts, MIN_DISTINCT_PAYOUTS,
    'distinct payouts, minimum', 'conservative-design');
  check('attainable-advertised-max', stats.maxWinBaseBet === MAX_WIN_MULTIPLIER, stats.maxWinBaseBet, MAX_WIN_MULTIPLIER,
    'base bets', 'exact-math');
  check('maxwin-probability', BigInt(e.maxWinWeight) * 100_000_000n >= 11n * w,
    stats.maxWinProbability, DESIGN_LIMITS.minMaxWinProbability, 'probability fraction, minimum', 'conservative-design');
  check('individual-book-concentration', BigInt(e.largestBookWeight) * 10_000n <= w,
    stats.mostLikelyBookProbability, DESIGN_LIMITS.maxIndividualBookProbability, 'probability fraction', 'conservative-design');
  check('nonzero-hit-rate', (w - BigInt(e.zeroWeight)) * 1_000_000n >= 50_001n * w,
    stats.hitProbability, DESIGN_LIMITS.minHitProbability, 'probability fraction, minimum', 'conservative-design');
  check('payout-cap', stats.maxWinBaseBet <= USER_LIMITS.maxPayoutBaseBet, stats.maxWinBaseBet, USER_LIMITS.maxPayoutBaseBet,
    'base bets', 'user-provided');
  check('cost-multiplier', stats.cost <= USER_LIMITS.maxCostMultiplier, stats.cost, USER_LIMITS.maxCostMultiplier,
    'base bets paid', 'user-provided');
  check('probability-5000-conservative', p5 * 2000n <= w, stats.probability5000.fraction, DESIGN_LIMITS.probability5000,
    'probability fraction', 'conservative-design', true, '0.0005 fraction = 0.05%; passes either supplied unit reading.');
  check('probability-10000-conservative', p10 * 10_000n <= w, stats.probability10000.fraction, DESIGN_LIMITS.probability10000,
    'probability fraction', 'conservative-design', true, '0.0001 fraction = 0.01%; passes either supplied unit reading.');
  check('probability-5000-raw-reading', p5 * 20n <= w, stats.probability5000.fraction, USER_LIMITS.probability5000RawReading,
    'probability fraction', 'user-provided', false, 'Supplied 0.05 treated as fraction for comparison only; stricter design gate is required.');
  check('probability-10000-raw-reading', p10 * 100n <= w, stats.probability10000.fraction, USER_LIMITS.probability10000RawReading,
    'probability fraction', 'user-provided', false, 'Supplied 0.01 treated as fraction for comparison only; stricter design gate is required.');
  check('tail-40-cost', tail40 * 10n <= 9n * w * 100n, stats.tail40CostBaseBet, USER_LIMITS.tail40Cost,
    'expected base-bet payout above inclusive 40× mode cost', 'conservative-design');
  check('tail-10000', tail10 * 5n <= 4n * w * 100n, stats.tail10000BaseBet, USER_LIMITS.tail10000,
    'expected base-bet payout above inclusive 10000× base bet', 'conservative-design');
  check('tail-sum', (tail40 + tail10) * 2n <= 3n * w * 100n, stats.tailSumBaseBet, USER_LIMITS.tailSum,
    'sum of raw tail expectations; overlap counted twice', 'conservative-design');
  check('cvar-exact-per-cost', cv <= 700n * c * w * 100n, stats.cvar999PerCost, USER_LIMITS.cvar999PerCost,
    'mean worst 0.1% payout / mode cost', 'conservative-design');
  check('cvar-exact-absolute', cv <= 50_000n * w * 100n, stats.cvar999BaseBet, USER_LIMITS.cvar999BaseBet,
    'mean worst 0.1% payout in base bets', 'user-provided');
  if (mode === 'base') check('base-standard-deviation', variance <= 60n ** 2n * w ** 2n * 10_000n,
    stats.stdBaseBet, USER_LIMITS.baseStd, 'base bets', 'user-provided');
  const exposure = stats.maxWinBaseBet * maxBaseBet, maxBetCost = stats.cost * maxBaseBet;
  check('template-max-exposure', exposure <= USER_LIMITS.maxExposure, exposure, USER_LIMITS.maxExposure,
    'display currency units at assumed max base bet', 'template-assumption', true, 'Actual registered limits require authenticate/configuration evidence.');
  check('template-max-bet-cost', maxBetCost <= USER_LIMITS.maxBetCost, maxBetCost, USER_LIMITS.maxBetCost,
    'display currency units at assumed max base bet', 'template-assumption', true, 'Template value is not a server limit or a claim of current live exposure.');
  const failures = checks.filter(item => item.required && !item.passed).map(item => item.id);
  return {
    passed: failures.length === 0, profile: MATH_PROFILE, mode, checks, failures,
    registeredBetLimitsVerified: false, platformApprovalEstablished: false, maxBaseBetAssumption: maxBaseBet,
  };
}
