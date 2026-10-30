import { describe, expect, it } from 'bun:test';
import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import {
  adStopsWithParent,
  latestLiveChangeOf,
  liveChangeBudgetText,
  liveChangeSummaryOf,
  liveChangeTreeOf,
  liveChangeValueText,
} from './liveChange';

const node = (
  overrides: Partial<LiveChangeNode> & Pick<LiveChangeNode, 'id' | 'level'>,
): LiveChangeNode => ({
  parentId: null,
  name: overrides.id,
  status: 'ACTIVE',
  dailyBudgetMinor: null,
  mark: 'unchanged',
  changes: [],
  basedOnId: null,
  ...overrides,
});

const payload = (
  nodes: LiveChangeNode[],
  counts = { changed: 0, added: 0, paused: 0 },
): LiveChangePreviewPayload => ({
  approvalId: 'appr_1',
  toolCallId: 'call_1',
  toolName: 'pause_meta_entity',
  partId: 'live-change:appr_1',
  subject: 'Pause ad set 200',
  currency: 'MXN',
  nodes,
  truncated: false,
  counts,
  readAt: '2026-10-30T12:00:00Z',
});

const PAUSE = payload(
  [
    node({ id: '100', level: 'campaign' }),
    node({ id: '200', level: 'adset', parentId: '100', mark: 'paused', dailyBudgetMinor: 30000 }),
    node({ id: '300', level: 'ad', parentId: '200' }),
    node({ id: '201', level: 'adset', parentId: '100' }),
    node({
      id: 'new:1',
      level: 'adset',
      parentId: '100',
      mark: 'added',
      basedOnId: '201',
      status: null,
    }),
    node({ id: 'new:2', level: 'ad', parentId: 'new:1', mark: 'added', status: null }),
  ],
  { changed: 0, added: 2, paused: 1 },
);

describe('liveChangeTreeOf', () => {
  it('nests ad sets and their ads under the campaign, in payload order', () => {
    const [campaign] = liveChangeTreeOf(PAUSE);
    expect(campaign?.node.id).toBe('100');
    expect(campaign?.adSets.map((adSet) => adSet.node.id)).toEqual(['200', '201', 'new:1']);
    expect(campaign?.adSets[0]?.ads.map((ad) => ad.id)).toEqual(['300']);
    expect(campaign?.adSets[2]?.ads.map((ad) => ad.id)).toEqual(['new:2']);
  });

  it('an ad of a paused ad set stops with it; an ad set of a paused campaign stops too', () => {
    const [campaign] = liveChangeTreeOf(PAUSE);
    const paused = campaign!.adSets[0]!;
    expect(adStopsWithParent(paused, paused.ads[0]!)).toBe(true);
    expect(adStopsWithParent(campaign!.adSets[2]!, campaign!.adSets[2]!.ads[0]!)).toBe(false);
    const whole = payload([
      node({ id: '100', level: 'campaign', mark: 'paused' }),
      node({ id: '200', level: 'adset', parentId: '100' }),
    ]);
    expect(liveChangeTreeOf(whole)[0]?.adSets[0]?.stopsWithParent).toBe(true);
  });
});

describe('liveChangeSummaryOf', () => {
  it('counts what changes', () => {
    expect(liveChangeSummaryOf(PAUSE)).toBe('1 pause · 2 new, paused');
    expect(liveChangeSummaryOf(payload([], { changed: 3, added: 0, paused: 0 }))).toBe('3 changes');
    expect(liveChangeSummaryOf(payload([]))).toBe('No change on this campaign');
  });
});

describe('cell text', () => {
  it('reads budgets in minor units as money and an empty side as none', () => {
    const row = { field: 'daily_budget', before: 30000, after: 45000 };
    expect(liveChangeValueText(row, 'before', 'MXN')).toContain('300');
    expect(liveChangeValueText(row, 'after', 'MXN')).toContain('450');
    expect(
      liveChangeValueText({ field: 'bid_amount', before: null, after: 6000 }, 'before', 'MXN'),
    ).toBe('none');
    expect(
      liveChangeValueText({ field: 'status', before: 'ACTIVE', after: 'PAUSED' }, 'after', null),
    ).toBe('PAUSED');
    expect(liveChangeBudgetText(PAUSE.nodes[1]!, 'MXN')).toContain('/day');
    expect(liveChangeBudgetText(PAUSE.nodes[0]!, 'MXN')).toBe(null);
  });
});

describe('latestLiveChangeOf', () => {
  it('takes the newest preview and the decision from any later turn', () => {
    const second = { ...PAUSE, approvalId: 'appr_2', partId: 'live-change:appr_2' };
    const latest = latestLiveChangeOf([
      { liveChangePreviews: [PAUSE] },
      { liveChangePreviews: [second] },
      { resolvedApprovals: { appr_2: { decision: 'approved' } } },
    ]);
    expect(latest?.preview.approvalId).toBe('appr_2');
    expect(latest?.decision).toBe('approved');
    expect(latest?.index).toBe(1);
  });

  it('is pending until a decision exists, and null with no preview', () => {
    expect(latestLiveChangeOf([{ liveChangePreviews: [PAUSE] }])?.decision).toBe('pending');
    expect(latestLiveChangeOf([{}])).toBe(null);
  });
});
