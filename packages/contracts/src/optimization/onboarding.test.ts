import { describe, expect, test } from 'bun:test';
import {
  suggestionToCreateRequest,
  suggestionToEnrollRequest,
  suggestionToPortfolioConfig,
} from './onboarding';
import type { PortfolioSuggestion } from './service';
import { CreatePortfolioRequestSchema, EnrollRequestSchema } from './service';

const UUID = '11111111-1111-4111-8111-111111111111';

function suggestion(overrides: Partial<PortfolioSuggestion> = {}): PortfolioSuggestion {
  return {
    objective: 'purchase',
    name: 'Prospecting — Purchases',
    level: 'adset',
    mode: 'balanced',
    daily_total: 500,
    adset_ids: ['as_1', 'as_2'],
    summary: { adsets: 2, spend14: 1200, conv14: 40 },
    reason: '2 ad sets tracking purchases',
    ...overrides,
  };
}

describe('suggestionToPortfolioConfig', () => {
  test("defaults apply_mode='observe' (soak-first) and carries objective/level/mode/daily_total", () => {
    const cfg = suggestionToPortfolioConfig(suggestion({ mode: 'scale' }));
    expect(cfg).toMatchObject({
      name: 'Prospecting — Purchases',
      objective: 'purchase',
      level: 'adset',
      mode: 'scale',
      apply_mode: 'observe',
      daily_total: 500,
    });
    expect('cpa_target' in cfg).toBe(false);
  });

  test("accepts apply_mode='recommend' for human-in-the-loop create", () => {
    const cfg = suggestionToPortfolioConfig(suggestion(), { apply_mode: 'recommend' });
    expect(cfg.apply_mode).toBe('recommend');
    const req = suggestionToCreateRequest({
      brand_id: UUID,
      ad_account_id: 'act_1',
      suggestion: suggestion(),
      apply_mode: 'recommend',
    });
    expect(req.config.apply_mode).toBe('recommend');
    expect(() => CreatePortfolioRequestSchema.parse(req)).not.toThrow();
  });

  test('carries cpa_target only when the suggestion set one', () => {
    expect(suggestionToPortfolioConfig(suggestion({ cpa_target: 42 })).cpa_target).toBe(42);
    expect(
      suggestionToPortfolioConfig(suggestion({ cpa_target: undefined })).cpa_target,
    ).toBeUndefined();
  });

  test('output is always a valid CreatePortfolio config', () => {
    const req = suggestionToCreateRequest({
      brand_id: UUID,
      ad_account_id: 'act_1',
      suggestion: suggestion({ cpa_target: 30 }),
    });
    expect(() => CreatePortfolioRequestSchema.parse(req)).not.toThrow();
    expect(req.config.apply_mode).toBe('observe');
  });
});

describe('suggestionToEnrollRequest', () => {
  test('adset-level enrolls the ad-set ids', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({ level: 'adset', adset_ids: ['a', 'b'] }),
    );
    expect(req).toEqual({ portfolio_id: UUID, adset_ids: ['a', 'b'] });
    expect(() => EnrollRequestSchema.parse(req)).not.toThrow();
  });

  test('single-campaign campaign-level enrolls by campaign_id', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({ level: 'campaign', adset_ids: ['camp_1'] }),
    );
    expect(req).toEqual({ portfolio_id: UUID, campaign_id: 'camp_1' });
    expect(() => EnrollRequestSchema.parse(req)).not.toThrow();
  });

  test('multi-campaign campaign-level falls back to the adset_ids form (caller fans out)', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({ level: 'campaign', adset_ids: ['c1', 'c2'] }),
    );
    expect(req).toEqual({ portfolio_id: UUID, adset_ids: ['c1', 'c2'] });
  });

  test('forwards the suggestion names so enrolled rows are not nameless', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({
        adset_ids: ['a', 'b'],
        adset_names: { a: 'ALEIRA // $249', b: 'ALEIRA // 333' },
      }),
    );
    expect(req).toEqual({
      portfolio_id: UUID,
      adset_ids: ['a', 'b'],
      adset_names: { a: 'ALEIRA // $249', b: 'ALEIRA // 333' },
    });
    expect(() => EnrollRequestSchema.parse(req)).not.toThrow();
  });

  test('forwards only names for ids this suggestion carries', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({ adset_ids: ['a'], adset_names: { a: 'Kept', z: 'Belongs to another group' } }),
    );
    expect(req).toEqual({ portfolio_id: UUID, adset_ids: ['a'], adset_names: { a: 'Kept' } });
  });

  test('omits adset_names entirely when nothing resolved — an empty map reads as "no names exist"', () => {
    const blank = suggestionToEnrollRequest(UUID, suggestion({ adset_ids: ['a'] }));
    expect(blank).not.toHaveProperty('adset_names');

    const whitespace = suggestionToEnrollRequest(
      UUID,
      suggestion({ adset_ids: ['a'], adset_names: { a: '   ' } }),
    );
    expect(whitespace).not.toHaveProperty('adset_names');
  });

  test('campaign-level still enrolls by campaign_id — the edge resolves names from its own read', () => {
    const req = suggestionToEnrollRequest(
      UUID,
      suggestion({
        level: 'campaign',
        adset_ids: ['camp_1'],
        adset_names: { camp_1: 'Campaign 1' },
      }),
    );
    expect(req).toEqual({ portfolio_id: UUID, campaign_id: 'camp_1' });
  });
});
