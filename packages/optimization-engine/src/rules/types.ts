// ---------------------------------------------------------------------------
// Data-driven rules layer — types. Salvaged design from the legacy Automatic
// DCO rule engine (rules-as-data: JSONB condition trees + tunable params),
// re-expressed for this engine's ad-set/portfolio grain.
//
// STATUS: UNWIRED STUB. Nothing in runCycle() consumes this module yet — it is
// staged for the wiring pass described in Continuum-Optimizer/docs/dco-salvage/.
// Deliberately NOT exported from src/index.ts until then.
//
// The condition wire format is kept compatible with the DCO's json-rules-engine
// shape ({ conditions: { all|any: [{ fact, operator, value }] } }) so the DCO's
// rule library ports literally. One deliberate inversion: here a HIGHER
// `priority` number wins dedup (the DCO used lowest-number-wins).
// ---------------------------------------------------------------------------

/** Reference to another fact's value — the DCO's `value: { fact: 'x' }` indirection.
 *  Rule `params` are merged into the fact map, so thresholds are referenced the
 *  same way as measured facts. */
export type FactRef = { fact: string };

export type FactValue = number | string | boolean;

/** The fact map one rule evaluates against: measured ad-set facts + portfolio
 *  aggregates + the rule's own params (params override on key collision, as in
 *  the DCO's `{ ...cached, ...paramFacts }`). */
export type FactMap = Record<string, FactValue | undefined>;

/** Standard comparison operators (json-rules-engine names) + the DCO's five
 *  custom proportional operators, ported with identical semantics (including
 *  their return-false-on-zero-base guards). */
export type RuleOperator =
  | 'equal'
  | 'notEqual'
  | 'greaterThan'
  | 'greaterThanInclusive'
  | 'lessThan'
  | 'lessThanInclusive'
  | 'in'
  | 'notIn'
  | 'isGreaterThanPercentOf'
  | 'isLessThanPercentOf'
  | 'isGreaterThanRatio'
  | 'isLessThanRatio'
  | 'isWithinPercentRange';

/** A leaf's comparison value: a literal, a fact reference, a list (in/notIn),
 *  or a proportional-operator parameter object whose fields may themselves be
 *  fact references (e.g. { compareValue: { fact: 'portfolio_avg_cpp_d7' }, ratio: 1.5 }). */
export type ConditionValue =
  | FactValue
  | FactRef
  | FactValue[]
  | { [param: string]: number | FactRef };

export type RuleConditionLeaf = {
  fact: string;
  operator: RuleOperator;
  value: ConditionValue;
};

/** Condition tree: `all` = AND (empty => true), `any` = OR (empty => false) —
 *  the json-rules-engine boolean conventions. */
export type RuleCondition = RuleConditionLeaf | { all: RuleCondition[] } | { any: RuleCondition[] };

/** What a matched rule asks for.
 *  - pause / creative_refresh / audience_expand -> a RuleFinding (maps onto the
 *    existing Recommendation kinds; always human-approved downstream).
 *  - starve / freeze -> budget-shaping signals consumed by the reallocation
 *    (drive to floor / hold budget) — no approval object, mirroring how the
 *    built-in triggers starve and the abstain freezes today. */
export type RuleActionKind = 'pause' | 'creative_refresh' | 'audience_expand' | 'starve' | 'freeze';

export type RuleSeverity = 'low' | 'medium' | 'high';

export type RuleAction = {
  kind: RuleActionKind;
  severity: RuleSeverity;
  /** Human-readable reason with `{{fact_name}}` placeholders interpolated from
   *  the evaluated fact map at match time. */
  reasonTemplate: string;
};

/** A rule as stored (future `optimizer.rules` row) / evaluated. */
export type RuleDefinition = {
  /** Row id (uuid in the DB; `seed:<templateId>` in fixtures/tests). */
  id: string;
  /** Lineage to the template that generated this rule — the learning loop's
   *  grouping key. Absent for user-authored rules. */
  templateId?: string;
  version: number;
  name: string;
  enabled: boolean;
  /** Cross-rule dedup: for the same (adSetId, action kind) the HIGHEST priority
   *  match wins; the rest are recorded as deduped. */
  priority: number;
  conditions: RuleCondition;
  action: RuleAction;
  /** Tunable thresholds, merged into the fact map (override on collision).
   *  This is the surface the learning loop's auto-tuner adjusts. */
  params: Record<string, FactValue>;
};

/** A matched recommendation-kind rule, shaped to map 1:1 onto the engine's
 *  Recommendation at wiring time. `trigger` is a free string (`rule:<templateId>`)
 *  because the engine's Recommendation.trigger union is closed — widening it is
 *  a wiring-pass change, kept out of this stub on purpose. */
export type RuleFinding = {
  adSetId: string;
  kind: 'pause' | 'creative_refresh' | 'audience_expand';
  trigger: string; // `rule:<templateId | ruleId>`
  severity: RuleSeverity;
  reason: string;
  needsApproval: true;
  ruleId: string;
  templateId?: string;
};

/** One rule x ad-set evaluation — the future `optimizer.rule_evaluations` row.
 *  `facts` is the snapshot the learning loop's auto-tuner replays; populated
 *  only on matched rows to bound storage (raw windows already persist in
 *  adset_snapshots). Note: non-finite fact values (e.g. an Infinity cost proxy)
 *  serialize to null in JSON — the persistence layer inherits that. */
export type RuleEvaluation = {
  ruleId: string;
  templateId?: string;
  adSetId: string;
  matched: boolean;
  /** Matched, but suppressed by a higher-priority rule or a built-in trigger
   *  that already flagged the same (adSetId, kind). Persisted anyway: deduped
   *  matches are free shadow-validation data for the learning loop. */
  deduped?: boolean;
  facts?: FactMap;
  /** Unknown fact / operator / malformed value — the rule evaluates to
   *  no-match, loudly. Never throws out of evaluateRules. */
  error?: string;
};

export type RuleEngineOutput = {
  findings: RuleFinding[];
  /** Ad sets to drive to their floor (pause findings imply starve, exactly like
   *  the built-in pause triggers). */
  starveIds: Set<string>;
  /** Ad sets to hold at current budget (the freeze/abstain lever). */
  freezeIds: Set<string>;
  evaluations: RuleEvaluation[];
};

/** Built-in trigger output for dedup: adSetId -> kinds already flagged by the
 *  native P/F triggers this cycle. Built-ins win; rule matches against an
 *  already-flagged (adSetId, kind) are recorded as deduped. */
export type AlreadyFlagged = Map<string, Set<RuleActionKind>>;
