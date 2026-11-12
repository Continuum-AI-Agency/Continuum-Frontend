import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '@continuum/contracts';
import { createTranslator } from 'next-intl';
import es from '../../../../../messages/scale/es.json';
import pt from '../../../../../messages/scale/pt-BR.json';
import { buildCampaignSections } from './campaignGroups';
import {
  buildGooglePickerGroup,
  googleCampaignEligibility,
  pickerChildKindLabels,
  pickerProviderStatusLabel,
  platformCurrencyRefusal,
} from './platformPickerModel';

const translate = (locale: 'pt-BR' | 'es') =>
  createTranslator({
    locale,
    messages: { scale: locale === 'pt-BR' ? pt : es },
    namespace: 'scale',
  });
const metrics: WindowMetrics = {
  spend: 100,
  purchases: 2,
  addToCarts: 0,
  clicks: 20,
  impressions: 1000,
};
const snapshot = (override: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'adset',
  name: 'Authored English name',
  status: 'frozen',
  currentBudget: 0,
  ageDays: 10,
  windows: { d3: metrics, d7: metrics, d14: metrics },
  freezeReason: 'unsupported_budget',
  ...override,
});
describe('picker presentation', () => {
  it('localizes controlled child/status labels without changing enum values', () => {
    expect(pickerChildKindLabels('asset_group', translate('pt-BR'))).toEqual({
      one: 'grupo de recursos',
      many: 'Grupos de recursos',
    });
    expect(pickerChildKindLabels('adset', translate('es')).one).toBe('conjunto de anuncios');
    expect(pickerProviderStatusLabel('CAMPAIGN_PAUSED', translate('es'))).not.toBe(
      'CAMPAIGN_PAUSED',
    );
    expect(pickerProviderStatusLabel('unrecognized-provider-code', translate('es'))).toBe(
      es.entityUnknown,
    );
  });
  it('retains Google admission, source names, currencies, IDs, ranks and children while localizing reasons', () => {
    const input = {
      account: { account_id: '123', name: 'English account', currency: 'MXN' },
      portfolioCurrency: 'MXN',
      campaigns: [
        { id: 'search', name: 'English campaign', channelType: 'SEARCH', spend: 5 },
        { id: 'video', name: 'Authored Video name', channelType: 'VIDEO', spend: 8 },
      ],
      adGroups: [{ id: 'child', name: 'Authored child name', campaignId: 'search' }],
    };
    const original = structuredClone(input);
    const baseline = buildGooglePickerGroup(input);
    const localized = buildGooglePickerGroup(input, translate('es'));
    const neutral = (group: typeof baseline) => ({
      ...group,
      refusal: null,
      campaigns: group.campaigns.map(({ typeLabel: _type, reason: _reason, ...data }) => data),
    });
    expect(neutral(localized)).toEqual(neutral(baseline));
    expect(input).toEqual(original);
    expect(localized.campaigns.find((c) => c.id === 'video')?.reason).toContain(
      'Google no permite',
    );
    for (const type of [
      'SEARCH',
      'PERFORMANCE_MAX',
      'DEMAND_GEN',
      'SHOPPING',
      'SMART',
      'DISPLAY',
      'VIDEO',
      'LOCAL',
      null,
    ])
      expect(googleCampaignEligibility(type, translate('pt-BR')).eligible).toBe(
        googleCampaignEligibility(type).eligible,
      );
    const refusal = platformCurrencyRefusal('google_ads', 'MXN', 'USD', translate('pt-BR'));
    expect(refusal).toContain('USD');
    expect(refusal).toContain('MXN');
  });
  it('localizes derived ungrouped and held labels while preserving authored names, IDs and all metrics', () => {
    const inputs = [
      snapshot(),
      snapshot({ id: 'authored', campaignId: 'campaign', campaignName: 'Ungrouped' }),
    ];
    const original = structuredClone(inputs);
    const baseline = buildCampaignSections(inputs);
    const localized = buildCampaignSections(
      inputs,
      'adset',
      undefined,
      undefined,
      translate('pt-BR'),
    );
    expect(localized.find((s) => s.campaignId === '__ungrouped__')?.campaignName).toBe('Sem grupo');
    expect(localized.find((s) => s.campaignId === 'campaign')?.campaignName).toBe('Ungrouped');
    const neutral = (sections: typeof baseline) =>
      sections.map(({ campaignName: _name, ...s }) => ({
        ...s,
        adsets: s.adsets.map(({ reason: _reason, ...data }) => data),
      }));
    expect(neutral(localized)).toEqual(neutral(baseline));
    expect(inputs).toEqual(original);
    expect(localized[0].adsets[0].reason).not.toBe(baseline[0].adsets[0].reason);
    const [campaign] = buildCampaignSections(
      [snapshot({ campaignId: 'campaign' })],
      'campaign',
      undefined,
      undefined,
      translate('es'),
    );
    expect(campaign.adsets[0].reason).toContain('(ABO)');
  });
});
