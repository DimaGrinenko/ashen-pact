import { assertMode, MODE_COST, UINT64_MAX } from './config';
import type { AshenMathMode, WeightedOutcome, WeightedStatistics } from './contracts';

function weightOf(value: WeightedOutcome['weight']): bigint {
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new Error('Weights must be bigint or unsigned decimal strings; Number weights are not accepted.');
  }
  const weight = BigInt(value);
  if (weight < 0n || weight > UINT64_MAX) throw new Error('Weight outside uint64 range');
  return weight;
}

const ratio = (numerator: bigint, denominator: bigint) => Number(numerator) / Number(denominator);

/** Exact aggregates over the published finite distribution; no Monte Carlo estimates. */
export function calculateStatistics(mode: AshenMathMode, rows: readonly WeightedOutcome[]): WeightedStatistics {
  assertMode(mode);
  const cost = MODE_COST[mode], ids = new Set<number>(), support = new Map<number, bigint>();
  let total = 0n, first = 0n, second = 0n, largestBook = 0n, positiveBooks = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id < 0 || ids.has(row.id)) throw new Error('Duplicate or invalid outcome ID');
    ids.add(row.id);
    if (!Number.isSafeInteger(row.payoutMultiplier) || row.payoutMultiplier < 0 || row.payoutMultiplier % 20) {
      throw new Error('ASHEN payout must be a nonnegative integer multiple of 20 hundredths');
    }
    const weight = weightOf(row.weight);
    if (!weight) continue;
    positiveBooks++;
    const payout = BigInt(row.payoutMultiplier);
    total += weight;
    if (total > UINT64_MAX) throw new Error('Total weight exceeds uint64');
    first += payout * weight;
    second += payout * payout * weight;
    largestBook = largestBook > weight ? largestBook : weight;
    support.set(row.payoutMultiplier, (support.get(row.payoutMultiplier) ?? 0n) + weight);
  }
  if (!total) throw new Error('No positive-weight outcomes');
  const sorted = [...support].sort(([a], [b]) => a - b);
  let cumulative = 0n, zero = 0n, loss = 0n, profit = 0n, tail5k = 0n, tail10k = 0n;
  let expectation40 = 0n, expectation10k = 0n, quantile: number | undefined;
  for (const [payout, weight] of sorted) {
    if (payout === 0) zero += weight;
    if (payout < cost * 100) loss += weight;
    if (payout > cost * 100) profit += weight;
    if (payout >= 500_000) tail5k += weight;
    if (payout >= 1_000_000) { tail10k += weight; expectation10k += BigInt(payout) * weight; }
    if (payout >= 4_000 * cost) expectation40 += BigInt(payout) * weight;
    cumulative += weight;
    if (quantile === undefined && cumulative * 1000n >= total * 999n) quantile = payout;
  }
  let sdkTailWeight = 0n, sdkTailPayout = 0n;
  for (const [payout, weight] of sorted) if (payout >= quantile!) {
    sdkTailWeight += weight;
    sdkTailPayout += BigInt(payout) * weight;
  }
  // Take precisely 0.001 of the probability mass, splitting the boundary atom.
  // A weight is represented in 1/1000 units so no integer rounding loses mass.
  let tailRemaining = total, fractionalTailPayout = 0n;
  for (let index = sorted.length - 1; index >= 0 && tailRemaining; index--) {
    const [payout, weight] = sorted[index];
    const available = weight * 1000n, take = available < tailRemaining ? available : tailRemaining;
    fractionalTailPayout += BigInt(payout) * take;
    tailRemaining -= take;
  }
  if (tailRemaining) throw new Error('Incomplete worst-tail calculation');
  const varianceNumerator = second * total - first * first;
  if (varianceNumerator < 0n) throw new Error('Negative exact variance');
  const mean = ratio(first, total * 100n), variance = ratio(varianceNumerator, total * total * 10_000n);
  const [maxPayout, maxWeight] = sorted[sorted.length - 1];
  const probability5000 = ratio(tail5k, total), probability10000 = ratio(tail10k, total);
  const cvar999 = ratio(fractionalTailPayout, total * 100n);
  const sdkCvar = ratio(sdkTailPayout, sdkTailWeight * 100n);
  const probabilityScale = cost >= 1000 ? .2 : cost >= 500 ? .5 : cost >= 200 ? .8 : 1;
  return {
    mode, cost, books: rows.length, positiveWeightBooks: positiveBooks, distinctPayouts: sorted.length,
    exact: {
      totalWeight: total.toString(), weightedPayoutHundredths: first.toString(),
      weightedSquaredPayoutHundredths: second.toString(), varianceNumerator: varianceNumerator.toString(),
      zeroWeight: zero.toString(), weightAbove5000: tail5k.toString(), weightAbove10000: tail10k.toString(),
      maxWinWeight: maxWeight.toString(), largestBookWeight: largestBook.toString(),
      expectedTail40Hundredths: expectation40.toString(), expectedTail10000Hundredths: expectation10k.toString(),
      fractionalTailPayoutNumerator: fractionalTailPayout.toString(),
    },
    rtp: mean / cost, rtpPercent: mean / cost * 100, meanBaseBet: mean,
    varianceBaseBet: variance, stdBaseBet: Math.sqrt(variance), stdPerCost: Math.sqrt(variance) / cost,
    hitProbability: ratio(total - zero, total), zeroProbability: ratio(zero, total),
    profitProbability: ratio(profit, total), lossProbability: ratio(loss, total),
    minWinBaseBet: sorted[0][0] / 100, maxWinBaseBet: maxPayout / 100,
    maxWinProbability: ratio(maxWeight, total), mostLikelyBookProbability: ratio(largestBook, total),
    probability5000: { fraction: probability5000, percent: probability5000 * 100 },
    probability10000: { fraction: probability10000, percent: probability10000 * 100 },
    tail40CostBaseBet: ratio(expectation40, total * 100n),
    tail10000BaseBet: ratio(expectation10k, total * 100n),
    tailSumBaseBet: ratio(expectation40 + expectation10k, total * 100n),
    quantile999BaseBet: quantile! / 100, cvar999BaseBet: cvar999, cvar999PerCost: cvar999 / cost,
    sdk: {
      probabilityScale, probability5000Scaled: probability5000 * probabilityScale,
      probability10000Scaled: probability10000 * probabilityScale,
      tieInclusiveTailProbability: ratio(sdkTailWeight, total),
      tieInclusiveCvar999BaseBet: sdkCvar, tieInclusiveCvar999PerCost: sdkCvar / cost,
    },
  };
}
