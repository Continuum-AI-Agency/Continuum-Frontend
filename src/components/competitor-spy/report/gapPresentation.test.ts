import { describe, expect, it } from 'bun:test';
import { gapCategorySchema } from '@continuum/contracts';
import {
  GAP_CATEGORY_META,
  humanize,
  medianDays,
  money,
  nonUsCountriesLabel,
  percent,
} from './gapPresentation';

describe('GAP_CATEGORY_META', () => {
  it('labels every gap category the contract defines', () => {
    for (const category of gapCategorySchema.options) {
      expect(GAP_CATEGORY_META[category].label.length).toBeGreaterThan(0);
      expect(GAP_CATEGORY_META[category].className.length).toBeGreaterThan(0);
    }
  });

  it('uses the agreed copy per category', () => {
    expect(GAP_CATEGORY_META.they_scale_you_absent.label).toBe("They scale, you're absent");
    expect(GAP_CATEGORY_META.they_scale_you_losing.label).toBe("They scale, you're losing");
    expect(GAP_CATEGORY_META.you_win_they_ignore.label).toBe('You win, they ignore');
    expect(GAP_CATEGORY_META.shared_battleground.label).toBe('Battleground');
  });
});

describe('formatters', () => {
  it('percent renders a dash for missing win rates', () => {
    expect(percent(null)).toBe('—');
    expect(percent(undefined)).toBe('—');
    expect(percent(0.375)).toBe('38%');
    expect(percent(0)).toBe('0%');
  });

  it('money renders 30d spend or a dash', () => {
    expect(money(null)).toBe('—');
    expect(money(12.5)).toBe('$12.50');
  });

  it('medianDays rounds to whole days', () => {
    expect(medianDays(14.6)).toBe('median 15d');
  });

  it('humanize swaps underscores for spaces', () => {
    expect(humanize('problem_solution')).toBe('problem solution');
  });
});

describe('nonUsCountriesLabel', () => {
  it('is silent for empty or US-only coverage', () => {
    expect(nonUsCountriesLabel([])).toBeNull();
    expect(nonUsCountriesLabel(['US'])).toBeNull();
    expect(nonUsCountriesLabel(['us'])).toBeNull();
  });

  it('names the market when coverage extends beyond the US', () => {
    expect(nonUsCountriesLabel(['GB', 'DE'])).toBe('seen in GB, DE');
    expect(nonUsCountriesLabel(['US', 'GB'])).toBe('seen in US, GB');
  });
});
