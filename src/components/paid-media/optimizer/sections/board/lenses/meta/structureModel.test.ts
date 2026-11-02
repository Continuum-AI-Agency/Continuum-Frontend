import { describe, expect, it } from 'bun:test';
import {
  ADSET,
  ALEIRA_ADS,
  CAMPAIGN,
  PORTFOLIO_IDS,
  PORTFOLIOS,
  ROSTERS,
  TOP_ADSETS,
  TOP_CAMPAIGNS,
} from './__fixtures__/easyFitMeta';
import { rankRowOf } from './metaLensModel';
import { buildStructure, layoutIcicle, type StructureModel } from './structureModel';

const campaigns = TOP_CAMPAIGNS.map(rankRowOf);
const adsets = TOP_ADSETS.map(rankRowOf);
const ads = ALEIRA_ADS.map(rankRowOf);
const rosters = new Map(Object.entries(ROSTERS));

function structureOf(withRosters = true): StructureModel {
  const model = buildStructure({
    campaigns,
    adsets,
    portfolios: PORTFOLIOS,
    rosters: withRosters ? rosters : null,
    rootName: 'Easy Fit',
  });
  if (!model) throw new Error('expected a structure');
  return model;
}

describe('buildStructure on Easy Fit (Oct 3 – Nov 2)', () => {
  const model = structureOf();

  it('hatches the Tours ad sets Meta stopped serving on Oct 14–15, and keeps their width', () => {
    const easy = model.children.get(CAMPAIGN.easy.id) ?? [];
    expect(easy.map((node) => [node.name, node.level, node.lost, node.lostSince])).toEqual([
      ['EASY/BROAD/OCTUBRE', 'adset', true, '2026-10-15T16:58:32.02+00:00'],
      ['CONJUNTO GEO', 'adset', true, '2026-10-15T16:58:32.02+00:00'],
      ['Other ad sets', 'rest', false, null],
    ]);
    expect(easy[0]?.portfolioId).toBe(PORTFOLIO_IDS.tours);
    expect(easy[2]?.spend).toBeCloseTo(8551.89 - 4227.71 - 2286.54, 2);
  });

  it('lays the portfolios over the ad sets they hold, the largest in the first slot', () => {
    const aleira = model.children.get(CAMPAIGN.aleira.id) ?? [];
    expect(aleira[0]?.id).toBe(ADSET.aleiraBau.id);
    expect(aleira[0]?.portfolioId).toBe(PORTFOLIO_IDS.conversaciones);
    expect(model.portfolios.map((portfolio) => [portfolio.name, portfolio.slot])).toEqual([
      ['Conversaciones Whatsapp', 0],
      ['Tours Programados - Octubre', 1],
      ['Leads // Google Ads only', null],
    ]);
  });

  it('names lost ad sets that had no spend to draw', () => {
    expect(model.lost).toEqual([
      {
        portfolioId: PORTFOLIO_IDS.tours,
        portfolioName: 'Tours Programados - Octubre',
        count: 3,
        since: '2026-10-15T16:58:32.02+00:00',
        unseen: ['EASY /BAU/ OCTUBRE'],
      },
    ]);
  });

  it('says how much of the spend a portfolio optimizes, and what was lost', () => {
    expect(model.managedShare).toBeCloseTo(70802.85 / 88062.36, 6);
    expect(model.takeaway).toBe(
      'Los portafolios manejan el 80% del gasto de 30 días; 3 conjuntos de Tours Programados - Octubre se perdieron el 15 oct.',
    );
  });

  it('draws without the rosters, without the portfolios on it', () => {
    const bare = structureOf(false);
    expect(bare.managedShare).toBeNull();
    expect(bare.lost).toEqual([]);
    expect(bare.takeaway).toBe(
      'CAÑADAS // MENSAJES //Octubre  2026 concentra el 26% del gasto de 30 días.',
    );
  });

  it('says the ad sets were not read rather than drawing a gap', () => {
    const unread = buildStructure({
      campaigns,
      adsets: [],
      adsetsRead: false,
      portfolios: PORTFOLIOS,
      rosters,
      rootName: 'Easy Fit',
    });
    expect(unread?.children.get(CAMPAIGN.aleira.id)?.map((node) => node.name)).toEqual([
      'Ad sets not read',
    ]);
  });
});

describe('layoutIcicle', () => {
  const model = structureOf();

  it('spans the account, then its campaigns by spend, then each campaign’s ad sets', () => {
    const cells = layoutIcicle(model, null, null);
    expect(cells[0]).toMatchObject({ row: 0, x: 0, w: 100, visible: true });
    const campaignCells = cells.filter((cell) => cell.node.level === 'campaign');
    expect(campaignCells.reduce((sum, cell) => sum + cell.w, 0)).toBeCloseTo(100, 6);
    const aleira = campaignCells.find((cell) => cell.node.id === CAMPAIGN.aleira.id);
    const children = cells.filter((cell) => cell.node.parentId === CAMPAIGN.aleira.id);
    expect(children.reduce((sum, cell) => sum + cell.w, 0)).toBeCloseTo(aleira?.w ?? 0, 6);
    expect(children[0]?.x).toBeCloseTo(aleira?.x ?? -1, 6);
  });

  it('zooms a campaign across the width, its ad sets below, their ads last', () => {
    const cells = layoutIcicle(model, CAMPAIGN.aleira.id, ads);
    const visible = cells.filter((cell) => cell.visible);
    expect(visible[0]).toMatchObject({ row: 0, x: 0, w: 100 });
    expect(visible[0]?.node.id).toBe(CAMPAIGN.aleira.id);
    // The LKL ad set is past the ad set read's top ten; its ads bring it back.
    const adsetRow = visible.filter((cell) => cell.row === 1);
    expect(adsetRow.map((cell) => cell.node.name)).toEqual([
      ADSET.aleiraBau.name,
      ADSET.aleiraLkl.name,
    ]);
    expect(adsetRow.reduce((sum, cell) => sum + cell.w, 0)).toBeCloseTo(
      ((17717.19 + 842.58) / 18562.21) * 100,
      6,
    );
    const adRow = visible.filter((cell) => cell.row === 2);
    expect(adRow).toHaveLength(10);
    expect(adRow[0]?.node.name).toBe('OCTUBRE//ALEIRA // 1 VIDEO $31');
    expect(
      adRow.every(
        (cell) => cell.node.portfolioId != null || cell.node.parentId === ADSET.aleiraLkl.id,
      ),
    ).toBe(true);
    // Every other campaign folds away and stays in the list, to glide back on the way out.
    const hidden = cells.filter((cell) => !cell.visible && cell.node.level === 'campaign');
    expect(hidden).toHaveLength(campaigns.length - 1);
    expect(hidden.every((cell) => cell.w === 0)).toBe(true);
  });

  it('keeps the zoomed ad sets in place while their ads are still reading', () => {
    const cells = layoutIcicle(model, CAMPAIGN.aleira.id, null);
    expect(cells.filter((cell) => cell.visible && cell.row === 2)).toEqual([]);
    expect(cells.filter((cell) => cell.visible && cell.row === 1).map((c) => c.node.name)).toEqual([
      ADSET.aleiraBau.name,
      'Other ad sets',
    ]);
  });
});
