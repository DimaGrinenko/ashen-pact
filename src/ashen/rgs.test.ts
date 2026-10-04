import assert from 'node:assert/strict';
import test from 'node:test';
import { buyBonus, deal, initialState, setFeatureMode, settleReveal, spin } from './engine';
import type { GameState, PresetName } from './engine';
import { AshenRgs, BOOK_SCHEMA, MODE_COST, RgsError, applyServerFrameToState, createServerState, loadReplay, parseBook, parseConfiguration, parseLaunch, toApiAmount } from './rgs';
import type { AshenMode } from './rgs';

const LIVE = 'https://game.test/?sessionID=secret-test-token&rgs_url=https%3A%2F%2Frgs.test&lang=en';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(mode: AshenMode = 'base', preset: PresetName = 'two-wheels') {
  let state = initialState({ balanceCents: 1_000_000, betCents: 100 });
  const events: Record<string, unknown>[] = [{ index: 0, type: 'ashenBook', schema: BOOK_SCHEMA, mode, betCents: 100 }];
  const append = (kind: 'spin' | 'deal', next: GameState) => {
    state = next;
    events.push({ index: events.length, type: kind === 'spin' ? 'ashenSpin' : 'ashenDeal', result: structuredClone(kind === 'spin' ? state.lastSpin : state.lastDeal), bonus: structuredClone(state.bonus) });
  };
  if (mode === 'bonus1' || mode === 'bonus2' || mode === 'bonus3') state = buyBonus(state, mode === 'bonus1' ? 1 : mode === 'bonus2' ? 2 : 3);
  else { state = setFeatureMode(state, mode); append('spin', spin(state, { preset })); }
  while (state.phase !== 'base') {
    if (state.phase === 'deal') append('deal', deal(state, 'decline'));
    else append('spin', spin(state, mode === 'bonus3' ? undefined : { preset: 'dead' }));
  }
  const total = events.reduce((sum, event) => sum + (event.type === 'ashenSpin' ? (event.result as { totalWinCents: number }).totalWinCents : 0), 0);
  events.push({ index: events.length, type: 'ashenTotal', payoutMultiplier: total });
  return { events, total };
}
function server(preset: PresetName = 'two-wheels') {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const config = { minBet: 1_000, maxBet: 100_000_000, stepBet: 1_000, defaultBetLevel: 1_000_000, betLevels: [1_000, 1_000_000, 2_000_000, 100_000_000], betModes: Object.fromEntries(Object.entries(MODE_COST).map(([mode, costMultiplier]) => [mode, { costMultiplier }])), jurisdiction: {} as Record<string, unknown> };
  let active: Record<string, unknown> | null = null;
  let playError: 'invalid' | 'network' | 'insufficient' | null = null;
  let roundActive = true;
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ path, body });
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    if (path === '/wallet/authenticate') return json({ balance: { amount: 99_543_210, currency: 'USD' }, config, round: active });
    if (path === '/wallet/play') {
      if (playError === 'network') throw new TypeError('Simulated network failure');
      if (playError === 'insufficient') return json({ error: 'ERR_IPB' }, 400);
      const outcome = fixture(body.mode as AshenMode, preset);
      active = { betID: 'server-round-1', amount: body.amount, payout: Number(body.amount) * outcome.total / 100, payoutMultiplier: outcome.total / 100, mode: body.mode, active: roundActive, state: outcome.events };
      return json({ balance: { amount: 98_543_210, currency: 'USD' }, round: playError === 'invalid' ? { ...active, state: [] } : active });
    }
    if (path === '/bet/event') {
      if (typeof body.event !== 'string' || !/^(0|[1-9]\d*)$/.test(body.event)) return json({ error: 'ERR_VAL' }, 400);
      if (active) active.event = body.event; return json({ event: body.event });
    }
    if (path === '/wallet/end-round') { active = null; return json({ balance: { amount: 198_777_777, currency: 'USD' } }); }
    throw new Error(`Unexpected path ${path}`);
  };
  return { calls, config, request, setError: (value: typeof playError) => { playError = value; }, setActive: (value: typeof active) => { active = value; }, setRoundActive: (value: boolean) => { roundActive = value; } };
}

test('launch parsing fails closed for partial, duplicate, malformed or insecure server parameters', () => {
  assert.equal(parseLaunch('https://game.test/').kind, 'demo');
  assert.equal(parseLaunch(LIVE).kind, 'live');
  assert.equal(parseLaunch(`${LIVE}&social=true`).language, 'en');
  assert.equal(parseLaunch(`${LIVE.replace('lang=en', 'lang=ru')}&social=true`).language, 'en');
  for (const url of [
    'https://game.test/?sessionID=abc', 'https://game.test/?rgs_url=rgs.test', 'https://game.test/?replay=1',
    `${LIVE}&sessionID=second`, 'https://game.test/?sessionID=a&rgs_url=http://example.com',
    'https://game.test/?sessionID=a&rgs_url=https://username:password@example.com',
    'https://game.test/?replay=true&rgs_url=rgs.test',
  ]) assert.throws(() => parseLaunch(url));
  assert.equal(parseLaunch('http://localhost/?sessionID=a&rgs_url=http://localhost:3000').baseUrl, 'http://localhost:3000');
  assert.equal(toApiAmount(0.123456), 123456); assert.throws(() => toApiAmount(0.1234567));
});

test('normalized books verify geometry, exact line/wheel arithmetic, mode and all bonus frames', () => {
  assert.equal(parseBook(fixture().events, 'base', 100).payoutMultiplier, 10_000);
  assert.equal(parseBook(fixture('base', 'line-win').events).frames.length, 1);
  assert.equal(parseBook(fixture('base', 'bonus-1').events).frames.length, 12);
  assert.equal(parseBook(fixture('bonus1').events).frames.length, 11);
  assert.equal(parseBook(fixture('bonus2').events).frames.length, 11);
  assert.equal(parseBook(fixture('base', 'max-win').events).payoutMultiplier, 1_666_600);
  assert.throws(() => parseBook([{ index: 0, type: 'reveal', board: [] }]));
  const wrong = fixture(); (wrong.events[1].result as Record<string, unknown>).totalWinCents = 9999;
  assert.throws(() => parseBook(wrong.events));
  const wrongSchema = fixture(); wrongSchema.events[0].schema = 'alchemist/v1'; assert.throws(() => parseBook(wrongSchema.events));
  assert.throws(() => parseBook(fixture().events, 'red'));
  assert.throws(() => parseBook(fixture().events, 'base', 99));
  const partial = fixture('base', 'bonus-1'); partial.events.splice(2, 1); partial.events.forEach((e, index) => { e.index = index; });
  assert.throws(() => parseBook(partial.events));
});

test('server books reject red wheels in base and blue-feature spins while accepting the red feature', () => {
  for (const mode of ['base', 'blue'] as const) {
    assert.throws(() => parseBook(fixture(mode, 'red-wheel').events), /requires blue wheels/);
    assert.equal(parseBook(fixture(mode, 'blue-wheel').events).mode, mode);
  }
  assert.equal(parseBook(fixture('red', 'red-wheel').events).mode, 'red');
  assert.throws(() => parseBook(fixture('red', 'blue-wheel').events), /requires red wheels/);
});

test('wallet transaction uses API units, server balance, checkpoints and end-round settlement', async () => {
  const mock = server(), rgs = new AshenRgs(LIVE, mock.request);
  const auth = await rgs.authenticate(); assert.equal(auth.balance.amount, 99_543_210);
  const outcome = await rgs.play(1_000, 'base'); assert.equal(outcome.round.payout, 100_000);
  assert.equal(rgs.balance!.amount, 98_543_210);
  await assert.rejects(() => rgs.play(1_000, 'base'));
  await assert.rejects(() => rgs.endRound());
  await rgs.event(1); await rgs.endRound();
  assert.equal(rgs.balance!.amount, 198_777_777); assert.equal(rgs.round, null);
  assert.deepEqual(mock.calls.map(call => call.path), ['/wallet/authenticate', '/wallet/play', '/bet/event', '/wallet/end-round']);
  assert.deepEqual(mock.calls[1].body, { sessionID: 'secret-test-token', amount: 1_000, mode: 'base' });
});

test('active-round recovery restores validated book and bookmark without another play', async () => {
  const mock = server(); const outcome = fixture('bonus1');
  mock.setActive({ betID: 17, amount: 1_000_000, payout: 0, payoutMultiplier: 0, active: true, mode: 'bonus1', state: outcome.events,
    event: JSON.stringify({ schema: BOOK_SCHEMA, betID: '17', cursor: 3 }) });
  const rgs = new AshenRgs(LIVE, mock.request), auth = await rgs.authenticate();
  assert.equal(auth.round!.cursor, 3); assert.equal(auth.round!.book.frames.length, 11);
  await assert.rejects(() => rgs.play(1_000_000, 'base'));
  for (let cursor = 4; cursor <= 11; cursor++) await rgs.event(cursor);
  await rgs.endRound(); assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 0);
});

test('malformed financial results and connection loss lock play until authentication recovery', async () => {
  for (const error of ['invalid', 'network'] as const) {
    const mock = server(), rgs = new AshenRgs(LIVE, mock.request); await rgs.authenticate(); mock.setError(error);
    await assert.rejects(() => rgs.play(1_000_000, 'base'), (err: unknown) => err instanceof RgsError && err.uncertain);
    await assert.rejects(() => rgs.play(1_000_000, 'base'));
    assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
    mock.setError(null); await rgs.authenticate(); assert.equal(rgs.fault, null);
  }
});

test('definite insufficient-balance response does not retry or invent a balance', async () => {
  const mock = server(), rgs = new AshenRgs(LIVE, mock.request); await rgs.authenticate(); mock.setError('insufficient');
  await assert.rejects(() => rgs.play(1_000_000, 'base'), (err: unknown) => err instanceof RgsError && !err.uncertain);
  assert.equal(rgs.balance!.amount, 99_543_210); assert.equal(rgs.fault, null);
  assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
});

test('jurisdiction, registered mode cost, server bet levels and minimum duration are enforced', async () => {
  const mock = server(); mock.config.jurisdiction.disabledBuyFeature = true; mock.config.jurisdiction.minimumRoundDuration = 5000;
  const rgs = new AshenRgs(`${LIVE}&social=true`, mock.request); const auth = await rgs.authenticate();
  assert.equal(auth.config.jurisdiction.socialCasino, true);
  await assert.rejects(() => rgs.play(1_000_000, 'blue')); await assert.rejects(() => rgs.play(2_000, 'base'));
  await rgs.play(1_000_000, 'base'); await rgs.event(1);
  await assert.rejects(() => rgs.endRound(), (err: unknown) => err instanceof RgsError && err.code === 'MINIMUM_DURATION');
  assert.equal(mock.calls.filter(call => call.path === '/wallet/end-round').length, 0);
  const wrong = { ...mock.config, betModes: { base: { costMultiplier: 2 } } }; assert.throws(() => parseConfiguration(wrong));
  assert.deepEqual(parseConfiguration({ ...mock.config, betModes: undefined }).modes, Object.keys(MODE_COST));
});

test('official authenticate without mode metadata or with an empty map permits registered purchases', async () => {
  for (const metadata of [undefined, {}]) {
    for (const mode of ['blue', 'red', 'bonus1', 'bonus2', 'bonus3'] as const) {
      const mock = server(mode === 'red' ? 'red-wheel' : 'blue-wheel');
      const request: typeof fetch = async (input, init) => {
        const response = await mock.request(input, init);
        if (new URL(String(input)).pathname !== '/wallet/authenticate') return response;
        const data = await response.json();
        if (metadata === undefined) delete data.config.betModes;
        else data.config.betModes = metadata;
        return json(data);
      };
      const rgs = new AshenRgs(LIVE, request), auth = await rgs.authenticate();
      assert.deepEqual(auth.config.modes, Object.keys(MODE_COST));
      const result = await rgs.play(1_000, mode);
      assert.equal(result.round.mode, mode);
      assert.deepEqual(mock.calls.filter(call => call.path === '/wallet/play').map(call => call.body),
        [{ sessionID: 'secret-test-token', amount: 1_000, mode }]);
      assert.equal(rgs.balance!.amount, 98_543_210);
    }
  }
});

test('explicit metadata remains restrictive and optional costs are validated when supplied', async () => {
  const mock = server();
  assert.deepEqual(parseConfiguration({ ...mock.config, betModes: {} }).modes, Object.keys(MODE_COST));
  assert.deepEqual(parseConfiguration({ ...mock.config, betModes: { base: {}, bonus1: {} } }).modes, ['base', 'bonus1']);
  assert.deepEqual(parseConfiguration({ ...mock.config, betModes: { base: { cost: 1 } } }).modes, ['base']);
  for (const betModes of [null, [], { bonus1: {} }, { base: { costMultiplier: null } },
    { base: {}, bonus1: { costMultiplier: 99 } }, { base: { costMultiplier: 1, cost: 2 } }]) {
    assert.throws(() => parseConfiguration({ ...mock.config, betModes }));
  }
  mock.config.betModes = { base: { costMultiplier: 1 } };
  const rgs = new AshenRgs(LIVE, mock.request); await rgs.authenticate();
  for (const mode of ['blue', 'red', 'bonus1', 'bonus2', 'bonus3'] as const) await assert.rejects(() => rgs.play(1_000, mode), /does not allow this mode/);
  assert.deepEqual(mock.calls.map(call => call.path), ['/wallet/authenticate']);
  assert.equal(rgs.balance!.amount, 99_543_210);
});

test('top-level jurisdiction still prohibits all paid features when mode metadata is absent', async () => {
  const mock = server();
  const request: typeof fetch = async (input, init) => {
    const response = await mock.request(input, init);
    if (new URL(String(input)).pathname !== '/wallet/authenticate') return response;
    const data = await response.json();
    delete data.config.betModes; delete data.config.jurisdiction;
    data.jurisdictionFlags = { disabledBuyFeature: true };
    return json(data);
  };
  const rgs = new AshenRgs(LIVE, request); await rgs.authenticate();
  for (const mode of ['blue', 'red', 'bonus1', 'bonus2', 'bonus3'] as const) await assert.rejects(() => rgs.play(1_000, mode), /disabled for this session/);
  assert.deepEqual(mock.calls.map(call => call.path), ['/wallet/authenticate']);
  assert.equal(rgs.balance!.amount, 99_543_210);
  await rgs.play(1_000, 'base');
  assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
});

test('server-completed rounds display without unnecessary wallet/end-round or event calls', async () => {
  const mock = server(); mock.setRoundActive(false); const rgs = new AshenRgs(LIVE, mock.request);
  await rgs.authenticate(); await rgs.play(1_000_000, 'base'); await rgs.event(1); await rgs.endRound();
  assert.deepEqual(mock.calls.map(call => call.path), ['/wallet/authenticate', '/wallet/play']);
});

test('zero-win auto-closed rounds preserve the returned balance and allow the next play without settlement requests', async () => {
  const mock = server('dead'); mock.setRoundActive(false);
  const rgs = new AshenRgs(LIVE, mock.request);
  await rgs.authenticate();
  const result = await rgs.play(1_000_000, 'base');
  assert.equal(result.round.payout, 0);
  assert.equal(result.round.payoutMultiplier, 0);
  assert.equal(result.round.active, false);
  await rgs.event(1);
  const final = await rgs.endRound();
  assert.equal(final.amount, result.balance.amount);
  assert.equal(rgs.round, null);
  await rgs.play(1_000_000, 'base');
  assert.deepEqual(mock.calls.map(call => call.path), ['/wallet/authenticate', '/wallet/play', '/wallet/play']);
});

test('concurrent play has exactly one financial request', async () => {
  const mock = server(), rgs = new AshenRgs(LIVE, mock.request); await rgs.authenticate();
  const first = rgs.play(1_000_000, 'base'); const second = rgs.play(1_000_000, 'base');
  await assert.rejects(() => second); await first;
  assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
});

test('public replay omits session and all wallet calls, uses actual play amount and encodes identifiers', async () => {
  const outcome = fixture(); const calls: string[] = [];
  const request: typeof fetch = async (input, init) => { calls.push(String(input)); assert.equal(init?.body, undefined); return json({ state: outcome.events, payoutMultiplier: 100, costMultiplier: 1 }); };
  const replay = await loadReplay('https://game.test/?replay=true&sessionID=never-send&rgs_url=rgs.test&game=a%2Fb&version=1&mode=base&event=42&amount=123000&currency=EUR', request);
  assert.deepEqual(calls, ['https://rgs.test/bet/replay/a%2Fb/1/base/42']); assert.equal(replay.round.amount, 123000); assert.equal(replay.round.payout, 12_300_000);
  assert.equal(replay.currency, 'EUR');
  assert.deepEqual(replay.displayDefaults, { amount: false, currency: false });
  await assert.rejects(() => loadReplay('https://game.test/?replay=true&rgs_url=rgs.test&game=g&version=1&mode=base&event=1&amount=1000000&currency=EUR', async () => json({ costMultiplier: 1, payoutMultiplier: 0, state: [] })));
});

test('minimal replay uses explicit reference display defaults and remains isolated from the wallet', async () => {
  const minimal = 'https://game.test/?replay=true&rgs_url=rgs.test&game=g&version=1&mode=base&event=42';
  const launch = parseLaunch(minimal);
  assert.equal(launch.kind, 'replay'); assert.equal(launch.amount, 1_000_000); assert.equal(launch.currency, 'USD');
  assert.deepEqual(launch.replayDisplayDefaults, { amount: true, currency: true });
  assert.equal(launch.sessionID, undefined);
  const calls: { url: string; method: string | undefined }[] = [], outcome = fixture();
  const request: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method });
    assert.equal(init?.body, undefined); assert.equal(init?.credentials, 'omit');
    return json({ state: outcome.events, payoutMultiplier: 100, costMultiplier: 1 });
  };
  const replay = await loadReplay(`${minimal}&sessionID=must-not-be-used`, request);
  assert.equal(replay.round.amount, 1_000_000); assert.equal(replay.round.payoutMultiplier, 100);
  assert.equal(replay.round.payout, 100_000_000); // Reference-scale visualization, not a wallet payout.
  assert.equal(replay.round.active, false); assert.equal(replay.currency, 'USD');
  assert.deepEqual(replay.displayDefaults, { amount: true, currency: true });
  assert.throws(() => new AshenRgs(minimal, request), /live session/);
  assert.deepEqual(calls, [{ url: 'https://rgs.test/bet/replay/g/1/base/42', method: 'GET' }]);
});

test('optional replay display fields default independently while supplied invalid fields still fail', () => {
  const minimal = 'https://game.test/?replay=true&rgs_url=rgs.test&game=g&version=1&mode=base&event=42';
  const currencyOnly = parseLaunch(`${minimal}&currency=EUR`);
  assert.equal(currencyOnly.amount, 1_000_000); assert.equal(currencyOnly.currency, 'EUR');
  assert.deepEqual(currencyOnly.replayDisplayDefaults, { amount: true, currency: false });
  const amountOnly = parseLaunch(`${minimal}&amount=1230`);
  assert.equal(amountOnly.amount, 1230); assert.equal(amountOnly.currency, 'USD');
  assert.deepEqual(amountOnly.replayDisplayDefaults, { amount: false, currency: true });
  for (const bad of ['amount=', 'amount=0', 'amount=-1', 'amount=1.5', 'amount=9007199254740992', 'currency=', 'currency=usd', 'amount=1&amount=2', 'currency=USD&currency=EUR']) {
    assert.throws(() => parseLaunch(`${minimal}&${bad}`), bad);
  }
});

test('presentation scaling preserves server balance and seed, including subcent currency amounts', () => {
  const book = parseBook(fixture().events); const previous = createServerState({ amount: 12_345_678, currency: 'USD' }, 1_230);
  const next = applyServerFrameToState(previous, book.frames[0], 1_230);
  assert.equal(next.balanceCents, 1234.5678); assert.equal(next.seed, 0); assert.equal(next.betCents, 0.123);
  assert.equal(next.lastSpin!.totalWinCents, 12.3); assert.equal(next.lastSpin!.wheels[0].afterCents, 3.075);
  assert.equal(book.frames[0].type === 'spin' && book.frames[0].result.totalWinCents, 10_000);
});

test('fractional API-unit line and wheel awards add up to the exact wallet payout', () => {
  const local = initialState(), board = structuredClone(local.board);
  for (let reel = 0; reel < 3; reel++) board[reel][0] = 'ten';
  board[4][1] = 'blue-six';
  const outcome = settleReveal(local, board, [{ reel: 4, row: 1, color: 'blue', kind: 'add', value: 5 }]);
  const frame = { type: 'spin' as const, result: outcome.lastSpin!, bonus: null };
  const next = applyServerFrameToState(createServerState({ amount: 100_000, currency: 'USD' }, 1003), frame, 1003);
  assert.equal(next.lastSpin!.lineWinCents, .02); // 200 micro units, not 200.6.
  assert.equal(next.lastSpin!.wheelWinCents, .5015);
  assert.equal(next.lastSpin!.totalWinCents, .5215);
  assert.equal(next.lastSpin!.lineWins[0].winCents, .02);
  assert.equal(next.lastSpin!.wheels[0].afterCents, .5015);
  assert.equal((next.lastSpin!.totalWinCents / 100).toFixed(6), '0.005215');
  assert.equal(next.balanceCents, 10); // The presenter never credits the wallet itself.
});

test('cumulative micro-unit allocation preserves bonus payout instead of rounding every spin independently', () => {
  let local = deal(buyBonus(initialState({ balanceCents: 1_000_000 }), 1), 'decline');
  let shown = applyServerFrameToState(createServerState({ amount: 100_000, currency: 'USD' }, 1003, 'bonus1'), { type: 'deal', result: local.lastDeal!, bonus: local.bonus! }, 1003);
  let paidBookCents = 0, shownMicros = 0;
  for (let index = 0; index < 10; index++) {
    const board = structuredClone(initialState().board);
    for (let reel = 0; reel < 3; reel++) board[reel][0] = 'ten';
    local = settleReveal(local, board, []);
    shown = applyServerFrameToState(shown, { type: 'spin', result: local.lastSpin!, bonus: local.bonus }, 1003, paidBookCents);
    paidBookCents += local.lastSpin!.totalWinCents;
    shownMicros += Math.round(shown.lastSpin!.totalWinCents * 10_000);
    assert.equal(shownMicros, Number(BigInt(1003) * BigInt(paidBookCents) / 100n));
    assert.equal(shown.lastSpin!.lineWins[0].winCents, shown.lastSpin!.totalWinCents);
  }
  assert.equal(shownMicros, 2006);
  assert.equal(shown.completedBonus!.totalWinCents, .2006);
  assert.equal(shown.completedBonus!.roundWinCents, .2006);
});


test('numeric checkpoints recover exactly; legacy JSON remains compatible and malformed indices fail closed', async () => {
  const outcome = fixture('bonus1');
  for (const event of ['0', '3', '11', null]) {
    const mock = server();
    mock.setActive({ betID: 'recover', amount: 1000000, payout: outcome.total * 10000, payoutMultiplier: outcome.total / 100, active: true, mode: 'bonus1', state: outcome.events, event });
    const rgs = new AshenRgs(LIVE, mock.request);
    const auth = await rgs.authenticate();
    assert.equal(auth.round!.cursor, event === null ? 0 : Number(event));
    assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 0);
  }
  for (const event of ['-1', '1.5', '01', '12', '9007199254740992', '{"schema":"wrong"}']) {
    const mock = server();
    mock.setActive({ betID: 'recover', amount: 1000000, payout: outcome.total * 10000, payoutMultiplier: outcome.total / 100, active: true, mode: 'bonus1', state: outcome.events, event });
    await assert.rejects(() => new AshenRgs(LIVE, mock.request).authenticate());
  }
});

test('checkpoint rejection identifies event and cannot retry a paid spin or silently advance the bookmark', async () => {
  const mock = server();
  const request: typeof fetch = async (input, init) => new URL(String(input)).pathname === '/bet/event'
    ? json({ code: 'ERR_VAL', message: 'invalid event' }, 400) : mock.request(input, init);
  const rgs = new AshenRgs(LIVE, request); await rgs.authenticate(); await rgs.play(1000000, 'base');
  await assert.rejects(() => rgs.event(1), (error: unknown) => error instanceof RgsError && error.operation === 'event' && error.code === 'ERR_VAL' && error.status === 400 && error.message === 'Server rejected the round checkpoint');
  assert.equal(rgs.round!.cursor, 0);
  await assert.rejects(() => rgs.play(1000000, 'base'));
  assert.equal(mock.calls.filter(call => call.path === '/wallet/play').length, 1);
});

test('Eclipse begins with ten purchased spins and keeps its identity through first-spin cap', () => {
  const outcome = fixture('bonus3');
  const parsed = parseBook(outcome.events, 'bonus3');
  assert(parsed.frames.every(frame => frame.type === 'spin' && frame.result.wheels.length >= 2));
  const opening = createServerState({ amount: 500000000, currency: 'USD' }, 1000000, 'bonus3');
  assert.equal(opening.phase, 'free-spins'); assert.equal(opening.bonus!.remaining, 10);
  assert.equal(opening.bonus!.variant, 'eclipse');
  const local = buyBonus(initialState({balanceCents: 1000000, betCents: 100}), 3);
  const board = structuredClone(local.board); board[0][0] = 'red-six'; board[2][0] = 'red-six';
  const capped = settleReveal(local, board, [{reel:0,row:0,color:'red',kind:'max',value:16666},{reel:2,row:0,color:'red',kind:'add',value:10}]);
  const shown = applyServerFrameToState(opening, {type:'spin', result:capped.lastSpin!, bonus:capped.bonus}, 1000000);
  assert.equal(shown.bonus, null); assert.equal(shown.completedBonus!.variant, 'eclipse');
  assert.equal(shown.completedBonus!.totalSpins, 1); assert.equal(shown.completedBonus!.capped, true);
});
