import { describe, expect, test } from 'bun:test';
import {
  createForgeRenderSetRequestSchema,
  forgeRenderSetRowsSchema,
  forgeRenderSetSchema,
  resolveForgeRenderSetRows,
  updateForgeRenderSetRequestSchema,
} from './forge-render-sets';

const rootId = '00000000-0000-4000-8000-000000000001';
const childId = '00000000-0000-4000-8000-000000000002';

describe('Forge render-set tree', () => {
  test('inherits, explicitly clears, overrides, and reports ancestry', () => {
    const resolved = resolveForgeRenderSetRows([
      {
        id: rootId,
        parentId: null,
        label: 'Root',
        overrides: { headline: 'Root', price: 10 },
        clearedKeys: [],
        outputIds: ['square', 'story'],
      },
      {
        id: childId,
        parentId: rootId,
        label: 'Child',
        overrides: { headline: 'Child' },
        clearedKeys: ['price'],
        outputIds: [],
      },
    ]);

    expect(resolved[1]).toEqual({
      id: childId,
      rootRowId: rootId,
      parentRowId: rootId,
      path: [rootId, childId],
      variables: { headline: 'Child' },
      outputIds: ['square', 'story'],
    });
  });

  test('rejects orphaned and over-deep trees', () => {
    expect(() =>
      resolveForgeRenderSetRows([
        {
          id: rootId,
          parentId: null,
          label: 'Root',
          overrides: {},
          clearedKeys: [],
          outputIds: [],
        },
        {
          id: childId,
          parentId: '00000000-0000-4000-8000-000000000099',
          label: 'Lost',
          overrides: {},
          clearedKeys: [],
          outputIds: [],
        },
      ]),
    ).toThrow('render_set_orphan');

    const chain = Array.from({ length: 5 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      parentId: index === 0 ? null : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      label: String(index),
      overrides: {},
      clearedKeys: [],
      outputIds: [],
    }));
    expect(() => resolveForgeRenderSetRows(chain)).toThrow('render_set_depth_exceeded');
  });

  test('supports several independent root render rows', () => {
    const otherRoot = '00000000-0000-4000-8000-000000000003';
    const resolved = resolveForgeRenderSetRows([
      { id: rootId, parentId: null, label: 'A', overrides: {}, clearedKeys: [], outputIds: [] },
      { id: otherRoot, parentId: null, label: 'B', overrides: {}, clearedKeys: [], outputIds: [] },
    ]);
    expect(resolved.map((row) => row.rootRowId)).toEqual([rootId, otherRoot]);
  });

  test('a fork never inherits its parent delivery', () => {
    const grandchildId = '00000000-0000-4000-8000-000000000004';
    const replace = {
      action: 'replace' as const,
      adAccountId: 'act_1',
      campaignId: 'c1',
      adsetId: 's1',
      adId: 'ad_1',
    };
    const create = { adAccountId: 'act_1', campaignId: 'c1', adsetId: 's2' };
    const resolved = resolveForgeRenderSetRows([
      { ...row(rootId, null, 'Root'), delivery: replace },
      row(childId, rootId, 'Fork'),
      { ...row(grandchildId, childId, 'Fork of fork'), delivery: create },
    ]);
    expect(resolved[0]?.delivery).toEqual(replace);
    expect(resolved[1]).not.toHaveProperty('delivery');
    // a pre-union create target still parses, and gains its defaults
    expect(resolved[2]?.delivery).toEqual({ ...create, action: 'create', adStatus: 'PAUSED' });
  });

  test('row order is array order, round-tripped through the schema and the resolver', () => {
    const otherRoot = '00000000-0000-4000-8000-000000000003';
    // a fork saved BEFORE its parent, and a second root between them
    const rows = [row(childId, rootId, 'Fork'), row(otherRoot, null, 'B'), row(rootId, null, 'A')];
    const saved = forgeRenderSetRowsSchema.parse(JSON.parse(JSON.stringify(rows)));
    expect(saved.map((entry) => entry.id)).toEqual([childId, otherRoot, rootId]);
    expect(resolveForgeRenderSetRows(saved).map((entry) => entry.id)).toEqual([
      childId,
      otherRoot,
      rootId,
    ]);
  });
});

function row(id: string, parentId: string | null, label: string) {
  return { id, parentId, label, overrides: {}, clearedKeys: [], outputIds: [] };
}

describe('Forge render-set output settings', () => {
  const row = (over: Record<string, unknown>) => ({
    id: rootId,
    parentId: null,
    label: 'Root',
    overrides: {},
    clearedKeys: [],
    outputIds: [],
    ...over,
  });

  test('a child inherits, overrides per leaf, clears to the template, and resets by omission', () => {
    const grandchildId = '00000000-0000-4000-8000-000000000003';
    const resolved = resolveForgeRenderSetRows([
      row({
        encode: {
          default: { fps: 25, audio: { sampleRate: 48000, channels: 2 } },
          outputs: { story: { video: { crf: 18 } } },
        },
      }),
      row({
        id: childId,
        parentId: rootId,
        label: 'Child',
        encode: { default: { audio: { channels: 1 } } },
        clearedEncodeKeys: { default: ['fps'], outputs: { story: ['video.crf'] } },
      }),
      // Authors nothing: a reset child is exactly its parent.
      row({ id: grandchildId, parentId: childId, label: 'Grandchild' }),
    ]);

    expect(resolved[0]?.encode).toEqual({
      default: { fps: 25, audio: { sampleRate: 48000, channels: 2 } },
      outputs: { story: { video: { crf: 18 } } },
    });
    expect(resolved[1]?.encode).toEqual({ default: { audio: { sampleRate: 48000, channels: 1 } } });
    expect(resolved[2]?.encode).toEqual(resolved[1]?.encode);
  });

  test('rows with no settings resolve to no settings', () => {
    expect(resolveForgeRenderSetRows([row({})])[0]?.encode).toBeUndefined();
  });
});

describe('Forge render-set description', () => {
  const brandId = '00000000-0000-4000-8000-000000000020';

  test('a set from before descriptions reads as null', () => {
    const set = forgeRenderSetSchema.parse({
      id: rootId,
      brandId,
      bindingId: brandId,
      name: 'Summer',
      templateKey: '133',
      contractHash: 'hash',
      revision: 0,
      rows: [{ id: rootId, parentId: null, label: 'Root' }],
      createdAt: '2026-09-15T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    });
    expect(set.description).toBeNull();
  });

  test('an update may change only the description, and 500 characters is the ceiling', () => {
    expect(
      updateForgeRenderSetRequestSchema.safeParse({
        brandId,
        expectedRevision: 3,
        description: 'Prospecting cuts for the September push',
      }).success,
    ).toBe(true);
    expect(
      updateForgeRenderSetRequestSchema.safeParse({
        brandId,
        expectedRevision: 3,
        description: null,
      }).success,
    ).toBe(true);
    expect(
      updateForgeRenderSetRequestSchema.safeParse({ brandId, expectedRevision: 3 }).success,
    ).toBe(false);
    expect(
      updateForgeRenderSetRequestSchema.safeParse({
        brandId,
        expectedRevision: 3,
        description: 'x'.repeat(501),
      }).success,
    ).toBe(false);
    expect(
      createForgeRenderSetRequestSchema.safeParse({
        brandId,
        bindingId: brandId,
        name: 'Summer',
        templateKey: '133',
        contractHash: 'hash',
        description: 'x'.repeat(500),
        rows: [{ id: rootId, parentId: null, label: 'Root' }],
      }).success,
    ).toBe(true);
  });

  test('a contract hash moves only with rows', () => {
    const rows = [{ id: rootId, parentId: null, label: 'Root' }];
    expect(
      updateForgeRenderSetRequestSchema.safeParse({
        brandId,
        expectedRevision: 3,
        rows,
        contractHash: 'hash-2',
      }).success,
    ).toBe(true);
    expect(
      updateForgeRenderSetRequestSchema.safeParse({
        brandId,
        expectedRevision: 3,
        name: 'Renamed',
        contractHash: 'hash-2',
      }).success,
    ).toBe(false);
  });
});
