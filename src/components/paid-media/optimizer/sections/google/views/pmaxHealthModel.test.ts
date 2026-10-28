import { describe, expect, it } from 'bun:test';
import { GoogleBreakdownReadSchema, GoogleSignalsReadSchema } from '@continuum/contracts';
import { networkFixture, noPmaxFixture, pmaxFixture } from './__fixtures__/googleViews';
import { buildPmaxHealth, networkSplit } from './pmaxHealthModel';

describe('buildPmaxHealth', () => {
  it('lists Poor asset groups first, with their assets counted by Google’s status', () => {
    const model = buildPmaxHealth(GoogleSignalsReadSchema.parse(pmaxFixture()));
    if (model.kind !== 'read') throw new Error('expected a read');
    expect(model.groups.map((group) => group.name)).toEqual([
      'Clases grupales',
      'Membresías · Todos',
    ]);
    expect(model.poor.map((group) => group.id)).toEqual(['ag-2']);
    expect(model.groups[0]).toMatchObject({
      strength: { text: 'Poor' },
      status: { text: 'Limited' },
      assets: { text: '1 limited' },
      missingItems: ['Add more headlines', 'Add a video'],
    });
    expect(model.groups[1]?.assets.text).toBe('3 eligible');
    expect(model.campaignIds).toEqual(['222']);
  });

  it('says "—" with a reason for an unrated group and a failed asset read', () => {
    const read = pmaxFixture();
    const google = read.signals?.google;
    const [rated] = google?.asset_groups ?? [];
    if (!google || !rated) throw new Error('fixture');
    rated.ad_strength = null;
    delete google.pmax_assets;
    const model = buildPmaxHealth(read);
    if (model.kind !== 'read') throw new Error('expected a read');
    const group = model.groups.find((row) => row.id === 'ag-1');
    expect(group?.strength).toEqual({ text: '—', reason: 'Google has not rated this asset group' });
    expect(group?.assets.reason).toBe("Google's asset read failed for this account");
  });

  it('names why nothing was read: a failed block, or a rejected signals build', () => {
    const failed = pmaxFixture();
    if (failed.signals?.google) delete failed.signals.google.asset_groups;
    failed.skipped = { read_failed_asset_groups: 1 };
    expect(buildPmaxHealth(failed)).toEqual({
      kind: 'unread',
      reason: "Google's asset-group read failed",
    });
    expect(
      buildPmaxHealth({ ...pmaxFixture(), signals: null, rejected: ['window: invalid'] }),
    ).toEqual({ kind: 'unread', reason: 'The Google read came back incomplete: window: invalid' });
  });

  it('is an empty read for an account with no Performance Max', () => {
    const model = buildPmaxHealth(noPmaxFixture());
    expect(model).toEqual({ kind: 'read', groups: [], poor: [], campaignIds: [] });
  });
});

describe('networkSplit', () => {
  it('sums YouTube’s two rows, sorts by spend, and prices each network in the account currency', () => {
    const slices = networkSplit(GoogleBreakdownReadSchema.parse(networkFixture()), 'MXN');
    expect(slices.map((slice) => [slice.network, slice.spend])).toEqual([
      ['Search', 2100],
      ['Display', 1000],
      ['YouTube', 400],
    ]);
    expect(slices[0]?.share).toBeCloseTo(0.6);
    expect(slices[0]?.costPerConversion.text).toBe('$210 MXN');
    expect(slices[2]?.conversions.text).toBe('1');
  });

  it('never prints a zero for conversions the account does not count', () => {
    const slices = networkSplit(networkFixture('ambiguous'), 'MXN');
    for (const slice of slices) {
      expect(slice.conversions.reason).toContain("Conversions aren't counted");
      expect(slice.costPerConversion.text).toBe('—');
    }
  });

  it('says a network with no conversions has no cost per conversion', () => {
    const read = networkFixture();
    read.rows = read.rows.filter((row) => row.name === 'YOUTUBE_WATCH');
    expect(networkSplit(read, 'MXN')[0]?.costPerConversion.reason).toBe(
      'No conversions on this network in the window',
    );
  });
});
