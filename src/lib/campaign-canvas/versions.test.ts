import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type CampaignStructurePayload,
  campaignStructurePayloadSchema,
  type LiveChangePreviewPayload,
} from '@continuum/contracts';
import { campaignViewFromStructure } from './lectura';
import { LIVE_BATCH_PREVIEW } from './lectura.fixtures';
import {
  appliedLabelOf,
  compareVersions,
  comparisonSummaryOf,
  liveChangeVersionsOf,
  scaffoldVersionsOf,
  showsVersionLine,
  versionViewOf,
} from './versions';

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

/**
 * The real copy's second version, as a correction in words would save it: test ad set c0/a4
 * dropped (with its ads), c0/a3's budget $100 → $150 MXN.
 */
const secondVersionOf = (v1: CampaignStructurePayload): CampaignStructurePayload => ({
  ...v1,
  scaffoldId: 'version-2',
  version: 2,
  partId: 'campaign-structure:v2:diff',
  nodes: v1.nodes
    .filter((node) => node.path_key !== 'c0/a4' && node.parent_path_key !== 'c0/a4')
    .map((node) =>
      node.path_key === 'c0/a3'
        ? {
            ...node,
            fields: node.fields.map((field) =>
              field.key === 'daily_budget_minor_units' ? { ...field, value: '$150 MXN' } : field,
            ),
          }
        : node,
    ),
});

/** The batch's next proposal: the pause dropped, the raise bigger, a new ad set gone. */
const batchV2: LiveChangePreviewPayload = {
  ...LIVE_BATCH_PREVIEW,
  approvalId: 'appr_v2',
  toolCallId: 'call_v2',
  partId: 'live-change:appr_v2',
  nodes: LIVE_BATCH_PREVIEW.nodes
    .filter((node) => !node.id.startsWith('new:'))
    .map((node) => {
      if (node.id === '2202') return { ...node, mark: 'unchanged' as const, changes: [] };
      if (node.id === '2203')
        return { ...node, changes: [{ field: 'daily_budget', before: 30000, after: 60000 }] };
      return node;
    }),
};

describe('compareVersions', () => {
  it('marks a dropped ad set removed and a budget change changed — the real copy, v1 → v2', () => {
    const v1 = realCopyStructure();
    const { model, counts } = compareVersions(
      campaignViewFromStructure(v1),
      campaignViewFromStructure(secondVersionOf(v1)),
    );
    const adSets = model.campaigns[0]?.adSets ?? [];
    expect(adSets.find((adSet) => adSet.id === 'c0/a4')?.mark).toBe('removed');
    expect(
      adSets.find((adSet) => adSet.id === 'c0/a4')?.ads.every((ad) => ad.mark === 'removed'),
    ).toBe(true);
    const a3 = adSets.find((adSet) => adSet.id === 'c0/a3');
    expect(a3?.mark).toBe('changed');
    expect(a3?.rows).toEqual([
      { field: 'daily_budget', label: 'Daily budget', before: '$100 MXN', after: '$150 MXN' },
    ]);
    expect(adSets.filter((adSet) => adSet.mark === 'unchanged').map((adSet) => adSet.id)).toEqual([
      'c0/a0',
      'c0/a1',
      'c0/a2',
    ]);
    expect(counts).toEqual({ added: 0, changed: 1, paused: 0, removed: 1 });
    expect(model.changes.map((change) => `${change.id}:${change.mark}`)).toEqual([
      'c0/a3:changed',
      'c0/a4:removed',
    ]);
    expect(model.adSetCount).toBe(4);
    expect(model.totals).toMatchObject({ before: 50000, after: 45000 });
  });

  it('reads a live proposal against the one before it', () => {
    const v1 = liveChangeVersionsOf([{ liveChangePreviews: [LIVE_BATCH_PREVIEW] }], '1201');
    const v2 = liveChangeVersionsOf([{ liveChangePreviews: [batchV2] }], '1201');
    const { model, counts } = compareVersions(
      v1.versions[0]?.model as never,
      v2.versions[0]?.model as never,
    );
    const byId = new Map(model.changes.map((change) => [change.id, change]));
    expect(byId.get('2202')?.mark).toBe('changed');
    expect(byId.get('2202')?.rows).toContainEqual({
      field: 'stops',
      label: 'Status',
      before: 'Pauses',
      after: 'Keeps running',
    });
    expect(byId.get('2203')?.rows[0]).toMatchObject({ before: '$450 MXN', after: '$600 MXN' });
    // The pause dropped: its budget did not change, only whether it stops.
    expect(byId.get('2202')?.rows.map((row) => row.field)).toEqual(['stops']);
    expect(byId.get('new:1')?.mark).toBe('removed');
    expect(counts.removed).toBe(1);
    expect(comparisonSummaryOf({ model, counts })).toBe('1 removed · 2 changed');
  });

  it('is the same when nothing changed', () => {
    const model = campaignViewFromStructure(realCopyStructure());
    const comparison = compareVersions(model, model);
    expect(comparison.model.changes).toEqual([]);
    expect(comparisonSummaryOf(comparison)).toBe('Same as the version before');
  });
});

describe('version lines', () => {
  it('numbers each preview of one campaign as its next version, and knows what was applied', () => {
    const line = liveChangeVersionsOf(
      [
        { liveChangePreviews: [LIVE_BATCH_PREVIEW] },
        { resolvedApprovals: { appr_batch: { decision: 'denied' } } },
        { liveChangePreviews: [batchV2] },
        {
          resolvedApprovals: { appr_v2: { decision: 'approved' } },
          toolResults: [{ id: 'call_v2', ok: true }],
        },
      ],
      '1201',
    );
    expect(line.versions.map((version) => `${version.label}:${version.status}`)).toEqual([
      'v1:denied',
      'v2:applied',
    ]);
    expect(line.appliedId).toBe('live-change:appr_v2');
    expect(showsVersionLine(line)).toBe(true);
    expect(appliedLabelOf(line.versions[0]?.model as never)).toBe('Applied in Meta');
  });

  it('an approval without its result is approved, not applied', () => {
    const line = liveChangeVersionsOf(
      [
        { liveChangePreviews: [LIVE_BATCH_PREVIEW] },
        { resolvedApprovals: { appr_batch: { decision: 'approved' } } },
      ],
      '1201',
    );
    expect(line.versions[0]?.status).toBe('approved');
    expect(line.appliedId).toBeNull();
    expect(showsVersionLine(line)).toBe(false);
  });

  it('collects a scaffold’s versions from its structure parts, in version order', () => {
    const v1 = realCopyStructure();
    const v2 = secondVersionOf(v1);
    const line = scaffoldVersionsOf(
      [
        { campaignStructures: [v2] },
        { campaignStructures: [v1, { ...v1, layout: 'outline', partId: 'o' }] },
        { scaffold: { scaffoldId: 'version-2', receipt: { status: 'completed' } } },
      ],
      'f44ad7f4-7913-4949-9589-c2152826793c',
    );
    expect(line.versions.map((version) => `${version.label}:${version.status}`)).toEqual([
      'v1:proposed',
      'v2:applied',
    ]);
    expect(line.versions[0]?.model.changes.length).toBeGreaterThan(0);
  });

  it('shows the newest version by default and compares a picked one with the one before', () => {
    const v1 = realCopyStructure();
    const line = scaffoldVersionsOf(
      [{ campaignStructures: [v1] }, { campaignStructures: [secondVersionOf(v1)] }],
      'f44ad7f4-7913-4949-9589-c2152826793c',
    );
    expect(versionViewOf(line, null, false)?.version.label).toBe('v2');
    expect(versionViewOf(line, null, true)?.comparison?.counts.removed).toBe(1);
    const first = versionViewOf(line, v1.scaffoldId, true);
    expect(first?.version.label).toBe('v1');
    expect(first?.comparison).toBeNull();
  });
});
