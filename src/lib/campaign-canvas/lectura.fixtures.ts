// Real-shaped inputs for the Lectura tests and the visual proof: the shape the Backend's
// `jaina:live-change:bench` emits for a batch on an Easy Fit-like campaign (one pause, one
// budget raise, one new paused copy), and a hand-drawn scaffold graph.

import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';

const live = (
  overrides: Partial<LiveChangeNode> & Pick<LiveChangeNode, 'id' | 'level' | 'name'>,
): LiveChangeNode => ({
  parentId: null,
  status: 'ACTIVE',
  dailyBudgetMinor: null,
  mark: 'unchanged',
  changes: [],
  basedOnId: null,
  ...overrides,
});

export const LIVE_BATCH_PREVIEW: LiveChangePreviewPayload = {
  approvalId: 'appr_batch',
  toolCallId: 'call_batch',
  toolName: 'batch_meta_entity_changes',
  partId: 'live-change:appr_batch',
  subject: '3 changes in CAÑADAS // MENSAJES // Octubre 2026',
  currency: 'MXN',
  truncated: false,
  counts: { changed: 1, added: 1, paused: 1 },
  readAt: '2026-10-31T06:00:00.000Z',
  nodes: [
    live({ id: '1201', level: 'campaign', name: 'CAÑADAS // MENSAJES // Octubre 2026' }),
    live({
      id: '2201',
      level: 'adset',
      parentId: '1201',
      name: 'Mujeres 25-34 · Zapopan',
      dailyBudgetMinor: 35000,
    }),
    live({ id: '3201', level: 'ad', parentId: '2201', name: 'Reel clase spinning' }),
    live({ id: '3202', level: 'ad', parentId: '2201', name: 'Carrusel $99 primer mes' }),
    live({ id: '3203', level: 'ad', parentId: '2201', name: 'UGC testimonio' }),
    live({
      id: '2202',
      level: 'adset',
      parentId: '1201',
      name: 'Intereses fitness',
      dailyBudgetMinor: 30000,
      mark: 'paused',
      changes: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
      basis: '0 conversations in 3 days with 900 MXN spent',
    }),
    live({ id: '3204', level: 'ad', parentId: '2202', name: 'Reel clase spinning' }),
    live({ id: '3205', level: 'ad', parentId: '2202', name: 'Carrusel $99 primer mes' }),
    live({
      id: '2203',
      level: 'adset',
      parentId: '1201',
      name: 'Lookalike 1% clientes',
      dailyBudgetMinor: 30000,
      mark: 'changed',
      changes: [{ field: 'daily_budget', before: 30000, after: 45000 }],
      basis: 'Lowest cost per conversation in the campaign: 48 MXN',
    }),
    live({ id: '3206', level: 'ad', parentId: '2203', name: 'UGC testimonio' }),
    live({ id: '3207', level: 'ad', parentId: '2203', name: 'Reel clase spinning' }),
    live({
      id: 'new:1',
      level: 'adset',
      parentId: '1201',
      name: 'Prueba A · Advantage+',
      status: null,
      dailyBudgetMinor: 15000,
      mark: 'added',
      basedOnId: '2203',
      changes: [{ field: 'advantage_audience', before: 'off', after: 'on' }],
    }),
    live({
      id: 'new:2',
      level: 'ad',
      parentId: 'new:1',
      name: 'UGC testimonio',
      status: null,
      mark: 'added',
    }),
    live({
      id: '2204',
      level: 'adset',
      parentId: '1201',
      name: 'Retargeting 30d',
      dailyBudgetMinor: 20000,
    }),
    live({ id: '3208', level: 'ad', parentId: '2204', name: 'Carrusel $99 primer mes' }),
  ],
};

const flowNode = (
  id: string,
  type: CampaignCanvasNode['type'],
  data: Record<string, unknown>,
): CampaignCanvasNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as unknown as CampaignCanvasNode;

const flowEdge = (source: string, target: string): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
});

export const SCAFFOLD_GRAPH: { nodes: CampaignCanvasNode[]; edges: CampaignCanvasEdge[] } = {
  nodes: [
    flowNode('c', 'campaign', {
      label: 'ZAPOPAN // MENSAJES // Noviembre 2026',
      objective: 'OUTCOME_ENGAGEMENT',
      buyingType: 'AUCTION',
      specialAdCategories: [],
      budgetMode: 'abo',
      budgetCurrency: 'MXN',
    }),
    flowNode('s1', 'ad-set', {
      label: 'Mujeres 25-44 · amplio',
      optimizationGoal: 'CONVERSATIONS',
      billingEvent: 'IMPRESSIONS',
      budgetAmount: 400,
      budgetCurrency: 'MXN',
      fieldProvenance: { budgetAmount: 'jaina_filled', ageMin: 'user_gave' },
    }),
    flowNode('aud1', 'audience', {
      label: 'Audience',
      mode: 'broad',
      locations: ['MX'],
      ageMin: 25,
      ageMax: 44,
      genders: [2],
      fieldProvenance: { ageMin: 'user_gave', ageMax: 'user_gave' },
    }),
    flowNode('a1', 'ad', {
      label: 'Reel clase spinning',
      adFormat: 'VIDEO',
      primaryText: '',
      headline: '',
      callToAction: 'MESSAGE_PAGE',
    }),
    flowNode('cr1', 'creative', {
      label: 'Reel',
      assetType: 'video',
      thumbnailUrl: 'https://example.test/reel.jpg',
    }),
    flowNode('s2', 'ad-set', {
      label: 'Retargeting 30d',
      optimizationGoal: 'CONVERSATIONS',
      billingEvent: 'IMPRESSIONS',
      budgetAmount: 200,
      budgetCurrency: 'MXN',
    }),
    flowNode('a2', 'ad', {
      label: 'Sin creativo',
      adFormat: 'IMAGE',
      primaryText: '',
      headline: '',
      callToAction: 'MESSAGE_PAGE',
      fieldProvenance: { creative: 'jaina_asks' },
    }),
  ],
  edges: [
    flowEdge('c', 's1'),
    flowEdge('aud1', 's1'),
    flowEdge('s1', 'a1'),
    flowEdge('a1', 'cr1'),
    flowEdge('c', 's2'),
    flowEdge('s2', 'a2'),
  ],
};
