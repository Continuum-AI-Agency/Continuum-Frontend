import { describe, expect, it } from 'bun:test';
import {
  type CustomField,
  customFieldSchema,
  type MediaAsset,
  type MediaReviewStatus,
  mediaAssetSchema,
} from '@continuum/contracts';
import {
  buildBoardLanes,
  decodeLaneId,
  dropValue,
  encodeLaneId,
  UNSET_LANE_LABEL,
} from './boardGrouping';

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
      valueByAssetId: new Map([
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
      valueByAssetId: new Map([['orphan', 'option-that-was-deleted']]),
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

describe('buildBoardLanes — status and user fields', () => {
  it('gives a status field one coloured lane per stage', () => {
    const stage = {
      ...rights,
      id: 'stage',
      type: 'status' as const,
      options: [
        { id: 'todo', label: 'To do', color: '#999999' },
        { id: 'done', label: 'Done', color: '#10b981' },
      ],
    };
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: stage },
      assets: [makeAsset('a1')],
      valueByAssetId: new Map([['a1', 'done']]),
    });
    expect(lanes.map((lane) => [lane.label, lane.dotColor ?? null])).toEqual([
      [UNSET_LANE_LABEL, null],
      ['To do', '#999999'],
      ['Done', '#10b981'],
    ]);
    expect(lanes[2]?.assets.map((asset) => asset.id)).toEqual(['a1']);
  });

  it('gives a user field an Unassigned lane and one lane per member', () => {
    const assignee = { ...rights, id: 'assignee', type: 'user' as const, options: [] };
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: assignee },
      assets: [makeAsset('a1'), makeAsset('a2')],
      valueByAssetId: new Map([['a2', 'u-2']]),
      members: [
        { userId: 'u-1', label: 'Ada' },
        { userId: 'u-2', label: 'Grace' },
      ],
    });
    expect(lanes.map((lane) => lane.label)).toEqual(['Unassigned', 'Ada', 'Grace']);
    expect(lanes[0]?.assets.map((asset) => asset.id)).toEqual(['a1']);
    expect(lanes[2]?.assets.map((asset) => asset.id)).toEqual(['a2']);
    expect(decodeLaneId(lanes[2]?.id ?? '')).toEqual({
      kind: 'custom_field',
      fieldId: 'assignee',
      optionId: 'u-2',
    });
  });
});

const field = (type: CustomField['type'], options: unknown = []): CustomField =>
  customFieldSchema.parse({ ...rights, id: `f-${type}`, type, options });
const ids = (lane: { assets: MediaAsset[] } | undefined) => lane?.assets.map((asset) => asset.id);

describe('buildBoardLanes — every other field type', () => {
  it('puts a multi-select in the lane of its first option', () => {
    const multi = field('multi_select', [
      { id: 'ig', label: 'Instagram' },
      { id: 'tt', label: 'TikTok' },
    ]);
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: multi },
      assets: [makeAsset('a1'), makeAsset('a2')],
      valueByAssetId: new Map([['a1', ['tt', 'ig']]]),
    });
    expect(lanes.map((lane) => lane.label)).toEqual([UNSET_LANE_LABEL, 'Instagram', 'TikTok']);
    expect(ids(lanes[2])).toEqual(['a1']);
    expect(ids(lanes[0])).toEqual(['a2']);
  });

  it('buckets dates relative to today and refuses drops', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: field('date') },
      assets: ['a1', 'a2', 'a3', 'a4'].map((id) => makeAsset(id)),
      valueByAssetId: new Map([
        ['a1', '2026-09-20'],
        ['a2', '2026-09-27'],
        ['a3', '2026-10-01'],
        ['a4', '2027-01-01'],
      ]),
      now: new Date('2026-09-27T15:00:00Z'),
    });
    expect(lanes.map((lane) => [lane.label, ids(lane)])).toEqual([
      [UNSET_LANE_LABEL, []],
      ['Past', ['a1']],
      ['Today', ['a2']],
      ['Next 7 days', ['a3']],
      ['Later', ['a4']],
    ]);
    expect(lanes.every((lane) => !lane.droppable)).toBe(true);
  });

  it('splits numbers into four equal ranges over the values present', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: field('number') },
      assets: ['a1', 'a2', 'a3'].map((id) => makeAsset(id)),
      valueByAssetId: new Map([
        ['a1', 0],
        ['a2', 50],
        ['a3', 100],
      ]),
    });
    expect(lanes.map((lane) => lane.label)).toEqual([
      UNSET_LANE_LABEL,
      '0 – 25',
      '25 – 50',
      '50 – 75',
      '75 – 100',
    ]);
    expect(ids(lanes[1])).toEqual(['a1']);
    expect(ids(lanes[3])).toEqual(['a2']);
    expect(ids(lanes[4])).toEqual(['a3']);
  });

  it('gives a rating one lane per star and a checkbox exactly Yes and No', () => {
    const rating = buildBoardLanes({
      grouping: { kind: 'custom_field', field: field('rating', { max: 3 }) },
      assets: [makeAsset('a1')],
      valueByAssetId: new Map([['a1', 2]]),
    });
    expect(rating.map((lane) => lane.label)).toEqual([UNSET_LANE_LABEL, '★', '★★', '★★★']);
    expect(ids(rating[2])).toEqual(['a1']);
    const checkbox = buildBoardLanes({
      grouping: { kind: 'custom_field', field: field('checkbox') },
      assets: [makeAsset('a1'), makeAsset('a2')],
      valueByAssetId: new Map([['a1', true]]),
    });
    expect(checkbox.map((lane) => [lane.label, ids(lane)])).toEqual([
      ['Yes', ['a1']],
      ['No', ['a2']],
    ]);
  });

  it('groups text by value with the long tail in Other', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'custom_field', field: field('text') },
      assets: ['a1', 'a2', 'a3'].map((id) => makeAsset(id)),
      valueByAssetId: new Map([
        ['a1', 'Q4'],
        ['a2', 'Q4'],
        ['a3', 'Q1'],
      ]),
    });
    expect(lanes.map((lane) => [lane.label, ids(lane)])).toEqual([
      [UNSET_LANE_LABEL, []],
      ['Q4', ['a1', 'a2']],
      ['Q1', ['a3']],
    ]);
  });

  it('takes the brand review labels and colours for the review lanes', () => {
    const lanes = buildBoardLanes({
      grouping: { kind: 'review_status' },
      assets: [],
      reviewLabels: { approved: { label: 'Signed off', color: '#10b981' } },
    });
    expect(lanes[4]).toMatchObject({ label: 'Signed off', dotColor: '#10b981' });
    expect(lanes[1]?.label).toBe('Draft');
  });
});

describe('dropValue', () => {
  it('writes the lane value for each droppable type and nothing for buckets', () => {
    expect(dropValue(field('rating', { max: 5 }), '4', null)).toBe(4);
    expect(dropValue(field('checkbox'), 'true', false)).toBe(true);
    expect(dropValue(field('checkbox'), null, true)).toBe(false);
    expect(dropValue(rights, null, 'expired')).toBeNull();
    expect(dropValue(field('date'), 'later', '2026-01-01')).toBeUndefined();
  });

  it('swaps only the grouped option of a multi-select', () => {
    const multi = field('multi_select', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ]);
    expect(dropValue(multi, 'c', ['a', 'b'])).toEqual(['c', 'b']);
    expect(dropValue(multi, 'b', ['a', 'b'])).toEqual(['b']);
  });
});
