import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOK_SCHEMA, MODE_COST, parseBook } from '../../src/ashen/rgs';
import { buildCandidatePool, candidateSeed, CANDIDATE_MODES, completeRound, DEAL_POLICIES, decisionForPolicy, MAX_BOOK_EVENTS, MAX_PAYOUT, policyForIndex, summarizeBook, validateEventBook } from './candidates';
import { replayCandidate } from './export';

test('all six modes and four precommitted policies produce deterministic, complete legal rounds', () => {
  for (const mode of CANDIDATE_MODES) for (const policy of DEAL_POLICIES) for (let id = 0; id < 12; id++) {
    const seed = candidateSeed(670096, mode, id), book = completeRound(mode, seed, id, policy);
    assert.deepEqual(book, completeRound(mode, seed, id, policy));
    const parsed = parseBook(book.events, mode, book.payoutMultiplier / 100), final = parsed.frames.at(-1);
    assert.equal(parsed.schema, BOOK_SCHEMA); assert.equal(parsed.payoutMultiplier, book.payoutMultiplier);
    assert(final?.type === 'spin' && final.result.roundComplete && final.bonus === null);
    assert(book.events.length <= MAX_BOOK_EVENTS && book.payoutMultiplier <= MAX_PAYOUT);
    assert(book.events.every((event, index) => event.index === index));
    const row = summarizeBook(book, mode); assert.equal(row.eventCount, book.events.length); assert.equal(row.spinCount + row.dealCount + 2, book.events.length);
    if (mode === 'bonus3') {
      assert.equal(parsed.frames[0].type, 'spin', 'Eclipse starts directly with free spins');
      assert(parsed.frames.filter(frame => frame.type === 'spin').every(frame => frame.type === 'spin' && frame.result.isFreeSpin && frame.result.wheels.length >= 2));
      assert.equal(row.dealCount, 0);
      assert(row.spinCount === 10 || row.capped);
    }
    else if (mode.startsWith('bonus')) assert(parsed.frames[0].type === 'deal', 'First two purchases begin with the recorded pact');
    else assert(parsed.frames[0].type === 'spin' && !parsed.frames[0].result.isFreeSpin, 'Base/features include their paid triggering spin');
    if (mode === 'red') assert(book.payoutMultiplier > 0, 'Guaranteed red wheel produces a positive payout');
    assert.equal(MODE_COST[mode], { base: 1, blue: 10, red: 50, bonus1: 100, bonus2: 250, bonus3: 500 }[mode]);
  }
});
test('seed sequence is stable across pool sizes, mode separated, and unique within the scanned domain', () => {
  for (const mode of CANDIDATE_MODES) {
    const seen = new Set<number>(); for (let i = 0; i < 20_000; i++) seen.add(candidateSeed(670096, mode, i)); assert.equal(seen.size, 20_000);
  }
  assert.equal(new Set(CANDIDATE_MODES.map(mode => candidateSeed(670096, mode, 0))).size, 6);
  assert.throws(() => candidateSeed(-1, 'base', 0)); assert.throws(() => candidateSeed(1, 'base', 2 ** 32));
});
test('policy decisions are fixed before engine simulation and independently select each available tier', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => policyForIndex(i)), [...DEAL_POLICIES, ...DEAL_POLICIES]);
  assert.deepEqual(DEAL_POLICIES.map(policy => [decisionForPolicy(policy, 1), decisionForPolicy(policy, 2)]), [
    ['decline', 'decline'], ['accept', 'accept'], ['accept', 'decline'], ['decline', 'accept'],
  ]);
  const book = completeRound('bonus1', 67, 0, 'decline-all'), invalid = structuredClone(book);
  assert(invalid.events[0].type === 'ashenBook'); invalid.events[0].math.policyId = 'accept-all';
  assert.throws(() => validateEventBook(invalid, 'bonus1'), /policy/);
});
test('small diagnostic pool keeps reproducible event-free metadata and reports it cannot establish cap support', () => {
  const options = { count: 32, seed: 670096, maxSearchRounds: 32, requireCap: false };
  const first = buildCandidatePool('base', options), again = buildCandidatePool('base', options);
  assert.deepEqual(first, again); assert.equal(first.candidates.length, 32); assert.equal(first.scannedRounds, 32);
  assert(first.candidates.every((candidate, index) => candidate.id === index && !('events' in candidate)));
  for (const candidate of first.candidates) assert.deepEqual(summarizeBook(completeRound('base', candidate.seed, candidate.id, candidate.policyId), 'base'), candidate);
  assert.deepEqual(Object.values(first.policyCounts), [8, 8, 8, 8]);
});
test('event index/payout corruption and incomplete rounds are rejected before weighting', () => {
  const book = completeRound('base', 670096, 0, 'decline-all');
  const index = structuredClone(book); index.events[1].index = 7; assert.throws(() => validateEventBook(index, 'base'), /indices/);
  const payout = structuredClone(book); payout.payoutMultiplier += 20; assert.throws(() => validateEventBook(payout, 'base'), /payout|mismatch/i);
  const incomplete = structuredClone(book); incomplete.events.pop(); assert.throws(() => validateEventBook(incomplete, 'base'));
});

test('reusing sampled seeds cannot export stale payouts or a replaced engine result', () => {
  for (const mode of CANDIDATE_MODES) {
    const book = completeRound(mode, 670096, 0, 'decline-all');
    const candidate = summarizeBook(book, mode);
    assert.deepEqual(replayCandidate(candidate), book);
    assert.throws(() => replayCandidate({ ...candidate, payoutMultiplier: candidate.payoutMultiplier + 20 }), /replay changed/);
    assert.throws(() => replayCandidate({ ...candidate, spinCount: candidate.spinCount + 1 }), /replay changed/);
  }
});
