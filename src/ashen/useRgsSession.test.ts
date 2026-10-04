import assert from 'node:assert/strict';
import test from 'node:test';
import { buyBonus, deal, initialState, settleReveal, spin } from './engine';
import type { GameState } from './engine';
import { BOOK_SCHEMA } from './rgs';
import type { AshenMode } from './rgs';
import { RgsSessionController } from './useRgsSession';

const LIVE = 'https://game.test/?sessionID=test-secret&rgs_url=https%3A%2F%2Frgs.test';
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
function book(mode: AshenMode = 'base') {
  let game = initialState({ balanceCents: 1_000_000 });
  const state: Record<string, unknown>[] = [{ index: 0, type: 'ashenBook', schema: BOOK_SCHEMA, mode, betCents: 100 }];
  const append = (next: GameState, type: 'spin' | 'deal') => {
    game = next; state.push({ index: state.length, type: type === 'spin' ? 'ashenSpin' : 'ashenDeal', result: type === 'spin' ? game.lastSpin : game.lastDeal, bonus: game.bonus });
  };
  if (mode === 'bonus1' || mode === 'bonus2' || mode === 'bonus3') { game = buyBonus(game, mode === 'bonus1' ? 1 : mode === 'bonus2' ? 2 : 3); if (game.phase === 'deal') append(deal(game, 'decline'), 'deal'); }
  if (mode === 'base') append(spin(game, { preset: 'blue-wheel' }), 'spin');
  while (game.phase !== 'base') append(spin(game, mode === 'bonus3' ? undefined : { preset: 'dead' }), 'spin');
  const payout = state.reduce((total, event) => total + (event.type === 'ashenSpin' ? (event.result as { totalWinCents: number }).totalWinCents : 0), 0);
  state.push({ index: state.length, type: 'ashenTotal', payoutMultiplier: payout });
  return { state, payoutMultiplier: payout / 100 };
}
function server(minimumRoundDuration = 0) {
  const calls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  let active: Record<string, unknown> | null = null;
  let rejectPlay = false;
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname, body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push(path); bodies.push(body);
    if (path === '/wallet/authenticate') return json({ balance: { amount: 100_000_001, currency: 'EUR' }, config: {
      minBet: 1_000, maxBet: 1_000_000, stepBet: 1_000, defaultBetLevel: 1_000_000, betLevels: [1_000, 1_000_000],
    }, jurisdictionFlags: { minimumRoundDuration }, round: active });
    if (path === '/wallet/play') {
      const outcome = book(body.mode as AshenMode);
      active = { ...outcome, betID: 'round-1', amount: body.amount, payout: Number(body.amount) * outcome.payoutMultiplier, mode: body.mode, active: true };
      if (rejectPlay) throw new Error('Connection interrupted after accepting play');
      return json({ balance: { amount: 99_000_001, currency: 'EUR' }, round: active });
    }
    if (path === '/bet/event') { active!.event = body.event; return json({ event: body.event }); }
    if (path === '/wallet/end-round') { active = null; return json({ balance: { amount: 115_123_456, currency: 'EUR' } }); }
    throw new Error(`Unexpected ${path}`);
  };
  return { request, calls, bodies, rejectNextPlay: () => { rejectPlay = true; }, restorePlay: () => { rejectPlay = false; } };
}

test('local mode makes no requests; malformed partial server links never enable the local generator', async () => {
  let requests = 0;
  const request: typeof fetch = async () => { requests++; throw new Error('unexpected request'); };
  const local = new RgsSessionController('https://game.test/', { request }); await local.initialize();
  assert.equal(local.getSnapshot().enabled, false); assert.equal(local.getSnapshot().mode, 'local');
  for (const query of ['sessionID=partial', 'sessionId=typo', 'game=partial', 'rgsUrl=rgs.test', 'sessionID=a&rgs_url=ftp://evil.test']) {
    const session = new RgsSessionController(`https://game.test/?${query}`, { request });
    await assert.rejects(() => session.initialize());
    assert.equal(session.getSnapshot().enabled, true); assert.equal(session.getSnapshot().ready, false);
  }
  assert.equal(requests, 0);
});

test('initialization is idempotent and a round presents before checkpoint and authoritative settlement', async () => {
  const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request });
  await Promise.all([controller.initialize(), controller.initialize()]);
  assert.deepEqual(mock.calls, ['/wallet/authenticate']);
  assert.equal(controller.getSnapshot().currency, 'EUR');
  let eventsBeforePresentation = 0;
  const final = await controller.advance({ amountCents: 100, presenter: async (next, frame) => {
    eventsBeforePresentation = mock.calls.length;
    assert.equal(frame.type, 'spin'); assert.equal(next.balanceCents, 9900.0001); assert.equal(next.lastSpin!.totalWinCents, 1500);
    assert.equal(controller.getSnapshot().busy, true);
    // A presenter cannot overwrite authoritative internal state by mutating the supplied copy.
    next.balanceCents = 999_999_999;
  } });
  assert.equal(eventsBeforePresentation, 2);
  assert.deepEqual(mock.calls, ['/wallet/authenticate', '/wallet/play', '/bet/event', '/wallet/end-round']);
  assert.equal(final.balanceCents, 11512.3456); assert.equal(controller.getSnapshot().roundPending, false);
  assert.equal(controller.getSnapshot().busy, false);
});

test('bonus frames consume one at a time and never charge another bet; recorded deal carries no client choice', async () => {
  const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request }); await controller.initialize();
  const first = await controller.advance({ amountCents: 100, buyTier: 1, presenter: async (next, frame) => {
    assert.equal(frame.type, 'deal'); assert.equal(next.lastDeal!.decision, 'decline'); assert.equal(next.bonus!.remaining, 10);
  } });
  assert.equal(first.bonus!.remaining, 10); assert.equal(controller.getSnapshot().nextFrameType, 'spin');
  for (let index = 0; index < 10; index++) await controller.advance({ amountCents: 777, featureMode: 'red', presenter: async (_next, frame) => { assert.equal(frame.type, 'spin'); } });
  assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
  assert.equal(mock.calls.filter(path => path === '/bet/event').length, 11);
  assert.equal(controller.getSnapshot().state!.completedBonus!.totalSpins, 10);
});

test('presentation failure neither acknowledges nor settles, and explicit reconnect recovers the accepted round', async () => {
  const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request }); await controller.initialize();
  await assert.rejects(() => controller.advance({ amountCents: 100, presenter: async () => { throw new Error('Presentation unmounted'); } }));
  assert.deepEqual(mock.calls, ['/wallet/authenticate', '/wallet/play']); assert.equal(controller.getSnapshot().ready, false);
  await assert.rejects(() => controller.advance({ amountCents: 100, presenter: async () => {} }));
  await controller.reconnect(); assert.equal(controller.getSnapshot().ready, true); assert.equal(controller.getSnapshot().nextFrameType, 'spin');
  await controller.advance({ amountCents: 100, presenter: async () => {} });
  assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
});

test('uncertain financial request never retries automatically and recovers the original round', async () => {
  const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request }); await controller.initialize(); mock.rejectNextPlay();
  await assert.rejects(() => controller.advance({ amountCents: 100, presenter: async () => { throw new Error('Must not present'); } }));
  assert.equal(controller.getSnapshot().ready, false); assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
  mock.restorePlay(); await controller.reconnect(); await controller.advance({ amountCents: 100, presenter: async () => {} });
  assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
});

test('simultaneous user actions issue one play and one presentation', async () => {
  const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request }); await controller.initialize();
  let presentations = 0;
  const presenter = async () => { presentations++; };
  const first = controller.advance({ amountCents: 100, presenter });
  await assert.rejects(() => controller.advance({ amountCents: 100, presenter })); await first;
  assert.equal(presentations, 1); assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
});

test('minimum round duration elapses before end-round settlement', async () => {
  const mock = server(60), controller = new RgsSessionController(LIVE, { request: mock.request }); await controller.initialize();
  const before = Date.now(); await controller.advance({ amountCents: 100, presenter: async () => {} });
  assert.ok(Date.now() - before >= 55); assert.equal(mock.calls.at(-1), '/wallet/end-round');
});

test('replay is read-only and can restart without wallet, session token or additional network calls', async () => {
  const calls: string[] = [], outcome = book('bonus1');
  const request: typeof fetch = async (input, init) => {
    calls.push(String(input)); assert.equal(init?.body, undefined);
    return json({ ...outcome, costMultiplier: 100 });
  };
  const replay = new RgsSessionController('https://game.test/?replay=true&sessionID=never-send&rgs_url=rgs.test&game=ashen&version=1&mode=bonus1&event=17&amount=1000000&currency=USD', { request });
  await replay.initialize(); assert.equal(replay.getSnapshot().readOnly, true); assert.equal(replay.getSnapshot().mode, 'replay');
  assert.equal(replay.getSnapshot().nextFrameType, 'deal');
  await replay.revealRecordedDeal(async (state, frame) => { assert.equal(frame.type, 'deal'); assert.equal(state.lastDeal!.decision, 'decline'); });
  for (let index = 0; index < 10; index++) await replay.advance({ amountCents: 100, presenter: async () => {} });
  assert.equal(replay.getSnapshot().replayInfo!.completed, true); assert.equal(replay.getSnapshot().state!.balanceCents, 0);
  replay.restartReplay(); assert.equal(replay.getSnapshot().nextFrameType, 'deal'); assert.equal(replay.getSnapshot().replayInfo!.completed, false);
  assert.deepEqual(calls, ['https://rgs.test/bet/replay/ashen/1/bonus1/17']);
});

test('recovered bonus keeps integer-unit rounding across its bookmark and settles without a second wager', async () => {
  let local = deal(buyBonus(initialState({ balanceCents: 1_000_000 }), 1), 'decline');
  const events: Record<string, unknown>[] = [
    { index: 0, type: 'ashenBook', schema: BOOK_SCHEMA, mode: 'bonus1', betCents: 100 },
    { index: 1, type: 'ashenDeal', result: local.lastDeal, bonus: local.bonus },
  ];
  for (let index = 0; index < 10; index++) {
    const board = structuredClone(initialState().board);
    for (let reel = 0; reel < 3; reel++) board[reel][0] = 'ten';
    local = settleReveal(local, board, []);
    events.push({ index: events.length, type: 'ashenSpin', result: local.lastSpin, bonus: local.bonus });
  }
  events.push({ index: events.length, type: 'ashenTotal', payoutMultiplier: 200 });
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path === '/wallet/authenticate') return json({ balance: { amount: 50_000, currency: 'USD' },
      config: { minBet: 1, maxBet: 1_000_000, stepBet: 1, defaultBetLevel: 1_000_000, betLevels: [1003, 1_000_000] },
      round: { betID: 'tiny-bonus', mode: 'bonus1', amount: 1003, payout: 2006, payoutMultiplier: 2, active: true, state: events,
        event: JSON.stringify({ schema: BOOK_SCHEMA, betID: 'tiny-bonus', cursor: 5 }) },
    });
    if (path === '/bet/event') return json({ event: JSON.parse(String(init!.body)).event });
    if (path === '/wallet/end-round') return json({ balance: { amount: 52_006, currency: 'USD' } });
    throw new Error(`Unexpected financial request ${path}`);
  };
  const controller = new RgsSessionController(LIVE, { request });
  await controller.initialize();
  assert.equal(controller.getSnapshot().state!.betCents, .1003); // Restore the round bet, not the new default.
  assert.equal(controller.getSnapshot().state!.bonus!.remaining, 6);
  assert.equal(controller.getSnapshot().state!.bonus!.totalWinCents, .0802);
  let shownMicros = 802;
  for (let index = 0; index < 6; index++) {
    await controller.advance({ amountCents: 100, presenter: async next => { shownMicros += Math.round(next.lastSpin!.totalWinCents * 10_000); } });
  }
  assert.equal(shownMicros, 2006);
  assert.equal(controller.getSnapshot().state!.completedBonus!.totalWinCents, .2006);
  assert.equal(controller.getSnapshot().state!.balanceCents, 5.2006);
  assert.equal(controller.getSnapshot().roundPending, false);
  assert.equal(calls.filter(path => path === '/wallet/play').length, 0);
  assert.equal(calls.filter(path => path === '/wallet/end-round').length, 1);
});


test('purchased intro precedes every recorded frame and remains recoverable without a second debit', async () => {
  for (const tier of [1, 2, 3] as const) {
    const mock = server(), controller = new RgsSessionController(LIVE, { request: mock.request });
    await controller.initialize(); let presentations = 0;
    const opening = await controller.advance({ amountCents: .1, buyTier: tier, deferPresentation: true,
      presenter: async () => { presentations++; } });
    assert.equal(opening.bonus!.remaining, 10); assert.equal(opening.bonus!.tier, tier);
    assert.equal(opening.phase, tier === 3 ? 'free-spins' : 'deal');
    assert.equal(opening.bonus!.variant, tier === 3 ? 'eclipse' : undefined);
    assert.equal(presentations, 0);
    assert.deepEqual(mock.calls, ['/wallet/authenticate', '/wallet/play']);
    await controller.reconnect();
    assert.equal(controller.getSnapshot().state!.bonus!.remaining, 10);
    while (controller.getSnapshot().roundPending) await controller.advance({amountCents:.1, presenter: async () => { presentations++; }});
    assert.equal(mock.calls.filter(path => path === '/wallet/play').length, 1);
    assert.equal(mock.calls.filter(path => path === '/wallet/end-round').length, 1);
    assert.equal(controller.getSnapshot().state!.completedBonus!.totalSpins, 10);
    assert.equal(presentations, tier === 3 ? 10 : 11);
  }
});
