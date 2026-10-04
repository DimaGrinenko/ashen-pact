/** Synthetic distributions test wallet arithmetic only; never export these as books. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { auditBetLevels, BASE_BET_QUANTUM_MICRO } from './registration';
import type { WeightedOutcome } from './contracts';

// (6 * 0.20 + 19 * 1.20) / 25 = 0.96 of a base-mode paid bet.
const fractional96: readonly WeightedOutcome[] = [
  { id: 0, payoutMultiplier: 20, weight: '6' },
  { id: 1, payoutMultiplier: 120, weight: '19' },
];

test('10000 micro-unit base bet preserves exact96% with positive weights', () => {
  const report = auditBetLevels('base', fractional96, [10_000]);
  assert.equal(BASE_BET_QUANTUM_MICRO, 5);
  assert.deepEqual(report.normalizedBookRtp, { numerator: '24', denominator: '25' });
  assert.equal(report.normalizedRtpMatches96Percent, true);
  assert.deepEqual(report.levels[0], {
    amountMicro: 10_000, paidCostMicro: '10000', onRecommendedQuantum: true,
    weightedWalletPayoutMicro: '240000', weightedPaidCostMicro: '250000',
    walletRtp: { numerator: '24', denominator: '25' }, matches96Percent: true,
    meanRoundingLossMicro: { numerator: '0', denominator: '1' }, allOutcomePayoutsExact: true,
  });
  assert.equal(report.allLevelsMatch96Percent, true);
  assert.equal(report.registeredBetLimitsVerified, false); assert.equal(report.platformApprovalEstablished, false);
});

test('1003 and1 micro-unit bets expose exact wallet floor drift without reweighting', () => {
  const report = auditBetLevels('base', fractional96, [1003, 1]);
  assert.equal(report.normalizedRtpMatches96Percent, true); assert.equal(report.allLevelsMatch96Percent, false);
  assert.deepEqual(report.levels.map(level => level.walletRtp), [
    { numerator: '24057', denominator: '25075' }, { numerator: '19', denominator: '25' },
  ]);
  assert.deepEqual(report.levels.map(level => level.meanRoundingLossMicro), [
    { numerator: '3', denominator: '5' }, { numerator: '1', denominator: '5' },
  ]);
  assert(report.levels.every(level => !level.matches96Percent && !level.onRecommendedQuantum && !level.allOutcomePayoutsExact));
});

test('mode cost is included exactly once while payout uses the underlying base amount', () => {
  const report = auditBetLevels('blue', [{ id: 0, payoutMultiplier: 960, weight: 1n }], [10_000, 1003]);
  assert.deepEqual(report.normalizedBookRtp, { numerator: '24', denominator: '25' });
  assert.equal(report.levels[0].paidCostMicro, '100000');
  assert.equal(report.levels[0].weightedWalletPayoutMicro, '96000');
  assert.equal(report.levels[0].matches96Percent, true);
  assert.deepEqual(report.levels[1].walletRtp, { numerator: '4814', denominator: '5015' });
  assert.deepEqual(report.levels[1].meanRoundingLossMicro, { numerator: '4', denominator: '5' });
  assert.equal(report.levels[1].matches96Percent, false);
});

test('quantum is sufficient rather than mandatory for a support with integer multipliers', () => {
  const report = auditBetLevels('bonus2', [{ id: 0, payoutMultiplier: 24_000, weight: '3' }], [1]);
  assert.equal(report.levels[0].onRecommendedQuantum, false);
  assert.equal(report.levels[0].allOutcomePayoutsExact, true);
  assert.equal(report.levels[0].matches96Percent, true);
  assert.deepEqual(report.levels[0].walletRtp, { numerator: '24', denominator: '25' });
});

test('huge weighted products remain exact and inputs remain unchanged', () => {
  const factor = 40_000_000_000_000n;
  const rows = fractional96.map(row => ({ ...row, weight: BigInt(row.weight) * factor }));
  const before = structuredClone(rows), levels = [10_000, 1003];
  const report = auditBetLevels('base', rows, levels);
  assert.equal(report.totalWeight, '1000000000000000');
  assert.equal(report.levels[0].weightedWalletPayoutMicro, '9600000000000000000');
  assert.deepEqual(report.levels[1].walletRtp, { numerator: '24057', denominator: '25075' });
  assert.deepEqual(rows, before); assert.deepEqual(levels, [10_000, 1003]);
});

test('invalid weights, duplicate IDs, nonengine payouts and invalid bet levels fail', () => {
  for (const weight of ['0', '-1', '1.5', 0n, -1n, 1n << 64n]) {
    assert.throws(() => auditBetLevels('base', [{ id: 0, payoutMultiplier: 100, weight }], [10_000]), /weight|uint64/i);
  }
  assert.throws(() => auditBetLevels('base', [fractional96[0], fractional96[0]], [10_000]), /Duplicate/);
  assert.throws(() => auditBetLevels('base', [{ id: 0, payoutMultiplier: 10, weight: '1' }], [10_000]), /lattice/);
  assert.throws(() => auditBetLevels('base', [{ id: 0, payoutMultiplier: 1_666_620, weight: '1' }], [10_000]), /cap/);
  assert.throws(() => auditBetLevels('base', [], [10_000]), /positive-weight/);
  for (const levels of [[], [0], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 1], [1000, 1000]]) {
    assert.throws(() => auditBetLevels('base', fractional96, levels), /bet level|micro-unit/i);
  }
});

test('rounding audit does not mistake a different normalized RTP for96%', () => {
  const report = auditBetLevels('base', [{ id: 0, payoutMultiplier: 100, weight: '1' }], [10_000]);
  assert.equal(report.normalizedRtpMatches96Percent, false); assert.equal(report.levels[0].matches96Percent, false);
  assert.equal(report.levels[0].allOutcomePayoutsExact, true); assert.equal(report.allLevelsMatch96Percent, false);
});
