import type { BonusState, DealResult, GameState, SpinResult } from './engine';
import { evaluateLines, resolveWheels, validateBoard, MAX_WIN_MULTIPLIER, REGULAR_SYMBOLS, celebrationFor } from './engine';

/** Wallet amounts use millionths. Book payouts use hundredths of a 1-unit base bet. */
export const API_SCALE = 1_000_000;
export const BOOK_SCHEMA = 'ashen-pact/v1';
export const MODE_COST = { base: 1, blue: 10, red: 50, bonus1: 100, bonus2: 250, bonus3: 500 } as const;
export type AshenMode = keyof typeof MODE_COST;
export type RgsOperation = 'authenticate' | 'play' | 'end-round' | 'event' | 'replay';
export class RgsError extends Error {
  readonly operation: RgsOperation; readonly uncertain: boolean; readonly code: string; readonly status?: number;
  constructor(message: string, operation: RgsOperation, uncertain = false, code = 'RGS_ERROR', status?: number) {
    super(message); this.name = 'RgsError'; this.operation = operation; this.uncertain = uncertain; this.code = code; this.status = status;
  }
}
export interface RgsBalance { amount: number; currency: string }
export interface Jurisdiction {
  socialCasino?: boolean; disabledFullscreen?: boolean; disabledTurbo?: boolean;
  disabledSuperTurbo?: boolean; disabledAutoplay?: boolean; disabledSlamstop?: boolean;
  disabledSpacebar?: boolean; disabledBuyFeature?: boolean; displayNetPosition?: boolean;
  displayRTP?: boolean; displaySessionTimer?: boolean; minimumRoundDuration?: number;
}
export interface RgsConfiguration {
  minBet: number; maxBet: number; stepBet: number; defaultBetLevel: number;
  betLevels: number[]; modes: AshenMode[]; jurisdiction: Jurisdiction;
}
export type ServerFrame =
  | { type: 'spin'; result: SpinResult; bonus: BonusState | null }
  | { type: 'deal'; result: DealResult; bonus: BonusState };
export interface ServerBook { schema: typeof BOOK_SCHEMA; mode: AshenMode; frames: ServerFrame[]; payoutMultiplier: number }
export interface AshenRound {
  betID: string; amount: number; payout: number; payoutMultiplier: number; active: boolean;
  mode: AshenMode; book: ServerBook; cursor: number;
}
export interface RgsAuthentication { balance: RgsBalance; config: RgsConfiguration; round: AshenRound | null }
export interface RgsPlay { balance: RgsBalance; round: AshenRound }
export interface ReplayDisplayDefaults { amount: boolean; currency: boolean }
export interface ReplayResult { round: AshenRound; currency: string; game: string; version: string; displayDefaults: ReplayDisplayDefaults }
export interface LaunchConfig {
  kind: 'demo' | 'live' | 'replay'; language: string; social: boolean; baseUrl?: string;
  sessionID?: string; game?: string; version?: string; mode?: AshenMode; event?: string;
  amount?: number; currency?: string; replayDisplayDefaults?: ReplayDisplayDefaults;
}

function record(value: unknown, label = 'object'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => same(item, b[index]));
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const av = a as Record<string, unknown>, bv = b as Record<string, unknown>;
    return Object.keys(av).length === Object.keys(bv).length && Object.keys(av).every(key => same(av[key], bv[key]));
  }
  return false;
}
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}
function oneOf<T extends string | number>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) throw new Error(`Unsupported ${label}`);
  return value as T;
}
function textId(value: unknown, label: string): string {
  if (typeof value === 'number') return String(integer(value, label));
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error(`Invalid ${label}`);
  return value;
}
export function parseMode(value: unknown): AshenMode {
  return oneOf(value, Object.keys(MODE_COST) as AshenMode[], 'game mode');
}
export function apiAmount(value: unknown, label = 'amount', positive = false): number {
  return integer(value, label, positive ? 1 : 0);
}
export function toApiAmount(value: number): number {
  const amount = Math.round(value * API_SCALE);
  if (!Number.isFinite(value) || Math.abs(value * API_SCALE - amount) > 0.0001) throw new Error('Amount exceeds six decimal places');
  return apiAmount(amount, 'amount', true);
}
function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{2,10}$/.test(value)) throw new Error('Invalid server currency');
  return value;
}
function balance(value: unknown): RgsBalance {
  const v = record(value, 'balance'); return { amount: apiAmount(v.amount), currency: currency(v.currency) };
}
function baseUrl(host: string): string {
  if (host.includes('\\') || [...host].some(character => character.charCodeAt(0) <= 32) || host.startsWith('//') || /:\/\//.test(host) && !/^https?:\/\//i.test(host)) throw new Error('Invalid RGS endpoint');
  const url = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid RGS endpoint');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('RGS requires HTTPS');
  return url.href.replace(/\/$/, '');
}
/** Partial/broken server launch parameters are errors, never a request for a local demo. */
export function parseLaunch(launchUrl: string): LaunchConfig {
  const params = new URL(launchUrl).searchParams;
  for (const name of ['sessionID', 'rgs_url', 'replay', 'game', 'version', 'mode', 'event', 'amount', 'currency']) {
    if (params.getAll(name).length > 1) throw new Error(`Duplicate launch parameter ${name}`);
  }
  const social = params.get('social') === 'true';
  const language = !social && /^[a-z]{2}$/.test(params.get('lang') ?? '') ? params.get('lang')! : 'en';
  if (params.has('replay') && !['true', 'false'].includes(params.get('replay')!)) throw new Error('Invalid replay flag');
  const kind = params.get('replay') === 'true' ? 'replay' : params.has('sessionID') || params.has('rgs_url') ? 'live' : 'demo';
  if (kind === 'demo') return { kind, language, social };
  const requireParam = (name: string) => textId(params.get(name)?.trim(), `launch ${name}`);
  const endpoint = baseUrl(requireParam('rgs_url'));
  if (kind === 'live') return { kind, language, social, baseUrl: endpoint, sessionID: requireParam('sessionID') };
  // Replay amount/currency are optional display context. Missing values use a
  // one-unit USD reference scale; they never establish a historical wallet stake.
  const replayDisplayDefaults = { amount: !params.has('amount'), currency: !params.has('currency') };
  const amountText = replayDisplayDefaults.amount ? String(API_SCALE) : requireParam('amount');
  if (!/^\d+$/.test(amountText)) throw new Error('Replay amount must use integer API units');
  return { kind, language, social, baseUrl: endpoint, game: requireParam('game'), version: requireParam('version'),
    mode: parseMode(requireParam('mode')), event: requireParam('event'), amount: apiAmount(Number(amountText), 'replay amount', true),
    currency: replayDisplayDefaults.currency ? 'USD' : currency(requireParam('currency')), replayDisplayDefaults };
}
export function parseConfiguration(value: unknown, social = false): RgsConfiguration {
  const v = record(value, 'configuration');
  const minBet = apiAmount(v.minBet, 'minimum bet', true), maxBet = apiAmount(v.maxBet, 'maximum bet', true);
  const stepBet = apiAmount(v.stepBet, 'bet step', true), defaultBetLevel = apiAmount(v.defaultBetLevel, 'default bet', true);
  if (minBet > maxBet || !Array.isArray(v.betLevels) || !v.betLevels.length) throw new Error('Invalid bet range');
  const betLevels = [...new Set(v.betLevels.map(x => apiAmount(x, 'bet level', true)))].sort((a, b) => a - b);
  if (!betLevels.includes(defaultBetLevel) || betLevels.some(x => x < minBet || x > maxBet || x % stepBet !== 0)) throw new Error('Invalid server bet levels');
  // Authenticate may omit mode metadata (or supply {}). The game's published
  // registry defines the modes in that case; jurisdiction and /play still govern access.
  let modes = Object.keys(MODE_COST) as AshenMode[];
  if (v.betModes !== undefined) {
    const offered = record(v.betModes, 'bet modes');
    if (Object.keys(offered).length) {
      modes = modes.filter(mode => Object.hasOwn(offered, mode));
      if (!modes.includes('base')) throw new Error('Server has no compatible base mode');
      for (const mode of modes) {
        const entry = record(offered[mode], 'mode config');
        for (const key of ['costMultiplier', 'cost'] as const) {
          if (entry[key] !== undefined && entry[key] !== MODE_COST[mode]) throw new Error(`Incorrect registered cost for ${mode}`);
        }
      }
    }
  }
  const source = v.jurisdiction === undefined ? {} : record(v.jurisdiction, 'jurisdiction');
  const jurisdiction: Jurisdiction = {};
  for (const key of ['socialCasino', 'disabledFullscreen', 'disabledTurbo', 'disabledSuperTurbo', 'disabledAutoplay', 'disabledSlamstop', 'disabledSpacebar', 'disabledBuyFeature', 'displayNetPosition', 'displayRTP', 'displaySessionTimer'] as const) {
    if (source[key] !== undefined) jurisdiction[key] = bool(source[key], `jurisdiction ${key}`);
  }
  if (source.minimumRoundDuration !== undefined) jurisdiction.minimumRoundDuration = integer(source.minimumRoundDuration, 'minimum round duration', 0, 3_600_000);
  if (social) jurisdiction.socialCasino = true;
  return { minBet, maxBet, stepBet, defaultBetLevel, betLevels, modes, jurisdiction };
}

const MAX_BOOK_PAYOUT = MAX_WIN_MULTIPLIER * 100;
function parseBoard(value: unknown): void {
  validateBoard(value as SpinResult['board']);
}
function parseBonus(value: unknown): BonusState | null {
  if (value === null) return null;
  const v = record(value, 'bonus');
  oneOf(v.tier, [1, 2, 3], 'bonus tier'); integer(v.remaining, 'free spins remaining', 0, 10_000);
  integer(v.totalSpins, 'total free spins', 0, 10_000);
  if (Number(v.remaining) > Number(v.totalSpins)) throw new Error('Invalid free spin totals');
  integer(v.totalWinCents, 'bonus win', 0, MAX_BOOK_PAYOUT); integer(v.roundWinCents, 'round win', 0, MAX_BOOK_PAYOUT);
  oneOf(v.source, ['natural', 'purchase'], 'bonus source');
  if (v.variant !== undefined && (v.variant !== 'eclipse' || v.tier !== 3 || v.source !== 'purchase')) throw new Error('Invalid bonus variant');
  if (!Array.isArray(v.dealUsedLevels) || v.dealUsedLevels.length > 3 || new Set(v.dealUsedLevels).size !== v.dealUsedLevels.length) throw new Error('Invalid used deal levels');
  v.dealUsedLevels.forEach(t => oneOf(t, [1, 2, 3], 'deal level'));
  return structuredClone(v) as unknown as BonusState;
}
function parseSpin(value: unknown, paidCents: number): SpinResult {
  const v = record(value, 'spin'); parseBoard(v.board);
  for (const key of ['lineWinCents', 'wheelWinCents', 'totalWinCents']) integer(v[key], key, 0, MAX_BOOK_PAYOUT);
  bool(v.capped, 'capped'); bool(v.isFreeSpin, 'free spin'); bool(v.roundComplete, 'round complete');
  integer(v.spinIndex, 'spin index', 1, 10_000); oneOf(v.bonusTriggered, [0, 1, 2, 3], 'bonus trigger');
  oneOf(v.celebration, ['none', 'win', 'big', 'mega', 'epic', 'max'], 'celebration');
  if (!Array.isArray(v.lineWins) || v.lineWins.length > 14 || !Array.isArray(v.wheels) || v.wheels.length > 3) throw new Error('Invalid outcome arrays');
  const board = v.board as SpinResult['board'];
  const remaining = MAX_BOOK_PAYOUT - paidCents;
  const expectedLines = evaluateLines(board, 100);
  let lineBudget = remaining;
  expectedLines.forEach(line => { line.winCents = Math.min(line.winCents, lineBudget); lineBudget -= line.winCents; });
  if (!same(v.lineWins, expectedLines) || v.lineWinCents !== remaining - lineBudget) throw new Error('Incorrect line payout');
  const wheels = v.wheels as SpinResult['wheels'];
  const expectedWheels = resolveWheels(wheels.map(wheel => ({ reel: wheel.reel, row: wheel.row, color: wheel.color, kind: wheel.kind, value: wheel.value })), 100, lineBudget);
  if (!same(wheels, expectedWheels)) throw new Error('Incorrect wheel payout');
  const special = board.flatMap((column, reel) => column.flatMap((symbol, row) => symbol.endsWith('-six') ? [{ reel, row, color: symbol === 'red-six' ? 'red' : 'blue' }] : []));
  if (special.length !== wheels.length || special.some(cell => !wheels.some(wheel => wheel.reel === cell.reel && wheel.row === cell.row && wheel.color === cell.color))) throw new Error('Wheel/board mismatch');
  const subtotal = wheels.at(-1)?.afterCents ?? 0;
  if (v.wheelWinCents !== subtotal || v.totalWinCents !== Number(v.lineWinCents) + subtotal || v.capped !== (v.totalWinCents === remaining)) throw new Error('Inconsistent spin payout');
  const trigger = v.isFreeSpin || v.capped ? 0 : wheels.filter(wheel => wheel.kind === 'free-spins').length;
  if (v.isFreeSpin && wheels.some(wheel => wheel.kind === 'free-spins') || v.bonusTriggered !== trigger) throw new Error('Invalid bonus trigger');
  if (v.celebration !== celebrationFor(Number(v.totalWinCents), 100, Boolean(v.capped))) throw new Error('Invalid celebration');
  return structuredClone(v) as unknown as SpinResult;
}
function parseDeal(value: unknown): DealResult {
  const v = record(value, 'deal'); oneOf(v.decision, ['accept', 'decline'], 'deal decision');
  if (v.outcome !== null) oneOf(v.outcome, [5, 8, 12, 16, 20, 'upgrade'] as const, 'deal outcome');
  oneOf(v.fromTier, [1, 2, 3], 'previous tier'); oneOf(v.toTier, [1, 2, 3], 'next tier'); integer(v.spins, 'deal spins', 1, 10_000);
  if (v.decision === 'decline' && (v.outcome !== null || v.fromTier !== v.toTier)) throw new Error('Invalid declined deal');
  if (v.decision === 'accept' && (v.outcome === null || (v.outcome === 'upgrade' ? v.fromTier === 3 || v.toTier !== Number(v.fromTier) + 1 : v.toTier !== v.fromTier || v.spins !== v.outcome))) throw new Error('Invalid accepted deal');
  return structuredClone(v) as unknown as DealResult;
}
/** Strict versioned event books only. Old Alchemist boards cannot be silently reinterpreted. */
export function parseBook(state: unknown, expectedMode?: AshenMode, expectedPayout?: number): ServerBook {
  if (!Array.isArray(state) || state.length < 3 || state.length > 10_002) throw new Error('Missing ASHEN PACT event book');
  state.forEach((event, index) => { if (record(event, 'book event').index !== index) throw new Error('Non-contiguous book indices'); });
  const header = record(state[0]), end = record(state[state.length - 1]);
  if (header.type !== 'ashenBook' || header.schema !== BOOK_SCHEMA || header.betCents !== 100 || end.type !== 'ashenTotal') throw new Error('Incompatible ASHEN PACT book schema');
  const mode = parseMode(header.mode); if (expectedMode !== undefined && expectedMode !== mode) throw new Error('Book mode mismatch');
  const payoutMultiplier = integer(end.payoutMultiplier, 'book payout multiplier', 0, MAX_BOOK_PAYOUT);
  if (expectedPayout !== undefined && Math.abs(expectedPayout * 100 - payoutMultiplier) > 0.000001) throw new Error('Book/server payout mismatch');
  let paidCents = 0, spinIndex = 0, complete = false;
  let priorBonus: BonusState | null = mode.startsWith('bonus') ? { tier: mode === 'bonus1' ? 1 : mode === 'bonus2' ? 2 : 3, remaining: 10, totalSpins: 10, totalWinCents: 0, roundWinCents: 0, dealUsedLevels: [], source: 'purchase', ...(mode === 'bonus3' ? { variant: 'eclipse' as const } : {}) } : null;
  const frames: ServerFrame[] = state.slice(1, -1).map(raw => {
    if (complete) throw new Error('Events after round completion');
    const event = record(raw); const bonus = parseBonus(event.bonus);
    const awaitingDeal = priorBonus && priorBonus.tier !== 3 && !priorBonus.dealUsedLevels.includes(priorBonus.tier);
    if (event.type === 'ashenSpin') {
      if (awaitingDeal) throw new Error('Unresolved pact offer');
      const result = parseSpin(event.result, paidCents); paidCents += result.totalWinCents;
      if (result.isFreeSpin !== Boolean(priorBonus) || result.spinIndex !== ++spinIndex) throw new Error('Invalid spin sequence');
      if (!priorBonus && (mode === 'base' || mode === 'blue') && result.wheels.some(wheel => wheel.color !== 'blue')) {
        throw new Error('Mode requires blue wheels');
      }
      if (priorBonus?.tier === 2 || priorBonus?.tier === 3 || !priorBonus && mode === 'red') {
        if (result.wheels.some(wheel => wheel.color !== 'red')) throw new Error('Mode requires red wheels');
      }
      if ((priorBonus?.tier === 3 || !priorBonus && mode === 'red') && !result.wheels.length) throw new Error('Missing guaranteed red wheel');
      if (priorBonus?.variant === 'eclipse' && result.wheels.length < 2) throw new Error('Missing guaranteed Eclipse seals');
      let nextBonus: BonusState | null = priorBonus ? { ...priorBonus, remaining: priorBonus.remaining - 1, totalWinCents: priorBonus.totalWinCents + result.totalWinCents, roundWinCents: paidCents } : null;
      if (nextBonus && (!nextBonus.remaining || result.capped)) nextBonus = null;
      if (result.bonusTriggered) nextBonus = { tier: result.bonusTriggered, remaining: 10, totalSpins: 10, totalWinCents: 0, roundWinCents: paidCents, dealUsedLevels: [], source: 'natural' };
      if (!same(bonus, nextBonus) || result.roundComplete !== !nextBonus) throw new Error('Invalid bonus progression');
      priorBonus = nextBonus; complete = result.roundComplete;
      return { type: 'spin', result, bonus };
    }
    if (event.type === 'ashenDeal' && bonus && priorBonus && awaitingDeal) {
      const result = parseDeal(event.result);
      if (result.fromTier !== priorBonus.tier) throw new Error('Deal tier mismatch');
      const nextBonus: BonusState = { ...priorBonus, tier: result.toTier, dealUsedLevels: [...priorBonus.dealUsedLevels, priorBonus.tier] };
      if (typeof result.outcome === 'number') { nextBonus.remaining = result.outcome; nextBonus.totalSpins = result.outcome; }
      if (result.spins !== nextBonus.remaining || !same(bonus, nextBonus)) throw new Error('Invalid deal progression');
      priorBonus = nextBonus;
      return { type: 'deal', result, bonus };
    }
    throw new Error('Unsupported ASHEN PACT event');
  });
  const total = frames.reduce((sum, frame) => sum + (frame.type === 'spin' ? frame.result.totalWinCents : 0), 0);
  if (total !== payoutMultiplier || frames.at(-1)?.type !== 'spin' || !(frames.at(-1) as Extract<ServerFrame, { type: 'spin' }>).result.roundComplete) throw new Error('Incomplete or inconsistent ASHEN PACT book');
  return { schema: BOOK_SCHEMA, mode, frames, payoutMultiplier };
}
function scaledPayout(amount: number, multiplier: number): number {
  return apiAmount(Number(BigInt(amount) * BigInt(multiplier) / 100n), 'scaled payout');
}
// Match the official web client's event-index bookmark. Frame 1 is book event 1
// because event 0 is our schema header. Never send a fabricated outcome here.
function checkpoint(cursor: number): string { return String(cursor); }
function parseRound(value: unknown): AshenRound {
  const v = record(value, 'round'), betID = textId(v.betID, 'bet ID'), mode = parseMode(v.mode);
  const amount = apiAmount(v.amount, 'round bet', true), payout = apiAmount(v.payout, 'round payout'), active = bool(v.active, 'active round');
  if (typeof v.payoutMultiplier !== 'number' || !Number.isFinite(v.payoutMultiplier) || v.payoutMultiplier < 0) throw new Error('Invalid round multiplier');
  const book = parseBook(v.state, mode, v.payoutMultiplier);
  if (payout !== scaledPayout(amount, book.payoutMultiplier)) throw new Error('Wallet/book amount mismatch');
  let cursor = 0;
  if (v.event !== undefined && v.event !== null && v.event !== '') {
    if (typeof v.event !== 'string') throw new Error('Invalid bookmark');
    if (/^(0|[1-9]\d*)$/.test(v.event)) cursor = integer(Number(v.event), 'bookmark cursor', 0, book.frames.length);
    else {
      // Recover rounds saved by the previous release without replaying a stake.
      const mark = record(JSON.parse(v.event), 'bookmark');
      if (mark.schema !== BOOK_SCHEMA || mark.betID !== betID) throw new Error('Incompatible round bookmark');
      cursor = integer(mark.cursor, 'bookmark cursor', 0, book.frames.length);
    }
  }
  return { betID, amount, payout, payoutMultiplier: v.payoutMultiplier, active, mode, book, cursor };
}

/** Only this class mutates wallet state; uncertain transactions are never automatically retried. */
export class AshenRgs {
  readonly launch: LaunchConfig;
  config: RgsConfiguration | null = null;
  balance: RgsBalance | null = null;
  round: AshenRound | null = null;
  fault: RgsError | null = null;
  private busy = false;
  private startedAt = 0;
  private readonly request: typeof fetch;
  constructor(launchUrl: string, request: typeof fetch = fetch) {
    // Browser fetch rejects a class instance as its receiver. Keep injected/native
    // transports callable as functions instead of invoking them as client methods.
    this.request = (input, init) => request(input, init);
    this.launch = parseLaunch(launchUrl);
    if (this.launch.kind !== 'live') throw new Error('AshenRgs requires a live session');
  }
  private async post(operation: Exclude<RgsOperation, 'replay'>, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const financial = operation === 'play' || operation === 'end-round';
    try {
      const response = await this.request(`${this.launch.baseUrl}/${operation === 'event' ? 'bet/event' : `wallet/${operation}`}`, {
        method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionID: this.launch.sessionID, ...payload }), signal: AbortSignal.timeout(25_000),
      });
      const raw: unknown = await response.json(); const data = record(raw, 'RGS response');
      if (!response.ok) {
        const error = data.error && typeof data.error === 'object' ? record(data.error) : {};
        if (import.meta.env?.DEV) {
          const diagnostic = [data.message, error.message].filter(value => typeof value === 'string').join(' ').split(this.launch.sessionID!).join('[session]').replace(/https?:\/\/\S+/g, '[endpoint]').slice(0, 240);
          console.warn('ASHEN RGS diagnostic', operation, response.status, diagnostic);
        }
        const code = typeof data.code === 'string' ? data.code : typeof error.code === 'string' ? error.code : typeof data.error === 'string' ? data.error : 'RGS_ERROR';
        const definite = response.status === 400 && ['ERR_VAL', 'ERR_IPB', 'ERR_IS', 'ERR_ATE', 'ERR_GLE', 'ERR_LOC'].includes(code);
        const messages: Record<string, string> = { ERR_IPB: 'Insufficient balance', ERR_IS: 'Session expired. Reopen the game', ERR_ATE: 'Session not authenticated', ERR_GLE: 'Session limit reached', ERR_LOC: 'Game unavailable in this location', ERR_VAL: 'Server rejected play parameters' };
        const serverMessage = typeof data.message === 'string' ? data.message : error.message;
        const message = code === 'ERR_VAL' && serverMessage === 'session not found' ? 'Session expired. Reopen the game'
          : code === 'ERR_VAL' && operation === 'event' ? 'Server rejected the round checkpoint'
          : code === 'ERR_VAL' && operation === 'end-round' ? 'Server rejected round settlement'
          : messages[code] ?? 'Server confirmation unavailable';
        throw new RgsError(message, operation, financial && !definite, /^[A-Z0-9_]{1,48}$/.test(code) ? code : 'RGS_ERROR', response.status);
      }
      return data;
    } catch (error) {
      throw error instanceof RgsError ? error : new RgsError(financial ? 'Unconfirmed transaction. Reconnect to recover; do not repeat the play.' : 'Could not read the server response', operation, financial, 'NETWORK_OR_INVALID_RESPONSE');
    }
  }
  private guard(operation: RgsOperation): void {
    if (this.busy) throw new RgsError('Another session operation is pending', operation, false, 'BUSY');
    if (this.fault && operation !== 'authenticate') throw new RgsError('Reconnect to recover the session before continuing', operation, false, 'RECOVERY_REQUIRED');
  }
  async authenticate(): Promise<RgsAuthentication> {
    this.guard('authenticate'); this.busy = true; this.config = null;
    try {
      const data = await this.post('authenticate', { language: this.launch.language });
      const rawConfig = record(data.config);
      const config = parseConfiguration({ ...rawConfig, jurisdiction: rawConfig.jurisdiction ?? data.jurisdictionFlags }, this.launch.social);
      const nextBalance = balance(data.balance); const nextRound = data.round == null ? null : parseRound(data.round);
      this.config = config; this.balance = nextBalance; this.round = nextRound?.active ? nextRound : null;
      this.startedAt = Date.now(); this.fault = null;
      return { balance: nextBalance, config, round: this.round };
    } catch (error) {
      this.fault = error instanceof RgsError ? error : new RgsError('Incompatible session data; game paused', 'authenticate', false, 'INVALID_SESSION'); throw this.fault;
    } finally { this.busy = false; }
  }
  validateBet(amount: number, mode: AshenMode): void {
    if (!this.config || !this.balance) throw new Error('Authenticate before playing');
    apiAmount(amount, 'bet', true); parseMode(mode);
    const c = this.config;
    if (!c.betLevels.includes(amount) || amount < c.minBet || amount > c.maxBet || amount % c.stepBet !== 0) throw new Error('Server does not allow this play amount');
    if (!c.modes.includes(mode)) throw new Error('Server does not allow this mode');
    if (c.jurisdiction.disabledBuyFeature && mode !== 'base') throw new Error('Feature modes are disabled for this session');
    if (BigInt(amount) * BigInt(MODE_COST[mode]) > BigInt(this.balance.amount)) throw new Error('Insufficient balance');
  }
  async play(amount: number, mode: AshenMode): Promise<RgsPlay> {
    this.guard('play'); if (this.round) throw new Error('Complete the current round first'); this.validateBet(amount, mode);
    this.busy = true; this.startedAt = Date.now();
    try {
      const data = await this.post('play', { amount, mode });
      let nextBalance: RgsBalance, nextRound: AshenRound;
      try {
        nextBalance = balance(data.balance); nextRound = parseRound(data.round);
        if (nextRound.amount !== amount || nextRound.mode !== mode || nextBalance.currency !== this.balance!.currency) throw new Error('Round identity mismatch');
      } catch { throw new RgsError('Server returned an incompatible result. Reconnect to recover.', 'play', true, 'INVALID_RESULT'); }
      this.balance = nextBalance; this.round = nextRound;
      return { balance: nextBalance, round: nextRound };
    } catch (error) {
      if (error instanceof RgsError && error.uncertain) this.fault = error;
      throw error;
    } finally { this.busy = false; }
  }
  /** Cursor is the number of fully displayed frames. Acknowledgement never changes money. */
  async event(nextCursor: number): Promise<void> {
    this.guard('event'); const round = this.round;
    if (!round || nextCursor !== round.cursor + 1 || nextCursor > round.book.frames.length) throw new Error('Invalid frame checkpoint');
    this.busy = true;
    try {
      if (round.active) {
        const value = checkpoint(nextCursor), data = await this.post('event', { event: value });
        if (data.event !== value) throw new RgsError('Server did not confirm the round position', 'event', false, 'INVALID_BOOKMARK');
      }
      round.cursor = nextCursor;
    } catch (error) {
      this.fault = error instanceof RgsError ? error : new RgsError('Round checkpoint failed; reconnect to recover', 'event'); throw this.fault;
    } finally { this.busy = false; }
  }
  get remainingRoundDuration(): number { return Math.max(0, (this.config?.jurisdiction.minimumRoundDuration ?? 0) - (Date.now() - this.startedAt)); }
  async endRound(): Promise<RgsBalance> {
    this.guard('end-round'); const round = this.round;
    if (!round || round.cursor !== round.book.frames.length) throw new Error('Display all round events before settlement');
    if (this.remainingRoundDuration) throw new RgsError('Minimum round duration has not elapsed', 'end-round', false, 'MINIMUM_DURATION');
    this.busy = true;
    try {
      if (round.active) {
        const data = await this.post('end-round');
        try {
          const nextBalance = balance(data.balance);
          if (nextBalance.currency !== this.balance!.currency) throw new Error('Currency changed');
          this.balance = nextBalance;
        } catch { throw new RgsError('Round settlement requires balance recovery', 'end-round', true, 'INVALID_BALANCE'); }
      }
      this.round = null; return this.balance!;
    } catch (error) {
      if (error instanceof RgsError) this.fault = error;
      throw error;
    } finally { this.busy = false; }
  }
}
/** Replay uses the public endpoint only; even a supplied session token is never sent. */
export async function loadReplay(launchUrl: string, request: typeof fetch = fetch): Promise<ReplayResult> {
  const launch = parseLaunch(launchUrl); if (launch.kind !== 'replay') throw new Error('Replay parameters required');
  const path = [launch.game!, launch.version!, launch.mode!, launch.event!].map(encodeURIComponent).join('/');
  try {
    const response = await request(`${launch.baseUrl}/bet/replay/${path}`, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error('Replay unavailable');
    const data = record(await response.json());
    if (data.costMultiplier !== MODE_COST[launch.mode!]) throw new Error('Replay mode cost mismatch');
    const book = parseBook(data.state, launch.mode, data.payoutMultiplier as number);
    if (typeof data.payoutMultiplier !== 'number') throw new Error('Missing replay multiplier');
    const round: AshenRound = { betID: launch.event!, amount: launch.amount!, payout: scaledPayout(launch.amount!, book.payoutMultiplier), payoutMultiplier: book.payoutMultiplier / 100,
      active: false, mode: launch.mode!, book, cursor: 0 };
    return { round, currency: launch.currency!, game: launch.game!, version: launch.version!, displayDefaults: launch.replayDisplayDefaults! };
  } catch { throw new RgsError('Replay is unavailable or incompatible with ASHEN PACT', 'replay', false, 'INVALID_REPLAY'); }
}

/** Scale presentation amounts only. Wallet balance is preserved and must be injected from RGS responses. */
export function applyServerFrameToState(previous: GameState, frame: ServerFrame, amountMicro: number, paidBookCents = 0): GameState {
  apiAmount(amountMicro, 'round amount', true);
  integer(paidBookCents, 'previous book payout', 0, MAX_BOOK_PAYOUT);
  // Round once in integer wallet units. Allocating the cumulative difference to
  // each award keeps a low-denomination bonus equal to its authoritative total,
  // without displaying sub-micro-unit money or losing rounding between spins.
  const centsAt = (bookCents: number) => scaledPayout(amountMicro, bookCents) / 10_000;
  const centsBetween = (before: number, after: number) => (scaledPayout(amountMicro, after) - scaledPayout(amountMicro, before)) / 10_000;
  const bonus = frame.bonus ? { ...structuredClone(frame.bonus),
    roundWinCents: centsAt(frame.bonus.roundWinCents),
    totalWinCents: centsBetween(frame.bonus.roundWinCents - frame.bonus.totalWinCents, frame.bonus.roundWinCents),
  } : null;
  if (frame.type === 'deal') return { ...previous, betCents: amountMicro / 10_000, bonus, phase: bonus && bonus.tier !== 3 && !bonus.dealUsedLevels.includes(bonus.tier) ? 'deal' : 'free-spins', lastDeal: structuredClone(frame.result), completedBonus: null };
  const result = structuredClone(frame.result);
  let lineOffset = paidBookCents;
  result.lineWins.forEach(line => { const end = lineOffset + line.winCents; line.winCents = centsBetween(lineOffset, end); lineOffset = end; });
  result.lineWinCents = centsBetween(paidBookCents, lineOffset);
  result.wheels.forEach(wheel => {
    wheel.beforeCents = centsBetween(lineOffset, lineOffset + wheel.beforeCents);
    wheel.afterCents = centsBetween(lineOffset, lineOffset + wheel.afterCents);
  });
  result.wheelWinCents = centsBetween(lineOffset, lineOffset + frame.result.wheelWinCents);
  result.totalWinCents = centsBetween(paidBookCents, paidBookCents + frame.result.totalWinCents);
  const addCents = (a: number, b: number) => (Math.round(a * 10_000) + Math.round(b * 10_000)) / 10_000;
  return { ...previous, betCents: amountMicro / 10_000, board: result.board, bonus,
    phase: bonus ? bonus.tier !== 3 && !bonus.dealUsedLevels.includes(bonus.tier) ? 'deal' : 'free-spins' : 'base', lastSpin: result, lastDeal: null, spinIndex: result.spinIndex,
    completedBonus: result.roundComplete && previous.bonus ? { tier: previous.bonus.tier, ...(previous.bonus.variant ? { variant: previous.bonus.variant } : {}), totalSpins: previous.bonus.totalSpins - (result.capped ? previous.bonus.remaining - 1 : 0), capped: result.capped, roundWinCents: centsAt(paidBookCents + frame.result.totalWinCents), totalWinCents: addCents(previous.bonus.totalWinCents, result.totalWinCents) } : null };
}

/** Deterministic empty presentation state, without invoking the local demo generator. */
export function createServerState(serverBalance: RgsBalance, amountMicro: number, mode: AshenMode = 'base'): GameState {
  apiAmount(serverBalance.amount, 'balance'); apiAmount(amountMicro, 'bet', true); parseMode(mode);
  const bonus: BonusState | null = mode.startsWith('bonus') ? { tier: mode === 'bonus1' ? 1 : mode === 'bonus2' ? 2 : 3,
    remaining: 10, totalSpins: 10, totalWinCents: 0, roundWinCents: 0, dealUsedLevels: [], source: 'purchase',
    ...(mode === 'bonus3' ? { variant: 'eclipse' as const } : {}) } : null;
  return { balanceCents: serverBalance.amount / 10_000, betCents: amountMicro / 10_000, seed: 0,
    board: Array.from({ length: 5 }, (_, reel) => Array.from({ length: 4 }, (_, row) => REGULAR_SYMBOLS[(reel * 2 + row) % REGULAR_SYMBOLS.length])),
    phase: bonus ? bonus.tier === 3 ? 'free-spins' : 'deal' : 'base', featureMode: mode === 'blue' || mode === 'red' ? mode : 'base', bonus, lastSpin: null, lastDeal: null, completedBonus: null, spinIndex: 0 };
}
