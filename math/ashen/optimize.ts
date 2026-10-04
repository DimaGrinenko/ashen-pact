import {
  assertMode, BASE_STD_TARGET, DESIGN_LIMITS, MATH_PROFILE, MAX_WIN_MULTIPLIER,
  MODE_COST, USEFUL_HIT_TARGETS, WEIGHT_TOTAL,
} from './config';
import type { AshenMathMode, Candidate, OptimizationResult, OptimizerOptions } from './contracts';
import { calculateStatistics } from './statistics';
import { verifyStatistics } from './verify-statistics';

interface Stratum { indexes: number[]; payouts: number[] }
interface Constraint { name: string; coefficients: Float64Array; limit: number; equality: boolean; multiplier: number }
interface SolveResult { probabilities: number[]; iterations: number }
interface PayoutBucket { payout: number; indexes: number[]; weight: bigint; floor: bigint; ceiling: bigint }

/** Preserve critical payout boundaries and spread the remaining outcomes over small strata.
 * Every constraint uses the actual mean of its per-book coefficients; no payout is rounded.
 * The search is restricted to this uniform-within-stratum candidate family.
 * Feasibility is verified; no global or dual/KKT optimality is claimed.
 */
function makeStrata(candidates: readonly Candidate[], cost: number): Stratum[] {
  const sorted = candidates.map((row, index) => ({ payout: row.payoutMultiplier / 100, index }))
    .sort((a, b) => a.payout - b.payout || a.index - b.index);
  const boundaries = [...new Set([0, cost, 40 * cost, 5000, 10000, MAX_WIN_MULTIPLIER])].sort((a, b) => a - b);
  const chunk = Math.max(1, Math.ceil(candidates.length / 192));
  const output: Stratum[] = [];
  let current: Stratum | undefined, previousRegion = '', previousPayout = -1;
  for (const row of sorted) {
    const exact = boundaries.indexOf(row.payout);
    const region = exact >= 0 ? `boundary-${exact}` : `range-${boundaries.findIndex(value => value > row.payout)}`;
    // A repeated identical payout remains one group even across a size boundary.
    if (!current || region !== previousRegion || current.indexes.length >= chunk && row.payout !== previousPayout) {
      current = { indexes: [], payouts: [] }; output.push(current);
    }
    current.indexes.push(row.index); current.payouts.push(row.payout);
    previousRegion = region; previousPayout = row.payout;
  }
  return output;
}

function constraint(name: string, strata: readonly Stratum[], fn: (payout: number) => number,
  limit: number, equality = false): Constraint {
  const coefficients = Float64Array.from(strata, group => group.payouts.reduce((sum, payout) => sum + fn(payout), 0) / group.payouts.length);
  // Normalize columns to comparable size without changing the constraint.
  let scale = 1;
  for (const coefficient of coefficients) scale = Math.max(scale, Math.abs(coefficient));
  for (let i = 0; i < coefficients.length; i++) coefficients[i] /= scale;
  return { name, coefficients, limit: limit / scale, equality, multiplier: 0 };
}

function softmax(logits: Float64Array): number[] {
  let max = -Infinity;
  for (const value of logits) max = Math.max(max, value);
  const values = Array.from(logits, value => Math.exp(value - max));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Nonfinite entropy distribution');
  return values.map(value => value / total);
}

function meanAfterTilt(logits: Float64Array, coefficients: Float64Array, beta: number): number {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] + beta * coefficients[i]);
  let total = 0, moment = 0;
  for (let i = 0; i < logits.length; i++) {
    const value = Math.exp(logits[i] + beta * coefficients[i] - max);
    total += value; moment += value * coefficients[i];
  }
  return moment / total;
}

/** Monotone one-dimensional dual solve. Bounds are probabilities, never invented outcomes. */
function tiltToMean(logits: Float64Array, item: Constraint, tolerance: number): number {
  const current = meanAfterTilt(logits, item.coefficients, 0);
  if (Math.abs(current - item.limit) <= tolerance) return 0;
  const sign = current > item.limit ? -1 : 1;
  let endpoint = sign;
  for (let attempt = 0; attempt < 64; attempt++) {
    const value = meanAfterTilt(logits, item.coefficients, endpoint);
    if (sign < 0 ? value <= item.limit : value >= item.limit) {
      let low = Math.min(0, endpoint), high = Math.max(0, endpoint);
      for (let iteration = 0; iteration < 56; iteration++) {
        const middle = (low + high) / 2, mean = meanAfterTilt(logits, item.coefficients, middle);
        if (Math.abs(mean - item.limit) <= tolerance * .1) return middle;
        if (mean < item.limit) low = middle; else high = middle;
      }
      return (low + high) / 2;
    }
    endpoint *= 2;
  }
  throw new Error(`Candidate support cannot attain constraint ${item.name}`);
}

/** Coordinate descent of the relative-entropy dual, with nonnegative multipliers
 * for upper bounds. Releasing a previously active inequality is essential; plain
 * repeated clipping would produce neither the stated objective nor a reliable solve.
 */
function entropySolve(strata: readonly Stratum[], constraints: Constraint[], count: number,
  iterations: number, tolerance: number): SolveResult {
  const logits = Float64Array.from(strata, group => Math.log(group.indexes.length / count));
  const cap = strata.map(group => Math.min(1, group.indexes.length * DESIGN_LIMITS.maxIndividualBookProbability * DESIGN_LIMITS.numericalSafety));
  if (cap.reduce((sum, value) => sum + value, 0) < 1) throw new Error('Too few books for concentration limit');
  const capMultipliers = new Float64Array(strata.length);
  for (const item of constraints) {
    let min = Infinity, max = -Infinity;
    for (const value of item.coefficients) { min = Math.min(min, value); max = Math.max(max, value); }
    if (item.limit < min - tolerance || item.equality && item.limit > max + tolerance) {
      throw new Error(`Candidate support excludes ${item.name}`);
    }
  }
  for (let iteration = 1; iteration <= iterations; iteration++) {
    for (const item of constraints) {
      const current = meanAfterTilt(logits, item.coefficients, 0);
      if (!item.equality && !item.multiplier && current <= item.limit) continue;
      let delta: number;
      // If the inequality is slack even with its multiplier removed, release it fully.
      if (!item.equality && meanAfterTilt(logits, item.coefficients, item.multiplier) <= item.limit) delta = item.multiplier;
      else delta = tiltToMean(logits, item, tolerance);
      if (!item.equality) {
        delta = Math.min(delta, item.multiplier);
        item.multiplier = Math.max(0, item.multiplier - delta);
      }
      if (delta) for (let i = 0; i < logits.length; i++) logits[i] += delta * item.coefficients[i];
    }
    // Analytic dual coordinate for individual stratum bounds, avoiding a dense matrix.
    for (let index = 0; index < logits.length; index++) {
      if (cap[index] === 1) continue;
      const probability = softmax(logits)[index];
      if (probability <= cap[index] && capMultipliers[index] === 0) continue;
      const p = Math.max(1e-300, Math.min(1 - Number.EPSILON, probability));
      const desired = Math.log(cap[index] / (1 - cap[index])) - Math.log(p / (1 - p));
      const delta = Math.min(desired, capMultipliers[index]);
      capMultipliers[index] = Math.max(0, capMultipliers[index] - delta);
      logits[index] += delta;
    }
    const probabilities = softmax(logits);
    const valid = constraints.every(item => {
      const value = probabilities.reduce((sum, p, index) => sum + p * item.coefficients[index], 0);
      return item.equality ? Math.abs(value - item.limit) <= tolerance : value <= item.limit + tolerance;
    }) && probabilities.every((p, index) => p <= cap[index] + tolerance);
    if (valid) return { probabilities, iterations: iteration };
    // Translation is immaterial to softmax and keeps extended solves well conditioned.
    const offset = Math.max(...logits);
    for (let i = 0; i < logits.length; i++) logits[i] -= offset;
  }
  throw new Error(`Entropy solver did not converge within ${iterations} iterations; no package produced`);
}

function gcd(a: number, b: number): number { while (b) { const remainder = a % b; a = b; b = remainder; } return Math.abs(a); }

function extendedGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  let oldR = a, r = b, oldS = 1n, s = 0n, oldT = 0n, t = 1n;
  while (r) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r]; [oldS, s] = [s, oldS - q * s]; [oldT, t] = [t, oldT - q * t];
  }
  return [oldR, oldS, oldT];
}
const floorDiv = (a: bigint, b: bigint) => { const q = a / b, r = a % b; return r < 0n ? q - 1n : q; };
const ceilDiv = (a: bigint, b: bigint) => -floorDiv(-a, b);
const abs = (x: bigint) => x < 0n ? -x : x;

/** Transfer weight only between existing legal payouts. Supports arbitrary coarse payout
 * lattices and positive-minimum modes; neither a 0x nor a 0.1x anchor is assumed.
 */
function integerWeights(candidates: readonly Candidate[], strata: readonly Stratum[], probabilities: readonly number[], cost: number) {
  const weights = new Array<bigint>(candidates.length).fill(1n);
  const maximumBookWeight = WEIGHT_TOTAL / 10_000n;
  for (let index = 0; index < strata.length; index++) {
    const group = strata[index];
    const total = BigInt(Math.round(probabilities[index] * Number(WEIGHT_TOTAL)));
    const count = BigInt(group.indexes.length), funded = total > count ? total : count;
    const each = funded / count, extra = funded % count;
    group.indexes.forEach((row, i) => { weights[row] = each + (BigInt(i) < extra ? 1n : 0n); });
  }
  const byPayout = new Map<number, PayoutBucket>();
  candidates.forEach((row, index) => {
    const bucket = byPayout.get(row.payoutMultiplier) ?? { payout: row.payoutMultiplier, indexes: [], weight: 0n, floor: 0n, ceiling: 0n };
    bucket.indexes.push(index); bucket.weight += weights[index]; bucket.floor++; bucket.ceiling += maximumBookWeight;
    byPayout.set(row.payoutMultiplier, bucket);
  });
  const buckets = [...byPayout.values()].sort((a, b) => a.payout - b.payout);
  let sumDifference = WEIGHT_TOTAL - buckets.reduce((sum, bucket) => sum + bucket.weight, 0n);
  for (const bucket of [...buckets].sort((a, b) => a.weight > b.weight ? -1 : a.weight < b.weight ? 1 : 0)) {
    const limit = sumDifference > 0n ? bucket.ceiling - bucket.weight : bucket.weight - bucket.floor;
    const amount = abs(sumDifference) < limit ? abs(sumDifference) : limit;
    const change = sumDifference > 0n ? amount : -amount;
    bucket.weight += change; sumDifference -= change;
    if (!sumDifference) break;
  }
  if (sumDifference) throw new Error('No capacity to repair total integer weight');
  let difference = 96n * BigInt(cost) * WEIGHT_TOTAL - buckets.reduce((sum, bucket) => sum + BigInt(bucket.payout) * bucket.weight, 0n);
  const lattice = buckets.slice(1).reduce((g, bucket) => gcd(g, bucket.payout - buckets[0].payout), 0);
  if (!lattice || difference % BigInt(lattice)) throw new Error('Exact 96% is not on this candidate payout lattice');
  const transfer = (low: PayoutBucket, high: PayoutBucket, units: bigint): boolean => {
    if (low === high) return false;
    if (low.weight - units < low.floor || low.weight - units > low.ceiling
      || high.weight + units < high.floor || high.weight + units > high.ceiling) return false;
    low.weight -= units; high.weight += units;
    difference -= units * BigInt(high.payout - low.payout); return true;
  };
  // Prefer one small, exactly divisible correction between neighboring real payouts.
  for (let i = 1; difference && i < buckets.length; i++) {
    const gap = BigInt(buckets[i].payout - buckets[i - 1].payout);
    if (difference % gap === 0n && transfer(buckets[i - 1], buckets[i], difference / gap)) break;
  }
  if (difference) {
    // Three funded anchors give an exact Diophantine correction without any fake payout.
    // Concentrate the search on liquid buckets, while preserving nearby lattice anchors.
    const liquid = [...buckets].sort((a, b) => a.weight > b.weight ? -1 : a.weight < b.weight ? 1 : 0).slice(0, 18);
    const anchors = [...new Set(liquid.flatMap(bucket => {
      const index = buckets.indexOf(bucket); return [bucket, buckets[index - 1], buckets[index + 1]].filter(Boolean) as PayoutBucket[];
    }))].sort((a, b) => a.payout - b.payout);
    outer: for (let a = 0; a < anchors.length - 2; a++) for (let b = a + 1; b < anchors.length - 1; b++) for (let h = b + 1; h < anchors.length; h++) {
      const base = anchors[a], mid = anchors[b], high = anchors[h];
      const gapA = BigInt(mid.payout - base.payout), gapB = BigInt(high.payout - base.payout);
      const [g, u, v] = extendedGcd(gapA, gapB);
      if (difference % g) continue;
      const x0 = u * (difference / g), y0 = v * (difference / g), stepX = gapB / g, stepY = -gapA / g;
      let lo: bigint | null = null, hi: bigint | null = null, feasible = true;
      const restrict = (value: bigint, step: bigint, min: bigint, max: bigint) => {
        if (!step) { if (value < min || value > max) feasible = false; return; }
        const lower = step > 0n ? ceilDiv(min - value, step) : ceilDiv(value - max, -step);
        const upper = step > 0n ? floorDiv(max - value, step) : floorDiv(value - min, -step);
        lo = lo === null || lower > lo ? lower : lo; hi = hi === null || upper < hi ? upper : hi;
      };
      restrict(x0, stepX, mid.floor - mid.weight, mid.ceiling - mid.weight);
      restrict(y0, stepY, high.floor - high.weight, high.ceiling - high.weight);
      restrict(-x0 - y0, -stepX - stepY, base.floor - base.weight, base.ceiling - base.weight);
      if (!feasible || lo === null || hi === null || lo > hi) continue;
      const clamp = (n: bigint) => n < lo! ? lo! : n > hi! ? hi! : n;
      const choices = [lo, hi, clamp(0n), clamp(floorDiv(-x0, stepX)), clamp(ceilDiv(-x0, stepX)),
        clamp(floorDiv(y0, -stepY)), clamp(ceilDiv(y0, -stepY))];
      let best: { score: bigint; x: bigint; y: bigint } | undefined;
      for (const t of choices) {
        const x = x0 + stepX * t, y = y0 + stepY * t, score = abs(x) + abs(y) + abs(x + y);
        if (!best || score < best.score) best = { score, x, y };
      }
      mid.weight += best!.x; high.weight += best!.y; base.weight -= best!.x + best!.y;
      difference -= best!.x * gapA + best!.y * gapB;
      if (difference) throw new Error('Diophantine repair identity failed');
      break outer;
    }
  }
  if (difference) throw new Error('No bounded exact integer mean repair; expand legal candidate support');
  // Equal spread within each exact payout retains positive book weights and reduces concentration.
  for (const bucket of buckets) {
    const count = BigInt(bucket.indexes.length), each = bucket.weight / count, extra = bucket.weight % count;
    bucket.indexes.forEach((index, j) => { weights[index] = each + (BigInt(j) < extra ? 1n : 0n); });
  }
  if (weights.some(weight => weight < 1n || weight > maximumBookWeight)) throw new Error('Integer repair violates book-weight bounds');
  if (weights.reduce((sum, weight) => sum + weight, 0n) !== WEIGHT_TOTAL) throw new Error('Integer total identity failed');
  if (weights.reduce((sum, weight, index) => sum + weight * BigInt(candidates[index].payoutMultiplier), 0n) !== 96n * BigInt(cost) * WEIGHT_TOTAL) {
    throw new Error('Integer RTP identity failed');
  }
  return { weights, lattice };
}

/** Produces weights only. Infeasibility, numerical failure or failed exact checks throw;
 * there is no hidden payout modification, target relaxation or publication fallback.
 */
export function optimizeCandidates(mode: AshenMathMode, candidates: readonly Candidate[], options: OptimizerOptions = {}): OptimizationResult {
  assertMode(mode);
  if (!candidates.length) throw new Error('Empty candidate pool');
  candidates.forEach((row, index) => {
    if (row.id !== index || row.mode !== mode || !Number.isSafeInteger(row.payoutMultiplier)
      || row.payoutMultiplier < 0 || row.payoutMultiplier > MAX_WIN_MULTIPLIER * 100 || row.payoutMultiplier % 20) {
      throw new Error('Candidate ID, mode or payout is incompatible');
    }
  });
  const cost = MODE_COST[mode], strata = makeStrata(candidates, cost);
  const hitTarget = options.usefulHitTarget ?? USEFUL_HIT_TARGETS[mode];
  const stdTarget = options.baseStdTarget ?? BASE_STD_TARGET;
  const iterations = options.maximumIterations ?? 3000, tolerance = options.convergenceTolerance ?? 2e-12;
  if (!Number.isFinite(hitTarget) || hitTarget < DESIGN_LIMITS.minHitProbability || hitTarget > 1
    || stdTarget.length !== 2 || !Number.isFinite(stdTarget[0]) || !Number.isFinite(stdTarget[1])
    || stdTarget[0] < 0 || stdTarget[1] < stdTarget[0] || stdTarget[1] > DESIGN_LIMITS.baseStd
    || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100_000
    || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 1e-8) throw new Error('Invalid optimizer options');
  const safety = DESIGN_LIMITS.numericalSafety;
  const cvarBound = Math.min(DESIGN_LIMITS.cvar999PerCost * cost, DESIGN_LIMITS.cvar999BaseBet) * safety;
  const thresholds = MAX_WIN_MULTIPLIER <= cvarBound ? [MAX_WIN_MULTIPLIER]
    : [...new Set([50 * cost, 10 * cost, 100 * cost, 200 * cost, cvarBound / 2])].filter(value => value < cvarBound);
  const attempts: string[] = [];
  for (const useTargets of [true, false]) for (const threshold of thresholds) {
    const bounds: Constraint[] = [];
    const add = (name: string, fn: (x: number) => number, limit: number, equality = false) => bounds.push(constraint(name, strata, fn, limit, equality));
    add('mean-96-percent', x => x / cost, .96, true);
    add('hit-rate-minimum', x => x > 0 ? -1 : 0, -(useTargets ? hitTarget : DESIGN_LIMITS.minHitProbability * 1.01));
    add('advertised-cap-frequency', x => x === MAX_WIN_MULTIPLIER ? -1 : 0, -DESIGN_LIMITS.minMaxWinProbability * 1.01);
    add('probability-5000', x => x >= 5000 ? 1 : 0, DESIGN_LIMITS.probability5000 * safety);
    add('probability-10000', x => x >= 10000 ? 1 : 0, DESIGN_LIMITS.probability10000 * safety);
    add('tail-40-cost', x => x >= 40 * cost ? x : 0, DESIGN_LIMITS.tail40Cost * safety);
    add('tail-10000', x => x >= 10000 ? x : 0, DESIGN_LIMITS.tail10000 * safety);
    add('tail-sum', x => (x >= 40 * cost ? x : 0) + (x >= 10000 ? x : 0), DESIGN_LIMITS.tailSum * safety);
    if (mode === 'base') {
      const reserve = (stdTarget[1] - stdTarget[0]) * .005;
      const stdUpper = useTargets ? stdTarget[1] - reserve : DESIGN_LIMITS.baseStd * safety;
      add('base-second-moment-upper', x => x * x, stdUpper ** 2 + .96 ** 2);
      if (useTargets && stdTarget[0] > 0) add('base-second-moment-target-lower', x => -x * x, -((stdTarget[0] + reserve) ** 2 + .96 ** 2));
    }
    if (MAX_WIN_MULTIPLIER > cvarBound) add('cvar-sufficient-bound', x => Math.max(x - threshold, 0), (cvarBound - threshold) / 1000);
    try {
      const solved = entropySolve(strata, bounds, candidates.length, iterations, tolerance);
      const { weights, lattice } = integerWeights(candidates, strata, solved.probabilities, cost);
      const statistics = calculateStatistics(mode, candidates.map((row, index) => ({ id: row.id, payoutMultiplier: row.payoutMultiplier, weight: weights[index] })));
      const verification = verifyStatistics(mode, statistics, { requireReleaseSize: false });
      if (!verification.passed) throw new Error(`Exact post-rounding checks failed: ${verification.failures.join(', ')}`);
      const targetsMet = statistics.hitProbability >= hitTarget - 1e-10
        && (mode !== 'base' || statistics.stdBaseBet >= stdTarget[0] - 1e-8 && statistics.stdBaseBet <= stdTarget[1] + 1e-8);
      return {
        mode, profile: MATH_PROFILE, totalWeight: WEIGHT_TOTAL.toString(), targetRtp: '24/25',
        weights: weights.map(String), statistics, verification,
        diagnostics: {
          algorithm: 'Bounded-stratum entropy-dual coordinate descent; exact integer lattice repair',
          objective: 'Seek feasible weights near the equal candidate prior within the stratum family; optimality is not claimed',
          candidateCount: candidates.length, payoutGroups: strata.length, iterations: solved.iterations,
          selectedCvarThresholdBaseBet: threshold, optionalTargets: { hit: hitTarget, baseStd: mode === 'base' ? stdTarget : null },
          optionalTargetsMet: targetsMet,
          relaxedOptionalTargets: useTargets ? [] : ['useful-hit target', ...(mode === 'base' ? ['base SD target band'] : [])],
          integerRepairPayoutGcd: lattice, executionStatus: 'calculated-not-platform-approved',
        },
      };
    } catch (error) {
      attempts.push(`${useTargets ? 'targets' : 'hard-limits'} threshold ${threshold}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`No feasible verified weights; no payout or hard limit was changed.\n${attempts.join('\n')}`);
}
