import { describe, expect, it } from 'bun:test';
import { getOptimizationMetricDefinition, OptimizationObjectiveSchema } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import {
  collectionPlural,
  entityNoun,
  platformName,
} from '@/components/paid-media/optimizer/entityNoun';
import {
  applyModeExplainer,
  applyModePill,
  autopilotScopeWords,
  confidenceBand,
  conversionVolume,
  deliveryLabel,
  freezeLabel,
  notImplementedMessage,
  recommendationActionCopy,
  recommendationLabel,
  upperBoundNote,
} from '@/components/paid-media/optimizer/reportModel';
import en from '../../../messages/scale/en.json';
import es from '../../../messages/scale/es.json';
import pt from '../../../messages/scale/pt-BR.json';
import {
  localizeOptimizationMetricDefinition,
  OPTIMIZATION_METRIC_DISPLAY_KEYS,
} from './optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from './optimizerTranslator';

for (const { locale, messages } of [
  { locale: 'en', messages: en },
  { locale: 'pt-BR', messages: pt },
  { locale: 'es', messages: es },
] as const) {
  const t = createTranslator({
    locale,
    timeZone: 'UTC',
    messages: { scale: messages },
    namespace: 'scale',
    onError(error) {
      throw error;
    },
  });
  const translate = createOptimizerDisplayTranslate(t);
  describe(`optimizer display boundaries ${locale}`, () => {
    it('clones canonical labels while preserving every objective, KPI and denominator', () => {
      for (const objective of OptimizationObjectiveSchema.options) {
        const original = getOptimizationMetricDefinition(objective);
        const before = JSON.stringify(original);
        const shown = localizeOptimizationMetricDefinition(original, translate);
        expect(shown).not.toBe(original);
        expect(shown.objective).toBe(objective);
        expect(shown.kpiField).toBe(original.kpiField);
        expect(shown.denominatorMultiplier).toBe(original.denominatorMultiplier);
        for (const field of ['resultLabel', 'costLabel', 'targetLabel'] as const)
          expect(shown[field]).toBe(translate(OPTIMIZATION_METRIC_DISPLAY_KEYS[objective][field]));
        expect(JSON.stringify(original)).toBe(before);
        expect(localizeOptimizationMetricDefinition(original)).toEqual(original);
      }
      const custom = {
        ...getOptimizationMetricDefinition('custom'),
        resultLabel: 'Demos booked — customer wording',
        costLabel: 'Customer cost label',
        targetLabel: 'Customer target label',
      };
      expect(localizeOptimizationMetricDefinition(custom, translate)).toEqual(custom);
    });
    it('uses stable entity/platform IDs and explicit singular/plural labels', () => {
      const google = { platform: 'google_ads', level: 'campaign' },
        tikTok = { platform: 'tiktok_ads', level: 'group' };
      expect(entityNoun(null, translate)).toBe(translate('entityAdSet'));
      expect(entityNoun(google, translate)).toBe(translate('entityCampaign'));
      expect(entityNoun(tikTok, translate)).toBe(translate('entityAdGroup'));
      expect(collectionPlural([google, tikTok], translate)).toBe(
        `${translate('entityCampaigns')} / ${translate('entityAdGroups')}`,
      );
      expect(platformName(google, translate)).toBe('Google Ads');
      expect(platformName({ platform: 'custom' }, translate)).toBe(translate('entityPlatform'));
      expect(google).toEqual({ platform: 'google_ads', level: 'campaign' });
    });
    it('translates hold/delivery guidance without changing state, glyphs or approval behavior', () => {
      for (const reason of [
        'no_conversions',
        'missing_window',
        'unsupported_budget',
        'lifetime_budget',
        'no_spend',
        'no_own_budget',
        'no_declared_objective',
        'kpi_mismatch',
        'future_reason',
      ])
        for (const entity of [
          null,
          { platform: 'google_ads', level: 'campaign' },
          { platform: 'tiktok_ads', level: 'group' },
        ]) {
          const shown = freezeLabel(reason, entity, translate);
          expect(shown?.hint).toBeTruthy();
          expect(shown?.hint).not.toContain('optimizer_');
          if (locale !== 'en') expect(shown?.label).not.toBe(freezeLabel(reason, entity)?.label);
        }
      expect(freezeLabel(null, null, translate)).toBeNull();
      for (const state of ['dark', 'throttled'])
        expect(deliveryLabel(state, translate)?.tone).toBe(deliveryLabel(state)?.tone);
      expect(deliveryLabel('serving', translate)).toBeNull();
      for (const kind of [
        'pause',
        'creative_refresh',
        'audience_expand',
        'settings',
        'pause_ad',
        'variate_creative',
        'seed_experiment',
        'restore_delivery',
      ]) {
        expect(recommendationLabel(kind, translate).glyph).toBe(recommendationLabel(kind).glyph);
        expect(recommendationActionCopy(kind, translate).approveLabel).toBeTruthy();
        expect(notImplementedMessage(kind, translate)).not.toContain('optimizer_');
      }
      expect(confidenceBand('HIGH', translate).variant).toBe('success');
      expect(applyModePill('autopilot', translate)?.indicator).toBe('success');
    });
    it('formats whole count/scope messages while retaining raw volume and guardrails', () => {
      const source = {
        events: 1250,
        sampleSize: 0.6,
        underFloor: { adsetIds: ['stable-1', 'stable-2'], floorEvents: 20 },
      };
      const original = conversionVolume(source)!;
      const shown = conversionVolume(source, translate)!;
      const { note: originalNote, ...originalData } = original;
      const { note: shownNote, ...shownData } = shown;
      expect(shownData).toEqual(originalData);
      expect(shownNote).toContain(new Intl.NumberFormat(locale).format(1250));
      if (locale !== 'en') expect(shownNote).not.toBe(originalNote);
      expect(upperBoundNote({ hi: null, events: 1 }, translate)).toContain('1');
      expect(upperBoundNote({ hi: 2, events: 1 }, translate)).toBeNull();
      const scopes = {
        budget: true,
        creative_swap: true,
        audience_change: false,
        new_audience: false,
        new_creatives: false,
        budget_move: false,
      };
      expect(autopilotScopeWords(scopes, translate, locale)).toContain(translate('scopeBudget'));
      expect(applyModeExplainer('autopilot', scopes, translate, locale)).toContain(
        translate('scopeCreative'),
      );
      expect(applyModeExplainer('observe', undefined, translate, locale)).toBe(
        translate('observeExplainer'),
      );
    });
  });
}
