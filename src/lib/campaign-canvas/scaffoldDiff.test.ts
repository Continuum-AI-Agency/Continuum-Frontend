import { describe, expect, it } from 'bun:test';
import type { CampaignStructurePayload, StructureDiff } from '@continuum/contracts';
import { diffForCanvas, latestStructureDiffFor, scaffoldStructureDiffOf } from './scaffoldDiff';

const DIFF: StructureDiff = {
  source: { kind: 'campaign', id: '120', name: 'AV CAMACHO' },
  entries: [
    {
      path_key: 'c0/a3',
      source_path_key: null,
      level: 'adset',
      name: 'Test Reels only',
      change: 'added',
      fields: [],
    },
  ],
};

const structure = (
  over: Partial<CampaignStructurePayload> & Pick<CampaignStructurePayload, 'layout'>,
): CampaignStructurePayload => ({
  scaffoldId: 'version-1',
  parentScaffoldId: 'parent-1',
  version: 1,
  partId: `campaign-structure:parent-1:${over.layout}`,
  title: 'AV CAMACHO · test copy',
  counts: { campaigns: 1, adSets: 1, ads: 0, userGave: 0, jainaFilled: 0, jainaAsks: 0 },
  nodes: [],
  truncated: false,
  diff: null,
  html: null,
  ...over,
});

describe('the diff a structure part carries', () => {
  it('is the diff layout only, with the scaffold it was drawn for', () => {
    expect(scaffoldStructureDiffOf(structure({ layout: 'diff', diff: DIFF }))).toEqual({
      parentScaffoldId: 'parent-1',
      scaffoldVersionId: 'version-1',
      diff: DIFF,
    });
    expect(scaffoldStructureDiffOf(structure({ layout: 'outline' }))).toBeNull();
    expect(
      scaffoldStructureDiffOf(
        structure({ layout: 'diff', diff: DIFF, parentScaffoldId: undefined }),
      ),
    ).toBeNull();
  });

  it("is the thread's newest one for that scaffold, never another scaffold's", () => {
    const older = structure({ layout: 'diff', diff: DIFF, scaffoldId: 'version-1' });
    const newer = structure({ layout: 'diff', diff: DIFF, scaffoldId: 'version-2' });
    const other = structure({ layout: 'diff', diff: DIFF, parentScaffoldId: 'parent-9' });
    const messages = [
      { campaignStructures: [older] },
      {},
      { campaignStructures: [structure({ layout: 'outline' }), newer] },
      { campaignStructures: [other] },
    ];
    expect(latestStructureDiffFor(messages, 'parent-1')?.scaffoldVersionId).toBe('version-2');
    expect(latestStructureDiffFor(messages, 'parent-9')?.parentScaffoldId).toBe('parent-9');
    expect(latestStructureDiffFor(messages, 'parent-404')).toBeNull();
  });
});

describe('the diff for the graph on the canvas', () => {
  const found = { parentScaffoldId: 'parent-1', scaffoldVersionId: 'version-1', diff: DIFF };

  it('applies to its own scaffold only: path keys mean nothing on another graph', () => {
    expect(diffForCanvas(found, { scaffoldId: 'parent-1' })).toBe(DIFF);
    expect(diffForCanvas(found, { scaffoldId: 'parent-2' })).toBeNull();
    expect(diffForCanvas(found, null)).toBeNull();
    expect(diffForCanvas(null, { scaffoldId: 'parent-1' })).toBeNull();
  });
});
