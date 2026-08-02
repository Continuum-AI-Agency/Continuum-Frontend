// ---------------------------------------------------------------------------
// Hierarchical empirical Bayes (Beta-Binomial) over an arbitrary node tree.
//
// `shrinkScores` (src/significance.ts) shrinks a FLAT cohort toward one grand
// mean. Real paid-media structure is nested — campaign > ad set > ad, or
// funnel > angle > hook — and a flat prior throws that away: a brand-new ad in
// a proven ad set is shrunk toward the account average instead of toward the
// ad set that actually predicts it. This module generalizes the same math to a
// tree: every node is shrunk toward its parent's ALREADY-SHRUNK estimate, and
// the strength of that pull (M, in trials) is learned per parent from how much
// its children actually disagree.
//
// Three passes, in this order:
//   1. Topological sort (missing parents and cycles are errors, not silent
//      drops; multiple roots are fine).
//   2. Roll (y, n) UP into subtree totals. This is what makes the recursion
//      coherent: a parent's mean has to come from its own subtree, which
//      includes the child being shrunk toward it.
//   3. Walk DOWN. Per parent, estimate M by method of moments over its
//      children's subtree totals, then shrink each child toward the parent.
//      The walk bottoms out at a virtual, globally pooled super-root.
//
// Deliberately ZERO imports — the package root barrel is dependency-free and
// re-exports this module directly.
// ---------------------------------------------------------------------------

/** One node of the tree. `n` must be the SAME denominator for every node in a
 *  single call (all impressions, or all clicks — never a mix). */
export interface TreeNodeInput {
  id: string;
  /** Exactly one parent; `null` marks a root. Multiple roots are allowed. */
  parentId: string | null;
  /** Successes (conversions, clicks, ...). Clamped into [0, n]. */
  y: number;
  /** Trials (impressions, clicks, ...). Negative values are clamped to 0. */
  n: number;
}

export interface ShrinkTreeOptions {
  /** Upper clamp on the learned prior strength, in trials. Default 5000.
   *  Never Infinity: an unbounded M means "the parent decides everything". */
  maxM?: number;
  /** Lower clamp on the learned prior strength, in trials. Default 1.
   *  Zero would mean "the parent is worth nothing" and defeats the point. */
  minM?: number;
  /** Below this many data-bearing children, method of moments is noise; the
   *  parent inherits the grandparent's M instead. Default 4. */
  minChildrenForMom?: number;
  /** Interval half-width in posterior standard deviations. Default 1.96. */
  z?: number;
  /** Prior for the virtual super-root, used when the tree carries no data at
   *  all (or to impose an account-level rate). Default: pooled over roots.
   *  `y` and `n` must be finite and `n > 0` — a prior with no trials behind it
   *  is not a prior, and both are rejected with `invalid_options` rather than
   *  silently ignored. `y` outside [0, n] is clamped, as node inputs are. */
  rootPrior?: { y: number; n: number };
}

export type ShrinkTreeFlag =
  | 'no_data'
  | 'children_no_data'
  | 'inherited_m'
  | 'm_clamped_high'
  | 'm_clamped_low'
  | 'single_child'
  | 'dominated_by_child';

export interface ShrunkNode {
  id: string;
  parentId: string | null;
  /** SUBTREE successes — this node's own y plus every descendant's. For a leaf
   *  this is the input y. `ownY` keeps the un-rolled input. */
  y: number;
  /** SUBTREE trials. See `y`. */
  n: number;
  /** The node's own, un-rolled input, before the upward pass. */
  ownY: number;
  ownN: number;
  /** y / n over the subtree, or null when the subtree has no trials at all. */
  raw: number | null;
  /** Posterior mean. ALWAYS defined, never NaN — this is the number to rank on
   *  when you also want the point estimate, `lcb` when you want the safe one. */
  estimate: number;
  /** n / (n + effectiveM) — the weight the node's own data carried. */
  lambda: number;
  /** M of THIS node's parent, in trials: the prior strength applied here. */
  effectiveM: number;
  /** Posterior standard deviation of Beta(a, b). */
  se: number;
  interval: readonly [number, number];
  /** max(0, estimate − z·se). The rank key: it penalizes thin data by widening
   *  the interval, not by inventing a multiplicative pessimism factor. */
  lcb: number;
  /** 0 for roots. */
  depth: number;
  /** Emitted in `FLAG_ORDER`, never input order. Each flag has ONE scope — the
   *  row it sits on ("self") or that row's children ("children"):
   *   - `no_data`          (self)     this node's subtree has zero trials, so
   *                                   its estimate is exactly its parent's.
   *   - `children_no_data` (children) none of this node's children carry a
   *                                   trial. Says NOTHING about this node's own
   *                                   n — a 10,000-trial parent whose children
   *                                   are all brand-new carries it.
   *   - `inherited_m`      (children) too few data-bearing children to estimate
   *                                   M; the grandparent's M was borrowed.
   *   - `m_clamped_high`   (children) M̂ hit maxM (or total pooling was the only
   *                                   coherent answer).
   *   - `m_clamped_low`    (children) M̂ hit minM: the children disagree so
   *                                   violently the prior is worth ~nothing.
   *   - `single_child`     (children) exactly one child, so the "cohort" the
   *                                   child is shrunk toward is itself.
   *   - `dominated_by_child` (children) one child holds >= DOMINANCE_SHARE of
   *                                   the trials; same circularity, by weight. */
  flags: ShrinkTreeFlag[];
}

export type ShrinkTreeErrorCode = 'duplicate_id' | 'missing_parent' | 'cycle' | 'invalid_options';

/** Structural problems are thrown, never swallowed: a parentId that points at
 *  nothing is a join bug upstream, and silently dropping the node hides it. */
export class ShrinkTreeError extends Error {
  readonly code: ShrinkTreeErrorCode;
  /** The offending node ids, sorted. */
  readonly ids: string[];

  constructor(code: ShrinkTreeErrorCode, message: string, ids: string[] = []) {
    super(message);
    this.name = 'ShrinkTreeError';
    this.code = code;
    this.ids = ids;
  }
}

const DEFAULT_MAX_M = 5_000;
const DEFAULT_MIN_M = 1;
const DEFAULT_MIN_CHILDREN_FOR_MOM = 4;
const DEFAULT_Z = 1.96;

/** One child holding >= this share of a parent's trials makes the parent's mean
 *  essentially that child's own rate — shrinking it toward "itself" is circular. */
const DOMINANCE_SHARE = 0.9;

/** Used only when a degenerate mean (exactly 0 or 1) has no trials behind it to
 *  size a continuity correction from. */
const EPSILON_FLOOR = 1e-6;

/** Stable flag order so output is byte-identical regardless of input order. */
const FLAG_ORDER: readonly ShrinkTreeFlag[] = [
  'no_data',
  'children_no_data',
  'inherited_m',
  'm_clamped_high',
  'm_clamped_low',
  'single_child',
  'dominated_by_child',
];

interface Internal {
  id: string;
  parentId: string | null;
  ownY: number;
  ownN: number;
  childIds: string[];
  depth: number;
  subtreeY: number;
  subtreeN: number;
  estimate: number;
  lambda: number;
  effectiveM: number;
  se: number;
  flags: Set<ShrinkTreeFlag>;
}

interface Totals {
  readonly y: number;
  readonly n: number;
}

interface MomResult {
  /** The prior strength this parent imposes on its children, in trials. */
  m: number;
  flags: ShrinkTreeFlag[];
}

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function compareIds(a: string, b: string): number {
  // Deliberately NOT localeCompare: locale collation is environment-dependent
  // and determinism is a stated requirement of this estimator.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The mean a parent hands DOWN to its children. Normally that is exactly the
 * parent's own posterior mean, which is what makes a zero-trial child land
 * exactly on its parent. The one exception is a mean of exactly 0 or 1: those
 * make Beta(a, b) degenerate (a = 0 collapses the interval to a point), so a
 * standard continuity correction of half a success is applied — sized by the
 * evidence behind the mean, so it vanishes as data accumulates. It can only
 * ever bind when the subtree saw zero successes or zero failures.
 */
function priorMeanFrom(estimate: number, trials: number): number {
  if (estimate > 0 && estimate < 1) return estimate;
  const epsilon = trials > 0 ? Math.min(1 / (2 * (trials + 1)), 0.5) : EPSILON_FLOOR;
  return estimate <= 0 ? epsilon : 1 - epsilon;
}

/**
 * Method of moments for the Beta prior strength M, over a parent's children.
 * Children with zero trials carry no information about spread and are excluded.
 *
 *   mu   = Σ y_j / Σ n_j
 *   Q    = Σ n_j (p_j − mu)²
 *   df   = Σ n_j − Σ n_j² / Σ n_j − (J − 1)         // effective d.o.f.
 *   tau² = max(0, (Q − mu(1−mu)(J−1)) / df)         // net of binomial noise
 *   M    = clamp(mu(1−mu)/tau² − 1, minM, maxM)
 *
 * The df denominator is the moment solution, not a refinement: with
 * p_j ~ Beta(mu, tau²) and y_j ~ Bin(n_j, p_j),
 *   E[Q] = tau²(N − Σn²/N) + (J−1)(mu(1−mu) − tau²),
 * so dividing the numerator by N instead biases tau² LOW by (N − Σn²/N −
 * (J−1))/N, hence M̂ high and every node over-shrunk — worst at small J, which
 * is exactly where minChildrenForMom (default 4) lets the estimator run.
 *
 * Every degenerate branch resolves to a flag, never to NaN.
 */
function methodOfMoments(
  children: readonly Totals[],
  inheritedM: number,
  minM: number,
  maxM: number,
  minChildrenForMom: number,
): MomResult {
  const flags: ShrinkTreeFlag[] = [];
  if (children.length === 1) flags.push('single_child');

  let sumN = 0;
  let sumY = 0;
  let sumN2 = 0;
  let largestN = 0;
  let effective = 0;
  for (const child of children) {
    if (child.n <= 0) continue;
    effective += 1;
    sumN += child.n;
    sumY += child.y;
    sumN2 += child.n * child.n;
    if (child.n > largestN) largestN = child.n;
  }

  // Keyed on trial SHARE alone. An arity guard here would invert the flag at
  // total dominance: one data-bearing child among zero-trial siblings is 100%
  // circular, yet `single_child` cannot cover it (that keys on children.length,
  // which counts the empty siblings). `sumN > 0` already excludes effective===0.
  if (sumN > 0 && largestN / sumN >= DOMINANCE_SHARE) {
    flags.push('dominated_by_child');
  }

  // No child has any trials: there is nothing to learn a spread from, so pool
  // totally. Estimates fall back to the parent, which is the honest answer.
  // This is about the CHILDREN — the parent may hold plenty of data of its own,
  // so it must not borrow `no_data`, which means "this row has no trials".
  if (effective === 0 || sumN <= 0) {
    flags.push('children_no_data');
    return { m: maxM, flags };
  }

  // Too few children for the moment estimator to mean anything — a 2-point
  // "spread" is noise. Borrow the grandparent's strength instead.
  if (effective < minChildrenForMom) {
    flags.push('inherited_m');
    return { m: inheritedM, flags };
  }

  const mu = sumY / sumN;
  const spread = mu * (1 - mu);

  // mu is exactly 0 or 1: mu(1−mu) = 0 and M = 0/0. A parent that never
  // converted (or always did) has no variance with which to tell its children
  // apart, so total pooling is the correct answer, not an arbitrary M.
  if (spread <= 0) {
    flags.push('m_clamped_high');
    return { m: maxM, flags };
  }

  let weightedSquares = 0;
  for (const child of children) {
    if (child.n <= 0) continue;
    const p = child.y / child.n;
    weightedSquares += child.n * (p - mu) * (p - mu);
  }
  // Effective degrees of freedom, NOT sumN — see the formula block above. df<=0
  // means the children carry no residual freedom to see spread with (one
  // data-bearing child, or every child at a single trial), and falls into the
  // total-pooling branch below, which is the right answer there.
  const df = sumN - sumN2 / sumN - (effective - 1);
  const tau2 = df > 0 ? Math.max(0, (weightedSquares - spread * (effective - 1)) / df) : 0;

  // Observed spread is at or below what binomial noise alone would produce:
  // there is no evidence of real between-child variation. Pool totally.
  if (tau2 <= 0) {
    flags.push('m_clamped_high');
    return { m: maxM, flags };
  }

  const rawM = spread / tau2 - 1;
  if (rawM > maxM) {
    flags.push('m_clamped_high');
    return { m: maxM, flags };
  }
  if (rawM < minM) {
    flags.push('m_clamped_low');
    return { m: minM, flags };
  }
  return { m: rawM, flags };
}

/** Apply a parent's (M, mu) to one node: posterior mean, weight, and sd. */
function applyShrinkage(node: Internal, m: number, mu: number): void {
  const y = node.subtreeY;
  const n = node.subtreeN;
  node.effectiveM = m;

  const a = y + m * mu;
  const b = n - y + m * (1 - mu);
  const total = a + b; // === n + m

  if (n <= 0) {
    node.flags.add('no_data');
    node.lambda = 0;
    // Exactly the parent's estimate — no arithmetic that could drift off it.
    node.estimate = mu;
  } else {
    node.lambda = n / (n + m);
    node.estimate = total > 0 ? a / total : mu;
  }

  if (total > 0) {
    const p = a / total;
    // sqrt(ab / ((a+b)²(a+b+1))), rearranged as p(1−p)/(a+b+1) to keep the
    // products small on big denominators.
    node.se = Math.sqrt(Math.max(0, (p * (1 - p)) / (total + 1)));
  } else {
    node.se = 0;
  }
}

function orderedFlags(flags: Set<ShrinkTreeFlag>): ShrinkTreeFlag[] {
  const out: ShrinkTreeFlag[] = [];
  for (const flag of FLAG_ORDER) if (flags.has(flag)) out.push(flag);
  return out;
}

/**
 * Hierarchical empirical-Bayes shrinkage over a tree of (y, n) counts.
 *
 * Output is sorted by id and does not depend on input order: children are
 * always summed in id order, so even the floating-point result is stable.
 */
export function shrinkTree(
  nodes: readonly TreeNodeInput[],
  options: ShrinkTreeOptions = {},
): ShrunkNode[] {
  const maxM = options.maxM ?? DEFAULT_MAX_M;
  const minM = options.minM ?? DEFAULT_MIN_M;
  const minChildrenForMom = options.minChildrenForMom ?? DEFAULT_MIN_CHILDREN_FOR_MOM;
  const z = options.z ?? DEFAULT_Z;

  if (!Number.isFinite(maxM) || maxM <= 0) {
    throw new ShrinkTreeError(
      'invalid_options',
      `maxM must be a finite positive number, got ${maxM}`,
    );
  }
  if (!Number.isFinite(minM) || minM <= 0) {
    throw new ShrinkTreeError(
      'invalid_options',
      `minM must be a finite positive number, got ${minM}`,
    );
  }
  if (minM > maxM) {
    throw new ShrinkTreeError('invalid_options', `minM (${minM}) must not exceed maxM (${maxM})`);
  }
  if (!Number.isFinite(z) || z < 0) {
    throw new ShrinkTreeError(
      'invalid_options',
      `z must be a finite non-negative number, got ${z}`,
    );
  }
  const prior = options.rootPrior;
  // Validated like every other numeric input, and for a sharper reason: an
  // unvalidated non-finite prior.y does not surface as NaN downstream, it
  // silently inverts the tree to ~1.0 (clamp(NaN,..) is NaN, and NaN takes
  // neither branch of priorMeanFrom, so it returns 1 − epsilon). A NULL
  // SUM(conversions) upstream would report a 3% account as a 70% one, in range
  // and past every sanity check. A prior with no trials behind it is not a
  // prior — silently ignoring it is the same class of bug. y is CLAMPED rather
  // than rejected, matching how node inputs treat y outside [0, n].
  if (
    prior !== undefined &&
    (!Number.isFinite(prior.y) || !Number.isFinite(prior.n) || prior.n <= 0)
  ) {
    throw new ShrinkTreeError(
      'invalid_options',
      `rootPrior must have finite y and finite positive n, got y=${prior.y}, n=${prior.n}`,
    );
  }

  if (nodes.length === 0) return [];

  // --- Pass 1: index, validate, topologically order --------------------------
  const byId = new Map<string, Internal>();
  for (const input of nodes) {
    if (byId.has(input.id)) {
      throw new ShrinkTreeError('duplicate_id', `duplicate node id: ${input.id}`, [input.id]);
    }
    const n = Number.isFinite(input.n) ? Math.max(0, input.n) : 0;
    const y = Number.isFinite(input.y) ? clamp(input.y, 0, n) : 0;
    byId.set(input.id, {
      id: input.id,
      parentId: input.parentId,
      ownY: y,
      ownN: n,
      childIds: [],
      depth: 0,
      subtreeY: y,
      subtreeN: n,
      estimate: 0,
      lambda: 0,
      effectiveM: maxM,
      se: 0,
      flags: new Set<ShrinkTreeFlag>(),
    });
  }

  const rootIds: string[] = [];
  const missingParents: string[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      rootIds.push(node.id);
      continue;
    }
    const parent = byId.get(node.parentId);
    if (parent === undefined) {
      missingParents.push(node.id);
      continue;
    }
    parent.childIds.push(node.id);
  }
  if (missingParents.length > 0) {
    const sorted = missingParents.sort(compareIds);
    const detail = sorted
      .map((id) => `${id} -> ${String(byId.get(id)?.parentId)}`)
      .slice(0, 5)
      .join(', ');
    throw new ShrinkTreeError(
      'missing_parent',
      `${sorted.length} node(s) reference a parentId not present in the input: ${detail}`,
      sorted,
    );
  }

  rootIds.sort(compareIds);
  for (const node of byId.values()) node.childIds.sort(compareIds);

  const topo: Internal[] = [];
  const queue: string[] = [...rootIds];
  let cursor = 0;
  while (cursor < queue.length) {
    const current = byId.get(queue[cursor] as string) as Internal;
    cursor += 1;
    topo.push(current);
    for (const childId of current.childIds) {
      const child = byId.get(childId) as Internal;
      child.depth = current.depth + 1;
      queue.push(childId);
    }
  }
  if (topo.length !== byId.size) {
    const reachable = new Set(topo.map((node) => node.id));
    const stranded = [...byId.keys()].filter((id) => !reachable.has(id)).sort(compareIds);
    throw new ShrinkTreeError(
      'cycle',
      `parent references form a cycle; ${stranded.length} node(s) are unreachable from any root: ${stranded.slice(0, 5).join(', ')}`,
      stranded,
    );
  }

  // --- Pass 2: roll (y, n) up into subtree totals -----------------------------
  // A parent's mean must describe its own subtree — including the very child
  // being shrunk toward it — or the recursion is not coherent.
  for (let i = topo.length - 1; i >= 0; i -= 1) {
    const node = topo[i] as Internal;
    let y = node.ownY;
    let n = node.ownN;
    for (const childId of node.childIds) {
      const child = byId.get(childId) as Internal;
      y += child.subtreeY;
      n += child.subtreeN;
    }
    node.subtreeY = y;
    node.subtreeN = n;
  }

  // --- Pass 3: walk down, shrinking each child toward its parent --------------
  // The virtual super-root: a globally pooled prior the real roots shrink
  // toward. It has no grandparent, so its inherited M is maxM.
  let rootTotalY = 0;
  let rootTotalN = 0;
  const rootTotals: Totals[] = [];
  for (const id of rootIds) {
    const root = byId.get(id) as Internal;
    rootTotalY += root.subtreeY;
    rootTotalN += root.subtreeN;
    rootTotals.push({ y: root.subtreeY, n: root.subtreeN });
  }

  // `prior` is already validated finite with n > 0, so the ratio is safe.
  const superEstimate =
    prior !== undefined
      ? clamp(prior.y / prior.n, 0, 1)
      : rootTotalN > 0
        ? rootTotalY / rootTotalN
        : 0;
  // The continuity correction is sized by the evidence behind THIS mean. When
  // the caller supplied the mean, that evidence is prior.n, not the tree's own
  // trials: a prior of 0 conversions in 1000 impressions must not be corrected
  // as if it came from an empty tree (which would make it ~500x too small).
  const superTrials = prior !== undefined ? prior.n : rootTotalN;
  const superMean = priorMeanFrom(superEstimate, superTrials);
  const superMom = methodOfMoments(rootTotals, maxM, minM, maxM, minChildrenForMom);
  // The super-root is virtual, so its own flags have no row to live on; they
  // are recomputed identically for each real root's `effectiveM` anyway.
  for (const id of rootIds) {
    applyShrinkage(byId.get(id) as Internal, superMom.m, superMean);
  }

  for (const node of topo) {
    if (node.childIds.length === 0) continue;
    const childTotals: Totals[] = [];
    for (const childId of node.childIds) {
      const child = byId.get(childId) as Internal;
      childTotals.push({ y: child.subtreeY, n: child.subtreeN });
    }
    const mom = methodOfMoments(childTotals, node.effectiveM, minM, maxM, minChildrenForMom);
    for (const flag of mom.flags) node.flags.add(flag);
    const mean = priorMeanFrom(node.estimate, node.subtreeN);
    for (const childId of node.childIds) {
      applyShrinkage(byId.get(childId) as Internal, mom.m, mean);
    }
  }

  // --- Emit -------------------------------------------------------------------
  const out: ShrunkNode[] = [];
  for (const node of topo) {
    const half = z * node.se;
    const lo = Math.max(0, node.estimate - half);
    const hi = Math.min(1, node.estimate + half);
    out.push({
      id: node.id,
      parentId: node.parentId,
      y: node.subtreeY,
      n: node.subtreeN,
      ownY: node.ownY,
      ownN: node.ownN,
      raw: node.subtreeN > 0 ? node.subtreeY / node.subtreeN : null,
      estimate: node.estimate,
      lambda: node.lambda,
      effectiveM: node.effectiveM,
      se: node.se,
      interval: [lo, hi] as const,
      lcb: lo,
      depth: node.depth,
      flags: orderedFlags(node.flags),
    });
  }
  out.sort((a, b) => compareIds(a.id, b.id));
  return out;
}
