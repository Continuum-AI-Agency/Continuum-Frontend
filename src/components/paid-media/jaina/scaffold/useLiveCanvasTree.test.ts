import { describe, expect, it } from 'bun:test';
import type { PaidScaffoldDraftNode } from '@continuum/contracts';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { draftRowsOf } from './useLiveCanvasTree';

const draft = (over: Partial<PaidScaffoldDraftNode>): PaidScaffoldDraftNode =>
  ({
    path_key: 'c0',
    parent_path_key: null,
    level: 'campaign',
    ordinal: 0,
    name: 'Campaign',
    product_key: null,
    angle_key: null,
    concept_key: null,
    objective: null,
    optimization_goal: null,
    funnel_stage: null,
    audience_group_version_id: null,
    daily_budget_minor_units: null,
    creative: null,
    ...over,
  }) as PaidScaffoldDraftNode;

const savedAd = {
  id: 'row-ad',
  pathKey: 'c0/a0/ad0',
  status: 'created',
  metaObjectId: 'ad_1',
  payload: { headline: 'Kept' },
} as unknown as PaidScaffoldNodeRow;

describe('draftRowsOf', () => {
  it('draws an attached creative from the draft and keeps the saved row by path_key', () => {
    const [ad] = draftRowsOf(
      [
        draft({
          path_key: 'c0/a0/ad0',
          parent_path_key: 'c0/a0',
          level: 'ad',
          name: 'Ad 1 renamed',
          creative: {
            format: 'image',
            cards: [{ asset_id: 'asset-1', headline: null, link: null }],
          },
        }),
      ],
      { sourceRows: { 'row-ad': savedAd } },
    );
    expect(ad).toMatchObject({
      id: 'c0/a0/ad0',
      parentId: 'c0/a0',
      name: 'Ad 1 renamed',
      status: 'created',
      metaObjectId: 'ad_1',
      payload: { headline: 'Kept' },
      creativeAssetId: 'asset-1',
      creativeMedia: { kind: 'image', asset_id: 'asset-1' },
    });
  });

  it('reads a node the canvas added as not built yet', () => {
    const [node] = draftRowsOf([draft({ path_key: 'c0/a1' })], { sourceRows: {} });
    expect(node?.status).toBe('pending');
    expect(node?.metaObjectId).toBeNull();
  });
});
