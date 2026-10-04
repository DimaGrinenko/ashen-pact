import { assertMode, MAX_WIN_MULTIPLIER, MODE_COST, PAYOUT_SCALE, TARGET_RTP, UINT64_MAX } from './config';
import type { AshenMathMode, WeightedOutcome } from './contracts';

/** Smallest wallet quantum preserving every payout on the game's 20/100 lattice:
 * 100 / gcd(100, 20) = 5 integer micro-units. It is sufficient, not necessary
 * for a particular distribution whose support may have a coarser lattice. */
export const BASE_BET_QUANTUM_MICRO = 5;
const PAYOUT_LATTICE_HUNDREDTHS = 20;

export interface ExactRatio { numerator: string; denominator: string }
export interface BetLevelAudit {
  amountMicro: number;
  /** The mode price is applied once to the actual charge, not to the payout. */
  paidCostMicro: string;
  onRecommendedQuantum: boolean;
  weightedWalletPayoutMicro: string;
  weightedPaidCostMicro: string;
  /** Reduced exact ratio; 24/25 represents 96%, not 0.96%. */
  walletRtp: ExactRatio;
  matches96Percent: boolean;
  /** Mean micro-units lost per paid round to floor(amount * multiplier / 100). */
  meanRoundingLossMicro: ExactRatio;
  allOutcomePayoutsExact: boolean;
}
export interface RegistrationAudit {
  mode: AshenMathMode;
  costMultiplier: number;
  baseBetQuantumMicro: typeof BASE_BET_QUANTUM_MICRO;
  payoutLatticeHundredths: typeof PAYOUT_LATTICE_HUNDREDTHS;
  totalWeight: string;
  normalizedBookRtp: ExactRatio;
  normalizedRtpMatches96Percent: boolean;
  allLevelsMatch96Percent: boolean;
  levels: BetLevelAudit[];
  /** Supplied levels are audited; no live authenticate/registration is implied. */
  registeredBetLimitsVerified: false;
  platformApprovalEstablished: false;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; } return a;
}
function ratio(numerator: bigint, denominator: bigint): ExactRatio {
  if (numerator < 0n || denominator <= 0n) throw new Error('Invalid nonnegative exact ratio');
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator / divisor).toString(), denominator: (denominator / divisor).toString() };
}
function matchesTarget(numerator: bigint, denominator: bigint): boolean {
  return numerator * TARGET_RTP.denominator === denominator * TARGET_RTP.numerator;
}

/** Pure audit of the actual whole-paid-round wallet conversion used by RGS.
 * All monetary products, floors and RTP comparisons use BigInt. Nothing is
 * rounded per free spin, no book is reweighted, and no server setting changes. */
export function auditBetLevels(mode: AshenMathMode, rows: readonly WeightedOutcome[], betLevelsMicro: readonly number[]): RegistrationAudit {
  assertMode(mode);
  if (!rows.length) throw new Error('At least one positive-weight complete paid round is required');
  if (!betLevelsMicro.length) throw new Error('At least one bet level is required');
  const ids = new Set<number>();
  let totalWeight = 0n, weightedPayout = 0n;
  const support = new Map<number, bigint>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id < 0 || ids.has(row.id)) throw new Error('Duplicate or invalid outcome ID');
    ids.add(row.id);
    if (!Number.isSafeInteger(row.payoutMultiplier) || row.payoutMultiplier < 0
      || row.payoutMultiplier > MAX_WIN_MULTIPLIER * PAYOUT_SCALE || row.payoutMultiplier % PAYOUT_LATTICE_HUNDREDTHS !== 0) {
      throw new Error('Payout must be on the engine 20-hundredth lattice and inside its paid-round cap');
    }
    if (typeof row.weight !== 'bigint' && (typeof row.weight !== 'string' || !/^[1-9]\d*$/.test(row.weight))) {
      throw new Error('Weights must be positive bigint or decimal strings');
    }
    const weight = BigInt(row.weight);
    if (weight <= 0n || weight > UINT64_MAX) throw new Error('Weight must be positive and inside uint64');
    totalWeight += weight;
    if (totalWeight > UINT64_MAX) throw new Error('Total positive weight exceeds uint64');
    weightedPayout += weight * BigInt(row.payoutMultiplier);
    support.set(row.payoutMultiplier, (support.get(row.payoutMultiplier) ?? 0n) + weight);
  }
  const scale = BigInt(PAYOUT_SCALE), cost = BigInt(MODE_COST[mode]);
  const normalizedDenominator = totalWeight * scale * cost;
  const seenLevels = new Set<number>();
  const levels = betLevelsMicro.map(amountMicro => {
    if (!Number.isSafeInteger(amountMicro) || amountMicro <= 0 || seenLevels.has(amountMicro)) throw new Error('Bet levels must be unique positive safe-integer micro-unit amounts');
    seenLevels.add(amountMicro);
    const amount = BigInt(amountMicro), paidCost = amount * cost;
    let walletPayout = 0n, allOutcomePayoutsExact = true;
    for (const [payoutMultiplier, weight] of support) {
      const unrounded = amount * BigInt(payoutMultiplier);
      walletPayout += (unrounded / scale) * weight;
      if (unrounded % scale !== 0n) allOutcomePayoutsExact = false;
    }
    const paidDenominator = totalWeight * paidCost;
    const lossNumerator = amount * weightedPayout - walletPayout * scale;
    return {
      amountMicro, paidCostMicro: paidCost.toString(), onRecommendedQuantum: amountMicro % BASE_BET_QUANTUM_MICRO === 0,
      weightedWalletPayoutMicro: walletPayout.toString(), weightedPaidCostMicro: paidDenominator.toString(),
      walletRtp: ratio(walletPayout, paidDenominator), matches96Percent: matchesTarget(walletPayout, paidDenominator),
      meanRoundingLossMicro: ratio(lossNumerator, totalWeight * scale), allOutcomePayoutsExact,
    };
  });
  return {
    mode, costMultiplier: MODE_COST[mode], baseBetQuantumMicro: BASE_BET_QUANTUM_MICRO,
    payoutLatticeHundredths: PAYOUT_LATTICE_HUNDREDTHS, totalWeight: totalWeight.toString(),
    normalizedBookRtp: ratio(weightedPayout, normalizedDenominator), normalizedRtpMatches96Percent: matchesTarget(weightedPayout, normalizedDenominator),
    allLevelsMatch96Percent: levels.every(level => level.matches96Percent), levels,
    registeredBetLimitsVerified: false, platformApprovalEstablished: false,
  };
}
