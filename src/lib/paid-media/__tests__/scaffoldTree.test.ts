/**
 * The precedence rule is the reason this file exists. A live progress frame may
 * advance a row ahead of the database, but a stale query result must never drag one
 * backwards — that invariant is what makes a 30s staleTime safe next to a live
 * stream, and it is invisible from reading either side alone.
 */

import { describe, expect, it } from 'bun:test';
import type { JainaScaffoldNodeProgress } from '@/lib/jaina/stream';
import {
  buildScaffoldTree,
  effectiveScaffoldStatus,
  type PaidScaffoldNodeRow,
} from '../scaffoldTree';

const row = (overrides: Partial<PaidScaffoldNodeRow>): PaidScaffoldNodeRow => ({
  id: 'n1',
  parentId: null,
  level: 'adset',
  ordinal: 1,
  pathKey: 'c0/a1',
  name: 'Ad set 1',
  productKey: 'p1',
  angleKey: 'value',
  conceptKey: null,
  payload: {},
  status: 'pending',
  metaObjectId: null,
  metaCreativeId: null,
  errorMessage: null,
  attempt: 0,
  ...overrides,
});

const progress = (status: JainaScaffoldNodeProgress['status']): JainaScaffoldNodeProgress => ({
  step: 'adset',
  status,
  entityId: null,
  message: null,
});

const smallTree = (): PaidScaffoldNodeRow[] => [
  row({
    id: 'c',
    level: 'campaign',
    ordinal: 0,
    pathKey: 'c0',
    name: 'Campaign',
    productKey: null,
    angleKey: null,
  }),
  row({ id: 'a1', parentId: 'c', ordinal: 1, pathKey: 'c0/a1', name: 'Ad set 1' }),
  row({ id: 'a2', parentId: 'c', ordinal: 2, pathKey: 'c0/a2', name: 'Ad set 2' }),
  row({
    id: 'ad1',
    parentId: 'a1',
    level: 'ad',
    ordinal: 1,
    pathKey: 'c0/a1/ad1',
    name: 'Ad 1',
    conceptKey: 'hook-a',
  }),
  row({
    id: 'ad2',
    parentId: 'a1',
    level: 'ad',
    ordinal: 2,
    pathKey: 'c0/a1/ad2',
    name: 'Ad 2',
    conceptKey: 'hook-b',
  }),
];

describe('effectiveScaffoldStatus', () => {
  it('advances a pending row when a frame says the node succeeded', () => {
    expect(effectiveScaffoldStatus('pending', progress('succeeded'))).toBe('created');
  });

  it('advances a pending row to creating while a node is in flight', () => {
    expect(effectiveScaffoldStatus('pending', progress('started'))).toBe('creating');
  });

  it('NEVER walks a created row back to creating on a late started frame', () => {
    expect(effectiveScaffoldStatus('created', progress('started'))).toBe('created');
  });

  it('never downgrades an active row', () => {
    expect(effectiveScaffoldStatus('active', progress('succeeded'))).toBe('active');
  });

  it('surfaces a failure the database has not recorded yet', () => {
    expect(effectiveScaffoldStatus('creating', progress('failed'))).toBe('failed_retryable');
  });

  it('leaves the row alone for a skipped frame and with no frame at all', () => {
    expect(effectiveScaffoldStatus('created', progress('skipped'))).toBe('created');
    expect(effectiveScaffoldStatus('pending', undefined)).toBe('pending');
  });
});

describe('buildScaffoldTree', () => {
  it('nests ads under their ad set and keeps ordinal order', () => {
    const tree = buildScaffoldTree(smallTree());
    expect(tree.campaign?.name).toBe('Campaign');
    expect(tree.adSets.map((adSet) => adSet.pathKey)).toEqual(['c0/a1', 'c0/a2']);
    expect(tree.adSets[0].ads.map((ad) => ad.conceptKey)).toEqual(['hook-a', 'hook-b']);
    expect(tree.adSets[1].ads).toHaveLength(0);
  });

  it('counts ad sets, ads and per-status totals across every level', () => {
    const rows = smallTree().map((entry) =>
      entry.id === 'a1' ? { ...entry, status: 'created' as const } : entry,
    );
    const tree = buildScaffoldTree(rows);
    expect(tree.counts).toMatchObject({ adSets: 2, ads: 2, created: 1 });
    expect(tree.counts.pending).toBe(4);
  });

  it('applies the overlay per node without touching its siblings', () => {
    const tree = buildScaffoldTree(smallTree(), { 'c0/a1': progress('succeeded') });
    expect(tree.adSets[0].status).toBe('created');
    expect(tree.adSets[1].status).toBe('pending');
    expect(tree.counts.created).toBe(1);
  });

  it('reads genuine choices out of payload and leaves them absent when unset', () => {
    const rows = smallTree().map((entry) =>
      entry.id === 'a1'
        ? {
            ...entry,
            payload: {
              optimization_goal: 'OFFSITE_CONVERSIONS',
              funnel_stage: 'prospecting',
              placement: ['facebook_feed', 'instagram_reels'],
              billing_event: 'IMPRESSIONS',
            },
          }
        : entry,
    );
    const tree = buildScaffoldTree(rows);
    expect(tree.adSets[0].choices).toEqual({
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      funnelStage: 'prospecting',
      placement: ['facebook_feed', 'instagram_reels'],
    });
    expect(tree.adSets[0].derived.billingEvent).toBe('IMPRESSIONS');
    // D-NODE-PAYLOAD is open, so an empty payload must not throw or invent values.
    expect(tree.adSets[1].choices).toEqual({});
  });

  it('handles a 50-ad-set scaffold', () => {
    const rows: PaidScaffoldNodeRow[] = [
      row({
        id: 'c',
        level: 'campaign',
        ordinal: 0,
        pathKey: 'c0',
        name: 'C',
        productKey: null,
        angleKey: null,
      }),
    ];
    for (let index = 1; index <= 50; index += 1) {
      rows.push(row({ id: `a${index}`, parentId: 'c', ordinal: index, pathKey: `c0/a${index}` }));
      for (let ad = 1; ad <= 3; ad += 1) {
        rows.push(
          row({
            id: `a${index}-ad${ad}`,
            parentId: `a${index}`,
            level: 'ad',
            ordinal: ad,
            pathKey: `c0/a${index}/ad${ad}`,
            conceptKey: `concept-${ad}`,
          }),
        );
      }
    }
    const tree = buildScaffoldTree(rows);
    expect(tree.counts).toMatchObject({ adSets: 50, ads: 150 });
  });

  it('returns an empty tree rather than throwing when there are no rows', () => {
    const tree = buildScaffoldTree([]);
    expect(tree.campaign).toBeNull();
    expect(tree.adSets).toHaveLength(0);
    expect(tree.counts.adSets).toBe(0);
  });
});
