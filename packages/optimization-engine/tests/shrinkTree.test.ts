// Hierarchical empirical-Bayes shrinkage over a tree — known-value fixtures,
// degenerate-branch defenses, and a seeded property sweep (bun test).
import { expect, test } from 'bun:test';
import type { ShrunkNode, TreeNodeInput } from '../src/index';
import { ShrinkTreeError, shrinkScores, shrinkTree } from '../src/index';

// --- helpers ---------------------------------------------------------------

function byId(rows: ShrunkNode[]): Map<string, ShrunkNode> {
  return new Map(rows.map((row) => [row.id, row]));
}

function expectFinite(row: ShrunkNode): void {
  expect(Number.isFinite(row.estimate)).toBe(true);
  expect(Number.isFinite(row.lambda)).toBe(true);
  expect(Number.isFinite(row.se)).toBe(true);
  expect(Number.isFinite(row.effectiveM)).toBe(true);
  expect(Number.isFinite(row.lcb)).toBe(true);
  expect(Number.isFinite(row.interval[0])).toBe(true);
  expect(Number.isFinite(row.interval[1])).toBe(true);
}

/** Deterministic LCG — Math.random is banned here: a property sweep that cannot
 *  be replayed cannot be debugged when it goes red in CI. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// --- 1. the generalization claim -------------------------------------------

test('flat tree degenerates to shrinkScores', () => {
  // The two estimators weight the grand mean differently: shrinkScores weights
  // each item's SCORE by its `events`, shrinkTree pools raw counts by TRIALS.
  // They coincide exactly when score := y/n and events := n, because then
  //   Σ score_i·events_i / Σ events_i  =  Σ (y_i/n_i)·n_i / Σ n_i  =  Σy / Σn,
  // which is shrinkTree's pooled parent mean. Pinning minM = maxM = 200 also
  // pins M̂ = 200 = shrinkScores' k, so the two shrinkage weights match too.
  const leaves = [
    { id: 'a', y: 3, n: 100 },
    { id: 'b', y: 20, n: 500 },
    { id: 'c', y: 25, n: 1000 },
    { id: 'd', y: 90, n: 2000 },
    { id: 'e', y: 150, n: 5000 },
  ];
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    ...leaves.map((leaf) => ({ id: leaf.id, parentId: 'root', y: leaf.y, n: leaf.n })),
  ];

  const rows = byId(shrinkTree(tree, { minM: 200, maxM: 200 }));
  const flat = shrinkScores(
    leaves.map((leaf) => ({ id: leaf.id, score: leaf.y / leaf.n, events: leaf.n })),
    200,
  );

  // The single root's estimate is the pooled rate exactly (see test 13's note).
  const pooled = 288 / 8600;
  expect(rows.get('root')?.estimate).toBeCloseTo(pooled, 12);

  for (const item of flat) {
    const node = rows.get(item.id) as ShrunkNode;
    expect(Math.abs(node.estimate - item.shrunk)).toBeLessThan(1e-9);
    expect(node.effectiveM).toBe(200);
  }
});

// --- 2..5. what the moment estimator learns ---------------------------------

test('identical children collapse to total pooling', () => {
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  for (let i = 0; i < 6; i += 1) tree.push({ id: `c${i}`, parentId: 'root', y: 30, n: 1000 });

  const rows = byId(shrinkTree(tree));
  // s² = 0 exactly, so tau² clamps at 0 and M̂ pins to maxM.
  expect(rows.get('root')?.flags).toContain('m_clamped_high');
  for (let i = 0; i < 6; i += 1) {
    const leaf = rows.get(`c${i}`) as ShrunkNode;
    expect(leaf.effectiveM).toBe(5000);
    expect(leaf.lambda).toBeLessThan(0.2); // 1000 / 6000 = 0.1667
    expect(leaf.estimate).toBeCloseTo(0.03, 12);
  }
});

test('divergent children are barely pooled at all', () => {
  const rates = [0.02, 0.03, 0.04, 0.06, 0.07, 0.09];
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  rates.forEach((rate, i) => {
    tree.push({ id: `c${i}`, parentId: 'root', y: rate * 5000, n: 5000 });
  });

  const rows = byId(shrinkTree(tree));
  const learnedM = (rows.get('c0') as ShrunkNode).effectiveM;
  expect(learnedM).toBeLessThan(200); // ≈ 86 trials of prior — nearly nothing
  expect(rows.get('root')?.flags).not.toContain('m_clamped_high');

  rates.forEach((rate, i) => {
    const leaf = rows.get(`c${i}`) as ShrunkNode;
    expect(leaf.lambda).toBeGreaterThan(0.95);
    expect(Math.abs(leaf.estimate - rate) / rate).toBeLessThan(0.05);
  });
});

test('a parent with too few children inherits the grandparent M̂', () => {
  // Grandparent g has 8 spread-out children, so its M̂ is genuinely estimated.
  // One of them, p, has only 2 children — below minChildrenForMom.
  const tree: TreeNodeInput[] = [{ id: 'g', parentId: null, y: 0, n: 0 }];
  const rates = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09];
  rates.forEach((rate, i) => {
    tree.push({ id: `g${i}`, parentId: 'g', y: rate * 5000, n: 5000 });
  });
  // Re-home g0 as the sparse parent `p` by giving it two children of its own.
  tree.push({ id: 'p0', parentId: 'g0', y: 40, n: 2000 });
  tree.push({ id: 'p1', parentId: 'g0', y: 70, n: 2000 });

  const rows = byId(shrinkTree(tree));
  const sparseParent = rows.get('g0') as ShrunkNode;
  const sibling = rows.get('g1') as ShrunkNode;
  const grandchild = rows.get('p0') as ShrunkNode;

  expect(sparseParent.flags).toContain('inherited_m');
  // M̂ that g imposes on its own children == M̂ g0 passes to ITS children.
  expect(grandchild.effectiveM).toBe(sibling.effectiveM);
  expect(sparseParent.effectiveM).toBe(sibling.effectiveM);
  // Non-trivial: g's M̂ is estimated, not just both landing on maxM.
  expect(sibling.effectiveM).toBeLessThan(5000);
});

test('spread below binomial noise drives tau² to zero without NaN', () => {
  // Every child is exactly 1/100 — zero observed spread, which is BELOW what
  // binomial sampling alone would produce, so tau² clamps at 0.
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  for (let i = 0; i < 6; i += 1) tree.push({ id: `c${i}`, parentId: 'root', y: 1, n: 100 });

  const rows = shrinkTree(tree);
  const map = byId(rows);
  expect(map.get('root')?.flags).toContain('m_clamped_high');
  expect(map.get('c0')?.effectiveM).toBe(5000);
  for (const row of rows) expectFinite(row);
});

// --- 6..7. the zero-count cases that break in production --------------------

test('a zero-trial node lands exactly on its parent, with no NaN', () => {
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'a', parentId: 'root', y: 30, n: 1000 },
    { id: 'b', parentId: 'root', y: 45, n: 1200 },
    { id: 'c', parentId: 'root', y: 22, n: 900 },
    { id: 'd', parentId: 'root', y: 60, n: 1500 },
    { id: 'fresh', parentId: 'root', y: 0, n: 0 }, // brand-new ad, no delivery yet
  ];

  const rows = shrinkTree(tree);
  const map = byId(rows);
  const fresh = map.get('fresh') as ShrunkNode;
  const root = map.get('root') as ShrunkNode;

  expect(fresh.raw).toBeNull();
  expect(fresh.lambda).toBe(0);
  expect(fresh.estimate).toBe(root.estimate); // exactly, not approximately
  expect(fresh.flags).toContain('no_data');
  expect(fresh.se).toBeGreaterThan(0); // the interval still says "we don't know"
  for (const row of rows) expectFinite(row);
});

test('a whole tree of zeros falls back on rootPrior', () => {
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'a', parentId: 'root', y: 0, n: 0 },
    { id: 'b', parentId: 'root', y: 0, n: 0 },
    { id: 'a1', parentId: 'a', y: 0, n: 0 },
  ];

  const rows = shrinkTree(tree, { rootPrior: { y: 3, n: 100 } });
  expect(rows.length).toBe(4);
  for (const row of rows) {
    expectFinite(row);
    expect(row.raw).toBeNull();
    expect(row.lambda).toBe(0);
    expect(row.estimate).toBe(0.03);
    expect(row.flags).toContain('no_data');
  }
});

// --- 8. the single-variant pathology ----------------------------------------

test('a single-child parent is flagged and still shrinks its only child', () => {
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'p', parentId: 'root', y: 0, n: 0 },
    { id: 'q', parentId: 'root', y: 200, n: 4000 },
    { id: 'r', parentId: 'root', y: 260, n: 4000 },
    { id: 's', parentId: 'root', y: 340, n: 4000 },
    { id: 'only', parentId: 'p', y: 10, n: 1000 }, // 0.01 vs a cohort near 0.05
  ];

  const rows = byId(shrinkTree(tree));
  const parent = rows.get('p') as ShrunkNode;
  const child = rows.get('only') as ShrunkNode;

  expect(parent.flags).toContain('single_child');
  // Behavioral, not cosmetic: a lone cell does NOT get to keep its raw rate.
  expect(child.raw).toBe(0.01);
  expect(child.estimate).not.toBe(child.raw);
  expect(child.estimate).toBeGreaterThan(0.01);
  expect(child.lambda).toBeLessThan(1);
});

// --- 9..10. degenerate means ------------------------------------------------

test('a parent that never converted pools totally with wide intervals', () => {
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  for (let i = 0; i < 5; i += 1) tree.push({ id: `c${i}`, parentId: 'root', y: 0, n: 2000 });

  const rows = shrinkTree(tree);
  const map = byId(rows);
  expect(map.get('root')?.flags).toContain('m_clamped_high');
  for (let i = 0; i < 5; i += 1) {
    const leaf = map.get(`c${i}`) as ShrunkNode;
    expect(leaf.effectiveM).toBe(5000);
    expect(leaf.estimate).toBeGreaterThan(0);
    expect(leaf.estimate).toBeLessThan(1e-3);
    // Non-degenerate: the interval must not collapse onto the point estimate.
    expect(leaf.interval[1]).toBeGreaterThan(leaf.estimate * 2);
    expect(leaf.lcb).toBe(0);
  }
  for (const row of rows) expectFinite(row);
});

test('a parent that always converted is the mirror image', () => {
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  for (let i = 0; i < 5; i += 1) tree.push({ id: `c${i}`, parentId: 'root', y: 2000, n: 2000 });

  const rows = shrinkTree(tree);
  const map = byId(rows);
  expect(map.get('root')?.flags).toContain('m_clamped_high');
  for (let i = 0; i < 5; i += 1) {
    const leaf = map.get(`c${i}`) as ShrunkNode;
    expect(leaf.effectiveM).toBe(5000);
    expect(leaf.estimate).toBeLessThan(1);
    expect(leaf.estimate).toBeGreaterThan(1 - 1e-3);
    expect(leaf.interval[1]).toBeLessThanOrEqual(1);
    expect(1 - leaf.lcb).toBeGreaterThan((1 - leaf.estimate) * 2);
  }
  for (const row of rows) expectFinite(row);
});

// --- 11. the recursion itself -----------------------------------------------

test('every node lands between its own rate and its parent estimate, 4 levels deep', () => {
  const tree: TreeNodeInput[] = [{ id: 'r', parentId: null, y: 0, n: 0 }];
  const l1 = ['r0', 'r1', 'r2', 'r3'];
  l1.forEach((id, i) => tree.push({ id, parentId: 'r', y: 40 + i * 30, n: 3000 }));
  const l2 = ['r0a', 'r0b', 'r0c', 'r0d'];
  l2.forEach((id, i) => tree.push({ id, parentId: 'r0', y: 12 + i * 18, n: 1500 }));
  const l3 = ['r0a1', 'r0a2', 'r0a3', 'r0a4'];
  l3.forEach((id, i) => tree.push({ id, parentId: 'r0a', y: 4 + i * 11, n: 700 }));

  const rows = shrinkTree(tree);
  const map = byId(rows);
  expect(map.get('r')?.depth).toBe(0);
  expect(map.get('r0a1')?.depth).toBe(3);

  for (const row of rows) {
    expectFinite(row);
    if (row.parentId === null) continue;
    const parent = map.get(row.parentId) as ShrunkNode;
    const raw = row.raw as number;
    const lo = Math.min(raw, parent.estimate);
    const hi = Math.max(raw, parent.estimate);
    expect(row.estimate).toBeGreaterThanOrEqual(lo - 1e-12);
    expect(row.estimate).toBeLessThanOrEqual(hi + 1e-12);
  }
});

// --- 12..14. determinism, structural defense, clamp behavior ----------------

test('output does not depend on input order', () => {
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'other', parentId: null, y: 5, n: 400 },
  ];
  for (let i = 0; i < 7; i += 1) {
    tree.push({ id: `c${i}`, parentId: 'root', y: 5 + i * 9, n: 900 + i * 130 });
    tree.push({ id: `c${i}x`, parentId: `c${i}`, y: 2 + i * 3, n: 300 + i * 40 });
  }

  const reference = shrinkTree(tree);
  const rand = lcg(20260729);
  for (let round = 0; round < 25; round += 1) {
    const shuffled = [...tree];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const swap = shuffled[i] as TreeNodeInput;
      shuffled[i] = shuffled[j] as TreeNodeInput;
      shuffled[j] = swap;
    }
    expect(shrinkTree(shuffled)).toEqual(reference);
  }
});

test('orphans and cycles throw; multiple roots are allowed', () => {
  expect(() =>
    shrinkTree([
      { id: 'a', parentId: null, y: 1, n: 10 },
      { id: 'b', parentId: 'ghost', y: 1, n: 10 },
    ]),
  ).toThrow(ShrinkTreeError);
  try {
    shrinkTree([
      { id: 'a', parentId: null, y: 1, n: 10 },
      { id: 'b', parentId: 'ghost', y: 1, n: 10 },
    ]);
    throw new Error('unreachable');
  } catch (error) {
    expect(error).toBeInstanceOf(ShrinkTreeError);
    expect((error as ShrinkTreeError).code).toBe('missing_parent');
    expect((error as ShrinkTreeError).ids).toEqual(['b']);
    expect((error as ShrinkTreeError).message).toContain('ghost');
  }

  expect(() =>
    shrinkTree([
      { id: 'root', parentId: null, y: 1, n: 10 },
      { id: 'x', parentId: 'y', y: 1, n: 10 },
      { id: 'y', parentId: 'x', y: 1, n: 10 },
    ]),
  ).toThrow(ShrinkTreeError);
  try {
    shrinkTree([
      { id: 'root', parentId: null, y: 1, n: 10 },
      { id: 'x', parentId: 'y', y: 1, n: 10 },
      { id: 'y', parentId: 'x', y: 1, n: 10 },
    ]);
    throw new Error('unreachable');
  } catch (error) {
    expect((error as ShrinkTreeError).code).toBe('cycle');
    expect((error as ShrinkTreeError).ids).toEqual(['x', 'y']);
  }

  expect(() =>
    shrinkTree([
      { id: 'a', parentId: null, y: 1, n: 10 },
      { id: 'a', parentId: null, y: 1, n: 10 },
    ]),
  ).toThrow(ShrinkTreeError);

  // Multiple roots: legal, and each is pooled through the virtual super-root.
  const forest = shrinkTree([
    { id: 'r1', parentId: null, y: 40, n: 1000 },
    { id: 'r2', parentId: null, y: 10, n: 1000 },
    { id: 'r3', parentId: null, y: 70, n: 1000 },
    { id: 'r4', parentId: null, y: 25, n: 1000 },
  ]);
  expect(forest.map((row) => row.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  for (const row of forest) {
    expect(row.depth).toBe(0);
    expect(row.parentId).toBeNull();
    expectFinite(row);
  }
  // Pooling actually happened: r2 (0.01) is pulled up toward the 0.03625 pool.
  const r2 = forest.find((row) => row.id === 'r2') as ShrunkNode;
  expect(r2.estimate).toBeGreaterThan(0.01);
  expect(r2.estimate).toBeLessThan(0.03625);
});

test('raising maxM never raises any lambda', () => {
  const tree: TreeNodeInput[] = [{ id: 'root', parentId: null, y: 0, n: 0 }];
  for (let i = 0; i < 6; i += 1) {
    tree.push({ id: `c${i}`, parentId: 'root', y: 8 + i * 14, n: 1200 });
    tree.push({ id: `c${i}x`, parentId: `c${i}`, y: 3 + i * 5, n: 400 });
    tree.push({ id: `c${i}y`, parentId: `c${i}`, y: 4 + i * 6, n: 400 });
  }

  let previous: Map<string, ShrunkNode> | null = null;
  for (const maxM of [50, 100, 500, 2000, 10000, 50000]) {
    const current = byId(shrinkTree(tree, { maxM }));
    if (previous !== null) {
      for (const [id, row] of current) {
        const before = previous.get(id) as ShrunkNode;
        expect(row.lambda).toBeLessThanOrEqual(before.lambda + 1e-12);
        expect(row.effectiveM).toBeGreaterThanOrEqual(before.effectiveM - 1e-12);
      }
    }
    previous = current;
  }
});

// --- 15. seeded property sweep ----------------------------------------------

test('10,000 seeded random trees keep every invariant', () => {
  const rand = lcg(0x5eed1234);
  const pick = (max: number) => Math.floor(rand() * max);

  for (let trial = 0; trial < 10_000; trial += 1) {
    const size = 3 + pick(18);
    const nodes: TreeNodeInput[] = [];
    for (let i = 0; i < size; i += 1) {
      // 15% chance of an extra root; otherwise attach to an earlier node, which
      // makes cycles structurally impossible.
      const parentId = i === 0 || rand() < 0.15 ? null : (nodes[pick(i)] as TreeNodeInput).id;
      const roll = rand();
      const n = roll < 0.15 ? 0 : pick(5000);
      const shape = rand();
      const y = n === 0 ? 0 : shape < 0.1 ? 0 : shape > 0.95 ? n : pick(n + 1);
      nodes.push({ id: `n${i}`, parentId, y, n });
    }

    const z = 0.5 + rand() * 3;
    const rows = shrinkTree(nodes, {
      maxM: 10 + pick(10_000),
      minM: 1 + pick(5),
      minChildrenForMom: 2 + pick(5),
      z,
    });

    expect(rows.length).toBe(size);
    for (const row of rows) {
      if (!Number.isFinite(row.estimate) || !Number.isFinite(row.se)) {
        throw new Error(`trial ${trial}: non-finite output on ${row.id}`);
      }
      expect(row.lcb).toBe(row.interval[0]);
      expect(row.interval[0]).toBeGreaterThanOrEqual(0);
      expect(row.interval[1]).toBeLessThanOrEqual(1);
      expect(row.interval[0]).toBeLessThanOrEqual(row.estimate);
      expect(row.estimate).toBeLessThanOrEqual(row.interval[1]);
      expect(row.lambda).toBeGreaterThanOrEqual(0);
      expect(row.lambda).toBeLessThanOrEqual(1);
      expect(row.se).toBeGreaterThanOrEqual(0);
    }
  }
});

// --- 16. `dominated_by_child`, which the flag union promised ------------------

test('a parent whose trials are one child is flagged dominated_by_child', () => {
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'whale', parentId: 'root', y: 3000, n: 100_000 },
    { id: 'minnow1', parentId: 'root', y: 4, n: 100 },
    { id: 'minnow2', parentId: 'root', y: 1, n: 100 },
    { id: 'minnow3', parentId: 'root', y: 9, n: 100 },
  ];

  const rows = byId(shrinkTree(tree));
  // 100k / 100.3k = 99.7% of the cohort's trials — the "cohort mean" IS `whale`.
  expect(rows.get('root')?.flags).toContain('dominated_by_child');

  const balanced = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'a', parentId: 'root', y: 30, n: 1000 },
      { id: 'b', parentId: 'root', y: 45, n: 1200 },
      { id: 'c', parentId: 'root', y: 22, n: 900 },
      { id: 'd', parentId: 'root', y: 60, n: 1500 },
    ]),
  );
  expect(balanced.get('root')?.flags).not.toContain('dominated_by_child');
});

// --- 17. rootPrior is validated like every other numeric option ---------------

test('a non-finite rootPrior throws instead of silently inverting the tree', () => {
  // The regression this pins is NOT "NaN leaks out" — it is worse than that.
  // clamp(NaN, 0, 1) is NaN (both comparisons are false), and NaN takes neither
  // branch of priorMeanFrom, so it used to return 1 − epsilon: a 3%-converting
  // account came back as a ~70-84% one, finite, in range, and past every
  // downstream sanity check including this suite's own expectFinite.
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'a', parentId: 'root', y: 30, n: 1000 },
    { id: 'fresh', parentId: 'root', y: 0, n: 0 },
  ];

  for (const bad of [
    { y: Number.NaN, n: 100 }, // a NULL SUM(conversions) upstream
    { y: Number.POSITIVE_INFINITY, n: 100 },
    { y: 3, n: Number.NaN },
    { y: 3, n: 0 }, // no evidence behind the prior at all
    { y: 3, n: -100 },
  ]) {
    expect(() => shrinkTree(tree, { rootPrior: bad })).toThrow(ShrinkTreeError);
    try {
      shrinkTree(tree, { rootPrior: bad });
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(ShrinkTreeError);
      expect((error as ShrinkTreeError).code).toBe('invalid_options');
    }
  }

  // A y outside [0, n] is CLAMPED, not rejected — same treatment node inputs get.
  const over = byId(shrinkTree(tree, { rootPrior: { y: 500, n: 100 } }));
  const under = byId(shrinkTree(tree, { rootPrior: { y: -50, n: 100 } }));
  expect((over.get('fresh') as ShrunkNode).estimate).toBeLessThanOrEqual(1);
  expect((under.get('fresh') as ShrunkNode).estimate).toBeGreaterThanOrEqual(0);

  // And a well-formed prior is still honored, so the guard cannot over-reject.
  const good = byId(shrinkTree(tree, { rootPrior: { y: 3, n: 100 } }));
  expect((good.get('a') as ShrunkNode).estimate).toBeLessThan(0.05);
});

// --- 18. dominance is a share, not an arity ----------------------------------

test('total dominance by one child is flagged, not un-flagged', () => {
  // The module's flagship scenario (header comment): a brand-new ad at n=0 next
  // to a proven one. The circularity signal has to be LOUDEST there, but an
  // `effective >= 2` guard used to switch it OFF exactly at 100% — deleting the
  // sibling's last trial made the warning disappear.
  const sweep = [
    { siblingN: 11_000, share: 0.9009 },
    { siblingN: 5_000, share: 0.9524 },
    { siblingN: 1, share: 1 },
    { siblingN: 0, share: 1 }, // total dominance: the regression case
  ];

  for (const step of sweep) {
    const rows = byId(
      shrinkTree([
        { id: 'root', parentId: null, y: 0, n: 0 },
        { id: 'whale', parentId: 'root', y: 3000, n: 100_000 },
        { id: 'z1', parentId: 'root', y: 0, n: step.siblingN },
        { id: 'z2', parentId: 'root', y: 0, n: 0 },
        { id: 'z3', parentId: 'root', y: 0, n: 0 },
      ]),
    );
    const root = rows.get('root') as ShrunkNode;
    expect(100_000 / (100_000 + step.siblingN)).toBeCloseTo(step.share, 4);
    // Monotone in share: once flagged, more dominance never un-flags it.
    expect(root.flags).toContain('dominated_by_child');
    // `single_child` cannot stand in — the zero-trial siblings keep
    // children.length at 4, which is why the gap was silent.
    expect(root.flags).not.toContain('single_child');
  }

  // The parent's mean IS the whale's own rate, which is the whole point.
  const total = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'whale', parentId: 'root', y: 3000, n: 100_000 },
      { id: 'z1', parentId: 'root', y: 0, n: 0 },
    ]),
  );
  expect((total.get('root') as ShrunkNode).estimate).toBeCloseTo(0.03, 12);
  expect((total.get('root') as ShrunkNode).flags).toContain('dominated_by_child');

  // Below the threshold it stays off: 1500 / 4600 = 0.326.
  const spread = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'a', parentId: 'root', y: 30, n: 1000 },
      { id: 'b', parentId: 'root', y: 45, n: 1200 },
      { id: 'c', parentId: 'root', y: 22, n: 900 },
      { id: 'd', parentId: 'root', y: 60, n: 1500 },
    ]),
  );
  expect((spread.get('root') as ShrunkNode).flags).not.toContain('dominated_by_child');
});

// --- 19. `no_data` means one thing ------------------------------------------

test('a parent with data whose children have none is not labelled no_data', () => {
  // `no_data` is self-scoped ("this row has no trials"); the children-scoped
  // meaning lives on its own flag. They used to collide on the same field, so a
  // consumer keeping rows with usable evidence dropped the row with the MOST.
  const rows = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 50, n: 1000 },
      { id: 'a', parentId: 'root', y: 0, n: 0 },
      { id: 'b', parentId: 'root', y: 0, n: 0 },
    ]),
  );

  const root = rows.get('root') as ShrunkNode;
  expect(root.n).toBe(1000);
  expect(root.raw).toBe(0.05);
  expect(root.flags).toContain('children_no_data');
  expect(root.flags).not.toContain('no_data');

  // The children are the ones that genuinely have nothing.
  for (const id of ['a', 'b']) {
    const child = rows.get(id) as ShrunkNode;
    expect(child.n).toBe(0);
    expect(child.flags).toContain('no_data');
    expect(child.flags).not.toContain('children_no_data');
  }

  // The consumer contract the collision broke.
  const withEvidence = [...rows.values()].filter((row) => !row.flags.includes('no_data'));
  expect(withEvidence.map((row) => row.id)).toEqual(['root']);

  // A deep parent is covered too: `p` holds 5000 trials, more than any sibling.
  const deep = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'p', parentId: 'root', y: 250, n: 5000 },
      { id: 'q', parentId: 'root', y: 100, n: 4000 },
      { id: 'r', parentId: 'root', y: 180, n: 4000 },
      { id: 's', parentId: 'root', y: 220, n: 4000 },
      { id: 'p1', parentId: 'p', y: 0, n: 0 },
      { id: 'p2', parentId: 'p', y: 0, n: 0 },
    ]),
  );
  expect((deep.get('p') as ShrunkNode).n).toBe(5000);
  expect((deep.get('p') as ShrunkNode).flags).not.toContain('no_data');
  expect((deep.get('p') as ShrunkNode).flags).toContain('children_no_data');
});

// --- 20. tau² uses the effective degrees of freedom --------------------------

test('M̂ is solved on effective d.o.f., not Σn — no systematic over-shrinkage', () => {
  // Dividing the (already noise-corrected) numerator by Σn_j instead of the
  // effective d.o.f. biases tau² LOW by (N − Σn²/N − (J−1))/N, so M̂ comes back
  // HIGH and every node is over-shrunk. Both fixtures are hand-computable.

  // Equal n: N = 4000, Σn²/N = 1000, J−1 = 3 -> df = 2997.
  //   mu = 0.05, spread = 0.0475, Q = 1.0, numerator = 1.0 − 3(0.0475) = 0.8575
  //   tau² = 0.8575 / 2997         -> M̂ = 0.0475/tau² − 1 = 165.0146
  //   (the Σn denominator gives tau² = 0.8575/4000 -> M̂ = 220.574, 34% high)
  const equal = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'c0', parentId: 'root', y: 30, n: 1000 },
      { id: 'c1', parentId: 'root', y: 40, n: 1000 },
      { id: 'c2', parentId: 'root', y: 60, n: 1000 },
      { id: 'c3', parentId: 'root', y: 70, n: 1000 },
    ]),
  );
  const c0 = equal.get('c0') as ShrunkNode;
  expect(c0.effectiveM).toBeCloseTo(165.0146, 3);
  expect(c0.lambda).toBeCloseTo(1000 / (1000 + c0.effectiveM), 12);
  expect(c0.estimate).toBeCloseTo(0.032833, 6);
  // Under the Σn denominator this was M̂ = 220.574 / estimate 0.033614.
  expect(c0.effectiveM).toBeLessThan(200);

  // Unequal n separates the df denominator from BOTH plausible wrong answers —
  // it pins the Σn²/N term, which an equal-n fixture alone cannot distinguish
  // from a hardcoded (J−1)(n−1):
  //   df   = 5000 − 7.5e6/5000 − 3 = 3497 -> M̂ = 221.7768   (correct)
  //   Σn   = 5000                         -> M̂ = 317.5256   (the bug)
  //   (J−1)(n̄−1) = 3·1249                 -> M̂ = 237.7031   (equal-n shortcut)
  const unequal = byId(
    shrinkTree([
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'c0', parentId: 'root', y: 15, n: 500 },
      { id: 'c1', parentId: 'root', y: 40, n: 1000 },
      { id: 'c2', parentId: 'root', y: 90, n: 1500 },
      { id: 'c3', parentId: 'root', y: 140, n: 2000 },
    ]),
  );
  const u0 = unequal.get('c0') as ShrunkNode;
  expect(u0.effectiveM).toBeCloseTo(221.7768, 3);
  expect(u0.effectiveM).toBeLessThan(237.7031); // excludes the equal-n shortcut
  expect(u0.effectiveM).toBeLessThan(317.5256); // excludes the Σn denominator

  // Less prior strength is strictly less shrinkage: every child keeps more of
  // its own rate than the biased estimator allowed it to. c0 is the thinnest
  // child (n=500), so it moves the most: 0.6927 here vs 0.6116 under the bug.
  expect(u0.lambda).toBeCloseTo(500 / (500 + u0.effectiveM), 12);
  for (const id of ['c0', 'c1', 'c2', 'c3']) {
    const row = unequal.get(id) as ShrunkNode;
    expect(row.lambda).toBeGreaterThan(row.n / (row.n + 317.5256));
    expectFinite(row);
  }
});

test('a single data-bearing child leaves no d.o.f. and pools totally', () => {
  // df = n − n²/n − 0 = 0. There is no way to separate real spread from
  // binomial noise off one child, so total pooling is the honest answer, not
  // whatever number a zero denominator would have produced.
  const rows = byId(
    shrinkTree(
      [
        { id: 'root', parentId: null, y: 0, n: 0 },
        { id: 'only', parentId: 'root', y: 30, n: 1000 },
        { id: 'empty', parentId: 'root', y: 0, n: 0 },
      ],
      { minChildrenForMom: 1 },
    ),
  );
  const root = rows.get('root') as ShrunkNode;
  expect(root.flags).toContain('m_clamped_high');
  expect((rows.get('only') as ShrunkNode).effectiveM).toBe(5000);
  for (const row of rows.values()) expectFinite(row);
});

// --- 21. the last unexercised flag: m_clamped_low ----------------------------

test('violently disagreeing children clamp M̂ at minM', () => {
  // Bimodal children: half never convert, half always do. tau² is enormous, so
  // M̂ = mu(1−mu)/tau² − 1 lands below minM and the prior is worth ~nothing.
  const tree: TreeNodeInput[] = [
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'a', parentId: 'root', y: 0, n: 1000 },
    { id: 'b', parentId: 'root', y: 1000, n: 1000 },
    { id: 'c', parentId: 'root', y: 0, n: 1000 },
    { id: 'd', parentId: 'root', y: 1000, n: 1000 },
  ];

  const rows = byId(shrinkTree(tree));
  expect((rows.get('root') as ShrunkNode).flags).toContain('m_clamped_low');
  for (const id of ['a', 'b', 'c', 'd']) {
    const leaf = rows.get(id) as ShrunkNode;
    expect(leaf.effectiveM).toBe(1); // the default minM, not maxM
    expect(leaf.lambda).toBeGreaterThan(0.99); // own data decides
    expectFinite(leaf);
  }
  // a = 0 + 1·0.5 over a total of n + M = 1001, and b is its mirror.
  expect((rows.get('a') as ShrunkNode).estimate).toBeCloseTo(0.5 / 1001, 12);
  expect((rows.get('b') as ShrunkNode).estimate).toBeCloseTo(1 - 0.5 / 1001, 12);

  // The clamp is the passed minM, not a constant: raise it and M̂ follows.
  const raised = byId(shrinkTree(tree, { minM: 400 }));
  expect((raised.get('root') as ShrunkNode).flags).toContain('m_clamped_low');
  expect((raised.get('a') as ShrunkNode).effectiveM).toBe(400);
  expect((raised.get('a') as ShrunkNode).lambda).toBeCloseTo(1000 / 1400, 12);
});

// --- 22. the prior's continuity correction is sized by the PRIOR's evidence --

test('a degenerate rootPrior is corrected by its own n, not the tree size', () => {
  // 1000 measured impressions, zero conversions. The correction has to be
  // 1/(2·1001), not the empty-tree floor — the point estimate was ~500x too
  // small and the interval ~35x too narrow, i.e. near-certainty about a rate
  // there are 1000 trials of evidence for.
  const rows = shrinkTree(
    [
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'a', parentId: 'root', y: 0, n: 0 },
      { id: 'b', parentId: 'root', y: 0, n: 0 },
    ],
    { rootPrior: { y: 0, n: 1000 } },
  );

  const expected = 1 / (2 * 1001);
  for (const row of rows) {
    expect(row.estimate).toBeCloseTo(expected, 12);
    expectFinite(row);
  }

  // It must NOT be byte-identical to passing no prior at all — that equality
  // was the tell that prior.n was being ignored.
  const noPrior = shrinkTree([
    { id: 'root', parentId: null, y: 0, n: 0 },
    { id: 'a', parentId: 'root', y: 0, n: 0 },
    { id: 'b', parentId: 'root', y: 0, n: 0 },
  ]);
  expect((noPrior[0] as ShrunkNode).estimate).toBeLessThan((rows[0] as ShrunkNode).estimate / 100);

  // Mirror image at the top: 1000 for 1000 corrects down from exactly 1.
  const always = shrinkTree(
    [
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'a', parentId: 'root', y: 0, n: 0 },
    ],
    { rootPrior: { y: 1000, n: 1000 } },
  );
  for (const row of always) expect(row.estimate).toBeCloseTo(1 - expected, 12);

  // An interior prior is untouched by the correction, degenerate or not.
  const interior = shrinkTree(
    [
      { id: 'root', parentId: null, y: 0, n: 0 },
      { id: 'a', parentId: 'root', y: 0, n: 0 },
    ],
    { rootPrior: { y: 3, n: 100 } },
  );
  for (const row of interior) expect(row.estimate).toBe(0.03);
});
