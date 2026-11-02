import { describe, expect, it } from 'bun:test';
import {
  CAMPAIGN,
  CAMPAIGN_CONVERSATIONS,
  PORTFOLIO_IDS,
  PORTFOLIOS,
  TOP_CAMPAIGNS,
} from './__fixtures__/easyFitMeta';
import { buildMix, foldTail, mixHeadline } from './branchesModel';
import { type MetaRankRow, rankRowOf } from './metaLensModel';

const campaigns = TOP_CAMPAIGNS.map(rankRowOf);

function mixOf(rows: MetaRankRow[] = campaigns, portfolios = PORTFOLIOS) {
  const mix = buildMix(rows, portfolios, 'MXN');
  if (!mix) throw new Error('expected a mix');
  return mix;
}

describe('buildMix on Easy Fit (Oct 3 – Nov 2)', () => {
  const mix = mixOf();

  it('reads by branch and measures purchases against the Tours goal', () => {
    expect(mix.by).toBe('branch');
    expect(mix.result?.kind).toBe('purchases');
    expect(mix.reference).toEqual({
      value: 296,
      kind: 'goal',
      source: 'Tours Programados - Octubre',
    });
    expect(mix.totals.results).toBe(217);
    expect(mix.totals.spend).toBeCloseTo(88062.36, 2);
  });

  it('sums every campaign of a branch and orders the branches by cost per purchase', () => {
    expect(
      mix.rows.map((row) => [
        row.label,
        row.campaignIds.length,
        Number(row.costPerResult?.toFixed(2)),
      ]),
    ).toEqual([
      ['EASY', 1, 305.42],
      ['ALEIRA', 2, 366.05],
      ['AV CAMACHO', 2, 398.05],
      ['CAÑADAS', 2, 451.16],
      ['ITESO', 3, 484.94],
    ]);
    const canadas = mix.rows.find((row) => row.label === 'CAÑADAS');
    expect(canadas?.spend).toBeCloseTo(23911.39, 2);
    expect(canadas?.results).toBe(53);
    expect(canadas?.spendShare).toBeCloseTo(0.2715, 4);
    expect(canadas?.resultShare).toBeCloseTo(53 / 217, 6);
  });

  it('reads a cost within 5% of the goal as on it', () => {
    expect(mix.rows.map((row) => row.tone)).toEqual(['mid', 'above', 'above', 'above', 'above']);
  });

  it('calls the cheapest and the dearest branch in the takeaway, in Spanish', () => {
    expect(mix.best?.label).toBe('EASY');
    expect(mix.worst?.label).toBe('ITESO');
    expect(mix.takeaway).toBe(
      'EASY consigue compras a $305 MXN y ITESO a $485 MXN; la meta es $296 MXN.',
    );
  });

  it('leads a small view with the cheapest-to-dearest range', () => {
    expect(mixHeadline(mix, 'MXN')).toEqual({
      figure: '$305–$485 MXN',
      caption: 'Cost per purchase by branch',
    });
  });

  it('folds the tail past the rows a view shows into one row', () => {
    const rows = foldTail(mix, 3);
    expect(rows.map((row) => row.label)).toEqual(['EASY', 'ALEIRA', '3 more branches']);
    const tail = rows[2];
    expect(tail?.folded).toBe(true);
    expect(tail?.results).toBe(48 + 53 + 36);
  });
});

describe('buildMix without a goal or with another result', () => {
  it('measures against the account average when no portfolio sets a goal', () => {
    const mix = mixOf(campaigns, []);
    expect(mix.reference?.kind).toBe('average');
    expect(mix.reference?.value).toBeCloseTo(88062.36 / 217, 4);
    expect(mix.takeaway).toBe(
      'EASY consigue compras a $305 MXN y ITESO a $485 MXN; el promedio de la cuenta es $406 MXN.',
    );
  });

  // The five MENSAJES campaigns with their conversations (campaign scope read): an account whose
  // only portfolio buys conversations is read by conversations, against its $45 goal.
  it('reads conversations when that is all the portfolios buy', () => {
    const withConversations = campaigns
      .filter((row) => CAMPAIGN_CONVERSATIONS[row.id])
      .map((row) => ({ ...row, ...CAMPAIGN_CONVERSATIONS[row.id] }));
    const conversaciones = PORTFOLIOS.filter((p) => p.id === PORTFOLIO_IDS.conversaciones);
    const mix = mixOf(withConversations, conversaciones);
    expect(mix.result?.kind).toBe('conversations');
    expect(mix.reference?.value).toBe(45);
    expect(mix.totals.results).toBe(478 + 391 + 419 + 336 + 138);
    expect(mix.rows[0]?.label).toBe('AV CAMACHO');
    expect(mix.rows[0]?.costPerResult).toBeCloseTo(18509.74 / 419, 6);
    expect(mix.takeaway).toBe(
      'AV CAMACHO consigue conversaciones a $44.18 MXN y EASY a $61.97 MXN; la meta es $45.00 MXN.',
    );
  });

  it('reads by campaign when the names do not show one campaign per branch', () => {
    const canadas = campaigns.filter(
      (row) => row.id === CAMPAIGN.canadas.id || row.id === CAMPAIGN.canadasForm.id,
    );
    const mix = mixOf(canadas);
    expect(mix.by).toBe('campaign');
    expect(mix.rows.map((row) => row.label)).toEqual([
      CAMPAIGN.canadasForm.name,
      CAMPAIGN.canadas.name,
    ]);
    expect(mixHeadline(mix, 'MXN').caption).toBe('Cost per purchase by campaign');
  });

  it('is null when no campaign spent', () => {
    expect(buildMix([], PORTFOLIOS, 'MXN')).toBeNull();
  });
});
