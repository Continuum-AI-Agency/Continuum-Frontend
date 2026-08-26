import { describe, expect, it } from 'bun:test';
import {
  buildPatch,
  createPortfolioFormSchema,
  type PortfolioCurrentValues,
  toFormValues,
  toInput,
  toStored,
  type UnitContext,
} from './portfolioFields';

const usd: UnitContext = { currency: 'USD', denominatorMultiplier: 1 };
const jpy: UnitContext = { currency: 'JPY', denominatorMultiplier: 1 };
const cpm: UnitContext = { currency: 'USD', denominatorMultiplier: 1_000 };

const current = (over: Partial<PortfolioCurrentValues> = {}): PortfolioCurrentValues => ({
  name: 'Prospecting',
  objective: 'purchase',
  mode: 'balanced',
  apply_mode: 'recommend',
  budget_source: 'observed',
  lookback_window: 'd14',
  period_start: null,
  period_end: null,
  daily_total: 4200,
  period_budget: null,
  cpa_target: null,
  velocity_cap_pct: null,
  max_daily_apply_minor: 630_000,
  max_change_pct_per_cycle: 0.2,
  ...over,
});

describe('unit descriptors — one conversion per field, both directions', () => {
  it('shows a MINOR-unit ceiling in the major units an operator types', () => {
    expect(toInput('max_daily_apply_minor', 630_000, usd)).toBe('6300');
    expect(toStored('max_daily_apply_minor', '6300', usd)).toBe(630_000);
  });

  it('uses the account currency offset, never a hardcoded 100', () => {
    expect(toInput('max_daily_apply_minor', 6300, jpy)).toBe('6300');
    expect(toStored('max_daily_apply_minor', '6300', jpy)).toBe(6300);
  });

  it('shows a stored fraction as a whole percent, free of float noise', () => {
    expect(toInput('max_change_pct_per_cycle', 0.2, usd)).toBe('20');
    expect(toStored('max_change_pct_per_cycle', '20', usd)).toBe(0.2);
    expect(toInput('velocity_cap_pct', 0.35, usd)).toBe('35');
  });

  it('prices an awareness target per thousand impressions, not per one', () => {
    expect(toInput('cpa_target', 0.05, cpm)).toBe('50');
    expect(toStored('cpa_target', '50', cpm)).toBe(0.05);
  });

  it('reads a blank or unparsable field as no value', () => {
    expect(toStored('daily_total', '', usd)).toBeNull();
    expect(toStored('daily_total', 'abc', usd)).toBeNull();
  });
});

describe('toFormValues — every field seeded from the portfolio, no keep-current sentinel', () => {
  it('shows the caps an operator is about to arm autopilot behind', () => {
    const values = toFormValues(current(), usd);
    expect(values.max_daily_apply_minor).toBe('6300');
    expect(values.max_change_pct_per_cycle).toBe('20');
    expect(values.daily_total).toBe('4200');
  });
});

describe('createPortfolioFormSchema — the resolver, derived from the contracts patch', () => {
  const parse = (over: Record<string, unknown>, currentOver: Partial<PortfolioCurrentValues> = {}) =>
    createPortfolioFormSchema(() => usd, current(currentOver)).safeParse({
      ...toFormValues(current(currentOver), usd),
      ...over,
    });

  it('hands submit every value already in its contract unit', () => {
    const result = parse({ max_daily_apply_minor: '7000', max_change_pct_per_cycle: '15' });
    expect(result.success).toBe(true);
    expect(result.data?.max_daily_apply_minor).toBe(700_000);
    expect(result.data?.max_change_pct_per_cycle).toBe(0.15);
  });

  it('enforces the contracts bound rather than a second hand-written one', () => {
    // velocity_cap_pct is z.number().min(0).max(5) in contracts — 600% is 6.0, over the max.
    expect(parse({ velocity_cap_pct: '600' }).success).toBe(false);
    expect(parse({ name: '' }).success).toBe(false);
  });

  it('mirrors the DB CHECK: autopilot needs both caps above zero', () => {
    expect(parse({ apply_mode: 'autopilot' }).success).toBe(true);
    const missing = parse({ apply_mode: 'autopilot', max_change_pct_per_cycle: '' });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues.some((i) => i.path[0] === 'max_change_pct_per_cycle')).toBe(true);
  });

  it('refuses a blank on a column the patch cannot clear', () => {
    // velocity_cap_pct has no null in the contract, so blanking a set one would silently
    // keep the old cap. Blank is fine when the portfolio never had one.
    expect(parse({ velocity_cap_pct: '' }, { velocity_cap_pct: 0.35 }).success).toBe(false);
    expect(parse({ velocity_cap_pct: '' }).success).toBe(true);
  });

  it('lets a nullable column be cleared', () => {
    const result = parse({ cpa_target: '' }, { cpa_target: 42 });
    expect(result.success).toBe(true);
    expect(result.data?.cpa_target).toBeNull();
  });
});

describe('buildPatch — the diff is the dirty fields, in contract units', () => {
  const parsed = (over: Record<string, unknown>) =>
    createPortfolioFormSchema(() => usd, current()).parse({ ...toFormValues(current(), usd), ...over });

  it('patches only what changed', () => {
    const values = parsed({ name: 'Renamed' });
    expect(buildPatch(values, { name: true })).toEqual({ name: 'Renamed' });
  });

  it('sends null for a cleared nullable column', () => {
    const values = parsed({ period_budget: '' });
    expect(buildPatch(values, { period_budget: true })).toEqual({ period_budget: null });
  });

  it('drops a blank on a column that cannot be nulled', () => {
    const values = parsed({ velocity_cap_pct: '' });
    expect(buildPatch(values, { velocity_cap_pct: true })).toEqual({});
  });
});
