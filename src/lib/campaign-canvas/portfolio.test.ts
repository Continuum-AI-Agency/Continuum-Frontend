import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type CampaignStructurePayload,
  campaignStructurePayloadSchema,
  type LiveChangePreviewPayload,
} from '@continuum/contracts';
import { LIVE_BATCH_PREVIEW } from './lectura.fixtures';
import {
  mergePreviews,
  pickStructure,
  portfolioCountWords,
  portfolioHeadline,
  portfolioOfMessage,
  portfolioOfParts,
  previewForCampaign,
} from './portfolio';

// The real copy proposal the canvas bench captured from the Backend (AV CAMACHO + 2 test ad sets).
const realCopyStructure = (): CampaignStructurePayload => {
  const capture = JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dir,
        '../../../scripts/canvas-c/fixtures/duplicate-test-adsets.json',
      ),
      'utf8',
    ),
  ) as { parts: { type: string; data: unknown }[] };
  const part = capture.parts.find((entry) => entry.type === 'data-jaina-campaign-structure');
  return campaignStructurePayloadSchema.parse(part?.data);
};

/** A second live campaign: the batch preview under other ids, one budget raise only. */
const otherCampaign = (): LiveChangePreviewPayload => ({
  ...LIVE_BATCH_PREVIEW,
  approvalId: 'appr_other',
  toolCallId: 'call_other',
  partId: 'live-change:appr_other',
  subject: 'Raise the budget of OTRA',
  counts: { changed: 1, added: 0, paused: 0 },
  nodes: [
    {
      id: '9001',
      parentId: null,
      level: 'campaign',
      name: 'OTRA // VENTAS',
      status: 'ACTIVE',
      dailyBudgetMinor: 50000,
      mark: 'changed',
      changes: [{ field: 'daily_budget', before: 50000, after: 60000 }],
      basedOnId: null,
    },
    {
      id: '9101',
      parentId: '9001',
      level: 'adset',
      name: 'Broad',
      status: 'ACTIVE',
      dailyBudgetMinor: null,
      mark: 'unchanged',
      changes: [],
      basedOnId: null,
    },
  ],
});

describe('portfolioOfParts', () => {
  it('groups a live batch and a copy proposal into one row per campaign', () => {
    const portfolio = portfolioOfParts({
      liveChangePreviews: [LIVE_BATCH_PREVIEW, otherCampaign()],
      campaignStructures: [realCopyStructure()],
    });
    expect(portfolio.rows.map((row) => row.id)).toEqual([
      'live:1201',
      'live:9001',
      'scaffold:f44ad7f4-7913-4949-9589-c2152826793c',
    ]);
    const [batch, other, copy] = portfolio.rows;
    expect(batch?.counts).toEqual({ changed: 1, added: 1, paused: 1 });
    expect(other?.before).toBe(50000);
    expect(other?.after).toBe(60000);
    expect(copy?.source).toMatchObject({ kind: 'scaffold', version: 1 });
    // The copy's two test ad sets, and the renamed campaign.
    expect(copy?.counts.added).toBe(2);
    expect(copy?.before).toBeNull();
    expect(copy?.onceActivated).toBe(50000);
    expect(portfolio.campaignCount).toBe(3);
    expect(portfolio.changeCount).toBe(
      (batch?.changeCount ?? 0) + (other?.changeCount ?? 0) + (copy?.changeCount ?? 0),
    );
    expect(portfolio.currency).toBe('MXN');
    expect(portfolio.totals.before).toBe((batch?.before ?? 0) + 50000);
    expect(portfolio.totals.after).toBe((batch?.after ?? 0) + 60000);
  });

  it('reads two approvals on one campaign as one row with both changes', () => {
    const pause = previewForCampaign(LIVE_BATCH_PREVIEW, '1201');
    const raise: LiveChangePreviewPayload = {
      ...LIVE_BATCH_PREVIEW,
      approvalId: 'appr_raise',
      partId: 'live-change:appr_raise',
      nodes: LIVE_BATCH_PREVIEW.nodes.map((node) =>
        node.id === '2201'
          ? {
              ...node,
              mark: 'changed' as const,
              changes: [{ field: 'daily_budget', before: 35000, after: 40000 }],
            }
          : { ...node, mark: 'unchanged' as const, changes: [] },
      ),
    };
    const portfolio = portfolioOfParts({ liveChangePreviews: [pause, raise] });
    expect(portfolio.rows).toHaveLength(1);
    expect(portfolio.rows[0]?.counts).toEqual({ changed: 2, added: 1, paused: 1 });
    expect(portfolio.rows[0]?.source).toMatchObject({
      kind: 'live',
      partIds: ['live-change:appr_batch', 'live-change:appr_raise'],
    });
  });

  it('does not sum across currencies', () => {
    const portfolio = portfolioOfParts({
      liveChangePreviews: [LIVE_BATCH_PREVIEW, { ...otherCampaign(), currency: 'USD' }],
    });
    expect(portfolio.mixedCurrency).toBe(true);
    expect(portfolio.totals.before).toBeNull();
  });
});

describe('portfolioOfMessage', () => {
  it('is null for one campaign, even drawn in two layouts', () => {
    const copy = realCopyStructure();
    expect(portfolioOfMessage({ liveChangePreviews: [LIVE_BATCH_PREVIEW] })).toBeNull();
    expect(
      portfolioOfMessage({
        campaignStructures: [copy, { ...copy, layout: 'outline', partId: 'x' }],
      }),
    ).toBeNull();
  });

  it('is a portfolio from two campaigns up, with its headline', () => {
    const portfolio = portfolioOfMessage({
      liveChangePreviews: [LIVE_BATCH_PREVIEW, otherCampaign()],
    });
    expect(portfolio && portfolioHeadline(portfolio)).toBe('2 campaigns · 4 changes');
  });
});

describe('helpers', () => {
  it('cuts a preview to one campaign and recounts it', () => {
    const cut = previewForCampaign(
      { ...LIVE_BATCH_PREVIEW, nodes: [...LIVE_BATCH_PREVIEW.nodes, ...otherCampaign().nodes] },
      '9001',
    );
    expect(cut.nodes.map((node) => node.id)).toEqual(['9001', '9101']);
    expect(cut.counts).toEqual({ changed: 1, added: 0, paused: 0 });
  });

  it('merges marks strongest first and fields later-wins', () => {
    const base = otherCampaign();
    const later: LiveChangePreviewPayload = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.id === '9001'
          ? { ...node, changes: [{ field: 'daily_budget', before: 50000, after: 70000 }] }
          : { ...node, mark: 'paused' as const },
      ),
    };
    const merged = mergePreviews([base, later]);
    expect(merged.nodes.find((node) => node.id === '9001')?.changes[0]?.after).toBe(70000);
    expect(merged.nodes.find((node) => node.id === '9101')?.mark).toBe('paused');
    expect(merged.counts).toEqual({ changed: 1, added: 0, paused: 1 });
  });

  it('picks the newest version of a scaffold, its diff drawing first', () => {
    const copy = realCopyStructure();
    const outlineV2 = { ...copy, version: 2, layout: 'outline' as const, scaffoldId: 'v2' };
    const diffV2 = { ...copy, version: 2, scaffoldId: 'v2' };
    expect(pickStructure([copy, outlineV2, diffV2])).toBe(diffV2);
  });

  it('words the counts strongest first', () => {
    expect(portfolioCountWords({ changed: 2, added: 3, paused: 1 }).map((w) => w.text)).toEqual([
      '1 pause',
      '2 changes',
      '3 new',
    ]);
  });
});
