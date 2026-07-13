import { describe, expect, it } from 'bun:test';
import {
  type CustomField,
  customFieldSchema,
  type MediaAsset,
  type MediaReviewStatus,
  mediaAssetSchema,
} from '@continuum/contracts';
import { buildBoardLanes, decodeLaneId, encodeLaneId, UNSET_LANE_LABEL } from './boardGrouping';

function makeAsset(id: string, reviewStatus?: MediaReviewStatus): MediaAsset {
  return mediaAssetSchema.parse({
    id,
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: `brand-1/${id}/file.png`,
    fileName: 'file.png',
    mimeType: 'image/png',
    source: 'upload',
    status: 'ready',
    ...(reviewStatus ? { reviewStatus } : {}),
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  });
}

const rights: CustomField = customFieldSchema.parse({
  id: 'field-1',
  brandId: 'brand-1',
  name: 'Usage rights',
  type: 'single_select',
  options: [
    { id: 'unlimited', label: 'Unlimited' },
    { id: 'expired', label: 'Expired' },
  ],
  position: 0,
  isDefault: true,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
});

describe('lane ids', () => {
  it('round-trips a review-status lane', () => {
    const id = encodeLaneId({ kind: 'review_status', status: 'approved' });
    expect(decodeLaneId(id)).toEqual({ kind: 'review_status', status: 'approved' });
  });

  it('round-trips a custom-field option lane and the unset lane', () => {
    const option = encodeLaneId({ kind: 'custom_field', fieldId: 'f1', optionId: 'r2' });
    expect(decodeLaneId(option)).toEqual({
      kind: 'custom_field',
      fieldId: 'f1',
      optionId: 'r2',
    });
    const unset = encodeLaneId({ kind: 'custom_field', fieldId: 'f1', optionId: null });
    expect(decodeLaneId(unset)).toEqual({ kind: 'custom_field', fieldId: 'f1', optionId: null });
  });

  it('keeps a colon inside an option id intact — only the first separator is structural', () => {
    const id = encodeLaneId({ kind: 'custom_field', fieldId: 'f1', optionId: 'a:b' });
    expect(decodeLaneId(id)).toEqual({ kind: 'custom_field', fieldId: 'f1', optionId: 'a:b' });
  });

  it('rejects an unknown status, an unprefixed id, and a truncated field lane', () => {
    expect(decodeLaneId('review:bogus')).toBeNull();
    expect(decodeLaneId('approved')).toBeNull();
    expect(decodeLaneId('field:f1')).toBeNull();
    expect(decodeLaneId('field:f1:')).toBeNull();
  });

  it('never decodes a review lane as a custom-field lane (the two writes must not be confused)', () => {
    const review = decodeLaneId(encodeLaneId({ kind: 'review_status', status: 'draft' }));
    expect(review?.kind).toBe('review_status');
  });
});

describe('buildBoardLanes — review_status', () => {
  it('keeps the canonical five lanes in order and preserves list order inside one', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'review_status' },
      assets: [makeAsset('a1', 'draft'), makeAsset('a2', 'approved'), makeAsset('a3', 'draft')],
    });
    expect(lanes.map((lane) => lane.label)).toEqual([
      'Unsorted',
      'Draft',
      'In review',
      'Needs changes',
      'Approved',
    ]);
    expect(lanes[1]?.assets.map((asset) => asset.id)).toEqual(['a1', 'a3']);
    expect(lanes[4]?.assets.map((asset) => asset.id)).toEqual(['a2']);
    expect(lanes[0]?.assets).toEqual([]);
  });
});

describe('buildBoardLanes — custom single-select field', () => {
  it('opens with an unset lane, then one lane per option in field order', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: rights },
      assets: [],
    });
    expect(lanes.map((lane) => lane.label)).toEqual([UNSET_LANE_LABEL, 'Unlimited', 'Expired']);
  });

  it('buckets assets by their stored option id, preserving order within a lane', () => {
    const assets = [makeAsset('a1'), makeAsset('a2'), makeAsset('a3'), makeAsset('a4')];
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: rights },
      assets,
      optionByAssetId: new Map([
        ['a1', 'expired'],
        ['a2', 'unlimited'],
        ['a4', 'expired'],
      ]),
    });
    expect(lanes[0]?.assets.map((asset) => asset.id)).toEqual(['a3']);
    expect(lanes[1]?.assets.map((asset) => asset.id)).toEqual(['a2']);
    expect(lanes[2]?.assets.map((asset) => asset.id)).toEqual(['a1', 'a4']);
  });

  it('lands an asset holding a DELETED option id in the unset lane instead of dropping it', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: rights },
      assets: [makeAsset('orphan')],
      optionByAssetId: new Map([['orphan', 'option-that-was-deleted']]),
    });
    expect(lanes[0]?.assets.map((asset) => asset.id)).toEqual(['orphan']);
    expect(lanes.flatMap((lane) => lane.assets)).toHaveLength(1);
  });

  it('lands every asset in the unset lane when no values have been read yet', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: rights },
      assets: [makeAsset('a1'), makeAsset('a2')],
    });
    expect(lanes[0]?.assets.map((asset) => asset.id)).toEqual(['a1', 'a2']);
  });

  it('lane ids decode back to this field and its options', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: rights },
      assets: [],
    });
    expect(decodeLaneId(lanes[0]?.id ?? '')).toEqual({
      kind: 'custom_field',
      fieldId: 'field-1',
      optionId: null,
    });
    expect(decodeLaneId(lanes[2]?.id ?? '')).toEqual({
      kind: 'custom_field',
      fieldId: 'field-1',
      optionId: 'expired',
    });
  });
});
