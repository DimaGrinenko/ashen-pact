import assert from 'node:assert/strict';
import { BONUS_COSTS, buyBonus, deal, FEATURE_COSTS, initialState, MAX_WIN_MULTIPLIER, setFeatureMode, spin } from '../../src/ashen/engine';
import type { BonusState, BonusTier, DealResult, GameState, SpinResult } from '../../src/ashen/engine';
import { BOOK_SCHEMA, MODE_COST, parseBook } from '../../src/ashen/rgs';
import type { AshenMode } from '../../src/ashen/rgs';
import type { Candidate, DealPolicyId } from './contracts';
import { MAX_WIN_MULTIPLIER as PROFILE_MAX_WIN, MODE_COST as PROFILE_MODE_COST, PAYOUT_SCALE } from './config';

export const GENERATOR = 'ashen-pact-math/v2-eclipse';
export const BASE_BET_CENTS = 100;
export const MAX_PAYOUT = MAX_WIN_MULTIPLIER * BASE_BET_CENTS;
export const MAX_BOOK_EVENTS = 25;
export const DEAL_POLICIES: readonly DealPolicyId[] = ['decline-all', 'accept-all', 'accept-tier1-only', 'accept-tier2-only'];
export const CANDIDATE_MODES: readonly AshenMode[] = ['base', 'blue', 'red', 'bonus1', 'bonus2', 'bonus3'];
const BANKROLL = 10_000_000;

export function assertEngineContract(): void {
  assert.deepEqual(PROFILE_MODE_COST, MODE_COST, 'Math profile prices diverged from the real RGS adapter');
  assert.deepEqual(MODE_COST, { ...FEATURE_COSTS, bonus1: BONUS_COSTS[1], bonus2: BONUS_COSTS[2], bonus3: BONUS_COSTS[3] }, 'RGS mode prices diverged from the seeded engine');
  assert.equal(PROFILE_MAX_WIN, MAX_WIN_MULTIPLIER, 'Math profile cap diverged from the engine');
  assert.equal(PAYOUT_SCALE, BASE_BET_CENTS, 'Math/RGS normalization scales differ');
}

export type BookEvent =
  | { index: number; type: 'ashenBook'; schema: typeof BOOK_SCHEMA; mode: AshenMode; betCents: 100; math: { generator: typeof GENERATOR; seed: number; policyId: DealPolicyId } }
  | { index: number; type: 'ashenSpin'; result: SpinResult; bonus: BonusState | null }
  | { index: number; type: 'ashenDeal'; result: DealResult; bonus: BonusState }
  | { index: number; type: 'ashenTotal'; payoutMultiplier: number };
export interface EventBook { id: number; events: BookEvent[]; payoutMultiplier: number }
export interface PoolOptions {
  count: number;
  seed: number;
  /** Total naturally sampled rounds, including the initial count. Never unbounded. */
  maxSearchRounds: number;
  requireCap?: boolean;
  onProgress?: (progress: { mode: AshenMode; scanned: number; admitted: number; capped: number }) => void;
}
export interface CandidatePool {
  mode: AshenMode;
  candidates: Candidate[];
  requestedCount: number;
  scannedRounds: number;
  targetedAdmissions: number;
  capAvailable: boolean;
  payoutValues: number;
  policyCounts: Record<DealPolicyId, number>;
  seedDerivation: string;
  samplingNote: string;
  reusedSeeds?: { generator: string; manifestSha256: string; seedSha256: string; validation: string };
}

function uint32(value: number, label: string): void {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} must be uint32`);
}
/** A bijective uint32 avalanche: each index within a mode visits a new seed. */
export function candidateSeed(seed: number, mode: AshenMode, index: number): number {
  uint32(seed, 'Master seed'); uint32(index, 'Candidate index');
  const ordinal = CANDIDATE_MODES.indexOf(mode); assert(ordinal >= 0, 'Unknown math mode');
  let value = (seed ^ Math.imul(ordinal + 1, 0x9e3779b9) ^ index) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
/** Chosen before RNG simulation. It is recorded in the paid book, not offered as
 * a client choice after the server has selected a weighted result. */
export function policyForIndex(index: number): DealPolicyId {
  uint32(index, 'Policy index'); return DEAL_POLICIES[index % DEAL_POLICIES.length];
}
export function decisionForPolicy(policy: DealPolicyId, tier: BonusTier): 'accept' | 'decline' {
  assert(DEAL_POLICIES.includes(policy), 'Unknown recorded pact policy');
  return policy === 'accept-all' || policy === 'accept-tier1-only' && tier === 1 || policy === 'accept-tier2-only' && tier === 2 ? 'accept' : 'decline';
}

/** Uses only real engine RNG. Deliberately has no preset/forced-outcome argument. */
export function completeRound(mode: AshenMode, seed: number, id: number, policyId: DealPolicyId): EventBook {
  assert(CANDIDATE_MODES.includes(mode), 'Unknown math mode'); uint32(seed, 'Round seed'); uint32(id, 'Book id');
  assert(DEAL_POLICIES.includes(policyId), 'Unknown recorded pact policy');
  let state = initialState({ balanceCents: BANKROLL, betCents: BASE_BET_CENTS, seed });
  const events: BookEvent[] = [{ index: 0, type: 'ashenBook', schema: BOOK_SCHEMA, mode, betCents: 100, math: { generator: GENERATOR, seed, policyId } }];
  let payout = 0;
  const append = (next: GameState, kind: 'spin' | 'deal') => {
    state = next;
    if (kind === 'spin') {
      assert(state.lastSpin); payout += state.lastSpin.totalWinCents;
      events.push({ index: events.length, type: 'ashenSpin', result: structuredClone(state.lastSpin), bonus: structuredClone(state.bonus) });
    } else {
      assert(state.lastDeal && state.bonus);
      events.push({ index: events.length, type: 'ashenDeal', result: structuredClone(state.lastDeal), bonus: structuredClone(state.bonus) });
    }
  };
  if (mode === 'bonus1' || mode === 'bonus2' || mode === 'bonus3') state = buyBonus(state, Number(mode.slice(-1)) as BonusTier);
  else append(spin(setFeatureMode(state, mode)), 'spin');
  while (state.phase !== 'base') {
    // At most one paid spin, two offers, and twenty free spins. No retrigger.
    assert(events.length < MAX_BOOK_EVENTS - 1, 'Incomplete round: engine exceeded the supported full-round bound');
    if (state.phase === 'deal') { assert(state.bonus); append(deal(state, decisionForPolicy(policyId, state.bonus.tier)), 'deal'); }
    else append(spin(state), 'spin');
  }
  assert.equal(state.bonus, null); assert.equal(state.lastSpin?.roundComplete, true);
  assert(Number.isSafeInteger(payout) && payout >= 0 && payout <= MAX_PAYOUT && payout % 20 === 0, 'Round payout exceeds its cap or actual engine lattice');
  assert.equal(state.balanceCents, BANKROLL - BASE_BET_CENTS * MODE_COST[mode] + payout, 'Whole paid-round ledger mismatch');
  events.push({ index: events.length, type: 'ashenTotal', payoutMultiplier: payout });
  const book: EventBook = { id, events, payoutMultiplier: payout };
  validateEventBook(book, mode); return book;
}

export function validateEventBook(book: EventBook, mode: AshenMode): void {
  uint32(book.id, 'Book id'); assert(book.events.length <= MAX_BOOK_EVENTS, 'Event count exceeds complete-round bound');
  const header = book.events[0]; assert(header.type === 'ashenBook');
  assert.equal(header.math.generator, GENERATOR); uint32(header.math.seed, 'Recorded seed');
  assert(DEAL_POLICIES.includes(header.math.policyId), 'Invalid policy recorded before play');
  for (const event of book.events) if (event.type === 'ashenDeal') assert.equal(event.result.decision, decisionForPolicy(header.math.policyId, event.result.fromTier), 'Book pact event contradicts recorded policy');
  const parsed = parseBook(book.events, mode, book.payoutMultiplier / 100);
  assert.equal(parsed.payoutMultiplier, book.payoutMultiplier);
}
export function summarizeBook(book: EventBook, mode: AshenMode): Candidate {
  const header = book.events[0]; assert(header.type === 'ashenBook');
  const spins = book.events.filter((e): e is Extract<BookEvent, { type: 'ashenSpin' }> => e.type === 'ashenSpin');
  return { id: book.id, mode, seed: header.math.seed, policyId: header.math.policyId, payoutMultiplier: book.payoutMultiplier,
    spinCount: spins.length, dealCount: book.events.filter(e => e.type === 'ashenDeal').length,
    bonusTriggered: (spins.find(e => e.result.bonusTriggered)?.result.bonusTriggered ?? 0) as 0 | 1 | 2 | 3,
    capped: book.payoutMultiplier === MAX_PAYOUT, eventCount: book.events.length };
}

/** Holds compact metadata only; every event book is regenerated for export.
 * Rare search changes proposal sampling, never engine results. Published weights
 * define the distribution and must be audited independently of pool frequency. */
export function buildCandidatePool(mode: AshenMode, options: PoolOptions): CandidatePool {
  assertEngineContract();
  assert(Number.isSafeInteger(options.count) && options.count >= 4 && options.count <= 1_000_000, 'Candidate count must be 4..1000000');
  assert(Number.isSafeInteger(options.maxSearchRounds) && options.maxSearchRounds >= options.count && options.maxSearchRounds <= 100_000_000, 'Search bound must be count..100000000');
  uint32(options.seed, 'Master seed');
  const candidates: Candidate[] = [], values = new Set<number>();
  const policyCounts = Object.fromEntries(DEAL_POLICIES.map(id => [id, 0])) as Record<DealPolicyId, number>;
  let scannedRounds = 0, caps = 0, targetedAdmissions = 0;
  while (scannedRounds < options.maxSearchRounds) {
    const index = scannedRounds++, policyId = policyForIndex(index), seed = candidateSeed(options.seed, mode, index);
    const book = completeRound(mode, seed, candidates.length, policyId), candidate = summarizeBook(book, mode);
    const initial = index < options.count;
    // The rare search admits a genuine capped engine round only. It cannot
    // manufacture an award or substitute a development-gallery reveal.
    if (initial || candidate.capped) {
      candidates.push(candidate); values.add(candidate.payoutMultiplier); policyCounts[policyId]++; caps += Number(candidate.capped);
      if (!initial) targetedAdmissions++;
    }
    if (scannedRounds % 10_000 === 0) options.onProgress?.({ mode, scanned: scannedRounds, admitted: candidates.length, capped: caps });
    if (scannedRounds >= options.count && (caps > 0 || options.requireCap === false)) break;
  }
  assert(options.requireCap === false || caps > 0, `${mode}: no naturally reachable maximum found in ${scannedRounds} sampled rounds; increase the explicit search budget or revise the engine. No fake maximum was inserted.`);
  return { mode, candidates, requestedCount: options.count, scannedRounds, targetedAdmissions, capAvailable: caps > 0, payoutValues: values.size, policyCounts,
    seedDerivation: 'candidateSeed: uint32 index XOR master/mode domain, bijective odd-multiply/xorshift avalanche',
    samplingNote: 'Initial sequential deterministic proposals plus bounded natural-seed search for a missing cap. Candidate frequency is not the published probability; integer lookup weights define the final distribution.' };
}
