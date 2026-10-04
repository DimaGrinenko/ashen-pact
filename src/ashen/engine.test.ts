import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_COSTS, FEATURE_COSTS, MAX_WIN_MULTIPLIER, PAYLINES, REGULAR_SYMBOLS,
  buyBonus, deal, evaluateLines, initialState, presetReveal, resolveWheels,
  setBet, setFeatureMode, settleReveal, spin, validateBoard,
} from './engine';
import type { Board, GameState, RegularSymbol, WheelInput } from './engine';

function state(): GameState { return initialState({ balanceCents: 1_000_000, betCents: 100, seed: 42 }); }
function uniform(symbol: RegularSymbol): Board { return Array.from({ length: 5 }, () => Array(4).fill(symbol)); }

test('the exact 14 primary-source paylines stay inside a 5 by 4 column-major grid', () => {
  assert.equal(PAYLINES.length, 14);
  assert.equal(new Set(PAYLINES.map(line => line.join(','))).size, 14);
  assert.deepEqual(PAYLINES.slice(10), [[0, 1, 2, 1, 0], [1, 2, 3, 2, 1], [3, 2, 1, 2, 3], [2, 1, 0, 1, 2]]);
  for (const line of PAYLINES) {
    assert.equal(line.length, 5);
    assert.ok(line.every(row => Number.isInteger(row) && row >= 0 && row <= 3));
  }
});

test('paytable pays only the highest left-to-right length per line', () => {
  for (const symbol of REGULAR_SYMBOLS) {
    const board = uniform(symbol);
    const wins = evaluateLines(board, 100);
    assert.equal(wins.length, 14);
    assert.ok(wins.every(win => win.count === 5));
  }
  assert.equal(evaluateLines(uniform('hand'), 100).reduce((sum, line) => sum + line.winCents, 0), 70_000);
  assert.equal(evaluateLines(uniform('ten'), 100).reduce((sum, line) => sum + line.winCents, 0), 4_200);
  const board = presetReveal('dead').board;
  for (let reel = 0; reel < 3; reel++) board[reel][0] = 'hand';
  assert.equal(evaluateLines(board, 100).find(win => win.line === 0)?.winCents, 500);
  board[0][0] = 'q';
  assert.equal(evaluateLines(board, 100).find(win => win.line === 0), undefined);
});

test('sixes are feature-only and valid only once on reels 1, 3, 5', () => {
  const board = presetReveal('bonus-3').board;
  validateBoard(board);
  assert.equal(evaluateLines(board, 100).length, 0);
  board[1][0] = 'blue-six';
  assert.throws(() => validateBoard(board), /reels 1, 3, 5/);
  board[1][0] = 'j';
  board[0][0] = 'red-six';
  assert.throws(() => validateBoard(board), /reels 1, 3, 5/);
});

test('wheel sequence is collected by reel order, with addition and multiplication distinct', () => {
  const wheels: WheelInput[] = [
    { reel: 4, row: 0, color: 'red', kind: 'multiply', value: 20 },
    { reel: 0, row: 0, color: 'red', kind: 'add', value: 250 },
    { reel: 2, row: 0, color: 'red', kind: 'multiply', value: 3 },
  ];
  const result = resolveWheels(wheels, 100);
  assert.deepEqual(result.map(wheel => wheel.reel), [0, 2, 4]);
  assert.deepEqual(result.map(wheel => wheel.afterCents), [25_000, 75_000, 1_500_000]);
  assert.deepEqual(wheels.map(wheel => wheel.reel), [4, 0, 2]);
});

test('a first multiplying wheel starts at one bet and never multiplies line payouts', () => {
  const board = presetReveal('dead').board;
  for (let reel = 0; reel < 3; reel++) board[reel][0] = 'ten';
  board[4][1] = 'blue-six';
  const next = settleReveal(initialState({ betCents: 40 }), board, [{ reel: 4, row: 1, color: 'blue', kind: 'multiply', value: 2 }]);
  // Matches the arithmetic of official public replay 16151921879, event 9.
  assert.equal(next.lastSpin?.lineWinCents, 8);
  assert.equal(next.lastSpin?.wheelWinCents, 80);
  assert.equal(next.lastSpin?.totalWinCents, 88);
});

test('an additive wheel after a multiplier adds its face value to the current wheel subtotal', () => {
  const result = resolveWheels([
    { reel: 0, row: 0, color: 'blue', kind: 'multiply', value: 3 },
    { reel: 2, row: 0, color: 'blue', kind: 'add', value: 10 },
  ], 100);
  assert.equal(result[1].afterCents, 1_300);
});

test('invalid wheel values and duplicate reels are rejected', () => {
  assert.throws(() => resolveWheels([{ reel: 0, row: 0, color: 'blue', kind: 'add', value: 500 }], 100), /Invalid wheel/);
  assert.throws(() => resolveWheels([{ reel: 0, row: 0, color: 'red', kind: 'free-spins', value: 6 }], 100), /Invalid wheel/);
  assert.throws(() => resolveWheels([
    { reel: 0, row: 0, color: 'blue', kind: 'add', value: 5 },
    { reel: 0, row: 1, color: 'blue', kind: 'add', value: 10 },
  ], 100), /Only one wheel/);
});

test('only wheel free-spin outcomes trigger bonus tiers, not mere six symbols', () => {
  const ordinarySix = spin(state(), { preset: 'blue-wheel' });
  assert.equal(ordinarySix.bonus, null);
  for (const tier of [1, 2, 3] as const) {
    const next = spin(state(), { preset: `bonus-${tier}` });
    assert.equal(next.bonus?.tier, tier);
    assert.equal(next.bonus?.remaining, 10);
    assert.equal(next.phase, tier === 3 ? 'free-spins' : 'deal');
  }
});

test('declining a pact keeps the original ten spins and costs no further stake', () => {
  const purchased = buyBonus(state(), 1);
  const acceptedSpins = deal(purchased, 'decline');
  assert.equal(acceptedSpins.phase, 'free-spins');
  assert.equal(acceptedSpins.bonus?.remaining, 10);
  assert.equal(acceptedSpins.balanceCents, purchased.balanceCents);
  assert.throws(() => deal(acceptedSpins, 'accept'), /No pact/);
});

test('numeric pact outcomes replace the count, while upgrades preserve ten and may offer next-tier pact', () => {
  for (const count of [5, 8, 12, 16, 20] as const) {
    const next = deal(buyBonus(state(), 1), 'accept', count);
    assert.equal(next.bonus?.remaining, count);
    assert.equal(next.bonus?.totalSpins, count);
    assert.equal(next.bonus?.tier, 1);
    assert.equal(next.phase, 'free-spins');
  }
  const upgraded = deal(buyBonus(state(), 1), 'accept', 'upgrade');
  assert.equal(upgraded.phase, 'deal');
  assert.equal(upgraded.bonus?.tier, 2);
  assert.equal(upgraded.bonus?.remaining, 10);
  const finalTier = deal(upgraded, 'accept', 'upgrade');
  assert.equal(finalTier.phase, 'free-spins');
  assert.equal(finalTier.bonus?.tier, 3);
  assert.deepEqual(finalTier.bonus?.dealUsedLevels, [1, 2]);
  assert.throws(() => deal(finalTier, 'accept'), /No pact/);
});

test('feature and bonus prices debit integer cents exactly once', () => {
  for (const tier of [1, 2, 3] as const) {
    const before = state();
    const after = buyBonus(before, tier);
    assert.equal(before.balanceCents - after.balanceCents, before.betCents * BONUS_COSTS[tier]);
    assert.throws(() => buyBonus(after, tier), /already active/);
  }
  for (const mode of ['base', 'blue', 'red'] as const) {
    const before = setFeatureMode(state(), mode);
    const after = spin(before, { preset: 'dead' });
    assert.equal(before.balanceCents - after.balanceCents, before.betCents * FEATURE_COSTS[mode]);
  }
  assert.throws(() => buyBonus(state(), 4 as 1), /Invalid bonus tier/);
  assert.throws(() => spin(initialState({ balanceCents: 0 })), /Insufficient balance/);
});

test('Eclipse buys ten free spins with two crimson seals on every spin and no further charge', () => {
  for (let seed = 0; seed < 200; seed++) {
    const before = initialState({ balanceCents: 1_000_000, betCents: 100, seed });
    let current = buyBonus(before, 3);
    assert.equal(current.phase, 'free-spins');
    assert.equal(current.bonus?.variant, 'eclipse');
    assert.equal(current.bonus?.remaining, 10);
    assert.equal(current.balanceCents, before.balanceCents - 50_000);
    assert.throws(() => deal(current, 'accept'), /No pact/);
    let awarded = 0, spins = 0;
    while (current.phase !== 'base') {
      current = spin(current); spins++;
      const result = current.lastSpin!;
      assert(result.wheels.length >= 2);
      assert(result.wheels.every(wheel => wheel.color === 'red' && wheel.kind !== 'free-spins'));
      assert.equal(result.bonusTriggered, 0);
      awarded += result.totalWinCents;
      assert.equal(current.balanceCents, before.balanceCents - 50_000 + awarded);
    }
    assert(spins === 10 || current.completedBonus?.capped);
    assert.equal(current.completedBonus?.variant, 'eclipse');
    assert.equal(current.completedBonus?.totalWinCents, awarded);
    assert(awarded <= 100 * MAX_WIN_MULTIPLIER);
  }
});

test('upgrading an existing purchased bonus does not silently grant the Eclipse feature', () => {
  let observedSingleSeal = false;
  for (let seed = 0; seed < 200; seed++) {
    const before = initialState({ balanceCents: 1_000_000, seed });
    const upgraded = deal(buyBonus(before, 2), 'accept', 'upgrade');
    assert.equal(upgraded.bonus?.tier, 3);
    assert.equal(upgraded.bonus?.variant, undefined);
    if (spin(upgraded).lastSpin!.wheels.length === 1) observedSingleSeal = true;
  }
  assert(observedSingleSeal, 'Ordinary tier-three rounds retain the one-seal guarantee');
});

test('free spins do not charge a stake, reset wheel subtotal, and return to base at exhaustion', () => {
  let current = deal(buyBonus(state(), 1), 'accept', 5);
  const startingBalance = current.balanceCents;
  for (let index = 0; index < 5; index++) {
    current = spin(current, { preset: 'blue-wheel' });
    assert.equal(current.lastSpin?.wheelWinCents, 1_500);
    assert.equal(current.lastSpin?.isFreeSpin, true);
  }
  assert.equal(current.balanceCents, startingBalance + 7_500);
  assert.equal(current.phase, 'base');
  assert.equal(current.bonus, null);
  assert.equal(current.completedBonus?.totalWinCents, 7_500);
  assert.equal(current.completedBonus?.totalSpins, 5);
});

test('bonus spins cannot retrigger and wager changes are locked while bonus or pact is active', () => {
  const pending = buyBonus(state(), 1);
  assert.throws(() => spin(pending), /pact offer/);
  assert.throws(() => setBet(pending, 200), /locked/);
  assert.throws(() => setFeatureMode(pending, 'red'), /locked/);
  const active = deal(pending, 'decline');
  assert.throws(() => spin(active, { preset: 'bonus-1' }), /require base/);
});

test('16,666x caps the full paid round, including any triggering line win and previous free spins', () => {
  const baseMax = spin(state(), { preset: 'max-win' });
  assert.equal(baseMax.lastSpin?.totalWinCents, MAX_WIN_MULTIPLIER * 100);
  assert.equal(baseMax.lastSpin?.celebration, 'max');
  assert.equal(baseMax.lastSpin?.roundComplete, true);
  const board = presetReveal('bonus-1').board;
  for (let reel = 0; reel < 5; reel++) board[reel][0] = 'hand';
  const entered = settleReveal(state(), board, presetReveal('bonus-1').wheels);
  assert.equal(entered.bonus?.roundWinCents, 5_000);
  let current = deal(entered, 'decline');
  current = spin(current, { preset: 'blue-wheel' });
  const beforeMax = current.balanceCents;
  current = spin(current, { preset: 'max-win' });
  assert.equal(current.lastSpin?.totalWinCents, MAX_WIN_MULTIPLIER * 100 - 6_500);
  assert.equal(current.balanceCents - beforeMax, MAX_WIN_MULTIPLIER * 100 - 6_500);
  assert.equal(current.completedBonus?.roundWinCents, MAX_WIN_MULTIPLIER * 100);
  assert.equal(current.completedBonus?.totalWinCents, MAX_WIN_MULTIPLIER * 100 - 5_000);
  assert.equal(current.phase, 'base');
  assert.equal(current.bonus, null);
});

test('line plus wheel awards stay within cap and subtotal matches credited total', () => {
  const board = uniform('hand');
  board[4][3] = 'blue-six';
  const result = settleReveal(state(), board, [{ reel: 4, row: 3, color: 'blue', kind: 'max', value: MAX_WIN_MULTIPLIER }]).lastSpin!;
  assert.equal(result.lineWinCents + result.wheelWinCents, result.totalWinCents);
  assert.equal(result.totalWinCents, MAX_WIN_MULTIPLIER * 100);
  assert.equal(result.lineWins.reduce((sum, line) => sum + line.winCents, 0), result.lineWinCents);
});

test('settlement refuses missing or mismatched wheel presentations', () => {
  const reveal = presetReveal('blue-wheel');
  assert.throws(() => settleReveal(state(), reveal.board, []), /exactly one/);
  assert.throws(() => settleReveal(state(), reveal.board, [{ ...reveal.wheels[0], color: 'red' }]), /exactly one/);
});

test('seeded sequences replay exactly without mutating the input state', () => {
  const original = state();
  const serialized = JSON.stringify(original);
  assert.deepEqual(spin(original), spin(original));
  assert.equal(JSON.stringify(original), serialized);
  let first = original;
  let second = original;
  for (let index = 0; index < 150; index++) {
    if (first.phase === 'deal') { first = deal(first, 'decline'); second = deal(second, 'decline'); }
    first = spin(first);
    second = spin(second);
    assert.deepEqual(first, second);
  }
});

test('random mode invariants hold: base only blue, red feature guaranteed red, final bonus guaranteed red', () => {
  for (let seed = 0; seed < 200; seed++) {
    const normal = spin(initialState({ balanceCents: 1_000_000, seed }));
    assert.ok(normal.lastSpin!.wheels.every(wheel => wheel.color === 'blue'));
    const red = spin(setFeatureMode(initialState({ balanceCents: 1_000_000, seed }), 'red'));
    assert.ok(red.lastSpin!.wheels.length >= 1);
    assert.ok(red.lastSpin!.wheels.every(wheel => wheel.color === 'red'));
    let ultimate = deal(buyBonus(initialState({ balanceCents: 1_000_000, seed }), 2), 'accept', 'upgrade');
    ultimate = spin(ultimate);
    assert.ok(ultimate.lastSpin!.wheels.length >= 1);
    assert.ok(ultimate.lastSpin!.wheels.every(wheel => wheel.color === 'red' && wheel.kind !== 'free-spins'));
  }
});

test('all permitted bet denominations settle with integer cents and invalid money is rejected', () => {
  for (const betCents of [10, 20, 40, 100, 1_000, 10_000]) {
    const result = spin(initialState({ betCents, balanceCents: 10_000_000 }), { preset: 'line-win' });
    assert.ok(Number.isSafeInteger(result.balanceCents));
    assert.ok(Number.isSafeInteger(result.lastSpin!.totalWinCents));
  }
  for (const betCents of [0, 1, 11, 10001, NaN, Infinity]) assert.throws(() => initialState({ betCents }));
  assert.throws(() => initialState({ balanceCents: -1 }));
});
