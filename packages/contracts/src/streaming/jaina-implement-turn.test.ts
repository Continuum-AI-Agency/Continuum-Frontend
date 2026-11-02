import { describe, expect, it } from 'bun:test';
import { CHANGE_PROJECTION_METHOD_ID, changeProjectionPartId } from './jaina-change-projection';
import {
  buildImplementProposalTurn,
  IMPLEMENT_PROPOSAL_TURN_HEADER,
  isImplementProposalTurn,
} from './jaina-implement-turn';
import { type LiveChangePreviewPayload, liveChangePreviewPayloadSchema } from './jaina-live-change';

const figures = (spend: number | null, results: number | null) => ({
  spend,
  results,
  costPerResult: null,
  value: null,
  roas: null,
  share: null,
});

const entity = (
  id: string,
  level: 'campaign' | 'adset' | 'ad',
  action: 'increase' | 'decrease' | 'pause' | 'unchanged',
  before: number | null,
  after: number | null,
  name = `Entity ${id}`,
) => ({
  id,
  level,
  name,
  platform: 'meta' as const,
  action,
  changeLabel: action === 'pause' ? 'pause' : '+20% daily spend',
  before: figures(before, 10),
  after: figures(after, 12),
  afterRange: null,
  note: null,
});

const previewOf = (
  entities: ReturnType<typeof entity>[],
  overrides: Partial<LiveChangePreviewPayload> = {},
): LiveChangePreviewPayload =>
  liveChangePreviewPayloadSchema.parse({
    approvalId: 'proposal:p1',
    toolCallId: 'call_1',
    toolName: 'project_change_outcome',
    partId: changeProjectionPartId('p1'),
    subject: null,
    currency: 'MXN',
    nodes: [],
    truncated: false,
    counts: { changed: 1, added: 0, paused: 1 },
    readAt: '2026-11-01T00:00:00.000Z',
    origin: 'proposal',
    platform: 'meta',
    projection: {
      method: { id: CHANGE_PROJECTION_METHOD_ID, label: 'Observed', summary: 'rule' },
      platform: 'meta',
      window: { since: '2026-10-18', until: '2026-10-31', days: 10, label: null },
      currency: 'MXN',
      resultLabel: 'Conversations',
      entities,
      totals: { before: figures(1, 1), after: figures(1, 1), afterRange: null },
      assumptions: ['The same 10 days, at the new daily spend.'],
      gaps: [],
      datasetId: 'ds_1',
      sourceDatasetIds: [],
    },
    ...overrides,
  });

describe('buildImplementProposalTurn', () => {
  const preview = previewOf([
    entity('111', 'campaign', 'pause', 1000, 0, 'ITESO // MENSAJES'),
    entity('222', 'adset', 'increase', 1000, 1200, 'AV CAMACHO'),
    entity('333', 'campaign', 'unchanged', 500, 500),
  ]);

  it('lists every change of the preview with its id, action and daily figure, and none that stays as it is', () => {
    const turn = buildImplementProposalTurn(preview);
    expect(turn).not.toBeNull();
    expect(turn).toContain('1. Pause campaign «ITESO // MENSAJES» (id 111).');
    expect(turn).toContain('2. Raise the daily budget of ad set «AV CAMACHO» (id 222)');
    expect(turn).toContain('from $100 MXN a day');
    expect(turn).toContain('to $120 MXN a day');
    expect(turn).not.toContain('333');
  });

  it('orders the approval cards and forbids asking, re-proposing or applying without one', () => {
    const turn = buildImplementProposalTurn(preview) ?? '';
    expect(turn).toMatch(/approval card/i);
    expect(turn).toMatch(/do not ask/i);
    expect(turn).toMatch(/nothing applies without/i);
  });

  it('is recognised by the Backend as the implement turn it built', () => {
    expect(isImplementProposalTurn(buildImplementProposalTurn(preview) ?? '')).toBe(true);
    expect(isImplementProposalTurn(`  ${IMPLEMENT_PROPOSAL_TURN_HEADER}\n1. x`)).toBe(true);
    expect(isImplementProposalTurn('Implement the changes you proposed.')).toBe(false);
  });

  it('has nothing to implement on a Google proposal, a preview with no projection, or no change', () => {
    expect(
      buildImplementProposalTurn(
        previewOf([entity('1', 'campaign', 'pause', 1, 0)], { platform: 'google' }),
      ),
    ).toBeNull();
    expect(
      buildImplementProposalTurn(
        previewOf([entity('1', 'campaign', 'pause', 1, 0)], { projection: null }),
      ),
    ).toBeNull();
    expect(
      buildImplementProposalTurn(previewOf([entity('1', 'campaign', 'unchanged', 1, 1)])),
    ).toBeNull();
  });

  it('never states a figure it does not have: an increase with no after figure is left out', () => {
    const turn = buildImplementProposalTurn(
      previewOf([
        entity('1', 'campaign', 'increase', 100, null),
        entity('2', 'campaign', 'pause', 1, 0),
      ]),
    );
    expect(turn).toContain('(id 2)');
    expect(turn).not.toContain('(id 1)');
  });
});
