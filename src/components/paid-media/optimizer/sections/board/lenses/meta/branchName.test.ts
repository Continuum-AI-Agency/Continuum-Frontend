import { describe, expect, it } from 'bun:test';
import { CAMPAIGN, TOP_CAMPAIGNS } from './__fixtures__/easyFitMeta';
import { foldName, groupByBranch, parseCampaignName } from './branchName';
import { rankRowOf } from './metaLensModel';

const campaigns = TOP_CAMPAIGNS.map(rankRowOf);

describe('parseCampaignName', () => {
  // Easy Fit's real names: the month moves, the spacing drifts, the kind sits anywhere.
  it.each([
    [CAMPAIGN.aleira.name, 'ALEIRA'],
    [CAMPAIGN.canadas.name, 'CAÑADAS'],
    [CAMPAIGN.camacho.name, 'AV CAMACHO'],
    [CAMPAIGN.easy.name, 'EASY'],
    [CAMPAIGN.canadasForm.name, 'CAÑADAS'],
    [CAMPAIGN.itesoTours.name, 'ITESO'],
  ])('reads %p as the branch %p', (name, branch) => {
    expect(parseCampaignName(name).branch).toBe(branch);
  });

  it('keeps the template it skipped, folded', () => {
    expect(parseCampaignName(CAMPAIGN.aleira.name).template).toEqual([
      'OCTUBRE',
      'MENSAJES',
      '2026',
    ]);
    expect(parseCampaignName(CAMPAIGN.itesoTours.name).template).toEqual([
      'TOURS',
      'OCTUBRE 2026',
      'CONTINUUM',
      'COPY',
    ]);
  });

  it('names no branch in a name without segments, or made only of dates and kinds', () => {
    expect(parseCampaignName('Campaña de octubre').branch).toBeNull();
    expect(parseCampaignName('MENSAJES // OCTUBRE 2026').branch).toBeNull();
    expect(parseCampaignName('Prospecting | Broad').branch).toBeNull();
  });

  it('skips a segment every campaign carries', () => {
    const parsed = parseCampaignName('EASYFIT // ALEIRA // MENSAJES', new Set(['EASYFIT']));
    expect(parsed.branch).toBe('ALEIRA');
  });

  it('folds accents and spacing, never the stored spelling', () => {
    expect(foldName('  Cañadas   Norte ')).toBe('CANADAS NORTE');
  });
});

describe('groupByBranch', () => {
  it('groups Easy Fit by branch: every campaign that names one, the biggest spelling first', () => {
    const grouping = groupByBranch(campaigns);
    if (grouping.by !== 'branch') throw new Error('expected branches');
    expect(grouping.groups.map((group) => [group.label, group.members.length])).toEqual([
      ['CAÑADAS', 2],
      ['ALEIRA', 2],
      ['AV CAMACHO', 2],
      ['ITESO', 3],
      ['EASY', 1],
    ]);
    expect(grouping.ungrouped).toEqual([]);
  });

  it('reads by campaign when the names name one branch only', () => {
    const one = campaigns.filter((row) => row.name.startsWith('CAÑADAS'));
    expect(groupByBranch(one).by).toBe('campaign');
  });

  it('reads by campaign when no segment repeats across branches', () => {
    expect(
      groupByBranch([
        { name: 'ALEIRA // Verano', spend: 10 },
        { name: 'ITESO // Invierno', spend: 10 },
      ]).by,
    ).toBe('campaign');
  });

  it('reads by campaign when the branch campaigns carry less than 80% of the spend', () => {
    expect(
      groupByBranch([
        { name: 'ALEIRA // MENSAJES', spend: 30 },
        { name: 'ITESO // MENSAJES', spend: 30 },
        { name: 'Prospecting', spend: 60 },
      ]).by,
    ).toBe('campaign');
  });

  it('looks past a brand prefix every campaign shares', () => {
    const grouping = groupByBranch([
      { name: 'EASYFIT // ALEIRA // MENSAJES', spend: 20 },
      { name: 'EASYFIT // ITESO // MENSAJES', spend: 10 },
    ]);
    if (grouping.by !== 'branch') throw new Error('expected branches');
    expect(grouping.groups.map((group) => group.label)).toEqual(['ALEIRA', 'ITESO']);
  });
});
