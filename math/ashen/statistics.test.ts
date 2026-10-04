/** Numeric contracts only. These synthetic distributions are never exported as game books. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStatistics } from './statistics';
import { verifyStatistics } from './verify-statistics';
import { WEIGHT_TOTAL } from './config';

test('true worst 0.1% is not diluted by a large atom at the SDK quantile', () => {
  const stats = calculateStatistics('base', [
    { id: 0, payoutMultiplier: 0, weight: '998' },
    { id: 1, payoutMultiplier: 100, weight: '1' },
    { id: 2, payoutMultiplier: 100_000, weight: '1' },
  ]);
  assert.equal(stats.quantile999BaseBet, 1);
  assert.equal(stats.cvar999BaseBet, 1000);
  assert.equal(stats.sdk.tieInclusiveCvar999BaseBet, 500.5);
  assert.equal(stats.sdk.tieInclusiveTailProbability, .002);
});

test('fractional tail splits a boundary even when total weight is not divisible by 1000', () => {
  const stats = calculateStatistics('base', [
    { id: 0, payoutMultiplier: 0, weight: '1000' },
    { id: 1, payoutMultiplier: 100_000, weight: '1' },
  ]);
  assert.equal(stats.exact.fractionalTailPayoutNumerator, '100000000');
  assert.equal(stats.cvar999BaseBet, 1_000_000 / 1001);
  assert.equal(stats.quantile999BaseBet, 0);
});

test('probability boundaries are inclusive; raw probabilities never receive bonus price scaling', () => {
  const stats = calculateStatistics('bonus2', [
    { id: 0, payoutMultiplier: 499_980, weight: '1' },
    { id: 1, payoutMultiplier: 500_000, weight: '1' },
    { id: 2, payoutMultiplier: 999_980, weight: '1' },
    { id: 3, payoutMultiplier: 1_000_000, weight: '1' },
  ]);
  assert.equal(stats.probability5000.fraction, .75);
  assert.equal(stats.probability5000.percent, 75);
  assert.equal(stats.probability10000.fraction, .25);
  assert.equal(stats.sdk.probabilityScale, .8);
  assert.equal(stats.sdk.probability5000Scaled, .75 * .8);
  assert.equal(stats.tail40CostBaseBet, 2500); // 40 * 250 = 10000, inclusive.
  assert.equal(stats.tail10000BaseBet, 2500);
  assert.equal(stats.tailSumBaseBet, 5000); // Both tails intentionally count the boundary.
});

test('mode price normalizes RTP and CVaR once; payout remains in underlying base bets', () => {
  const stats = calculateStatistics('blue', [{ id: 0, payoutMultiplier: 960, weight: '1000' }]);
  assert.equal(stats.rtp, .96);
  assert.equal(stats.meanBaseBet, 9.6);
  assert.equal(stats.cvar999BaseBet, 9.6);
  assert.equal(stats.cvar999PerCost, .96);
});

test('zero-weight maxima do not count as attainable support and duplicate IDs fail', () => {
  const rows = [{ id: 0, payoutMultiplier: 100, weight: '1' }, { id: 1, payoutMultiplier: 1_666_600, weight: '0' }];
  assert.equal(calculateStatistics('base', rows).maxWinBaseBet, 1);
  assert.equal(calculateStatistics('base', rows).positiveWeightBooks, 1);
  assert.throws(() => calculateStatistics('base', [rows[0], rows[0]]), /Duplicate/);
  assert.throws(() => calculateStatistics('base', [{ ...rows[0], weight: (1n << 64n).toString() }]), /uint64/);
  for (const payoutMultiplier of [10, 11]) {
    assert.throws(() => calculateStatistics('base', [{ ...rows[0], payoutMultiplier }]), /multiple of 20/);
  }
});

test('96% gate uses integer identity, and passing it alone cannot mark a tiny pack ready', () => {
  const stats = calculateStatistics('base', [
    { id: 0, payoutMultiplier: 0, weight: WEIGHT_TOTAL * 4n / 100n },
    { id: 1, payoutMultiplier: 100, weight: WEIGHT_TOTAL * 96n / 100n },
  ]);
  const report = verifyStatistics('base', stats);
  assert.equal(report.checks.find(check => check.id === 'exact-rtp')?.passed, true);
  assert.equal(report.passed, false);
  assert(report.failures.includes('release-book-count'));
  assert(report.failures.includes('attainable-advertised-max'));
  assert.equal(report.registeredBetLimitsVerified, false);
  assert.equal(report.platformApprovalEstablished, false);
});
