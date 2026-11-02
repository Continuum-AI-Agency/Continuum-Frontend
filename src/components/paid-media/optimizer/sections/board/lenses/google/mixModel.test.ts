import { describe, expect, it } from 'bun:test';
import type { PlatformCard } from '@continuum/contracts';
import { formatCurrency } from '../../../../format';
import { GOOGLE_ACCOUNT_COURSE_SPLIT } from '../../../platformCards/__fixtures__/platformCards';
import { buildGoogleOverview } from '../../../platforms/googleAdsOverviewModel';
import {
  EASYFIT_ACCOUNT,
  EASYFIT_CAMPAIGNS,
  PINK_ACCOUNT,
  PINK_CAMPAIGNS,
  PINK_LINES,
  TANGASSI_ACCOUNT,
  TANGASSI_CAMPAIGNS,
  VIVO_ACCOUNT,
  VIVO_CAMPAIGNS,
} from './__fixtures__/mixAuctionSignalReads';
import { type FindingCard, shareLabel } from './mixAuctionSignalModel';
import {
  buildMix,
  goalStanding,
  type MixSplit,
  mixByCampaign,
  mixByLine,
  mixByType,
  mixHeadlineLine,
  mixHeadlineRow,
  mixTakeaway,
  needsCampaignRead,
} from './mixModel';

const finding = (card: PlatformCard): FindingCard => {
  if (card.variant !== 'google_account_finding') throw new Error('not a finding');
  return card;
};

const easyFit = buildGoogleOverview(EASYFIT_ACCOUNT, EASYFIT_CAMPAIGNS);
const vivo = buildGoogleOverview(VIVO_ACCOUNT, VIVO_CAMPAIGNS);
const pink = buildGoogleOverview(PINK_ACCOUNT, PINK_CAMPAIGNS);
const tangassi = buildGoogleOverview(TANGASSI_ACCOUNT, TANGASSI_CAMPAIGNS);

function split(model: ReturnType<typeof buildMix>): MixSplit {
  if (model.kind !== 'type' && model.kind !== 'campaign') throw new Error(`got ${model.kind}`);
  return model;
}

describe('mixByType — Easy Fit, October: Search takes 62% of the spend for 8% of the leads', () => {
  const mix = mixByType(easyFit, 'leads', 99);

  it('folds the five campaigns into Search (3) and Performance Max (2), Search first', () => {
    expect(mix?.rows.map((row) => [row.label, row.campaigns, row.spend])).toEqual([
      ['Search', 3, 16600.34],
      ['Performance Max', 2, 10298.55],
    ]);
    expect(mix?.rows.map((row) => row.channel)).toEqual(['search', 'pmax']);
  });

  it('shares the spend and the leads between them, and prices each lead', () => {
    const [search, pmax] = mix?.rows ?? [];
    expect([shareLabel(search?.spendShare ?? 0), shareLabel(search?.resultShare ?? 0)]).toEqual([
      '62%',
      '8%',
    ]);
    expect([shareLabel(pmax?.spendShare ?? 0), shareLabel(pmax?.resultShare ?? 0)]).toEqual([
      '38%',
      '92%',
    ]);
    expect(formatCurrency(search?.costPerResult, 'MXN')).toBe('$502 MXN');
    expect(formatCurrency(pmax?.costPerResult, 'MXN')).toBe('$27.18 MXN');
    expect(mix?.words.many).toBe('leads');
    expect(mix?.results).toBeCloseTo(412.04, 2);
  });

  it('reads each cost against the $99 MXN goal', () => {
    const [search, pmax] = mix?.rows ?? [];
    expect(goalStanding(search?.costPerResult ?? null, mix?.goal ?? null)).toEqual({
      side: 'over',
      label: '407% over goal',
    });
    expect(goalStanding(pmax?.costPerResult ?? null, mix?.goal ?? null)).toEqual({
      side: 'under',
      label: '73% under goal',
    });
  });

  it('leads with Search and says both sides in Spanish', () => {
    if (!mix) throw new Error('no mix');
    expect(mixHeadlineRow(mix)?.label).toBe('Search');
    expect(mixTakeaway(mix, 'MXN')).toBe(
      'Search lleva 62% del gasto y trae 8% de los leads ($502 MXN por lead); Performance Max lleva 38% y trae 92% ($27.18 MXN por lead).',
    );
  });
});

describe('mixByType — when the results are not all there', () => {
  it('Vivo 47: the lead rule counted none per campaign, so only the spend splits', () => {
    const mix = mixByType(vivo, 'leads', null);
    expect(mix?.results).toBe(0);
    expect(
      mix?.rows.map((row) => [row.label, shareLabel(row.spendShare), row.resultShare]),
    ).toEqual([
      ['Search', '83%', null],
      ['Performance Max', '17%', null],
    ]);
    expect(mix?.rows.every((row) => row.costPerResult === null)).toBe(true);
    if (!mix) throw new Error('no mix');
    expect(mixTakeaway(mix, 'MXN')).toBe('Search lleva 83% del gasto; Performance Max, 17%.');
  });

  it('Tangassi: no portfolio names the result, so it reads as conversions, priced each', () => {
    const mix = mixByType(tangassi, null, null);
    expect(mix?.words.many).toBe('conversions');
    expect(mix?.goal).toBeNull();
    if (!mix) throw new Error('no mix');
    expect(mixTakeaway(mix, 'MXN')).toBe(
      'Search lleva 30% del gasto y trae 47% de las conversiones ($160 MXN por conversión); Performance Max lleva 70% y trae 53% ($332 MXN por conversión).',
    );
  });

  it('Pink Elephant runs Search only: there is no split by type', () => {
    expect(mixByType(pink, 'purchases', null)).toBeNull();
    expect(needsCampaignRead(pink)).toBe(true);
    expect(needsCampaignRead(easyFit)).toBe(false);
  });
});

describe('mixByCampaign — one type, split by campaign', () => {
  it('Pink Elephant: three Search campaigns, spend only (purchases not counted per campaign)', () => {
    const mix = mixByCampaign(PINK_CAMPAIGNS, 'purchases', null);
    expect(mix?.kind).toBe('campaign');
    expect(mix?.rows.map((row) => [row.label, shareLabel(row.spendShare)])).toEqual([
      ['Cursos-pink-elephant-2025', '56%'],
      ['ITSM 2026', '33%'],
      ['Eventos 2026', '11%'],
    ]);
    expect(mix?.results).toBeNull();
    if (!mix) throw new Error('no mix');
    expect(mixTakeaway(mix, 'MXN')).toBe(
      'Cursos-pink-elephant-2025 lleva 56% del gasto; ITSM 2026, 33%.',
    );
  });

  it('folds the campaigns past four into one row that never leads', () => {
    const mix = mixByCampaign(EASYFIT_CAMPAIGNS, 'leads', 99);
    expect(mix?.rows.map((row) => row.label)).toEqual([
      'Easy Fit | Search | Leads formulario',
      'GA 1 EASY',
      'Easy Fit',
      'PMax | Octubre | Easy Fit | Leads',
      '1 more campaign',
    ]);
    expect(mix?.rows.at(-1)?.results).toBe(8);
    if (!mix) throw new Error('no mix');
    expect(mixHeadlineRow(mix)?.label).not.toBe('1 more campaign');
  });
});

describe('mixByLine — course lines against the split agreed with the client (P4)', () => {
  it('Pink Elephant, Oct 29: 40 / 17 / 44 against 40 / 20 / 40', () => {
    const lines = mixByLine(finding(PINK_LINES));
    expect(lines?.rows.map((row) => [row.label, row.deviation, row.flagged])).toEqual([
      ['ITSM', 0, false],
      ['COBIT · BRM · IA · eventos', -3, false],
      ['ISO', 4, false],
    ]);
    if (!lines) throw new Error('no lines');
    expect(mixHeadlineLine(lines)?.label).toBe('ISO');
    expect(mixTakeaway(lines, 'MXN')).toBe(
      'ITSM lleva 40% del gasto contra 40% acordado; COBIT · BRM · IA · eventos, 17% contra 20%; ISO, 44% contra 40%.',
    );
  });

  // No account is off its agreed split today, so no real P4 card exists yet: the off-split path
  // runs on the contract's own fixture card.
  it('names only the lines the finding flags when some are off the split', () => {
    const lines = mixByLine(finding(GOOGLE_ACCOUNT_COURSE_SPLIT));
    if (!lines) throw new Error('no lines');
    expect(mixHeadlineLine(lines)?.label).toBe('Bachillerato');
    expect(mixTakeaway(lines, 'MXN')).toBe('Bachillerato lleva 71% del gasto contra 50% acordado.');
  });
});

describe('buildMix — which split the lens draws', () => {
  it('the agreed lines come first, even with a split by type to draw', () => {
    const model = buildMix({
      overview: easyFit,
      campaigns: null,
      lineCard: finding(PINK_LINES),
      bucket: 'leads',
      goal: 99,
    });
    expect(model.kind).toBe('line');
  });

  it('then the split by type, then by campaign', () => {
    const base = { lineCard: null, goal: null } as const;
    expect(buildMix({ ...base, overview: easyFit, campaigns: null, bucket: 'leads' }).kind).toBe(
      'type',
    );
    const byCampaign = buildMix({
      ...base,
      overview: pink,
      campaigns: PINK_CAMPAIGNS,
      bucket: 'purchases',
    });
    expect(split(byCampaign).kind).toBe('campaign');
  });

  it('says why there is no mix with fewer than two parts', () => {
    const one = buildGoogleOverview(TANGASSI_ACCOUNT, {
      ...TANGASSI_CAMPAIGNS,
      rows: TANGASSI_CAMPAIGNS.rows.slice(0, 1),
    });
    expect(
      buildMix({ overview: one, campaigns: null, lineCard: null, bucket: null, goal: null }),
    ).toEqual({
      kind: 'empty',
      reason: 'One campaign spent in this window: there is no mix to compare.',
    });
  });
});
