// Relevance resolution — which brand rules actually apply to THIS piece of work.
//
// The failure this module removes is "dump the whole book into the prompt". A brand book
// that says something about motion, people, packaging and illustration is a good brand
// book; sending all of it to a still-life packshot request is how a prompt becomes 4,000
// characters of mostly-irrelevant instruction that the model averages into mush. Worse,
// it makes every generation look like it obeyed the brand when most of the brand was
// never checkable for that artefact in the first place.
//
// So resolution is a filter with a stated order (F0-F9) and a stated budget, and it is
// PURE and SYNCHRONOUS. Every read happens in the Backend adapter and is injected here.
// Three things follow from that, and all three are the point:
//
//   - the same document + the same plan always produce the same `provenance.checksum`,
//     so "did the brand change or did the prompt change?" is answerable;
//   - the Frontend can run it for a live conflict preview with no network hop;
//   - a test can assert the resolved package without a database.
//
// The other half of the module is the authority boundary. `required` and `preferred` are
// `ApprovedRule[]` — a branded type whose only constructor is `asApprovedRule`, which
// refuses anything failing R1/R2. Non-authoritative rules can only reach `.proposals`,
// which is a DIFFERENT type. Putting a proposal in the prompt is a compile error rather
// than something review has to catch. The branded types live in `./brand-direction`
// alongside the invariants they enforce.
//
// Budget note: trimming drops WHOLE RULES and names every one of them in
// `budget.omitted`. It never truncates a rendered string. A half-sentence brand rule is
// worse than an absent one — it reads as authoritative and instructs nothing.

import type { ContentFamily } from '../creative-system/families';
import type { ReferenceRole } from '../creative-system/references';
import { IDENTITY_PRESERVING_ROLES } from '../creative-system/references';
import {
  type ApprovedProhibition,
  type ApprovedRule,
  asApprovedProhibition,
  asApprovedRule,
  asProposedRule,
  type BrandDirectionDocument,
  type BrandDirectionDrop,
  type BrandDirectionExample,
  type BrandDirectionMediaKind,
  type BrandDirectionPiece,
  type BrandDirectionRule,
  type BrandDirectionRuleOf,
  type BrandExampleAuthority,
  type BrandIntegrationValue,
  type BrandProhibitionCategory,
  type BrandRuleProvenance,
  type BrandRuleSourceVersion,
  type BrandVerificationHook,
  brandDirectionRuleSchema,
  canonicalDirectionJson,
  directionSha256Hex,
  isApprovedRule,
  LOGO_VERIFYING_HOOKS,
  type ProposedRule,
} from './brand-direction';
import type { BrandMdTokens } from './brand-md';

/* -------------------------------------------------------------------------- */
/*  Plan context                                                               */
/* -------------------------------------------------------------------------- */

export const BRAND_TEXT_STRATEGIES = [
  'none',
  'reserved-overlay',
  'direct-exact-text',
  'two-stage-art-then-copy',
  'typography-as-image',
] as const;
export type BrandTextStrategy = (typeof BRAND_TEXT_STRATEGIES)[number];

export const BRAND_PLAN_MEDIUMS = ['photographic', 'illustrated', 'typographic', 'mixed'] as const;
export type BrandPlanMedium = (typeof BRAND_PLAN_MEDIUMS)[number];

/**
 * What the compiler already knows about the run before it asks the brand anything.
 *
 * These are decisions, not preferences — `involvesLogo` is "a mark will be in the frame",
 * not "the brand would like one". The gating matrix below reads only from this object, so
 * two runs with the same plan admit the same pieces regardless of who asked.
 */
export type BrandDirectionPlanContext = {
  mediaKind: BrandDirectionMediaKind;
  /** Empty means unspecified, and matches ONLY rules that are themselves channel-agnostic. */
  channels: string[];
  /**
   * A kebab-case communication mechanism id. The closed vocabulary is owned by the
   * creative-system corpus and has not landed; this stays a shaped string until it does.
   */
  mechanism: string | null;
  textStrategy: BrandTextStrategy;
  referenceRoles: ReferenceRole[];
  involvesProduct: boolean;
  involvesPeople: boolean;
  involvesLogo: boolean;
  medium: BrandPlanMedium;
  aspect: string | null;
};

/**
 * The structural minimum this resolver needs from a family card.
 *
 * Deliberately narrow so the richer `ContentFamilyDefinition` the family corpus will own
 * satisfies it without a change here — structural typing means one field is the whole
 * coupling, and there is no second definition of a family to drift.
 */
export type BrandDirectionFamilyCard = {
  readonly requiredBrandBookPieces: readonly BrandDirectionPiece[];
};

/* -------------------------------------------------------------------------- */
/*  Output shapes                                                              */
/* -------------------------------------------------------------------------- */

export const BRAND_DIRECTION_BUCKETS = [
  'brand-integration',
  'required',
  'prohibitions',
  'preferred',
  'examples',
] as const;
export type BrandDirectionBucket = (typeof BRAND_DIRECTION_BUCKETS)[number];

/** Buckets that yield to the budget. Everything else fails compilation instead of shrinking. */
export const TRIMMABLE_BUCKETS: readonly BrandDirectionBucket[] = Object.freeze([
  'examples',
  'preferred',
]);

export type BrandDirectionBudget = {
  charBudget: number;
  byBucket: Record<BrandDirectionBucket, number>;
};

/**
 * The default allocation, in units of CANONICAL JSON characters.
 *
 * The intended ceiling is ~3,600 chars ≈ 900 tokens of rendered prose, which puts brand
 * direction in the same order of magnitude as the existing Organic skill-injection
 * ceilings (2,200 / 3,200) instead of crowding them out. These numbers are twice that
 * because the resolver has no renderer — the compiler owns prose — so it costs a rule by
 * its canonical JSON, which carries keys, quotes and punctuation the prompt will not.
 * Measured on the checked-in conflict fixtures, canonical JSON runs about 2x the prose it
 * describes; a complete `brand-integration` value measures ~1,114 chars.
 *
 * That measurement is why `brand-integration` is 1,400 rather than the 700 first drafted.
 * The bucket is never trimmed and an overflow FAILS compilation, so a 700-char allocation
 * would have blocked every brand that fully declared its integration policy — the exact
 * opposite of what the bucket is for. The shared limits module owns the final numbers
 * once a real renderer exists to measure; this declares the ALLOCATION SHAPE, which is
 * the part that has to be agreed: three buckets that never yield, two that do.
 */
export const BRAND_DIRECTION_DEFAULT_BUDGET: BrandDirectionBudget = Object.freeze({
  charBudget: 7_200,
  byBucket: Object.freeze({
    'brand-integration': 1_400,
    required: 2_400,
    prohibitions: 1_200,
    preferred: 1_600,
    examples: 600,
  }),
});

export type MissingDataWarningCode =
  | 'piece_missing'
  | 'brand_integration_undeclared'
  | 'rules_dropped_on_read'
  | 'no_direction_document';

export type MissingDataSeverity = 'low' | 'medium' | 'high';

export type MissingDataWarning = {
  code: MissingDataWarningCode;
  piece: BrandDirectionPiece | null;
  /** Null when the caller declared no family — see `matchesFamily`. */
  family: ContentFamily | null;
  severity: MissingDataSeverity;
  remedy: string;
};

export const INTRA_BOOK_CONFLICT_CODES = [
  'duplicate-thesis',
  'duplicate-suppressed',
  'strength-contradiction',
  'integration-inconsistency',
  'prohibition-vs-preference',
  'scoped-rule-preferred',
] as const;
export type IntraBookConflictCode = (typeof INTRA_BOOK_CONFLICT_CODES)[number];

export type IntraBookConflict = {
  code: IntraBookConflictCode;
  piece: BrandDirectionPiece;
  ruleIds: string[];
  provenances: BrandRuleProvenance[];
  detail: string;
  remedy: string;
};

/** An example the compiler may actually pin. `authority` is narrowed on purpose. */
export type PinnedExample = {
  assetId: string;
  versionId: string;
  kind: 'positive' | 'negative';
  annotations: BrandDirectionExample['annotations'];
  authority: Extract<BrandExampleAuthority, 'approved'>;
};

export type ResolvedBrandIntegration = {
  /** Null when the only integration policy in play is the conservative implicit default. */
  rule: ApprovedRule | null;
  source: 'approved-rule' | 'implicit-default';
  value: BrandIntegrationValue;
  /** Compiled straight into the evaluation contract's hard checks. */
  verificationHooks: BrandVerificationHook[];
};

export type BrandDirectionBudgetReport = {
  charBudget: number;
  charsUsed: number;
  byBucket: Record<BrandDirectionBucket, number>;
  omitted: Array<{ ruleId: string; bucket: BrandDirectionBucket; reason: 'budget' }>;
  /** True when a NEVER-trimmed bucket did not fit. The compiler fails rather than shrinks. */
  overflow: boolean;
};

export type ResolvedBrandDirection = {
  brandId: string;
  /** Null when the caller declared no family; only `families: 'all'` rules were considered. */
  family: ContentFamily | null;
  directionVersion: number | null;
  resolvedAt: string;

  tokens: BrandMdTokens | null;
  required: ApprovedRule[];
  preferred: ApprovedRule[];
  prohibitions: ApprovedProhibition[];
  brandIntegration: ResolvedBrandIntegration | null;

  examples: { positive: PinnedExample[]; negative: PinnedExample[] };

  proposals: ProposedRule[];
  missing: MissingDataWarning[];
  conflicts: IntraBookConflict[];

  provenance: {
    sourceVersions: BrandRuleSourceVersion[];
    ruleIds: string[];
    exampleRefs: Array<{ assetId: string; versionId: string }>;
    tokensChecksum: string;
    checksum: string;
  };

  budget: BrandDirectionBudgetReport;
};

/* -------------------------------------------------------------------------- */
/*  F5 — the piece-gating matrix                                               */
/* -------------------------------------------------------------------------- */

/**
 * The eleven pieces whose admission is a pure function of the plan.
 *
 * `brand-signature` is deliberately absent: its gate is `frequency.mode`, a property of
 * the RULE rather than the plan, so it is applied per-rule in F5b. This is why the two
 * worked contrasts below each admit seven pieces without mentioning it.
 */
export const PLAN_GATED_PIECES = [
  'visual-thesis',
  'composition',
  'colour-behaviour',
  'prohibition',
  'brand-integration',
  'product-world',
  'people-characters',
  'photography',
  'illustration-graphic',
  'typography-behaviour',
  'motion',
] as const;
export type PlanGatedPiece = (typeof PLAN_GATED_PIECES)[number];

export const admitsPiece = (
  piece: BrandDirectionPiece,
  plan: BrandDirectionPlanContext,
): boolean => {
  switch (piece) {
    case 'visual-thesis':
    case 'composition':
    case 'colour-behaviour':
    case 'prohibition':
      return true;
    case 'brand-integration':
      return plan.involvesLogo || plan.involvesProduct;
    case 'product-world':
      return plan.involvesProduct;
    case 'people-characters':
      return plan.involvesPeople;
    case 'photography':
      return plan.medium === 'photographic' || plan.medium === 'mixed';
    case 'illustration-graphic':
      return (
        plan.medium === 'illustrated' || plan.medium === 'typographic' || plan.medium === 'mixed'
      );
    case 'typography-behaviour':
      return plan.textStrategy !== 'none';
    case 'motion':
      return plan.mediaKind !== 'still';
    default:
      // `brand-signature` is rule-gated and `unclassified-direction` is never resolvable.
      return false;
  }
};

/** The exact set of plan-gated pieces this run admits, in a stable order. */
export const resolvePlanAdmittedPieces = (plan: BrandDirectionPlanContext): BrandDirectionPiece[] =>
  PLAN_GATED_PIECES.filter((piece) => admitsPiece(piece, plan));

/**
 * A prohibition is additionally gated on its own category.
 *
 * Without this a still-life packshot would carry the brand's motion bans and its
 * representation-of-people bans, neither of which any evaluator could apply to the
 * output — the exact "looks like coverage, checks nothing" failure R4 exists to prevent.
 */
export const admitsProhibitionCategory = (
  category: BrandProhibitionCategory,
  plan: BrandDirectionPlanContext,
): boolean => {
  if (category === 'people') return plan.involvesPeople;
  if (category === 'product' || category === 'logo')
    return plan.involvesProduct || plan.involvesLogo;
  if (category === 'motion') return plan.mediaKind !== 'still';
  return true;
};

/* -------------------------------------------------------------------------- */
/*  Ordering and canonical cost                                                */
/* -------------------------------------------------------------------------- */

/** Block order, matching the order the compiler renders these pieces into the prompt. */
const PIECE_BLOCK_ORDER: readonly BrandDirectionPiece[] = Object.freeze([
  'visual-thesis',
  'composition',
  'brand-integration',
  'product-world',
  'people-characters',
  'photography',
  'illustration-graphic',
  'typography-behaviour',
  'colour-behaviour',
  'motion',
  'brand-signature',
  'prohibition',
  'unclassified-direction',
]);

const STRENGTH_ORDER: Record<BrandDirectionRule['strength'], number> = {
  hard: 0,
  'strong-preference': 1,
  default: 2,
};

/**
 * Pieces where at most one rule can sensibly govern a family.
 *
 * A prohibition list and a signature set are additive — five bans are five bans. A
 * statement of how photography behaves is singular, so a family-scoped one must beat a
 * `families: 'all'` one rather than both being emitted and the model picking.
 */
const MULTI_INSTANCE_PIECES: readonly BrandDirectionPiece[] = Object.freeze([
  'prohibition',
  'brand-signature',
]);

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const compareResolvedRules = (a: BrandDirectionRule, b: BrandDirectionRule): number =>
  STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] ||
  PIECE_BLOCK_ORDER.indexOf(a.piece) - PIECE_BLOCK_ORDER.indexOf(b.piece) ||
  compareStrings(a.createdAt, b.createdAt) ||
  compareStrings(a.id, b.id);

/**
 * The canonical cost of a rule.
 *
 * Budgeting on the canonicalized form rather than on the compiler's prose is what makes
 * the same rule cost the same number of characters regardless of key order — otherwise
 * two identical books could resolve to different packages and the checksum would lie.
 */
export const renderRuleForBudget = (rule: BrandDirectionRule): string =>
  `${rule.piece}: ${canonicalDirectionJson(rule.value)}`;

export const renderExampleForBudget = (example: PinnedExample): string =>
  `${example.kind}:${example.assetId}:${example.versionId}:${canonicalDirectionJson(example.annotations)}`;

/* -------------------------------------------------------------------------- */
/*  Conflict detection helpers                                                 */
/* -------------------------------------------------------------------------- */

type ScalarLeaf = { path: string; value: string | number | boolean };

const collectScalarLeaves = (input: unknown, prefix: string, out: ScalarLeaf[]): void => {
  if (input === null || input === undefined) return;
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    out.push({ path: prefix, value: input });
    return;
  }
  if (Array.isArray(input)) return;
  if (typeof input !== 'object') return;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    collectScalarLeaves(value, prefix.length === 0 ? key : `${prefix}.${key}`, out);
  }
};

/** Scalar fields two same-piece rules both declare and disagree about. */
const contradictingScalarFields = (a: unknown, b: unknown): string[] => {
  const left: ScalarLeaf[] = [];
  const right: ScalarLeaf[] = [];
  collectScalarLeaves(a, '', left);
  collectScalarLeaves(b, '', right);
  const rightByPath = new Map(right.map((leaf) => [leaf.path, leaf.value]));
  return left
    .filter((leaf) => rightByPath.has(leaf.path) && rightByPath.get(leaf.path) !== leaf.value)
    .map((leaf) => leaf.path);
};

/**
 * Keys whose contents are themselves bans.
 *
 * A `prohibition` naming the same phrase as a rule's `forbiddenTreatments` is agreement,
 * not contradiction. Skipping these subtrees is what stops the conflict detector firing
 * on two rules that say the same thing.
 */
const PROHIBITIVE_VALUE_KEYS: ReadonlySet<string> = new Set([
  'forbidden',
  'forbiddenTreatments',
  'forbiddenTypeTropes',
  'prohibitedStockMotifs',
  'prohibitedPairings',
  'prohibitedStereotypes',
  'prohibitedInventions',
  'aiSignatureBans',
  'notThis',
  'observableFailure',
  'excludedFamilies',
]);

const normalizePhrase = (text: string): string =>
  text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const collectAffirmativePhrases = (input: unknown, out: Set<string>): void => {
  if (typeof input === 'string') {
    out.add(normalizePhrase(input));
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectAffirmativePhrases(item, out);
    return;
  }
  if (input === null || typeof input !== 'object') return;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (PROHIBITIVE_VALUE_KEYS.has(key)) continue;
    collectAffirmativePhrases(value, out);
  }
};

/**
 * Integration policies that cannot all be true at once.
 *
 * The first clause re-checks something the schema already rejects. That is deliberate:
 * `BrandDirectionDocument` is an inferred type, so a caller can hand-build one in
 * TypeScript without ever going through `readBrandDirection`, and the conservative
 * behaviour has to hold on that path too.
 */
const integrationInconsistencies = (value: BrandIntegrationValue): string[] => {
  const problems: string[] = [];
  if (value.logoRenderPolicy !== 'no-logo' && value.logoAssetRef === null) {
    problems.push('logoRenderPolicy permits a logo but no durable logoAssetRef is declared');
  }
  if (value.logoRenderPolicy !== 'no-logo' && value.maxOccurrences === 0) {
    problems.push('logoRenderPolicy permits a logo but maxOccurrences is 0');
  }
  if (
    value.logoRenderPolicy === 'composited-from-asset-only' &&
    !value.verificationHooks.some((hook) => LOGO_VERIFYING_HOOKS.includes(hook))
  ) {
    problems.push('composited-from-asset-only carries no hook that could verify the composite');
  }
  if (
    value.packagingTextPolicy === 'verbatim-from-asset' &&
    !value.verificationHooks.includes('ocr-label-match')
  ) {
    problems.push('verbatim-from-asset carries no ocr-label-match hook');
  }
  if (
    value.productRenderPolicy === 'real-reference-required' &&
    value.productAssetRefs.length === 0
  ) {
    problems.push('real-reference-required declares no product asset refs');
  }
  return problems;
};

/* -------------------------------------------------------------------------- */
/*  Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Does this rule apply to the family in hand — when there IS one?
 *
 * `family: null` is not "any family"; it is "the caller genuinely does not know". A literal
 * prompt declares no communication job, so nothing can be said about whether a rule scoped to
 * `campaign-key-visual` governs it. Only a rule the brand scoped to EVERY family survives,
 * because that is the only claim that remains true without knowing which one this is.
 *
 * Admitting family-scoped rules under an unknown family would apply a poster's typography law
 * to a packshot; excluding `families: 'all'` rules as well would mean an unknown family gets
 * no brand direction at all, which is the failure that made literal mode ungated to begin
 * with. This is the only reading that is true in both directions.
 */
const matchesFamily = (rule: BrandDirectionRule, family: ContentFamily | null): boolean => {
  if (family === null) return rule.applicability.families === 'all';
  if (rule.applicability.excludedFamilies.includes(family)) return false;
  if (rule.applicability.families === 'all') return true;
  return rule.applicability.families.includes(family);
};

const matchesMediaKind = (rule: BrandDirectionRule, plan: BrandDirectionPlanContext): boolean =>
  rule.applicability.mediaKinds.includes(plan.mediaKind);

const matchesChannels = (rule: BrandDirectionRule, plan: BrandDirectionPlanContext): boolean => {
  if (rule.applicability.channels.length === 0) return true;
  return rule.applicability.channels.some((channel) => plan.channels.includes(channel));
};

const isScopedToFamily = (rule: BrandDirectionRule): boolean =>
  rule.applicability.families !== 'all';

/* -------------------------------------------------------------------------- */
/*  The resolver                                                               */
/* -------------------------------------------------------------------------- */

export type ResolveBrandDirectionArgs = {
  brandId: string;
  /**
   * Null means the caller genuinely has no family — a literal prompt, not a wildcard.
   * Only rules the brand scoped to every family are considered. See `matchesFamily`.
   */
  family: ContentFamily | null;
  plan: BrandDirectionPlanContext;
  /** Injected. Null means no v2 direction exists yet, which is a valid answer, not an error. */
  document: BrandDirectionDocument | null;
  tokens: BrandMdTokens | null;
  familyCard: BrandDirectionFamilyCard;
  budget?: BrandDirectionBudget;
  /**
   * Which brand pieces the caller wants, intersected with what the plan admits.
   *
   * `undefined` = no preference, keep everything the plan admits. `[]` = no brand pieces at
   * all. A named list narrows. See F5b — a selection can never ADMIT a piece the plan gate
   * excluded, only withhold one it allowed.
   */
  pieces?: readonly BrandDirectionPiece[];
  /** Drops reported by `readBrandDirection`, surfaced so a parse loss is never invisible. */
  readDrops?: readonly BrandDirectionDrop[];
  now: string;
};

type BudgetEntry = {
  id: string;
  bucket: BrandDirectionBucket;
  cost: number;
};

/**
 * Resolve the brand's approved direction for one family and one plan.
 *
 * Pure and synchronous: no model call, no clock other than the injected `now`, no signed
 * URL, no I/O of any kind. The whole determinism contract rests on that.
 */
export function resolveBrandDirection(args: ResolveBrandDirectionArgs): ResolvedBrandDirection {
  const { brandId, family, plan, document, tokens, familyCard, now } = args;
  const budget = args.budget ?? BRAND_DIRECTION_DEFAULT_BUDGET;

  const allRules = document?.rules ?? [];
  const conflicts: IntraBookConflict[] = [];
  const proposals: ProposedRule[] = [];
  const missing: MissingDataWarning[] = [];

  /* F0/F1 — piece drop and approval routing. */
  const approvedCandidates: BrandDirectionRule[] = [];
  for (const rule of allRules) {
    if (rule.piece === 'unclassified-direction') {
      if (rule.approvalState === 'proposed') proposals.push(asProposedRule(rule));
      continue;
    }
    if (rule.approvalState === 'rejected' || rule.approvalState === 'retired') continue;
    if (!isApprovedRule(rule)) {
      proposals.push(asProposedRule(rule));
      continue;
    }
    approvedCandidates.push(rule);
  }

  /* Book-level cardinality: at most one approved thesis per brand. */
  const approvedTheses = approvedCandidates.filter((rule) => rule.piece === 'visual-thesis');
  if (approvedTheses.length > 1) {
    conflicts.push({
      code: 'duplicate-thesis',
      piece: 'visual-thesis',
      ruleIds: approvedTheses.map((rule) => rule.id),
      provenances: approvedTheses.map((rule) => rule.provenance),
      detail: `${approvedTheses.length} approved visual-thesis rules; a brand has exactly one thesis`,
      remedy: 'Retire all but one thesis, or merge them into a single approved statement.',
    });
  }

  /* F2-F4 — applicability. */
  let surviving = approvedCandidates.filter(
    (rule) =>
      matchesFamily(rule, family) && matchesMediaKind(rule, plan) && matchesChannels(rule, plan),
  );

  /* F5 — piece gating by plan, plus the two rule-level gates. */
  surviving = surviving.filter((rule) => {
    if (rule.piece === 'brand-signature') {
      if (rule.value.frequency.mode === 'occasional') {
        proposals.push(asProposedRule(rule));
        return false;
      }
      return true;
    }
    if (!admitsPiece(rule.piece, plan)) return false;
    if (rule.piece === 'prohibition') return admitsProhibitionCategory(rule.value.category, plan);
    return true;
  });

  /*
   * F5b — the CALLER's piece selection, when there is one.
   *
   * Applied AFTER the plan gate and INTERSECTED with it, never instead of it. The plan gate
   * answers "can this piece govern this artefact at all"; the selection answers "does the
   * person briefing want it to". A caller cannot switch on a piece the plan excludes — that
   * would put a motion prohibition on a still — so the selection can only ever narrow.
   *
   * `undefined` means the caller expressed no preference and everything the plan admits is
   * kept. An EMPTY ARRAY is a real answer and means "no brand pieces", which is how a canvas
   * turns the brand off entirely. The tri-state matches the one the Canvas brand-book toggle
   * already uses, so the two surfaces cannot mean different things by the same shape.
   *
   * Deselecting also frees budget: a rule that never enters the buckets cannot crowd out the
   * one the author actually needed.
   */
  if (args.pieces !== undefined) {
    const selected = new Set<BrandDirectionPiece>(args.pieces);
    for (const rule of surviving) {
      if (selected.has(rule.piece)) continue;
      /* Deselected is not the same as unapproved — it stays readable as a proposal. */
      proposals.push(asProposedRule(rule));
    }
    surviving = surviving.filter((rule) => selected.has(rule.piece));
  }

  /* F6a — specificity: an explicit family list beats `families: 'all'` for that family. */
  const scopedPieces = new Set(
    surviving
      .filter((rule) => !MULTI_INSTANCE_PIECES.includes(rule.piece) && isScopedToFamily(rule))
      .map((rule) => rule.piece),
  );
  surviving = surviving.filter((rule) => {
    if (!scopedPieces.has(rule.piece) || isScopedToFamily(rule)) return true;
    const winners = surviving.filter(
      (other) => other.piece === rule.piece && isScopedToFamily(other),
    );
    conflicts.push({
      code: 'scoped-rule-preferred',
      piece: rule.piece,
      ruleIds: [rule.id, ...winners.map((winner) => winner.id)],
      provenances: [rule.provenance, ...winners.map((winner) => winner.provenance)],
      detail: `${rule.id} applies to all families; a rule scoped to ${family} takes precedence`,
      remedy: `Narrow ${rule.id}'s applicability, or retire the family-scoped rule if the general one should win.`,
    });
    return false;
  });

  /* F6b — dedupe on piece + canonical value. */
  const byValueKey = new Map<string, BrandDirectionRule[]>();
  for (const rule of surviving) {
    const key = `${rule.piece}|${canonicalDirectionJson(rule.value)}`;
    const bucket = byValueKey.get(key);
    if (bucket) bucket.push(rule);
    else byValueKey.set(key, [rule]);
  }
  const deduped: BrandDirectionRule[] = [];
  for (const group of byValueKey.values()) {
    const ordered = [...group].sort(
      (a, b) =>
        STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] ||
        b.confidence - a.confidence ||
        compareStrings(b.updatedAt, a.updatedAt) ||
        compareStrings(a.id, b.id),
    );
    const [winner, ...losers] = ordered;
    deduped.push(winner);
    for (const loser of losers) {
      conflicts.push({
        code: 'duplicate-suppressed',
        piece: loser.piece,
        ruleIds: [winner.id, loser.id],
        provenances: [winner.provenance, loser.provenance],
        detail: `${loser.id} states the same ${loser.piece} value as ${winner.id}`,
        remedy: `Retire ${loser.id}; it adds no instruction the winning rule does not already carry.`,
      });
    }
  }

  /* Intra-book conflicts across the surviving set. */
  const hardByPiece = new Map<BrandDirectionPiece, BrandDirectionRule[]>();
  for (const rule of deduped) {
    if (rule.strength !== 'hard') continue;
    const bucket = hardByPiece.get(rule.piece);
    if (bucket) bucket.push(rule);
    else hardByPiece.set(rule.piece, [rule]);
  }
  for (const [piece, rules] of hardByPiece) {
    for (let i = 0; i < rules.length; i += 1) {
      for (let j = i + 1; j < rules.length; j += 1) {
        const fields = contradictingScalarFields(rules[i].value, rules[j].value);
        if (fields.length === 0) continue;
        conflicts.push({
          code: 'strength-contradiction',
          piece,
          ruleIds: [rules[i].id, rules[j].id],
          provenances: [rules[i].provenance, rules[j].provenance],
          detail: `two hard ${piece} rules disagree on ${fields.join(', ')}`,
          remedy: 'Scope one rule to a narrower family set, or downgrade one to a preference.',
        });
      }
    }
  }

  /* F7 — deterministic order. */
  const ordered = [...deduped].sort(compareResolvedRules);

  const integrationRule =
    ordered.find(
      (rule): rule is BrandDirectionRuleOf<'brand-integration'> =>
        rule.piece === 'brand-integration',
    ) ?? null;

  for (const problem of integrationRule ? integrationInconsistencies(integrationRule.value) : []) {
    conflicts.push({
      code: 'integration-inconsistency',
      piece: 'brand-integration',
      ruleIds: [integrationRule?.id ?? ''],
      provenances: integrationRule ? [integrationRule.provenance] : [],
      detail: problem,
      remedy: 'Correct the integration rule in Brand Book before compiling a run that uses it.',
    });
  }

  /* Buckets. */
  const required: ApprovedRule[] = [];
  const preferred: ApprovedRule[] = [];
  const prohibitions: ApprovedProhibition[] = [];

  for (const rule of ordered) {
    if (rule.piece === 'prohibition') {
      const approved = asApprovedProhibition(rule);
      if (approved) prohibitions.push(approved);
      continue;
    }
    if (rule.piece === 'brand-integration') continue;
    const approved = asApprovedRule(rule);
    if (!approved) continue;
    if (rule.strength === 'hard') required.push(approved);
    else preferred.push(approved);
  }

  /* Prohibition vs preference. */
  const affirmativePhrases = new Map<string, string[]>();
  for (const rule of [...required, ...preferred]) {
    const phrases = new Set<string>();
    collectAffirmativePhrases(rule.value, phrases);
    for (const phrase of phrases) {
      const owners = affirmativePhrases.get(phrase);
      if (owners) owners.push(rule.id);
      else affirmativePhrases.set(phrase, [rule.id]);
    }
  }
  for (const prohibition of prohibitions) {
    const banned = normalizePhrase(prohibition.value.observableFailure);
    const owners = affirmativePhrases.get(banned);
    if (!owners) continue;
    conflicts.push({
      code: 'prohibition-vs-preference',
      piece: 'prohibition',
      ruleIds: [prohibition.id, ...owners],
      provenances: [prohibition.provenance],
      detail: `${prohibition.id} bans "${prohibition.value.observableFailure}", which ${owners.join(', ')} asks for`,
      remedy:
        'Reword the prohibition to name the failure it actually means, or drop the conflicting instruction.',
    });
  }

  /* Brand integration, including the conservative implicit default (§3.3). */
  let brandIntegration: ResolvedBrandIntegration | null = null;
  const integrationInPlay = plan.involvesLogo || plan.involvesProduct;

  if (integrationRule) {
    const approved = asApprovedRule(integrationRule);
    brandIntegration = {
      rule: approved,
      source: 'approved-rule',
      value: integrationRule.value,
      verificationHooks: [...integrationRule.value.verificationHooks],
    };
  } else if (integrationInPlay && tokens?.logo?.storage_path) {
    // Absence is not permission. The compiler gets the conservative policy while the user
    // gets told the Brand Book has not answered the question — a `missing` warning, never
    // a fabricated approved rule.
    const implicit: BrandIntegrationValue = {
      logoRenderPolicy: 'composited-from-asset-only',
      logoAssetRef: null,
      placementLaws: [],
      clearSpace: { unit: 'logo-height', multiple: 1 },
      minimumSize: { unit: 'percent-of-shortest-edge', value: 6, contextNote: null },
      maxOccurrences: 1,
      forbiddenTreatments: [],
      coBrandingRules: {
        allowed: false,
        lockupOrder: 'brand-first',
        separatorRule: null,
        partnerMinClearSpace: null,
      },
      productRenderPolicy: 'model-may-render-from-reference',
      productAssetRefs: [],
      packagingTextPolicy: 'no-legible-text',
      signatureMarkBehaviour: { markId: null, whenRequired: 'never', frequency: 0 },
      integrationMechanism: 'foreground-lockup',
      verificationHooks: ['reference-composite-required', 'occurrence-count'],
    };
    brandIntegration = {
      rule: null,
      source: 'implicit-default',
      value: implicit,
      verificationHooks: [...implicit.verificationHooks],
    };
    // Surfaced as a proposal as well, so the editor can offer it for approval. It is a
    // PROPOSAL, not a rule: `asApprovedRule` would refuse it, and `.required` never sees it.
    const implicitRule = brandDirectionRuleSchema.safeParse({
      id: 'implicit-brand-integration-default',
      piece: 'brand-integration',
      value: implicit,
      applicability: {
        families: 'all',
        excludedFamilies: [],
        mediaKinds: ['still', 'motion', 'sequence'],
        channels: [],
      },
      strength: 'default',
      provenance: 'inferred-by-model',
      confidence: 0.5,
      approvalState: 'proposed',
      sourceVersion: {
        kind: 'manual',
        ref: 'brand_tokens.logo.storage_path',
        versionId: null,
        capturedAt: now,
      },
      observability: 'deterministic',
      rationale:
        'No brand-integration rule exists. Absence is not permission, so the conservative policy applies until a human answers.',
      supersedes: [],
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
      lastAppliedAt: null,
    });
    if (implicitRule.success) proposals.push(asProposedRule(implicitRule.data));
    missing.push({
      code: 'brand_integration_undeclared',
      piece: 'brand-integration',
      family,
      severity: 'high',
      remedy:
        'Declare a brand-integration rule. Until then the compiler will not let a model draw the mark.',
    });
  }

  /*
   * Examples — only `approved` authority may be pinned.
   *
   * An example declares the families it teaches, and `appliesTo` has no wildcard. With no
   * family in hand there is nothing to match it against, so NO example is pinned. Showing one
   * anyway would teach a brand's poster exemplar to a packshot.
   */
  const pinned: PinnedExample[] = (document?.examples ?? [])
    .filter(
      (example) =>
        example.authority === 'approved' && family !== null && example.appliesTo.includes(family),
    )
    .map((example) => ({
      assetId: example.assetId,
      versionId: example.versionId,
      kind: example.kind,
      annotations: example.annotations,
      authority: 'approved' as const,
    }));

  /* F8 — budget. Whole rules only; nothing is ever truncated. */
  const entries: BudgetEntry[] = [];
  if (brandIntegration) {
    entries.push({
      id: brandIntegration.rule?.id ?? 'implicit-brand-integration',
      bucket: 'brand-integration',
      cost: `brand-integration: ${canonicalDirectionJson(brandIntegration.value)}`.length,
    });
  }
  for (const rule of required) {
    entries.push({ id: rule.id, bucket: 'required', cost: renderRuleForBudget(rule).length });
  }
  for (const rule of prohibitions) {
    entries.push({ id: rule.id, bucket: 'prohibitions', cost: renderRuleForBudget(rule).length });
  }
  for (const rule of preferred) {
    entries.push({ id: rule.id, bucket: 'preferred', cost: renderRuleForBudget(rule).length });
  }
  const exampleEntries = pinned.map((example) => ({
    example,
    entry: {
      id: `${example.assetId}:${example.versionId}`,
      bucket: 'examples' as const,
      cost: renderExampleForBudget(example).length,
    },
  }));

  const omitted: BrandDirectionBudgetReport['omitted'] = [];
  const droppedPreferredIds = new Set<string>();
  const droppedExampleIds = new Set<string>();

  const bucketCost = (bucket: BrandDirectionBucket): number => {
    if (bucket === 'examples') {
      return exampleEntries
        .filter((item) => !droppedExampleIds.has(item.entry.id))
        .reduce((sum, item) => sum + item.entry.cost, 0);
    }
    return entries
      .filter((entry) => entry.bucket === bucket && !droppedPreferredIds.has(entry.id))
      .reduce((sum, entry) => sum + entry.cost, 0);
  };

  /**
   * Trim order within `examples`: lowest authority first, then most recently added, so a
   * long-established example survives a newly attached one. Only `approved` examples are
   * pinned today, which makes the authority term inert in practice — it is kept because
   * it is the stated contract and the pinning rule is the thing that may relax later.
   */
  const trimmableExamples = () =>
    exampleEntries
      .filter((item) => !droppedExampleIds.has(item.entry.id))
      .sort((a, b) => compareStrings(b.entry.id, a.entry.id));

  const trimmablePreferred = () =>
    preferred
      .filter((rule) => !droppedPreferredIds.has(rule.id))
      .sort(
        (a, b) =>
          a.confidence - b.confidence ||
          compareStrings(a.updatedAt, b.updatedAt) ||
          compareStrings(a.id, b.id),
      );

  const dropOneExample = (): boolean => {
    const [victim] = trimmableExamples();
    if (!victim) return false;
    droppedExampleIds.add(victim.entry.id);
    omitted.push({ ruleId: victim.entry.id, bucket: 'examples', reason: 'budget' });
    return true;
  };

  const dropOnePreferred = (): boolean => {
    const [victim] = trimmablePreferred();
    if (!victim) return false;
    droppedPreferredIds.add(victim.id);
    omitted.push({ ruleId: victim.id, bucket: 'preferred', reason: 'budget' });
    return true;
  };

  while (bucketCost('examples') > budget.byBucket.examples && dropOneExample()) {
    /* keep trimming */
  }
  while (bucketCost('preferred') > budget.byBucket.preferred && dropOnePreferred()) {
    /* keep trimming */
  }

  const totalCost = (): number =>
    BRAND_DIRECTION_BUCKETS.reduce((sum, bucket) => sum + bucketCost(bucket), 0);

  while (totalCost() > budget.charBudget && (dropOneExample() || dropOnePreferred())) {
    /* keep trimming */
  }

  const survivingPreferred = preferred.filter((rule) => !droppedPreferredIds.has(rule.id));
  const survivingExamples = exampleEntries
    .filter((item) => !droppedExampleIds.has(item.entry.id))
    .map((item) => item.example);

  const byBucket: Record<BrandDirectionBucket, number> = {
    'brand-integration': bucketCost('brand-integration'),
    required: bucketCost('required'),
    prohibitions: bucketCost('prohibitions'),
    preferred: bucketCost('preferred'),
    examples: bucketCost('examples'),
  };
  const charsUsed = BRAND_DIRECTION_BUCKETS.reduce((sum, bucket) => sum + byBucket[bucket], 0);
  const overflow =
    byBucket['brand-integration'] > budget.byBucket['brand-integration'] ||
    byBucket.required > budget.byBucket.required ||
    byBucket.prohibitions > budget.byBucket.prohibitions ||
    charsUsed > budget.charBudget;

  /* F9 — missing pieces the family card said it needed. */
  const producedPieces = new Set<BrandDirectionPiece>([
    ...required.map((rule) => rule.piece),
    ...survivingPreferred.map((rule) => rule.piece),
    ...prohibitions.map((rule) => rule.piece),
    ...(brandIntegration?.source === 'approved-rule' ? (['brand-integration'] as const) : []),
  ]);
  for (const piece of familyCard.requiredBrandBookPieces) {
    if (producedPieces.has(piece)) continue;
    missing.push({
      code: 'piece_missing',
      piece,
      family,
      severity: piece === 'brand-integration' ? 'high' : 'medium',
      remedy: `Author an approved ${piece} rule that applies to ${family}.`,
    });
  }

  if (document === null) {
    missing.push({
      code: 'no_direction_document',
      piece: null,
      family,
      severity: 'medium',
      remedy: 'This brand has no v2 creative direction yet; only v1 tokens are available.',
    });
  }

  if (args.readDrops && args.readDrops.length > 0) {
    missing.push({
      code: 'rules_dropped_on_read',
      piece: null,
      family,
      severity: 'medium',
      remedy: `${args.readDrops.length} rule(s) failed to parse and were dropped; review the Brand Book for stale or future-schema entries.`,
    });
  }

  /* Provenance. */
  const authoritative: BrandDirectionRule[] = [
    ...required,
    ...survivingPreferred,
    ...prohibitions,
    ...(integrationRule ? [integrationRule] : []),
  ];
  const ruleIds = authoritative.map((rule) => rule.id).sort(compareStrings);
  const sourceVersions: BrandRuleSourceVersion[] = [];
  const seenSourceVersions = new Set<string>();
  for (const rule of authoritative) {
    const key = canonicalDirectionJson(rule.sourceVersion);
    if (seenSourceVersions.has(key)) continue;
    seenSourceVersions.add(key);
    sourceVersions.push(rule.sourceVersion);
  }
  sourceVersions.sort((a, b) =>
    compareStrings(canonicalDirectionJson(a), canonicalDirectionJson(b)),
  );

  const exampleRefs = survivingExamples
    .map((example) => ({ assetId: example.assetId, versionId: example.versionId }))
    .sort((a, b) => compareStrings(`${a.assetId}:${a.versionId}`, `${b.assetId}:${b.versionId}`));

  const tokensChecksum = directionSha256Hex(canonicalDirectionJson(tokens ?? null));

  // `resolvedAt` is deliberately absent: two resolutions of the same document and plan
  // must hash identically, or the checksum measures the clock instead of the content.
  const checksum = directionSha256Hex(
    canonicalDirectionJson({
      brandId,
      family,
      directionVersion: document?.version ?? null,
      tokensChecksum,
      required: required.map(renderRuleForBudget),
      preferred: survivingPreferred.map(renderRuleForBudget),
      prohibitions: prohibitions.map(renderRuleForBudget),
      brandIntegration: brandIntegration
        ? { source: brandIntegration.source, value: brandIntegration.value }
        : null,
      examples: survivingExamples.map(renderExampleForBudget),
      budget: { charBudget: budget.charBudget, byBucket: budget.byBucket },
    }),
  );

  return {
    brandId,
    family,
    directionVersion: document?.version ?? null,
    resolvedAt: now,
    tokens,
    required,
    preferred: survivingPreferred,
    prohibitions,
    brandIntegration,
    examples: {
      positive: survivingExamples.filter((example) => example.kind === 'positive'),
      negative: survivingExamples.filter((example) => example.kind === 'negative'),
    },
    proposals,
    missing,
    conflicts,
    provenance: { sourceVersions, ruleIds, exampleRefs, tokensChecksum, checksum },
    budget: { charBudget: budget.charBudget, charsUsed, byBucket, omitted, overflow },
  };
}

/**
 * Does the plan carry a reference that can satisfy `real-reference-required`?
 *
 * Exported because it is the compiler's `unsatisfiable-plan` test (§3.2 clause 2) and
 * fixture CF-04 turns on it: an illustration plan carrying only style and composition
 * references cannot depict a product the brand says must never be invented.
 */
export const planCarriesIdentityReference = (plan: BrandDirectionPlanContext): boolean =>
  plan.referenceRoles.some((role) => IDENTITY_PRESERVING_ROLES.includes(role));
