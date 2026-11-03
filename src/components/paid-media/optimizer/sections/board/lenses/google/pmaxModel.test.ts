import { describe, expect, it } from 'bun:test';
import {
  GoogleSignalsReadSchema,
  type PlatformCard,
  PlatformCardSchema,
  pmaxLensTakeaway,
} from '@continuum/contracts';
import {
  easyFitPmaxRead,
  PINK_AD_WINNER,
  pinkCampaignsRead,
  tangassiPmaxRead,
  VIVO_PMAX_CARD,
  VIVO_PMAX_CARD_ES,
  vivoPmaxRead,
} from '../../../google/views/__fixtures__/lensReads';
import {
  buildPmaxModel,
  leadPmaxCampaign,
  multipleText,
  type PmaxModel,
  positionOf,
} from './pmaxModel';

const CARDS = [VIVO_PMAX_CARD, PINK_AD_WINNER].map((card) => PlatformCardSchema.parse(card));

function modelOf(raw: unknown, goal: number | null, cards: PlatformCard[] | null = CARDS) {
  return buildPmaxModel(GoogleSignalsReadSchema.parse(raw), cards, goal);
}

function pmaxOf(model: PmaxModel) {
  if (model.kind !== 'pmax') throw new Error(`expected a pmax model, got ${model.kind}`);
  return model;
}

describe('buildPmaxModel', () => {
  it('Vivo 47: SALES-PMAX-OCTUBRE costs $3,283 per conversion, 8.2× its $400 goal (V4)', () => {
    const model = pmaxOf(modelOf(vivoPmaxRead(), 400));
    const [pmax] = model.campaigns;
    expect(pmax?.name).toBe('SALES-PMAX-OCTUBRE');
    expect(Math.round(pmax?.costPerConversion ?? 0)).toBe(3283);
    expect(pmax?.goal).toEqual({ value: 400, source: 'portfolio' });
    expect(multipleText(pmax?.multiple ?? 0)).toBe('8.2×');
    expect(positionOf(pmax?.multiple ?? 0)).toBe('over');
    expect(pmax?.lostToRank).toBe(0.78);
    expect(pmax?.strengths).toEqual({ POOR: 0, AVERAGE: 1, GOOD: 0, EXCELLENT: 0 });
    expect(pmax?.groups[0]?.missing).toEqual(['1 square YouTube video']);
    expect(pmax?.finding?.headline).toBe('Rescue or pause this Performance Max');
    expect(Math.round(model.share * 100)).toBe(17);
    expect(model.assetGroupsUnread).toBeNull();
  });

  it('matches the Spanish V4 card by idea and campaign, never by its words (decision 3)', () => {
    const spanish = [PlatformCardSchema.parse(VIVO_PMAX_CARD_ES)];
    const [pmax] = pmaxOf(modelOf(vivoPmaxRead(), 400, spanish)).campaigns;
    expect(pmax?.finding?.headline).toBe(
      'SALES-PMAX-OCTUBRE: $3,283 MXN por conversión frente a un CPA objetivo de $400 MXN',
    );
    expect(Math.round(pmax?.costPerConversion ?? 0)).toBe(3283);
    expect(pmax?.goal).toEqual({ value: 400, source: 'portfolio' });
  });

  it('names the campaign whose channels it reads next: the PMax that spent most', () => {
    expect(leadPmaxCampaign(GoogleSignalsReadSchema.parse(easyFitPmaxRead()))).toEqual({
      id: 'easy-fit-pmax',
      window: { since: '2026-10-01', until: '2026-10-31' },
    });
    expect(leadPmaxCampaign(GoogleSignalsReadSchema.parse(pinkCampaignsRead()))).toBeNull();
  });

  it("reads the campaign's own target CPA before the portfolio goal, as the detector does", () => {
    const model = pmaxOf(modelOf(vivoPmaxRead(400), 900));
    expect(model.campaigns[0]?.goal).toEqual({ value: 400, source: 'target_cpa' });
  });

  it('Easy Fit: two Performance Max under the $99 goal, 38% of the spend, asset groups not read', () => {
    const model = pmaxOf(modelOf(easyFitPmaxRead(), 99, []));
    expect(model.campaigns.map((campaign) => campaign.name)).toEqual([
      'Easy Fit',
      'PMax | Octubre | Easy Fit | Leads',
    ]);
    expect(model.campaigns.map((campaign) => campaign.costPerConversion?.toFixed(2))).toEqual([
      '30.99',
      '23.73',
    ]);
    expect(model.campaigns.map((campaign) => positionOf(campaign.multiple ?? 1))).toEqual([
      'under',
      'under',
    ]);
    expect(Math.round(model.share * 100)).toBe(38);
    expect(model.assetGroupsUnread).toBe('Asset groups were not read for this account');
    expect(model.campaigns[0]?.finding).toBeNull();
  });

  it('Tangassi: no goal to read it against, and 70% of the spend in Performance Max', () => {
    const model = pmaxOf(modelOf(tangassiPmaxRead(), null, []));
    expect(model.campaigns[0]).toMatchObject({
      name: 'Necesidades SLP',
      goal: null,
      multiple: null,
    });
    expect(model.campaigns[0]?.costPerConversion).toBeCloseTo(331.695, 3);
    expect(Math.round(model.share * 100)).toBe(70);
  });

  it("Pink: Search only, so the lens is the Optimizer's winning-ad card (G10)", () => {
    const model = modelOf(pinkCampaignsRead(), null);
    expect(model.kind).toBe('search_only');
    if (model.kind !== 'search_only') return;
    expect(model.winner?.winner.label).toBe('Curso ISO 22301 Fundamentos');
    expect(modelOf(pinkCampaignsRead(), null, [])).toMatchObject({
      kind: 'search_only',
      winner: null,
    });
  });

  it('unread, failed and empty reads say what they are', () => {
    expect(modelOf({ ...vivoPmaxRead(), signals: null, rejected: [] }, 400)).toEqual({
      kind: 'unread',
      reason: 'The Google read came back incomplete',
    });
    const failed = vivoPmaxRead();
    if (failed.signals?.google) delete failed.signals.google.campaigns;
    expect(modelOf({ ...failed, skipped: { read_failed_campaign_window: 1 } }, 400)).toEqual({
      kind: 'unread',
      reason: "Google's campaign read failed",
    });
    const idle = vivoPmaxRead();
    for (const campaign of idle.signals?.google?.campaigns ?? []) campaign.totals.spend = 0;
    expect(modelOf(idle, 400).kind).toBe('empty');
  });
});

describe('pmaxLensTakeaway', () => {
  it("names the campaign, its cost and how far it sits from its goal, in the account's language", () => {
    expect(
      pmaxLensTakeaway({
        kind: 'goal',
        name: 'SALES-PMAX-OCTUBRE',
        cost: '$3,283 MXN',
        spend: '$7,190 MXN',
        goal: '$400 MXN',
        position: 'over',
        gap: '8.2×',
        lostToRank: '78%',
      }),
    ).toBe(
      'SALES-PMAX-OCTUBRE cuesta $3,283 MXN por conversión: 8.2× su meta de $400 MXN, y pierde el 78% de sus impresiones por ranking.',
    );
    expect(pmaxLensTakeaway({ kind: 'no_goal', share: '70%', cost: '$331.70 MXN' })).toBe(
      'Performance Max se lleva el 70% del gasto en Google, a $331.70 MXN por conversión, y no tiene una meta contra la cual medirlo.',
    );
    expect(
      pmaxLensTakeaway({
        kind: 'winner',
        winner: 'Curso ISO 22301 Fundamentos',
        winnerCost: '$88.98 MXN',
        comparator: 'Norma ISO 22301 Certificación',
        comparatorCost: '$331.87 MXN',
        ratio: '3.7×',
      }),
    ).toBe(
      '"Curso ISO 22301 Fundamentos" consigue cada conversión a $88.98 MXN; "Norma ISO 22301 Certificación", a $331.87 MXN: 3.7× más cara.',
    );
  });
});
