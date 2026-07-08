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

/** Why the ingest boundary froze an ad set (an "abstain": hold its budget rather
 *  than starve it on data it can't trust). Distinguishes an auto-abstain from a
 *  manual operator freeze in reports/telemetry.
 *   - no_conversions:     spend but zero measured KPI events (can't score CPA)
 *   - unsupported_budget: CBO / lifetime ad set — no ad-set daily_budget to optimize */
export type FreezeReason = 'no_conversions' | 'unsupported_budget';

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

/** One calendar day's raw counts — a WindowMetrics plus its ISO date (yyyy-mm-dd).
 *  The daily series is the SOURCE the cumulative windows are rolled up from (so the
 *  windows are guaranteed cumulative), and the grain the score system / FE charts read. */
export type DailyMetrics = WindowMetrics & { date: string };

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
  /** The budget the engine reallocates: a daily_budget for daily campaigns/ad sets, or
   *  a whole-flight lifetime_budget total for lifetime-CBO campaigns (see budgetType).
   *  Major currency units. */
  currentBudget: number;
  /** In platform learning phase (asymmetric down-cap applies). */
  learningPhase?: boolean;
  /** Frozen: excluded from reallocation, budget pinned at currentBudget. Set
   *  manually (operator) OR by the ingest boundary as an abstain (see freezeReason). */
  freeze?: boolean;
  /** When freeze is an ingest-side abstain, why — so a report can say "held: no
   *  conversion signal" vs a manual freeze. Undefined for a manual/operator freeze. */
  freezeReason?: FreezeReason;
  ageDays: number;
  audienceType?: AudienceType;
  /** Avg impressions per user, last 7d — for fatigue/saturation. */
  frequency7d?: number;
  /** Raw Meta optimization_goal (e.g. OFFSITE_CONVERSIONS, APP_INSTALLS).
   *  Metadata for objective grouping / onboarding suggestions — not used in scoring. */
  optimization_goal?: string;
  /** Parent campaign — metadata so the enrollment picker can group ad sets under
   *  their campaign. Not used in scoring. */
  campaignId?: string;
  campaignName?: string;
  /** How many ads (creatives) live in this ad set — metadata for the enrollment
   *  picker's "Ads" column. Not used in scoring. */
  adCount?: number;
  /** Which Meta budget field `currentBudget` came from — 'daily' (per-cycle daily_budget)
   *  or 'lifetime' (whole-flight lifetime_budget, lifetime CBO). Metadata for the
   *  picker/suggest + the applier's write-field choice; not used in scoring. Absent ⇒ daily. */
  budgetType?: 'daily' | 'lifetime';
  /** SCORING windows — the engine scores exclusively on these. Rolled up from the
   *  daily series (so d3 ⊆ d7 ⊆ d14 is guaranteed by construction). */
  windows: {
    d3: WindowMetrics;
    d7: WindowMetrics; // CUMULATIVE 0-7d (contains d3)
    d14: WindowMetrics; // CUMULATIVE 0-14d
  };
  /** ARCHIVAL rollups — constructed for history/reporting only, NOT used in scoring. */
  archivalWindows?: {
    d30: WindowMetrics; // CUMULATIVE 0-30d
    d90: WindowMetrics; // CUMULATIVE 0-90d
  };
  /** Per-day raw counts (up to 90d, oldest-first) the windows are rolled up from —
   *  the score system's daily grain + FE charts + archival. Optional so hand-built
   *  fixtures (tests) can still supply just `windows`. */
  daily?: DailyMetrics[];
};

export type TrajectoryState = 'positive' | 'neutral' | 'negative';

/** CPA point estimate + confidence interval, with the event count it rests on. */
export type CpaInterval = { cpa: number; lo: number; hi: number; events: number };

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
  /** P1: CPA confidence interval (Poisson on the event count). Undefined if no events. */
  ci?: CpaInterval;
  /** Carried from the snapshot when this item was frozen as an ingest-side abstain,
   *  so the FE/agents can render "held — no conversion signal" instead of a $0 change. */
  freezeReason?: FreezeReason;
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
  kind: 'pause' | 'creative_refresh' | 'audience_expand';
  trigger:
    | 'P1_zero_upper_funnel'
    | 'P2_sustained_poor'
    | 'P3_low_significance'
    | 'F1_creative_fatigue'
    | 'F2_audience_saturation';
  severity: 'low' | 'medium' | 'high';
  reason: string;
  needsApproval: true; // recommendations ALWAYS need user approval (engine never auto-acts)
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

/** How much to trust a measured efficiency signal (0..1). Deterministic, derived
 *  from objective predictiveness × sample size × within-signal consistency. */
export type Confidence = {
  score: number; // 0..1 overall
  predictiveness: number; // objective Spearman ceiling (prior)
  sampleSize: number; // 0..1, events/(events+k)
  consistency: number; // 0..1, 1 - CoV of the 3/7/14d per-$ scores
  events: number; // raw KPI events in the 14d window
  band: 'low' | 'medium' | 'high';
};

export type CycleResult = {
  mode: OptimizationMode;
  pacing: PacingResult;
  reallocation: ReallocationResult;
  recommendations: Recommendation[];
  /** Spend-weighted confidence that this cycle's reallocation signal is real. */
  confidence: Confidence;
};
