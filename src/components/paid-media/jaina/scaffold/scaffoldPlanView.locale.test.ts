import { describe, expect, it } from 'bun:test';
import { PAID_SCAFFOLD_AUTOPILOT_SCOPES_OFF, paidScaffoldPlanSchema } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import en from '../../../../../messages/scale/en.json';
import es from '../../../../../messages/scale/es.json';
import pt from '../../../../../messages/scale/pt-BR.json';
import {
  audienceLinesOf,
  deployBlockersOf,
  formatMetricValue,
  formatReach,
  objectiveLabel,
  scaffoldSummaryOf,
  sourceLabel,
  windowLabel,
} from './scaffoldPlanView';

const plan = paidScaffoldPlanSchema.parse({
  schema_version: 1,
  objective: 'OUTCOME_SALES',
  currency: 'MXN',
  adsets: [
    {
      path_key: 'campaign/audience',
      name: 'Customer campaign name',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      daily_budget_minor_units: 6199,
      budget_basis: 'Original generated budget explanation',
      budget_source: 'derived',
      meta_floor_minor_units: 100,
      raised_to_floor: false,
      expected_conversions_per_day: 3,
      audience: {
        kind: 'group',
        group_version_id: '11111111-1111-4111-8111-111111111111',
        group_name: 'Authored audience',
        member_count: 1,
        members: [{ label: 'Authored member', kind: 'custom' }],
        targeting_summary: 'Original generated targeting',
        reach: { lower: 1200000, upper: 1400000 },
      },
      promoted_object: null,
    },
  ],
  ads: [],
  evidence: [],
  expected: {
    daily_budget_minor_units: 6199,
    currency: 'MXN',
    cpa: 20.66,
    cpa_window: 'last_30d',
    conversions_per_day: 3,
    basis: 'Original generated basis',
  },
  optimizer_enrollment: {
    portfolio: { new_name: 'Authored portfolio' },
    apply_mode: 'recommend',
    autopilot_scopes: PAID_SCAFFOLD_AUTOPILOT_SCOPES_OFF,
  },
  blockers: [
    {
      code: 'custom_refusal',
      path_key: 'campaign/audience',
      message: 'Original generated refusal',
    },
    {
      code: 'custom_refusal',
      path_key: 'campaign/other',
      message: 'Original generated refusal',
    },
  ],
});

describe('scaffold UI language boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { scale: messages },
      namespace: 'scale',
    });
    it(`${locale}: translates labels while preserving authored plan data and financial values`, () => {
      const before = JSON.stringify(plan);
      expect(objectiveLabel(plan.objective, t)).toBe(
        { en: 'Sales', 'pt-BR': 'Vendas', es: 'Ventas' }[locale],
      );
      expect(sourceLabel('meta_reachestimate', t)).not.toBe('meta_reachestimate');
      expect(windowLabel('last_30d', t)).toContain('30');
      const [audience] = audienceLinesOf(plan, t, locale);
      expect(audience).toMatchObject({
        name: 'Authored audience',
        summary: 'Original generated targeting',
        members: ['Authored member'],
        adSets: ['Customer campaign name'],
      });
      expect(audience.reach).toBe(formatReach(plan.adsets[0].audience.reach, t, locale));
      const summary = scaffoldSummaryOf(plan, null, null, t, locale);
      expect(summary).toMatchObject({
        currency: 'MXN',
        dailyBudgetMinorUnits: 6199,
        cpa: 20.66,
        conversionsPerDay: 3,
      });
      expect(
        formatMetricValue(
          {
            label: 'Cost',
            value: 2.5,
            unit: 'USD',
            window: null,
            source: 'derived',
          },
          locale,
        ),
      ).not.toContain('R$');
      const blockers = deployBlockersOf({
        plan,
        planLoaded: true,
        tree: null,
        contentHash: 'a'.repeat(64),
        translate: t,
      });
      expect(blockers[0].code).toBe('custom_refusal');
      expect(blockers[0].message).toContain('Original generated refusal');
      expect(blockers[0].message).toContain('2');
      expect(JSON.stringify(plan)).toBe(before);
    });
  }
});
