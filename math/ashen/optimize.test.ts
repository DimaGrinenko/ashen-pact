/** Mathematical solver fixtures, not engine events and never publishable books. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candidate } from './contracts';
import { optimizeCandidates } from './optimize';
import { WEIGHT_TOTAL } from './config';

function candidate(id: number, payoutMultiplier: number): Candidate {
  return { id, mode: 'base', seed: id, policyId: 'decline-all', payoutMultiplier, spinCount: 1,
    dealCount: 0, bonusTriggered: 0, capped: payoutMultiplier === 1_666_600, eventCount: 3 };
}

test('optimizer rejects an impossible ASHEN 0.1x payout without adjusting it', () => {
  assert.throws(() => optimizeCandidates('base', [candidate(0, 10)]), /incompatible/);
});

test('missing advertised maximum cannot be repaired by inventing an outcome', () => {
  const rows = Array.from({ length: 10_001 }, (_, id) => candidate(id, id % 51 * 20));
  assert.throws(() => optimizeCandidates('base', rows, { maximumIterations: 10 }), /No feasible verified weights/);
  assert(rows.every(row => row.payoutMultiplier < 1_666_600));
});

test('successful finite-pool solve preserves every payout and proves both integer identities', { timeout: 120_000 }, () => {
  const rows = Array.from({ length: 20_000 }, (_, id) => candidate(id, id < 15_000 ? 0 : (id % 50 + 1) * 20));
  rows.push(candidate(rows.length, 1_666_600));
  const before = rows.map(row => row.payoutMultiplier);
  const result = optimizeCandidates('base', rows);
  assert.deepEqual(rows.map(row => row.payoutMultiplier), before);
  assert.equal(result.weights.length, rows.length);
  const weights = result.weights.map(BigInt);
  assert(weights.every(weight => weight > 0n));
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0n), WEIGHT_TOTAL);
  assert.equal(weights.reduce((sum, weight, index) => sum + weight * BigInt(rows[index].payoutMultiplier), 0n), 96n * WEIGHT_TOTAL);
  assert.equal(result.verification.passed, true);
  assert(result.statistics.cvar999PerCost <= 700);
  assert(result.statistics.stdBaseBet <= 60);
  assert(result.statistics.probability5000.fraction <= .0005);
  assert(result.statistics.probability10000.fraction <= .0001);
  assert.equal(result.diagnostics.executionStatus, 'calculated-not-platform-approved');
});
