import type {
  TemplateRevision,
  TemplateRevisionEdits,
  TemplateRevisionVariant,
} from '@continuum/contracts';

/**
 * A template's family as the registry records it: every variant hangs off the revision it was
 * branched from, so a variant of a variant is a grandchild. Pure, from one `revision-variants`
 * read — the registry already carries every parent pointer this needs.
 */
export type VariantNode = {
  variant: TemplateRevisionVariant;
  depth: number;
  children: VariantNode[];
  /** The revision this variant branched from, and the variant holding it. Null at a root. */
  from: { variant: TemplateRevisionVariant; revision: TemplateRevision } | null;
  /** What it changed against where it branched from, e.g. `['hid 2', 'moved 1']`. */
  changes: string[];
  /** Branched from an Original revision that is no longer the Original's head. */
  behindOriginal: boolean;
};

type Located = { variant: TemplateRevisionVariant; revision: TemplateRevision };

const GEOMETRY = ['x', 'y', 'width', 'height', 'rotation', 'scale', 'opacity'] as const;
const TYPE = ['text', 'font', 'fontSize'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const firstRevision = (variant: TemplateRevisionVariant) =>
  variant.revisions.reduce<TemplateRevision | undefined>(
    (first, revision) => (!first || revision.number < first.number ? revision : first),
    undefined,
  );

/**
 * What `after` changed against `before`. Saved edits are cumulative (a revision carries its
 * parent's edits plus its own), so this is the step between two revisions, not their totals.
 */
export function revisionChanges(
  before: TemplateRevisionEdits | null,
  after: TemplateRevisionEdits,
): string[] {
  const prior = new Map((before?.layers ?? []).map((l) => [`${l.compId}:${l.layerId}`, l]));
  const counts = { hid: 0, showed: 0, moved: 0, text: 0 };
  for (const layer of after.layers) {
    const was = prior.get(`${layer.compId}:${layer.layerId}`);
    if (layer.visible !== undefined && layer.visible !== was?.visible)
      counts[layer.visible ? 'showed' : 'hid'] += 1;
    if (GEOMETRY.some((key) => !same(layer[key], was?.[key]))) counts.moved += 1;
    if (TYPE.some((key) => !same(layer[key], was?.[key]))) counts.text += 1;
  }
  const orders = new Map((before?.orders ?? []).map((o) => [o.compId, o.layerIds]));
  const slots = new Map((before?.slots ?? []).map((s) => [s.slotKey, s]));
  const restacked = after.orders.filter((o) => !same(o.layerIds, orders.get(o.compId))).length;
  const fields = after.slots.filter((s) => !same(s, slots.get(s.slotKey))).length;
  return [
    ...Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([kind, n]) => `${kind} ${n}`),
    ...(restacked ? [restacked > 1 ? `re-stacked ${restacked}` : 're-stacked'] : []),
    ...(fields ? [`fields ${fields}`] : []),
    ...(!same(after.arrangement, before?.arrangement) ? ['arrangement'] : []),
    ...(!same(after.recolor, before?.recolor) ? ['recolored'] : []),
  ];
}

export function variantTree(variants: TemplateRevisionVariant[]): VariantNode[] {
  const located = new Map<string, Located>();
  for (const variant of variants)
    for (const revision of variant.revisions) located.set(revision.id, { variant, revision });
  const original = variants.find((variant) => variant.original);
  const originalHead = original?.revisions.find(
    (revision) =>
      revision.id === (original.publishedHeadRevisionId ?? original.draftHeadRevisionId),
  );
  const parentOf = (variant: TemplateRevisionVariant) =>
    variant.parentRevisionId ? located.get(variant.parentRevisionId) : undefined;

  // Walk up to the Original revision this line started from; a cycle cannot form in the
  // registry, but the bound keeps a bad row from hanging the page.
  const behind = (variant: TemplateRevisionVariant) => {
    let at = parentOf(variant);
    for (let hops = 0; at && !at.variant.original && hops < 64; hops += 1)
      at = parentOf(at.variant);
    return Boolean(at && originalHead && at.revision.number < originalHead.number);
  };

  const children = new Map<string | null, TemplateRevisionVariant[]>();
  for (const variant of variants) {
    const parent = variant.original ? undefined : parentOf(variant);
    const key = parent && parent.variant !== variant ? parent.variant.variantId : null;
    children.set(key, [...(children.get(key) ?? []), variant]);
  }
  const made = (variant: TemplateRevisionVariant) => firstRevision(variant)?.createdAt ?? '';
  const order = (list: TemplateRevisionVariant[]) =>
    [...list].sort(
      (a, b) => Number(b.original) - Number(a.original) || made(a).localeCompare(made(b)),
    );

  const build = (variant: TemplateRevisionVariant, depth: number): VariantNode => {
    const from = variant.original ? null : (parentOf(variant) ?? null);
    const first = firstRevision(variant);
    return {
      variant,
      depth,
      from,
      changes: from && first ? revisionChanges(from.revision.edits, first.edits) : [],
      behindOriginal: !variant.original && behind(variant),
      children: order(children.get(variant.variantId) ?? []).map((child) =>
        build(child, depth + 1),
      ),
    };
  };
  return order(children.get(null) ?? []).map((variant) => build(variant, 0));
}

export type LanePoint = { lane: number; row: number };

/**
 * The family as `git log --graph` draws it: one lane per variant in tree order, one dot per
 * revision with the newest on top, and a line from every revision to the one it was saved from
 * — inside its lane for a revision, across lanes where a variant branched.
 */
export function variantLanes(variants: TemplateRevisionVariant[]) {
  const lanes: Array<{ variant: TemplateRevisionVariant; depth: number }> = [];
  const visit = (node: VariantNode) => {
    lanes.push({ variant: node.variant, depth: node.depth });
    node.children.forEach(visit);
  };
  variantTree(variants).forEach(visit);
  const laneOf = new Map(lanes.map((lane, index) => [lane.variant.variantId, index]));
  const dots = lanes
    .flatMap(({ variant }) => variant.revisions)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number)
    .map((revision, row) => ({ revision, lane: laneOf.get(revision.variantId)!, row }));
  const at = new Map(dots.map((dot) => [dot.revision.id, { lane: dot.lane, row: dot.row }]));
  const edges = dots.flatMap((dot) => {
    const parent = dot.revision.parentRevisionId
      ? at.get(dot.revision.parentRevisionId)
      : undefined;
    return parent ? [{ from: { lane: dot.lane, row: dot.row }, to: parent }] : [];
  });
  return { lanes, dots, edges };
}
