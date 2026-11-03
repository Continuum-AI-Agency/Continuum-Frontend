// A Meta proposal preview as the canvas holds it: one campaign paused, one ad set raised.
import {
  CHANGE_PROJECTION_METHOD_ID,
  type LiveChangePreviewPayload,
  liveChangePreviewPayloadSchema,
} from '@continuum/contracts';

const figures = (spend: number) => ({
  spend,
  results: 10,
  costPerResult: null,
  value: null,
  roas: null,
  share: null,
});

const entity = (
  id: string,
  level: 'campaign' | 'adset',
  action: 'pause' | 'increase',
  before: number,
  after: number,
  name: string,
) => ({
  id,
  level,
  name,
  platform: 'meta' as const,
  action,
  changeLabel: action === 'pause' ? 'pause' : '+20% daily spend',
  before: figures(before),
  after: figures(after),
  afterRange: null,
  note: null,
});

export const implementablePreview = (): LiveChangePreviewPayload =>
  liveChangePreviewPayloadSchema.parse({
    approvalId: 'proposal:p1',
    toolCallId: 'call_1',
    toolName: 'project_change_outcome',
    partId: 'change-projection:p1',
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
      window: { since: null, until: null, days: 10, label: 'last_10d' },
      currency: 'MXN',
      resultLabel: 'Conversations',
      entities: [
        entity('111', 'campaign', 'pause', 1000, 0, 'ITESO // MENSAJES'),
        entity('222', 'adset', 'increase', 1000, 1200, 'AV CAMACHO'),
      ],
      totals: { before: figures(2000), after: figures(1200), afterRange: null },
      assumptions: ['The same 10 days, at the new daily spend.'],
      gaps: [],
      datasetId: 'ds_1',
      sourceDatasetIds: [],
    },
  });
