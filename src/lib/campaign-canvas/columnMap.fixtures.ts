// The Map-in-columns proof inputs: a scaffold the size that broke the old map (24 ads across 5
// ad sets — ≈ 10,900 px wide, fitView at ~6%) and a live change on a campaign that size with
// three proposed changes in two of its five branches.

import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import type { CampaignCanvasEdge, CampaignCanvasNode } from '@/CampaignCanvas/types';

/** Ads per ad set: 6 + 5 + 5 + 4 + 4 = 24. */
const ADS_PER_AD_SET = [6, 5, 5, 4, 4] as const;

const AD_SET_NAMES = [
  'Mujeres 25-44 · Zapopan',
  'Hombres 25-44 · Zapopan',
  'Intereses fitness',
  'Lookalike 1% clientes',
  'Retargeting 30d',
] as const;

const AD_NAMES = [
  'Reel clase spinning',
  'Carrusel $99 primer mes',
  'UGC testimonio',
  'Reel tour instalaciones',
  'Imagen promo noviembre',
  'Reel entrenador personal',
] as const;

const flowNode = (
  id: string,
  type: CampaignCanvasNode['type'],
  data: Record<string, unknown>,
): CampaignCanvasNode =>
  ({ id, type, position: { x: 0, y: 0 }, data, selected: false }) as unknown as CampaignCanvasNode;

const flowEdge = (source: string, target: string): CampaignCanvasEdge => ({
  id: `${source}->${target}`,
  source,
  target,
});

const buildScaffold24 = (): { nodes: CampaignCanvasNode[]; edges: CampaignCanvasEdge[] } => {
  const nodes: CampaignCanvasNode[] = [
    flowNode('c', 'campaign', {
      label: 'ZAPOPAN // MENSAJES // Noviembre 2026',
      objective: 'OUTCOME_ENGAGEMENT',
      buyingType: 'AUCTION',
      specialAdCategories: [],
      budgetMode: 'abo',
      budgetCurrency: 'MXN',
    }),
  ];
  const edges: CampaignCanvasEdge[] = [];
  ADS_PER_AD_SET.forEach((adCount, setIndex) => {
    const setId = `s${setIndex + 1}`;
    nodes.push(
      flowNode(setId, 'ad-set', {
        label: AD_SET_NAMES[setIndex],
        optimizationGoal: 'CONVERSATIONS',
        billingEvent: 'IMPRESSIONS',
        budgetAmount: 200 + setIndex * 50,
        budgetCurrency: 'MXN',
      }),
      flowNode(`${setId}:audience`, 'audience', {
        label: 'Audience',
        mode: 'broad',
        locations: ['MX'],
        ageMin: 25,
        ageMax: 44,
        genders: setIndex === 0 ? [2] : setIndex === 1 ? [1] : [],
      }),
    );
    edges.push(flowEdge('c', setId), flowEdge(`${setId}:audience`, setId));
    for (let adIndex = 0; adIndex < adCount; adIndex += 1) {
      const adId = `${setId}a${adIndex + 1}`;
      nodes.push(
        flowNode(adId, 'ad', {
          label: AD_NAMES[adIndex % AD_NAMES.length],
          adFormat: adIndex % 2 === 0 ? 'VIDEO' : 'IMAGE',
          primaryText: '',
          headline: '',
          callToAction: 'LEARN_MORE',
        }),
        flowNode(`${adId}:creative`, 'creative', {
          label: 'Creative',
          assetType: adIndex % 2 === 0 ? 'video' : 'image',
        }),
      );
      edges.push(flowEdge(setId, adId), flowEdge(adId, `${adId}:creative`));
    }
  });
  return { nodes, edges };
};

export const SCAFFOLD_24_ADS = buildScaffold24();

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

const buildLive24 = (): LiveChangePreviewPayload => {
  const nodes: LiveChangeNode[] = [
    live({ id: 'c1', level: 'campaign', name: 'ZAPOPAN // MENSAJES // Octubre 2026' }),
  ];
  ADS_PER_AD_SET.forEach((adCount, setIndex) => {
    const setId = `as${setIndex + 1}`;
    const budget = 20000 + setIndex * 5000;
    nodes.push(
      live({
        id: setId,
        level: 'adset',
        parentId: 'c1',
        name: AD_SET_NAMES[setIndex],
        dailyBudgetMinor: budget,
        // Ad set 3 pauses; ad set 4 gets a raise; everything else stays.
        ...(setIndex === 2
          ? {
              mark: 'paused' as const,
              changes: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
            }
          : {}),
        ...(setIndex === 3
          ? {
              mark: 'changed' as const,
              changes: [{ field: 'daily_budget', before: budget, after: budget + 15000 }],
            }
          : {}),
      }),
    );
    for (let adIndex = 0; adIndex < adCount; adIndex += 1) {
      nodes.push(
        live({
          id: `${setId}ad${adIndex + 1}`,
          level: 'ad',
          parentId: setId,
          name: AD_NAMES[adIndex % AD_NAMES.length],
          // One ad in ad set 1 pauses on its own.
          ...(setIndex === 0 && adIndex === 2
            ? {
                mark: 'paused' as const,
                changes: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
              }
            : {}),
        }),
      );
    }
  });
  return {
    approvalId: 'appr_24',
    toolCallId: 'call_24',
    toolName: 'batch_meta_entity_changes',
    partId: 'live-change:appr_24',
    subject: '3 changes in ZAPOPAN // MENSAJES // Octubre 2026',
    currency: 'MXN',
    truncated: false,
    counts: { changed: 1, added: 0, paused: 2 },
    readAt: '2026-10-31T06:00:00.000Z',
    nodes,
  };
};

export const LIVE_24_ADS_PREVIEW = buildLive24();
