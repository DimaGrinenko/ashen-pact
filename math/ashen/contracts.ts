/** ASHEN PACT production-math source contracts. These types are not generated books. */
export type AshenMathMode = 'base' | 'blue' | 'red' | 'bonus1' | 'bonus2' | 'bonus3';
export type DealPolicyId = 'decline-all' | 'accept-all' | 'accept-tier1-only' | 'accept-tier2-only';

/** A complete, reproducible, legal round. The optimizer may change only its weight. */
export interface Candidate {
  id: number;
  mode: AshenMathMode;
  seed: number;
  policyId: DealPolicyId;
  /** Integer hundredths of the underlying base bet, not of the mode price. */
  payoutMultiplier: number;
  spinCount: number;
  dealCount: number;
  bonusTriggered: 0 | 1 | 2 | 3;
  capped: boolean;
  eventCount: number;
}

export interface WeightedOutcome {
  id: number;
  payoutMultiplier: number;
  /** Decimal strings preserve uint64 weights through JSON without Number rounding. */
  weight: string | bigint;
}

export interface WeightedStatistics {
  mode: AshenMathMode;
  cost: number;
  books: number;
  positiveWeightBooks: number;
  distinctPayouts: number;
  exact: {
    totalWeight: string;
    weightedPayoutHundredths: string;
    weightedSquaredPayoutHundredths: string;
    varianceNumerator: string;
    zeroWeight: string;
    weightAbove5000: string;
    weightAbove10000: string;
    maxWinWeight: string;
    largestBookWeight: string;
    expectedTail40Hundredths: string;
    expectedTail10000Hundredths: string;
    /** Worst 0.1% mass measured in thousandths of integer weight. Denominator W*100. */
    fractionalTailPayoutNumerator: string;
  };
  rtp: number;
  rtpPercent: number;
  meanBaseBet: number;
  varianceBaseBet: number;
  stdBaseBet: number;
  stdPerCost: number;
  hitProbability: number;
  zeroProbability: number;
  profitProbability: number;
  lossProbability: number;
  maxWinBaseBet: number;
  minWinBaseBet: number;
  maxWinProbability: number;
  mostLikelyBookProbability: number;
  probability5000: { fraction: number; percent: number };
  probability10000: { fraction: number; percent: number };
  /** Raw expected payouts, never divided by mode cost. Both include their boundary. */
  tail40CostBaseBet: number;
  tail10000BaseBet: number;
  tailSumBaseBet: number;
  quantile999BaseBet: number;
  cvar999BaseBet: number;
  cvar999PerCost: number;
  sdk: {
    probabilityScale: number;
    probability5000Scaled: number;
    probability10000Scaled: number;
    tieInclusiveTailProbability: number;
    tieInclusiveCvar999BaseBet: number;
    tieInclusiveCvar999PerCost: number;
  };
}

export interface StatisticsCheck {
  id: string;
  passed: boolean;
  required: boolean;
  value: number | string;
  limit: number | string;
  units: string;
  scope: 'format' | 'exact-math' | 'conservative-design' | 'user-provided' | 'template-assumption' | 'informational';
  note?: string;
}

export interface StatisticsVerification {
  passed: boolean;
  profile: string;
  mode: AshenMathMode;
  checks: StatisticsCheck[];
  failures: string[];
  registeredBetLimitsVerified: false;
  platformApprovalEstablished: false;
  maxBaseBetAssumption: number;
}

export interface OptimizerOptions {
  /** A failure to reach these optional targets is reported, never disguised as a hard-rule pass. */
  usefulHitTarget?: number;
  baseStdTarget?: readonly [number, number];
  maximumIterations?: number;
  convergenceTolerance?: number;
}

export interface OptimizationResult {
  mode: AshenMathMode;
  profile: string;
  totalWeight: string;
  targetRtp: '24/25';
  /** Same order and length as the candidate array. All included books have positive weight. */
  weights: string[];
  statistics: WeightedStatistics;
  verification: StatisticsVerification;
  diagnostics: {
    algorithm: string;
    objective: string;
    candidateCount: number;
    payoutGroups: number;
    iterations: number;
    selectedCvarThresholdBaseBet: number;
    optionalTargets: { hit: number; baseStd: readonly [number, number] | null };
    optionalTargetsMet: boolean;
    relaxedOptionalTargets: string[];
    integerRepairPayoutGcd: number;
    executionStatus: 'calculated-not-platform-approved';
  };
}
