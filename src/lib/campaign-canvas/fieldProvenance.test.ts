import { describe, expect, it } from 'bun:test';
import { draftFieldProvenance, withUserGave } from './fieldProvenance';

describe('withUserGave', () => {
  it("marks every draft key a person's edit changed as 'user_gave', keeping the rest", () => {
    const current = {
      label: 'Prospecting',
      budgetAmount: 50,
      fieldProvenance: { name: 'jaina_filled', daily_budget_minor_units: 'jaina_filled' },
    } as const;
    expect(withUserGave('ad-set', current, { budgetAmount: 75 })).toEqual({
      budgetAmount: 75,
      fieldProvenance: { name: 'jaina_filled', daily_budget_minor_units: 'user_gave' },
    });
  });

  it('maps one canvas field to every draft key it writes (placement)', () => {
    const patch = withUserGave('ad-set', {}, { placementMode: 'manual' });
    expect(patch.fieldProvenance).toMatchObject({ placement_mode: 'user_gave' });
  });

  it('leaves a patch that changes nothing untouched, so the store sees no edit', () => {
    const current = { headline: 'Same', fieldProvenance: { headline: 'user_gave' } } as const;
    expect(withUserGave('ad', current, { headline: 'Same' })).toEqual({ headline: 'Same' });
    // Already the person's: the SAME provenance object, so no spurious undo step.
    expect(withUserGave('ad', current, { headline: 'New' })).toEqual({ headline: 'New' });
  });

  it("marks an audience or creative node's own key, read off onto its ad set / ad at save", () => {
    expect(withUserGave('audience', {}, { locations: ['MX'] }).fieldProvenance).toEqual({
      audience: 'user_gave',
    });
    expect(withUserGave('creative', {}, { mediaId: 'asset' }).fieldProvenance).toEqual({
      creative: 'user_gave',
    });
  });
});

describe('draftFieldProvenance', () => {
  const adSet = {
    name: 'Prospecting',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    daily_budget_minor_units: null,
    bid_strategy: 'COST_CAP',
    bid_amount_minor_units: 1500,
    broad_targeting: null,
    audience_group_version_id: 'group',
  };

  it('keeps the recorded labels in the canonical key order, dropping keys of other levels', () => {
    expect(
      draftFieldProvenance({
        level: 'adset',
        draft: adSet,
        recorded: { bid_strategy: 'user_gave', name: 'jaina_filled', url_tags: 'user_gave' },
        drawn: false,
      }),
    ).toEqual({ name: 'jaina_filled', bid_strategy: 'user_gave' });
  });

  it('labels every set field of a drawn node as the person’s', () => {
    expect(
      draftFieldProvenance({ level: 'adset', draft: adSet, recorded: null, drawn: true }),
    ).toEqual({
      name: 'user_gave',
      optimization_goal: 'user_gave',
      audience_group_version_id: 'user_gave',
      bid_strategy: 'user_gave',
      bid_amount_minor_units: 'user_gave',
    });
  });

  it('adds the keys a person gave through another node, and is null when nothing is known', () => {
    expect(
      draftFieldProvenance({
        level: 'adset',
        draft: adSet,
        recorded: null,
        drawn: false,
        userKeys: ['audience_group_version_id'],
      }),
    ).toEqual({ audience_group_version_id: 'user_gave' });
    expect(
      draftFieldProvenance({ level: 'ad', draft: { name: 'Ad' }, recorded: null, drawn: false }),
    ).toBeNull();
  });
});
