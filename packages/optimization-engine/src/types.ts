// ---------------------------------------------------------------------------
// Core domain types for the budget reallocation engine.
// Unit of optimization for v1 = ad set.
// ---------------------------------------------------------------------------

import type { RuleEvaluation } from './rules/types';

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
 *   - unsupported_budget: CBO / lifetime ad set — no ad-set daily_budget to optimize
 *   - lifetime_budget:    a CAMPAIGN whose budget is a whole-flight lifetime_budget, not a
 *                         per-cycle daily_budget. The engine's windows (3d/7d/14d) and its
 *                         pacing all reason in DAILY terms, so reallocating a lifetime total
 *                         as if it were a daily budget would silently resize a live flight.
 *                         Held until the flight model exists.
 *   - kpi_mismatch:       the ad set buys a DIFFERENT currency than the portfolio prices.
 *                         A pool ranks its members on events-per-dollar; a $39 conversation
 *                         and a $256 lead are not the same event, so the conversation ad set
 *                         would win on "efficiency" by definition and take the whole pool.
 *                         We refuse to compare them rather than produce a confident,
 *                         meaningless ranking — enroll it in a portfolio that prices what it
 *                         actually buys.
 *   - no_own_budget:      the ad set has NO budget of its own (currentBudget <= 0) and no
 *                         campaign-level explanation for it. Distinct from unsupported_budget,
 *                         where the budget exists but lives on the campaign: here there is no
 *                         budget anywhere the optimizer can see. Boosted posts arrive this way.
 *                         Reallocation MOVES money between ad sets; an ad set with none to move
 *                         can only RECEIVE, and a zero-budget item's solver box collapses onto
 *                         the floor, so it would be handed the floor on no evidence at all.
 *   - no_declared_objective: the ad set declares no optimization_goal and no kpiField, and has
 *                         produced zero events in the currency the portfolio prices. Nothing —
 *                         neither a declaration nor an observation — ties it to what this pool
 *                         ranks on, so scoring it measures absence. kpi_mismatch catches an ad
 *                         set declaring the WRONG currency; this catches one declaring none.
 *                         An undeclared ad set that DOES produce the portfolio's events is
 *                         still scored: observation establishes the currency that the missing
 *                         declaration did not. */
export type FreezeReason =
  | 'no_conversions'
  | 'unsupported_budget'
  | 'lifetime_budget'
  | 'kpi_mismatch'
  | 'no_own_budget'
  | 'no_declared_objective';

/** Raw counts for one analysis window. Cost-per-event is DERIVED, never stored.
 * The KPI event used for scoring is chosen by the portfolio's objective profile
 * (see objectives.ts). All event fields beyond spend are optional so a snapshot
 * only needs to carry the ones relevant to its objective. */
export type WindowMetrics = {
  spend: number;
  purchases: number; // optimization KPI for 'purchase' (incl. approved-credit)
  addToCarts: number;
  clicks: number; // ALL clicks (likes/comments/shares included) — the floor KPI
  impressions: number; // KPI for 'awareness' (cost = CPM-like)
  leads?: number; // KPI for 'lead'
  appInstalls?: number; // KPI for 'app_install'
  signups?: number; // KPI for 'signup' (account openings / checkouts initiated)
  landingPageViews?: number; // KPI for 'traffic'
  reach?: number;
  // --- The vectors an ad set can DECLARE it is buying (Meta optimization_goal) -----
  // Every currency paid_media.kpi_for_goal() can return must be representable here, or
  // an ad set that buys it scores zero KPI events and gets frozen as `no_conversions` —
  // an abstain that reads as "no signal" when the truth is "we never counted it".
  //
  // This is not hypothetical. A live account bought 949 messaging CONVERSATIONS against
  // 161 leads; with no `conversations` field, every one of its conversation ad sets was
  // held at its current budget and could never earn a fatigue recommendation, while the
  // creative-intel side was busy pricing those same conversations at $39.48 each.
  conversations?: number; // KPI for CONVERSATIONS / REPLIES (messaging threads started)
  linkClicks?: number; // KPI for LINK_CLICKS — the ones that actually left for the site
  thruplays?: number; // KPI for THRUPLAY / VIDEO_VIEWS
  postEngagement?: number; // KPI for POST_ENGAGEMENT / PAGE_LIKES / EVENT_RESPONSES
};

/** One calendar day's raw counts — a WindowMetrics plus its ISO date (yyyy-mm-dd).
 *  The daily series is the SOURCE the cumulative windows are rolled up from (so the
 *  windows are guaranteed cumulative), and the grain the score system / FE charts read. */
export type DailyMetrics = WindowMetrics & { date: string };

/** Portfolio optimization objective — selects the per-objective profile + KPI.
 *
 *  This is also the portfolio's CURRENCY. A pool ranks its members on events-per-dollar,
 *  so every ad set in it must be buying the same event; an ad set whose declared goal
 *  resolves elsewhere is frozen `kpi_mismatch` rather than compared. The first six are
 *  calibrated from real data; the rest are declared by Meta ad sets in the wild and are
 *  marked `calibrated: false` in objectives.ts. */
export type OptimizationObjective =
  | 'purchase'
  | 'app_install'
  | 'signup'
  | 'lead'
  | 'traffic'
  | 'awareness'
  | 'conversations'
  | 'link_clicks'
  | 'thruplays'
  | 'post_engagement'
  | 'clicks';

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
  /** Raw Meta optimization_goal (e.g. OFFSITE_CONVERSIONS, CONVERSATIONS, APP_INSTALLS).
   *  The ad set's DECLARED bid target. Kept raw for reporting/grouping; the engine never
   *  parses it — the ingest boundary resolves it into `kpiField` (below), because mapping
   *  Meta's goal taxonomy onto a currency is a boundary concern and must agree with SQL
   *  (paid_media.kpi_for_goal) and the paid-creative-intel verdicts. */
  optimization_goal?: string;
  /** WHICH WindowMetrics field this ad set's events are counted in — resolved at ingest
   *  from `optimization_goal`. THIS IS USED IN SCORING: it is the currency the ad set
   *  declared it was buying, and judging it in any other one is how a creative that
   *  started 200 messaging threads reads as a failure.
   *
   *  Declared beats observed because it is stable at zero: a zero-lead ad set in a
   *  LEAD_GENERATION portfolio still carries kpiField='leads', so it is compared against
   *  the lead-buying peers it takes budget from — which is how it earns a pause.
   *
   *  Absent ⇒ fall back to the portfolio profile's kpiField (cfg.kpiField). */
  kpiField?: keyof WindowMetrics;
  /** Parent campaign — metadata so the enrollment picker can group ad sets under
   *  their campaign. Not used in scoring. */
  campaignId?: string;
  campaignName?: string;
  /** How many ads (creatives) live in this ad set — metadata for the enrollment
   *  picker's "Ads" column. Not used in scoring. */
  adCount?: number;
  /** Dominant communication-angle archetype of the ad set's creatives (spend-weighted
   *  mode of the paid-creative-intel labels, stamped at ingest). Metadata for the
   *  audience × angle heat map — not used in scoring. Absent ⇒ untagged. */
  angle?: string;
  /** How this ad set's CREATIVES stand against each other. Stamped at ingest from
   *  paid_media_get_adset_creative_standing. Drives the creative triggers — the budget
   *  maths never reads it, but a raise can be withheld because of it (see `noRaise`). */
  creative?: CreativeStanding;
  /** Set by the creative triggers: this ad set may keep its budget but must not GROW it
   *  this cycle, because its money is sitting on a creative we have already judged.
   *  Raising it would fund the loser, not the ad set. Implemented as an upper bound of
   *  currentBudget in the solver, so conservation still holds and the freed headroom goes
   *  to ad sets that can use it. */
  noRaise?: boolean;
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
  /** ARCHIVAL rollups — constructed for history/reporting only, NOT used in scoring.
   *  d90 was removed: no reader ever existed (only optimizer_upsert_snapshots WROTE it),
   *  and the 90-day daily pull it required was 89% of a cold ingest. */
  archivalWindows?: {
    d30: WindowMetrics; // CUMULATIVE 0-30d
  };
  /** Per-AD trends for the creatives that delivered in this ad set, one entry per ad.
   *
   *  Present only when ad-level attribution landed this cycle AND the portfolio opted in
   *  (`optimizer.portfolios.creative_analysis = 'on'`). Absent means UNKNOWN — never that
   *  the creatives held steady. Nothing reading this may treat a missing entry as zero.
   *
   *  This is the difference between creative RANKING and creative FATIGUE: `creative` above
   *  is a d14 snapshot and can only say one creative beats another; only a series can say a
   *  creative is decaying. */
  creativeSeries?: CreativeAdSeries[];
  /** Per-day raw counts (up to 30d, oldest-first) the windows are rolled up from —
   *  the score system's daily grain + FE charts + archival. Every scoring window
   *  (d3 ⊆ d7 ⊆ d14) is derived from this one series, so 30 days covers all of them.
   *  Optional so hand-built fixtures (tests) can still supply just `windows`. */
  daily?: DailyMetrics[];
};

// --- Creative standing INSIDE one ad set ------------------------------------
// Audience, budget and optimization goal are constant within an ad set, so this is the
// only comparison in the account that isolates the creative. Nothing here ever compares
// two ad sets: across them, Meta's delivery optimization is the confound.

/** How far a standing can be trusted. Flags travel WITH the numbers, always. */
export type CreativeStandingFlag =
  /** Fewer than two creatives cleared the evidence floors — there was nothing to beat, so
   *  no winner is KNOWABLE here. Not the same as "no winner exists". */
  | 'single_creative'
  | 'low_evidence'
  | 'spend_concentrated'
  /** Labels were read off Meta's 64×64 thumbnail — barely a visual reading at all. */
  | 'thumbnail_derived_labels'
  /** The best converter is ALSO one Meta rates below its auction peers. Its ANGLE won;
   *  its CRAFT is being penalized. Cloning it would industrialize the penalty. */
  | 'winner_below_average_quality'
  /** We know which creative won, and we do not HAVE it: it has never been brought into the
   *  Library. A variation cannot be generated from a description of a creative — it needs
   *  the asset. Import it first. On a live account this is the norm (39 of 41 creatives),
   *  which is why it is flagged rather than left as a silent null. */
  | 'winner_not_in_library';

/** One creative's standing against its ad-set peers. */
export type CreativeStandingAd = {
  adId: string;
  adName?: string;
  creativeRowId?: string | null;
  verdict?: 'kill' | 'scale' | 'iterate' | 'watch' | null;
  verdictReason?: string | null;
  /** Meta's own grading of this creative against everything else in the same auction.
   *  Not reconstructable by our maths — it is the platform's opinion, and it is the one
   *  signal that says the problem is the CREATIVE and not the budget. */
  qualityRanking?: string | null;
  spend: number;
  events: number;
  /** Cost per the event the AD SET declared it was buying. Never call this "CPA". */
  costPerEvent: number | null;
  /** How many times the winner's cost this creative costs. 2.2 means it is burning 2.2x
   *  as much money per result as the creative sitting next to it in the same ad set. */
  vsWinner?: number | null;
  /** The Library asset (media.assets id) this creative IS. The head of the iteration
   *  chain: generation grounds on it, and the asset it produces is stamped with
   *  origin_ref.sourceAssetIds = [this], so "what did we make from the creative that won,
   *  and did any of it beat it?" is answerable later. Null ⇒ never imported, nothing to
   *  generate from (see `winner_not_in_library`). */
  assetId?: string | null;
  /** The creative's semantic labels — hook, angle, visual style, value props.
   *  This is what a variation brief is built FROM. Carried for the winner AND the
   *  laggards: "what is winning vs what is live" needs both sides, and until
   *  20260903182537 only the winner had them. */
  labels?: Record<string, unknown> | null;
  /** Where the creative's media can be read (poster or image). Needed to actually make a
   *  variation of it rather than a description of it. */
  posterUrl?: string | null;
  /** Meta's delivery frequency for this creative in the window. The one fatigue signal at
   *  CREATIVE grain. Projected for the winner only today. */
  frequency?: number | null;
};

/** One creative's OWN trend, cumulative exactly like AdSetSnapshot.windows (d3 ⊆ d7 ⊆ d14).
 *
 *  Deliberately NOT a field on CreativeStandingAd. A standing is a COMPARISON: its `winner`
 *  is withheld unless at least two creatives competed, and `laggards` holds only ranks below
 *  first — so an ad set running one creative has an empty winner AND an empty laggards list.
 *  That is 37 of 53 live ad sets, and it is precisely where a per-ad trend is the only signal
 *  there is. Hanging the series off the comparison would make it unavailable in exactly the
 *  case it exists for.
 *
 *  So the series is a ROSTER, keyed by ad id, sourced from `paid_media.ad_breakdown_daily`,
 *  which enumerates every ad that delivered regardless of how it ranks. */
/** Video retention counts for one window. Deliberately NOT part of WindowMetrics:
 *  that type is indexed by `kpiField: keyof WindowMetrics` (config.ts), so every field
 *  in it is a currency an ad set can DECLARE it is buying. A retention curve is a
 *  diagnostic SHAPE, never a conversion currency — putting it there would make
 *  `kpiField: 'videoP25'` type-legal and price creatives in quartile views.
 *
 *  Read the derived rates off `retentionRates`, not these raw counts. */
export type RetentionMetrics = {
  impressions: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  thruplays: number;
};

/** The three ratios a creative team can act on, derived from RetentionMetrics.
 *  Null means the denominator was zero — unknown, never "bad".
 *
 *  NOTE ON `hook`: the industry hook rate is 3-second-views / impressions. Meta's
 *  `video_3s` is requested by nobody in this pipeline and is 0% populated in
 *  `paid_media.ad_breakdown_daily`, so hook here is p25/impressions — a STRICTER
 *  bar (quarter-watched, not three seconds). It is comparable across our own ads
 *  but is NOT the same number a media buyer quotes. */
export type RetentionRates = {
  /** Reached 25% ÷ impressions. Did the opening earn a quarter of the view? */
  hook: number | null;
  /** Reached 50% ÷ reached 25%. Of those it caught, how many did it hold? */
  hold: number | null;
  /** Reached 75% ÷ reached 50%. Did the back half survive? */
  finish: number | null;
};

export type CreativeAdSeries = {
  adId: string;
  adName?: string;
  windows: {
    d3: WindowMetrics;
    d7: WindowMetrics;
    d14: WindowMetrics;
  };
  /** Absent when the ad ran no video, or when Meta reported no quartile rows at all.
   *  Absent is UNKNOWN — never "this creative was not watched". */
  retention?: {
    d3: RetentionMetrics;
    d7: RetentionMetrics;
    d14: RetentionMetrics;
  };
};

export type CreativeStanding = {
  /** Null whenever nothing ran against it. Read null as "no winner is knowable here". */
  winner: CreativeStandingAd | null;
  laggards: CreativeStandingAd[];
  eligibleAds: number;
  totalAds: number;
  /** Share of the ad set's spend on creatives our verdicts already called `kill`. */
  killSpendShare: number | null;
  /** Share of the ad set's spend on creatives META rates below its auction peers. */
  belowAvgSpendShare: number | null;
  medianCostPerEvent: number | null;
  flags: CreativeStandingFlag[];
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

/** What a recommendation asks a human to do.
 *
 *  The first three act on the AD SET. The last three act on the CREATIVE — which is the
 *  point of the product: an ad set is a budget and an audience, but the thing that
 *  actually works or doesn't is the creative inside it. */
export type RecommendationKind =
  | 'pause'
  | 'creative_refresh'
  | 'audience_expand'
  /** Pause ONE ad. The ad set is fine; this creative inside it is burning the money. */
  | 'pause_ad'
  /** Make variations of the creative that is WINNING inside this ad set — the experiment
   *  that moves the account forward, seeded from something measured rather than guessed. */
  | 'variate_creative'
  /** This ad set runs one creative, so it cannot tell you which creative works. Make
   *  variants to CREATE the comparison. No budget decision can substitute for this. */
  | 'seed_experiment';

export type RecommendationTrigger =
  | 'P1_zero_upper_funnel'
  | 'P2_sustained_poor'
  | 'P3_low_significance'
  | 'F1_creative_fatigue'
  | 'F2_audience_saturation'
  /** Spend concentrated on a creative already judged `kill`, or one Meta rates below its
   *  auction peers. The budget is not the problem; the creative is. */
  | 'C1_creative_drag'
  /** A creative measurably beats its ad-set peers, on the same audience and budget. */
  | 'C2_creative_winner'
  /** Fewer than two creatives ever competed here — nothing to learn from. */
  | 'C3_no_variance'
  /** ONE creative measured against its OWN past: cost per result rising while CTR falls.
   *  The only creative trigger that needs no peer, and therefore the only one that can say
   *  anything at all about an ad set running a single creative. */
  | 'C4_creative_decay';

export type Recommendation = {
  adSetId: string;
  /** The specific ad this is about. Present on the creative-level kinds, absent on the
   *  ad-set-level ones. Without it, "your creative is worn out" is advice no one can act
   *  on: an ad set with five creatives gives you five suspects and no defendant. */
  adId?: string;
  kind: RecommendationKind;
  /** Closed union for the built-in triggers, widened to admit the rules layer's
   *  `rule:<templateId | ruleId>` strings. `(string & {})` keeps the literals'
   *  autocomplete while accepting the open form. */
  trigger: RecommendationTrigger | (string & {});
  severity: 'low' | 'medium' | 'high';
  reason: string;
  /** Set when a data-driven rule produced this recommendation (trigger is then
   *  `rule:`-prefixed) — the join key back to the cycle's ruleEvaluations rows. */
  ruleId?: string;
  /** Everything a generator needs to make the next creative, carried on the recommendation
   *  so the loop closes without a second round-trip. Present on variate_creative /
   *  seed_experiment. */
  seed?: CreativeVariationSeed;
  needsApproval: true; // recommendations ALWAYS need user approval (engine never auto-acts)
};

/** The seed handed to generation. Deterministic — assembled from measured figures and the
 *  winning creative's own labels. A model may rephrase these; it may never invent them. */
export type CreativeVariationSeed = {
  adSetId: string;
  /** The creative to make variations OF. Absent for seed_experiment, where the whole point
   *  is that no winner is knowable and we are creating the comparison from scratch. */
  winnerAdId?: string;
  winnerCreativeRowId?: string | null;
  /** The Library asset generation grounds on, and the id the derived asset records as its
   *  parent (origin_ref.sourceAssetIds). This is what makes an iteration TRACEABLE rather
   *  than merely inspired. Null ⇒ the winner is not in the Library and must be imported
   *  before anything can be generated from it. */
  winnerAssetId?: string | null;
  /** The winner's own labels — hook, angle, visualStyle, valueProps. What WON. */
  labels?: Record<string, unknown> | null;
  posterUrl?: string | null;
  /** TRUE when the winner converts best but Meta rates its craft below peers. The brief
   *  must then say: keep the angle, REBUILD the execution. Not: clone this. */
  rebuildCraft: boolean;
  /** Deterministic citations, in the brief's own words. The sole grounding for any AI
   *  rephrase downstream — the optimizer-insight rule. */
  groundedOn: string[];
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
  /** Per rule × ad-set evaluation rows from the data-driven rules layer — the
   *  learning loop's shadow-validation feed. Empty when the cycle ran without rules. */
  ruleEvaluations: RuleEvaluation[];
};
