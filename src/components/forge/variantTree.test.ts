import { describe, expect, test } from 'bun:test';
import type {
  TemplateRevision,
  TemplateRevisionEdits,
  TemplateRevisionVariant,
} from '@continuum/contracts';
import { revisionChanges, variantLanes, variantTree } from './variantTree';

const TEMPLATE = '00000000-0000-4000-8000-000000000000';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NO_EDITS: TemplateRevisionEdits = { layers: [], slots: [], orders: [] };

const revision = (
  revisionId: string,
  variantId: string,
  number: number,
  parentRevisionId: string | null,
  createdAt: string,
  edits: TemplateRevisionEdits = NO_EDITS,
): TemplateRevision =>
  ({
    templateId: TEMPLATE,
    variantId,
    id: revisionId,
    number,
    parentRevisionId,
    sourceAssetId: revisionId,
    sourceVersionId: revisionId,
    checksum: 'a'.repeat(64),
    edits,
    publications: [],
    createdAt,
    createdBy: null,
    nativeCommitId: null,
    dependencies: null,
  }) as unknown as TemplateRevision;

const variant = (
  variantId: string,
  name: string,
  revisions: TemplateRevision[],
  over: Partial<TemplateRevisionVariant> = {},
): TemplateRevisionVariant => ({
  templateId: TEMPLATE,
  variantId,
  name,
  original: false,
  parentRevisionId: revisions[0]?.parentRevisionId ?? null,
  draftHeadRevisionId: revisions.at(-1)!.id,
  publishedHeadRevisionId: null,
  archivedAt: null,
  tags: [],
  sourceKind: 'after_effects',
  revisions,
  ...over,
});

const layer = (layerId: number, change: Record<string, unknown>) => ({
  compId: 1,
  layerId,
  ...change,
});

// Original r1 → r2. "Logo hidden" branched from r1 (now behind); "Tall CTA" branched from
// Logo hidden (a grandchild); "Fresh" branched from r2 (current).
const ORIGINAL = variant(
  id(1),
  'Original',
  [
    revision(id(11), id(1), 1, null, '2026-10-01T00:00:00Z'),
    revision(id(12), id(1), 2, id(11), '2026-10-05T00:00:00Z'),
  ],
  { original: true, parentRevisionId: null, publishedHeadRevisionId: id(12) },
);
const LOGO = variant(id(2), 'Logo hidden', [
  revision(id(21), id(2), 1, id(11), '2026-10-02T00:00:00Z', {
    ...NO_EDITS,
    layers: [layer(5, { visible: false }), layer(6, { visible: false })],
  }),
]);
const TALL = variant(id(3), 'Tall CTA', [
  revision(id(31), id(3), 1, id(21), '2026-10-03T00:00:00Z', {
    ...NO_EDITS,
    // Cumulative: the parent's two hidden layers, plus one moved and one retyped.
    layers: [
      layer(5, { visible: false }),
      layer(6, { visible: false }),
      layer(7, { y: 400 }),
      layer(8, { text: 'Shop now' }),
    ],
  }),
]);
const FRESH = variant(
  id(4),
  'Fresh',
  [revision(id(41), id(4), 1, id(12), '2026-10-06T00:00:00Z')],
  { archivedAt: '2026-10-07T00:00:00Z' },
);

describe('variantTree', () => {
  test('nests a grandchild under its parent, Original first, children in the order they were made', () => {
    const tree = variantTree([TALL, FRESH, LOGO, ORIGINAL]);
    expect(tree.map((node) => node.variant.name)).toEqual(['Original']);
    const [original] = tree;
    expect(original!.children.map((node) => node.variant.name)).toEqual(['Logo hidden', 'Fresh']);
    const logo = original!.children[0]!;
    expect(logo.children.map((node) => [node.variant.name, node.depth])).toEqual([['Tall CTA', 2]]);
    expect(logo.children[0]!.from?.variant.name).toBe('Logo hidden');
    expect(logo.children[0]!.from?.revision.number).toBe(1);
  });

  test('names what a branch changed against where it branched from, not the cumulative edits', () => {
    const [original] = variantTree([ORIGINAL, LOGO, TALL]);
    const logo = original!.children[0]!;
    expect(logo.changes).toEqual(['hid 2']);
    expect(logo.children[0]!.changes).toEqual(['moved 1', 'text 1']);
  });

  test('flags a branch whose Original revision is no longer the head, and its descendants', () => {
    const [original] = variantTree([ORIGINAL, LOGO, TALL, FRESH]);
    expect(original!.behindOriginal).toBe(false);
    const [logo, fresh] = original!.children;
    expect(logo!.behindOriginal).toBe(true);
    expect(logo!.children[0]!.behindOriginal).toBe(true);
    expect(fresh!.behindOriginal).toBe(false);
  });

  test('a variant whose parent is not in the list stands at the root rather than disappearing', () => {
    const tree = variantTree([ORIGINAL, TALL]);
    expect(tree.map((node) => [node.variant.name, node.depth, node.from])).toEqual([
      ['Original', 0, null],
      ['Tall CTA', 0, null],
    ]);
  });
});

describe('revisionChanges', () => {
  test('counts each kind of change once per layer', () => {
    expect(
      revisionChanges(NO_EDITS, {
        ...NO_EDITS,
        layers: [layer(1, { visible: true, x: 4 }), layer(2, { opacity: 50, font: 'Gotham' })],
        orders: [{ compId: 1, layerIds: [2, 1] }],
        slots: [{ slotKey: 'headline', exposed: false } as never],
        recolor: { palette: ['#ff0000'] },
      }),
    ).toEqual(['showed 1', 'moved 2', 'text 1', 're-stacked', 'fields 1', 'recolored']);
  });

  test('a revision that changed nothing says nothing', () => {
    expect(revisionChanges(LOGO.revisions[0]!.edits, LOGO.revisions[0]!.edits)).toEqual([]);
  });
});

describe('variantLanes', () => {
  test('one lane per variant in tree order, newest revision on top, each revision joined to its parent', () => {
    const lanes = variantLanes([TALL, LOGO, ORIGINAL]);
    expect(lanes.lanes.map((lane) => lane.variant.name)).toEqual([
      'Original',
      'Logo hidden',
      'Tall CTA',
    ]);
    expect(lanes.dots.map((dot) => [dot.revision.id, dot.lane, dot.row])).toEqual([
      [id(12), 0, 0],
      [id(31), 2, 1],
      [id(21), 1, 2],
      [id(11), 0, 3],
    ]);
    expect(lanes.edges).toEqual([
      { from: { lane: 0, row: 0 }, to: { lane: 0, row: 3 } },
      { from: { lane: 2, row: 1 }, to: { lane: 1, row: 2 } },
      { from: { lane: 1, row: 2 }, to: { lane: 0, row: 3 } },
    ]);
  });
});
