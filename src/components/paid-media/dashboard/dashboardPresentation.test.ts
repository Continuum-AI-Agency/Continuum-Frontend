import { describe, expect, it } from 'bun:test';
import { RULE_ACTION_STATUSES, RULE_ACTION_TYPES } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import es from '../../../../messages/scale/es.json';
import pt from '../../../../messages/scale/pt-BR.json';
import {
  dashboardActionLabel,
  dashboardFreshness,
  dashboardMetricLabel,
  dashboardScopeLabel,
  dashboardStatusLabel,
} from './dashboardPresentation';

const translate = (locale: 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: { scale: locale === 'pt-BR' ? pt : es },
    namespace: 'scale',
  });
describe('paid dashboard presentation', () => {
  it('localizes every canonical action and status without changing the code', () => {
    for (const locale of ['pt-BR', 'es'] as const) {
      const t = translate(locale);
      for (const code of RULE_ACTION_TYPES) {
        const label = dashboardActionLabel(code, t);
        expect(label).not.toBe(code);
        expect(label).not.toBe(t('dashboardActionOther'));
      }
      for (const code of RULE_ACTION_STATUSES) {
        expect(dashboardStatusLabel(code, t)).not.toBe(code);
      }
    }
    expect(dashboardActionLabel('PAUSE_CAMPAIGN', translate('pt-BR'))).toBe('Pausar campanha');
    expect(dashboardScopeLabel('CAMPAIGN', translate('es'))).toBe('Campaña');
    expect(dashboardActionLabel('provider-new-code', translate('es'))).toBe('Acción');
    expect(dashboardStatusLabel('provider-new-code', translate('es'))).toBe('Desconocido');
  });
  it('preserves freshness rounding and cutoff semantics while using ICU plurals', () => {
    const now = Date.UTC(2026, 10, 11);
    const at = (ms: number) => new Date(now + ms).toISOString();
    expect(dashboardFreshness(undefined, translate('es'), now)).toBeNull();
    expect(dashboardFreshness(at(0), translate('es'), now)).toBe('Desactualizado');
    expect(dashboardFreshness(at(1), translate('pt-BR'), now)).toBe('Válido por 1 minuto');
    expect(dashboardFreshness(at(60001), translate('es'), now)).toBe('Válido durante 2 minutos');
    expect(dashboardFreshness(at(3600000), translate('pt-BR'), now)).toBe('Válido por 1 hora');
    expect(dashboardFreshness(at(25 * 3600000), translate('es'), now)).toBe(
      'Válido durante 1 día y 1 hora',
    );
  });
  it('localizes application metric labels and keeps standard metric identities', () => {
    expect(dashboardMetricLabel('spend', translate('pt-BR'))).toBe(pt.spend_85f3d55);
    expect(dashboardMetricLabel('impressions', translate('es'))).toBe(es.impressions_c6310e9);
    expect(dashboardMetricLabel('cpc', translate('es'))).toBe('CPC');
  });
});
