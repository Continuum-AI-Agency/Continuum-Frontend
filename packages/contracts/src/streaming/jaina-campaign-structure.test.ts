import { describe, expect, it } from 'bun:test';
import type { JainaForwardableType } from './jaina';
import {
  CAMPAIGN_STRUCTURE_FRAME_TYPE,
  campaignStructurePartId,
  campaignStructurePayloadSchema,
  structureNodeSchema,
} from './jaina-campaign-structure';

const node = (path_key: string, parent: string | null, level: 'campaign' | 'adset' | 'ad') => ({
  path_key,
  parent_path_key: parent,
  level,
  name: path_key,
  funnel_stage: null,
  audience_key: level === 'campaign' ? null : 'aud_1',
  creative_key: level === 'ad' ? 'cr_1' : null,
  fields: [
    {
      key: 'daily_budget_minor_units',
      label: 'Daily budget',
      value: '500 MXN',
      provenance: 'user_gave',
    },
  ],
});

const base = {
  scaffoldId: 'v1',
  version: 1,
  layout: 'outline' as const,
  partId: campaignStructurePartId('v1', 'outline'),
  title: 'Promo',
  counts: { campaigns: 1, adSets: 1, ads: 1, userGave: 1, jainaFilled: 0, jainaAsks: 0 },
  nodes: [
    node('c0', null, 'campaign'),
    node('c0/a0', 'c0', 'adset'),
    node('c0/a0/ad0', 'c0/a0', 'ad'),
  ],
  truncated: false,
  diff: null,
  html: null,
};

describe('campaignStructurePayloadSchema', () => {
  it('accepts a React layout with no html', () => {
    expect(campaignStructurePayloadSchema.safeParse(base).success).toBe(true);
  });

  it('requires html for the compiled layouts and a diff for the diff layout', () => {
    for (const layout of ['tree', 'matrix', 'funnel'] as const) {
      expect(campaignStructurePayloadSchema.safeParse({ ...base, layout }).success).toBe(false);
      expect(
        campaignStructurePayloadSchema.safeParse({
          ...base,
          layout,
          html: { bucket: 'b', path: 'p.html', width: 1280, height: 720 },
        }).success,
      ).toBe(true);
    }
    expect(campaignStructurePayloadSchema.safeParse({ ...base, layout: 'diff' }).success).toBe(
      false,
    );
  });

  it('carries no status and no Meta id on a node', () => {
    const shape = structureNodeSchema.shape;
    for (const key of ['status', 'meta_object_id', 'meta_id']) expect(key in shape).toBe(false);
  });

  it('keeps an unknown field (wire DTO passthrough)', () => {
    const parsed = campaignStructurePayloadSchema.parse({ ...base, futureField: 1 });
    expect((parsed as Record<string, unknown>).futureField).toBe(1);
  });

  it('gives one stable part per scaffold and layout', () => {
    expect(campaignStructurePartId('v1', 'tree')).not.toBe(campaignStructurePartId('v1', 'matrix'));
    expect(campaignStructurePartId('v1', 'tree')).toBe(campaignStructurePartId('v1', 'tree'));
  });

  it('is a forwardable frame type', () => {
    const type: JainaForwardableType = CAMPAIGN_STRUCTURE_FRAME_TYPE;
    expect(type).toBe('paid.campaign_structure');
  });
});
