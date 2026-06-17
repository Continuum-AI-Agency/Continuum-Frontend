// ---------------------------------------------------------------------------
// Core domain types for the budget reallocation engine.
// Unit of optimization for v1 = ad set.
// ---------------------------------------------------------------------------

export type AdSetStatus =
  | 'active'
  | 'learning'
  | 'grace'
  | 'frozen'
  | 'flagged' // manual hard-exclude => budget 0 (kept for Excel parity)
  | 'starved'; // recommended for pause => eligible but driven to its floor

/** Audience family — modulates guardrails (e.g. frequency tolerance). */
export type AudienceType = 'prospecting' | 'retargeting' | 'remarketing' | 'unknown';

/** Raw counts for one analysis window. Cost-per-event is DERIVED, never stored.
 * The KPI event used for scoring is chosen by the portfolio's objective profile
 * (see objectives.ts). All event fields beyond spend are optional so a snapshot
 * only needs to carry the ones relevant to its objective. */
export type WindowMetrics = {
  spend: number;
  purchases: number; // optimization KPI for 'purchase' (incl. approved-credit)
  addToCarts: number;
  clicks: number;
  impressions: number; // KPI for 'awareness' (cost = CPM-like)
  leads?: number; // KPI for 'lead'
  appInstalls?: number; // KPI for 'app_install'
  signups?: number; // KPI for 'signup' (account openings / checkouts initiated)
  landingPageViews?: number; // KPI for 'traffic'
  reach?: number;
};

/** Campaign optimization objective — selects the per-objective profile + KPI. */
export type OptimizationObjective =
  | 'purchase'
  | 'app_install'
  | 'signup'
  | 'lead'
  | 'traffic'
  | 'awareness';

/** Snapshot of one ad set at the moment a cycle runs. */
export type AdSetSnapshot = {
  id: string;
  name?: string;
  status: AdSetStatus;
  currentBudget: number; // current daily budget
  /** In platform learning phase (asymmetric down-cap applies). */
  learningPhase?: boolean;
  /** Manually frozen (excluded from reallocation). */
  freeze?: boolean;
  ageDays: number;
  audienceType?: AudienceType;
  /** Avg impressions per user, last 7d — for fatigue/saturation. */
  frequency7d?: number;
  windows: {
    d3: WindowMetrics;
    d7: WindowMetrics; // CUMULATIVE 0-7d (contains d3), as Meta reports it
    d14: WindowMetrics; // CUMULATIVE 0-14d
  };
};

export type TrajectoryState = 'positive' | 'neutral' | 'negative';

/** Per-item diagnostics — mirrors the Excel "Cycle Simulation" columns. */
export type ItemDiagnostics = {
  id: string;
  status: AdSetStatus;
  currentBudget: number;
  score3d: number;
  score7d: number;
  score14d: number;
  trajectoryRatio: number;
  trajectoryState: TrajectoryState;
  weights: { d3: number; d7: number; d14: number };
  compositeScore: number;
  effectiveScore: number;
  portfolioShare: number; // fraction of redistributable pool
  rawBudget: number; // share * pool (pre-constraint)
  velocityCapped: number; // Excel intermediate (one-shot clamp)
  floor: number;
  lowerBound: number; // solver lo
  upperBound: number; // solver hi
  finalBudget: number; // solver output (conserving)
  changeAbs: number;
  changePct: number;
  capBreached: boolean; // solver had to exceed the velocity cap on this item
  floorRelaxed: boolean; // solver had to relax this item's floor
};

export type ReallocationResult = {
  totalBudget: number;
  pool: number; // total - frozen
  frozenBudget: number;
  items: ItemDiagnostics[];
  /** Sum of final budgets. Should equal totalBudget (within epsilon). */
  allocatedTotal: number;
  conserved: boolean;
  /** Unallocated residual (only non-zero under overflowMode='underspend'). */
  residual: number;
  feasibility: {
    sumLowerBounds: number;
    sumUpperBounds: number;
    overflow: boolean; // pool > sum(hi)
    underflow: boolean; // pool < sum(lo)
  };
  notes: string[];
};

// --- Full-cycle layer (classify -> triggers -> pacing -> reallocate) --------

export type OptimizationMode = 'efficiency' | 'balanced' | 'scale';

export type Recommendation = {
  adSetId: string;
  kind: 'pause'; // future: 'creative_refresh', 'audience_expand', ...
  trigger: 'P1_zero_upper_funnel' | 'P2_sustained_poor' | 'P3_low_significance';
  severity: 'low' | 'medium' | 'high';
  reason: string;
  needsApproval: true; // pauses ALWAYS need user approval
};

export type PacingState = {
  periodBudget: number; // total planned for the period
  periodDays: number;
  dayIndex: number; // 1-based day within the period
  actualSpendToDate: number; // cumulative actual spend so far
};

export type PacingResult = {
  dailyTotal: number; // budget total to feed the reallocation this cycle
  idealCumulative: number;
  pacingRatio: number; // actual / ideal (>1 over, <1 under)
  status: 'on_track' | 'underpacing' | 'overpacing';
  note: string;
};

export type CycleResult = {
  mode: OptimizationMode;
  pacing: PacingResult;
  reallocation: ReallocationResult;
  recommendations: Recommendation[];
};
