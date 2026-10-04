import { useEffect, useState, useSyncExternalStore } from 'react';
import type { FeatureMode, GameState } from './engine';
import { AshenRgs, RgsError, applyServerFrameToState, createServerState, loadReplay, parseLaunch, toApiAmount } from './rgs';
import type { AshenMode, AshenRound, LaunchConfig, ReplayDisplayDefaults, ReplayResult, RgsConfiguration, ServerFrame } from './rgs';

export type RgsPresenter = (next: GameState, frame: ServerFrame) => Promise<void>;
export interface AdvanceRequest {
  /** UI cents, including fractional cents when the server currency requires them. */
  amountCents: number;
  featureMode?: FeatureMode;
  buyTier?: 1 | 2 | 3;
  /** Accept a purchased round, then let its entrance play before consuming frame 1. */
  deferPresentation?: boolean;
  presenter: RgsPresenter;
}
export interface ReplayInfo {
  game: string; version: string; mode: AshenMode; amountCents: number;
  payoutCents: number; payoutMultiplier: number; completed: boolean;
  /** Missing URL display fields use a reference scale, never historical cash values. */
  displayDefaults: ReplayDisplayDefaults;
}
export interface RgsSessionSnapshot {
  enabled: boolean; ready: boolean; error: string; errorReference?: string; mode: 'local' | 'live' | 'replay';
  state: GameState | null; currency: string; config: RgsConfiguration | null; busy: boolean;
  readOnly: boolean; roundPending: boolean; nextFrameType: ServerFrame['type'] | null;
  roundAmountCents: number | null; replayInfo: ReplayInfo | null; dealLimitation: string;
}
export interface RgsSessionDependencies { request?: typeof fetch; wait?: (ms: number) => Promise<void> }

const DEAL_LIMITATION = 'Серверный повтор договора уже записан в результате раунда. Здесь раскрывается записанное решение; выбор новой ветки недоступен.';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось получить подтверждение сервера';
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Stateful, testable boundary between server events and an asynchronous visual presenter. */
export class RgsSessionController {
  private readonly launchUrl: string;
  private readonly dependencies: RgsSessionDependencies;
  private launch: LaunchConfig | null = null;
  private client: AshenRgs | null = null;
  private pending: AshenRound | null = null;
  private originalReplay: ReplayResult | null = null;
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot: RgsSessionSnapshot = {
    enabled: false, ready: true, error: '', mode: 'local', state: null, currency: 'DEMO',
    config: null, busy: false, readOnly: false, roundPending: false, nextFrameType: null,
    roundAmountCents: null, replayInfo: null, dealLimitation: DEAL_LIMITATION,
  };
  constructor(launchUrl: string, dependencies: RgsSessionDependencies = {}) {
    this.launchUrl = launchUrl; this.dependencies = dependencies;
    try {
      const url = new URL(launchUrl), params = url.searchParams;
      // Noncanonical or partial server links must not accidentally authorize the local demo.
      if (['sessionId', 'rgsUrl', 'session_id'].some(key => params.has(key))) throw new Error('Некорректная ссылка сессии: необходимы sessionID и rgs_url');
      this.launch = parseLaunch(launchUrl);
      if (this.launch.kind === 'demo' && ['game', 'version', 'event'].some(key => params.has(key))) throw new Error('Неполная ссылка повтора: необходим полный набор параметров replay');
      if (this.launch.kind !== 'demo') {
        this.snapshot = { ...this.snapshot, enabled: true, ready: false, mode: this.launch.kind,
          currency: this.launch.currency ?? '—', readOnly: this.launch.kind === 'replay' };
        if (this.launch.kind === 'live') this.client = new AshenRgs(launchUrl, dependencies.request);
      }
    } catch (error) {
      this.launch = null; this.client = null;
      this.snapshot = { ...this.snapshot, enabled: true, ready: false, mode: 'live', error: errorMessage(error), currency: '—' };
    }
  }
  readonly getSnapshot = (): RgsSessionSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  private publish(update: Partial<RgsSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update, roundPending: Boolean(this.pending),
      nextFrameType: this.pending?.book.frames[this.pending.cursor]?.type ?? null,
      roundAmountCents: this.pending ? this.pending.amount / 10_000 : null };
    this.listeners.forEach(listener => listener());
  }
  private fail(error: unknown): void { this.publish({ error: errorMessage(error), ready: false,
    errorReference: error instanceof RgsError ? `${error.operation} · ${error.code}${error.status ? ` · HTTP ${error.status}` : ''}` : undefined }); }
  /** React StrictMode may attach twice; a controller authenticates only once per explicit initialization. */
  readonly initialize = (): Promise<void> => {
    if (!this.snapshot.enabled) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.initializing = this.initializeOnce();
    return this.initializing;
  };
  private async initializeOnce(): Promise<void> {
    if (!this.launch) throw new Error(this.snapshot.error || 'Invalid session link');
    if (this.snapshot.busy) throw new Error('Операция сессии уже выполняется');
    this.publish({ busy: true, ready: false, error: '', errorReference: undefined });
    try {
      if (this.launch.kind === 'replay') {
        const replay = await loadReplay(this.launchUrl, this.dependencies.request);
        this.originalReplay = structuredClone(replay); this.pending = replay.round;
        this.publish({ ready: true, currency: replay.currency, config: null,
          state: createServerState({ amount: 0, currency: replay.currency }, replay.round.amount, replay.round.mode),
          replayInfo: { game: replay.game, version: replay.version, mode: replay.round.mode,
            amountCents: replay.round.amount / 10_000, payoutCents: replay.round.payout / 10_000,
            payoutMultiplier: replay.round.payoutMultiplier, completed: false, displayDefaults: replay.displayDefaults } });
      } else if (this.client) {
        const auth = await this.client.authenticate(); this.pending = auth.round;
        let state = createServerState(auth.balance, auth.round?.amount ?? auth.config.defaultBetLevel, auth.round?.mode);
        let paidBookCents = 0;
        if (auth.round) for (const frame of auth.round.book.frames.slice(0, auth.round.cursor)) {
          state = applyServerFrameToState(state, frame, auth.round.amount, paidBookCents);
          if (frame.type === 'spin') paidBookCents += frame.result.totalWinCents;
        }
        this.publish({ ready: true, state, config: auth.config, currency: auth.balance.currency, replayInfo: null });
      }
    } catch (error) { this.fail(error); throw error; }
    finally { this.publish({ busy: false }); }
  }
  readonly reconnect = async (): Promise<void> => {
    if (this.snapshot.busy) throw new Error('Дождитесь завершения текущей операции');
    this.initializing = null; await this.initialize();
  };
  private guard(): void {
    if (!this.snapshot.enabled) throw new Error('Локальная игра не использует серверную сессию');
    if (this.snapshot.busy) throw new Error('Дождитесь завершения текущей операции');
    if (!this.snapshot.ready || this.snapshot.error || !this.snapshot.state) throw new Error('Восстановите серверную сессию перед продолжением');
  }
  private async finishPending(): Promise<void> {
    const pending = this.pending;
    if (!pending || pending.cursor !== pending.book.frames.length) return;
    if (this.client) {
      const duration = this.client.remainingRoundDuration;
      if (duration > 0) await (this.dependencies.wait ?? wait)(duration);
      const serverBalance = await this.client.endRound();
      this.pending = null;
      this.publish({ state: { ...this.snapshot.state!, balanceCents: serverBalance.amount / 10_000 }, currency: serverBalance.currency });
    } else {
      this.pending = null;
      this.publish({ replayInfo: this.snapshot.replayInfo ? { ...this.snapshot.replayInfo, completed: true } : null });
    }
  }
  /** Consume exactly one recorded frame. It never calls spin(), deal(), buyBonus(), or local RNG. */
  readonly advance = async ({ amountCents, featureMode = 'base', buyTier, deferPresentation = false, presenter }: AdvanceRequest): Promise<GameState> => {
    this.guard(); this.publish({ busy: true, error: '' });
    try {
      if (deferPresentation && (!buyTier || this.pending || this.snapshot.readOnly)) throw new Error('A new purchased bonus is required');
      if (!this.pending) {
        if (!this.client) throw new Error('Повтор завершён. Начните его заново для просмотра');
        const mode: AshenMode = buyTier ? `bonus${buyTier}` : featureMode;
        const response = await this.client.play(toApiAmount(amountCents / 100), mode);
        this.pending = response.round;
        // Only the wallet response changes balance. Reset presentation state for this paid round.
        this.publish({ state: createServerState(response.balance, response.round.amount, response.round.mode), currency: response.balance.currency });
        if (deferPresentation) return this.snapshot.state!;
      }
      const pending = this.pending;
      if (pending.cursor === pending.book.frames.length) {
        await this.finishPending(); return this.snapshot.state!;
      }
      const frame = pending.book.frames[pending.cursor];
      const paidBookCents = pending.book.frames.slice(0, pending.cursor).reduce((sum, prior) => sum + (prior.type === 'spin' ? prior.result.totalWinCents : 0), 0);
      const next = applyServerFrameToState(this.snapshot.state!, frame, pending.amount, paidBookCents);
      await presenter(structuredClone(next), structuredClone(frame));
      this.publish({ state: next });
      const nextCursor = pending.cursor + 1;
      if (this.client) await this.client.event(nextCursor);
      else pending.cursor = nextCursor;
      this.publish({});
      await this.finishPending();
      return this.snapshot.state!;
    } catch (error) { this.fail(error); throw error; }
    finally { this.publish({ busy: false }); }
  };
  /** Recorded server result only. There is intentionally no accept/decline parameter. */
  readonly revealRecordedDeal = async (presenter: RgsPresenter): Promise<GameState> => {
    this.guard();
    if (this.snapshot.nextFrameType !== 'deal') throw new Error('В серверном раунде нет ожидающего договора');
    return this.advance({ amountCents: this.snapshot.state!.betCents, presenter });
  };
  readonly restartReplay = (): void => {
    if (!this.originalReplay || this.snapshot.mode !== 'replay') throw new Error('Серверный повтор не загружен');
    if (this.snapshot.busy) throw new Error('Дождитесь завершения текущего показа');
    const replay = structuredClone(this.originalReplay); this.pending = replay.round;
    this.publish({ ready: true, error: '', state: createServerState({ amount: 0, currency: replay.currency }, replay.round.amount, replay.round.mode),
      replayInfo: this.snapshot.replayInfo ? { ...this.snapshot.replayInfo, completed: false } : null });
  };
}

/** One immutable launch per mounted game. A new launch URL should remount the game. */
export function useRgsSession(launchUrl = window.location.href) {
  const [controller] = useState(() => new RgsSessionController(launchUrl));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { void controller.initialize().catch(() => { /* Error is exposed in the snapshot. */ }); }, [controller]);
  return { ...snapshot, advance: controller.advance, nextRoundOrFrame: controller.advance,
    revealRecordedDeal: controller.revealRecordedDeal, reconnect: controller.reconnect, restartReplay: controller.restartReplay };
}
