import { describe, expect, it } from 'bun:test';
import { buildCreateConfig, emptyDraft, stepIssues } from './wizardModel';

// PP-DT-C-wizard-thousands-separator-reads-as-one (deep test 2026-10-31, lane C, persona 7):
// the New-portfolio wizard reads every amount with Number.parseFloat, which stops at the first
// character it cannot read. A daily budget typed "1,500" — how an MXN account writes fifteen
// hundred — passes every step check and is created as 1 a day; a cost target "1,200" becomes 1,
// so every ad set reads as far over target. The Manage panel reads the same fields with
// Number() and refuses "1,500"; the wizard must never turn it into 1.

const ctx = { selectedBudgetSum: 1600, blockedCount: 0 };
const createCtx = { currency: 'MXN', selectedBudgetSum: 1600, level: 'adset' as const };
const base = { ...emptyDraft(), name: 'Q4 leads', adsetIds: ['as-1'] };

describe('amounts typed with separators or symbols', () => {
  for (const typed of ['1,500', '1 500', '$1,500', '1.500,00']) {
    it(`daily budget “${typed}” is refused in words or kept as 1500 — never created as 1`, () => {
      const draft = { ...base, dailyTotal: typed };
      const issues = stepIssues(draft, 'plan', ctx);
      const config = buildCreateConfig(draft, createCtx);
      expect(config.daily_total).not.toBe(1);
      expect(issues.length > 0 || config.daily_total === 1500).toBe(true);
    });
  }

  it('cost target “1,200” is refused in words or kept as 1200 — never sent as 1', () => {
    const draft = { ...base, objective: 'lead' as const, target: '1,200' };
    const issues = stepIssues(draft, 'goal', ctx);
    const config = buildCreateConfig(draft, createCtx);
    expect(config.cpa_target).not.toBe(1);
    expect(issues.length > 0 || config.cpa_target === 1200).toBe(true);
  });

  it('plain numbers still read as typed', () => {
    const config = buildCreateConfig({ ...base, dailyTotal: '1500', target: '45.5' }, createCtx);
    expect(config.daily_total).toBe(1500);
    expect(config.cpa_target).toBe(45.5);
    expect(stepIssues({ ...base, dailyTotal: '1500' }, 'plan', ctx)).toEqual([]);
  });
});
