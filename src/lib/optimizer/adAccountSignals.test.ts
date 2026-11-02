import { describe, expect, it } from 'bun:test';
import {
  type AccountCandidate,
  AccountPlatformMetricsSchema,
  type AdSetSnapshot,
  accountCandidateSchema,
  GoogleTopCampaignsSchema,
  type PortfolioListItem,
  PortfolioListItemSchema,
  readAdAccount,
} from '@continuum/contracts';
import vivoRecorded from '@/components/paid-media/optimizer/sections/platforms/__fixtures__/google-vivo47-paid-media-metrics.json';
import {
  adAccountSignalsFrom,
  figureIn,
  googleAccountOf,
  googleCampaignsFrom,
  googleFindingsFrom,
  metaCampaignsFrom,
  metaFindingsFrom,
  portfolioSignalOf,
  portfoliosOfAccount,
  ruleOfCard,
  windowSignalFrom,
} from './adAccountSignals';

// Production rows read on 2026-11-02 through the service role: optimizer_list_portfolios,
// optimizer_get_platform_cards('google_ads'), optimizer_get_account_read and
// optimizer_get_account_platform_metrics('d7'). Trimmed to what the mappers read (checklists
// emptied, negative lists cut to one term), every figure as production returned it.
const REAL = {
  vivo: [
    {
      id: 'platform_signal:0451585f-471c-4930-a88b-',
      detector: 'post_click',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        "8 keywords with Quality Score 3 or less spent $19,943 MXN (60% of the keyword spend) across 2 services, and they all land on the same page. A low score raises every click's price; a page and an ad group per service lifts it.",
      evidence: { rule: 'acct_quality_score_by_service', severity: 'medium' },
      platform_card: {
        bars: [
          { label: 'Vivo 47', share: 0.72, value: 14441.76, flagged: true, target_share: null },
          { label: 'Acuática', share: 0.28, value: 5501.49, flagged: true, target_share: null },
        ],
        idea: 'quality_score_by_service',
        unit: 'money',
        facts: [
          {
            label: 'Vivo 47',
            value: '"Entrenamiento funcional" QS 1, "Gym cerca de mi" QS 2 · $14,442 MXN',
          },
          { label: 'Acuática', value: '"Clases de natación cerca de mi" QS 2 · $5,501 MXN' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Low Quality Score by service — one landing page per service',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:27e90a69-8963-432b-9e22-',
      detector: 'funnel_coverage',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '51% of the search-term spend ($11,937 MXN) buys people who typed the brand, inside 2 campaigns that also have to find new customers. Brand searches crowd out the budget for new demand.',
      evidence: { rule: 'acct_brand_vs_nonbrand', severity: 'medium' },
      platform_card: {
        bars: [
          { label: 'Brand', share: 0.51, value: 11937.38, flagged: true, target_share: null },
          { label: 'Non-brand', share: 0.49, value: 11607.94, flagged: false, target_share: null },
        ],
        idea: 'brand_vs_nonbrand',
        unit: 'money',
        facts: [
          { label: 'Brand spend', value: '$11,937 MXN · $7.68 MXN per conversion Google reports' },
          {
            label: 'Non-brand spend',
            value: '$11,608 MXN · $9.25 MXN per conversion Google reports',
          },
          {
            label: 'Not cost per lead',
            value: '85% of the conversions Google reports are visits or attention events',
          },
          { label: 'Brand terms (inferred)', value: 'vivo 47, vivo47' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: '51% of the spend buys people already looking for you',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:524e08a8-8e57-4fb0-88e0-',
      detector: 'optimization_event',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '"www.vivo47.com.mx - GA4 (web) consulta_membresias", "www.vivo47.com.mx - GA4 (web) contacto" are leads that are not primary, while Google bids toward "Lead formulario web". All 5 conversion actions carry the same value, so Google cannot te',
      evidence: { rule: 'acct_conversion_value_map', severity: 'medium' },
      platform_card: {
        bars: [
          {
            label: 'www.vivo47.com.mx - GA4 (web) user_engagement',
            share: 0.85,
            value: 3469.78,
            flagged: true,
            target_share: null,
          },
          {
            label: 'www.vivo47.com.mx - GA4 (web) consulta_membresias',
            share: 0.12,
            value: 494.93,
            flagged: true,
            target_share: null,
          },
          {
            label: 'www.vivo47.com.mx - GA4 (web) contacto',
            share: 0.01,
            value: 48.62,
            flagged: true,
            target_share: null,
          },
          {
            label: 'Lead formulario web',
            share: 0.01,
            value: 45,
            flagged: false,
            target_share: null,
          },
          {
            label: '(Evento de Google Analytics file_download)',
            share: 0,
            value: 3,
            flagged: false,
            target_share: null,
          },
        ],
        idea: 'conversion_value_map',
        unit: 'count',
        facts: [
          { label: 'Primary today', value: 'Lead formulario web' },
          {
            label: 'www.vivo47.com.mx - GA4 (web) user_engagement',
            value: '3470 · secondary · value 1',
          },
          {
            label: 'www.vivo47.com.mx - GA4 (web) consulta_membresias',
            value: '495 · secondary · value 1',
          },
          { label: 'www.vivo47.com.mx - GA4 (web) contacto', value: '49 · secondary · value 1' },
          { label: 'Lead formulario web', value: '45 · primary · value 1' },
          { label: '(Evento de Google Analytics file_download)', value: '3 · secondary · value 1' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Which conversion is worth what',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:aee6eff2-a229-4707-aaaf-',
      detector: 'delivery_collapse',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'Gourmetería is LEARNING with $567 MXN/day of budget and showed no ad for 30 days. Google says: BIDDING_STRATEGY_LEARNING. Fix it in Google Ads; nothing here changes it.',
      evidence: { rule: 'G12', severity: 'high' },
      platform_card: {
        reasons: ['BIDDING_STRATEGY_LEARNING'],
        variant: 'google_delivery_issue',
        currency: 'MXN',
        dark_days: 30,
        dark_since: '2026-10-03',
        account_wide: false,
        campaign_name: 'Gourmetería',
        budget_per_day: 567,
        disapproved_ads: 0,
      },
    },
    {
      id: 'platform_signal:ca0bc3b7-6acb-4217-bb7c-',
      detector: 'optimization_event',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '85% of the 4051 conversions Google reports are visits or attention events ("www.vivo47.com.mx - GA4 (web) user_engagement") marked primary. Only 592 are leads or sales. Google bids toward what is primary, so it is buying visits. Our own rea',
      evidence: { rule: 'acct_inflated_primary_conversion', severity: 'high' },
      platform_card: {
        bars: [
          {
            label: 'Visits and attention events',
            share: 0.85,
            value: 3460.78,
            flagged: true,
            target_share: null,
          },
          {
            label: 'Leads and sales',
            share: 0.15,
            value: 591.56,
            flagged: false,
            target_share: null,
          },
        ],
        idea: 'inflated_primary_conversion',
        unit: 'count',
        facts: [
          { label: 'Conversions Google reports', value: '4051' },
          { label: 'Of them, visits and attention events', value: '3461 (85%)' },
          { label: 'Real results (leads, sales)', value: '592' },
          { label: 'Reported cost per conversion', value: '$10.09 MXN' },
          { label: 'Real cost per result', value: '$69.08 MXN' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Most of what Google calls a conversion is a visit',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:dc27018a-136d-4789-be10-',
      detector: 'scale_readiness',
      portfolio_ids: ['e642c737-ddde-4622-af8f-4b5622da98d0'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        "VIVO 47-EKATAR loses 75% of its impressions to budget, but the account's primary conversion counts visits: a bigger budget today buys more visits, not more leads. The raise waits until the conversion is fixed.",
      evidence: { rule: 'acct_capped_budget_locked', severity: 'medium' },
      platform_card: {
        bars: [
          { label: 'Shown', share: 0.25, value: 0.25, flagged: false, target_share: null },
          { label: 'Lost to budget', share: 0.75, value: 0.75, flagged: true, target_share: null },
        ],
        idea: 'capped_budget_locked',
        unit: 'share',
        facts: [
          { label: 'Lost to budget', value: '75%' },
          { label: 'Budget', value: '$1,179 MXN/day' },
          { label: 'Reported cost per conversion', value: '$8.28 MXN' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: '75% lost to budget — raise only after fixing the conversion',
        checklist: [],
        window_days: 30,
        campaign_name: 'VIVO 47-EKATAR',
        recommend_only: false,
      },
    },
  ],
  easyfitG: [
    {
      id: 'platform_signal:09956f3b-b340-4714-9c0d-',
      detector: 'dead_tail',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'Searches for other brands (smart fit, station 24, anytime fitness, planet fitness, total fitness, sports world, golds gym) spent $2,150 MXN with no conversion: people looking for a competitor rarely switch on an ad.',
      evidence: { rule: 'acct_competitor_terms', severity: 'medium' },
      platform_card: {
        idea: 'competitor_terms',
        facts: [
          { label: 'Spend on competitor searches', value: '$2,150 MXN · 0 conversions' },
          { label: 'smart fit', value: '$819 MXN · 44 terms' },
          { label: 'station 24', value: '$745 MXN · 33 terms' },
          { label: 'anytime fitness', value: '$272 MXN · 13 terms' },
          { label: 'planet fitness', value: '$261 MXN · 17 terms' },
          {
            label: 'Competitor list (inferred from the search terms)',
            value:
              'anytime fitness, crunch fitness, energy fitness, golds gym, planet fitness, smart fit, smartfit, snap fitness',
          },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Competitor searches spend and do not convert',
        checklist: [],
        negatives: [
          { theme: 'smart fit', terms: ['costo smart fit'] },
          { theme: 'station 24', terms: ['gimnasio station 24'] },
          { theme: 'anytime fitness', terms: ['anytime fitness'] },
          { theme: 'planet fitness', terms: ['gym planet fitness'] },
          { theme: 'total fitness', terms: ['total fitness 220'] },
          { theme: 'sports world', terms: ['sports world cerca de mi'] },
          { theme: 'golds gym', terms: ["gold's gym cerca de mi"] },
        ],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:0e8990e3-7411-4121-bbeb-',
      detector: 'delivery_collapse',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'Search | Octubre | Easy Fit is ELIGIBLE with $350 MXN/day of budget and showed no ad for 7 days. Google says: SERVING_STATUS_SUSPENDED. Fix it in Google Ads; nothing here changes it.',
      evidence: { rule: 'G12', severity: 'high' },
      platform_card: {
        reasons: ['SERVING_STATUS_SUSPENDED'],
        variant: 'google_delivery_issue',
        currency: 'MXN',
        dark_days: 7,
        dark_since: '2026-10-26',
        account_wide: false,
        campaign_name: 'Search | Octubre | Easy Fit',
        budget_per_day: 350,
        disapproved_ads: 0,
      },
    },
    {
      id: 'platform_signal:5a20d848-c372-40bc-8b37-',
      detector: 'optimization_event',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'All 6 conversion actions carry the same value, so Google cannot tell a contact from a map click.',
      evidence: { rule: 'acct_conversion_value_map', severity: 'medium' },
      platform_card: {
        bars: [
          {
            label: 'Local actions - Other engagements',
            share: 0.82,
            value: 6881,
            flagged: false,
            target_share: null,
          },
          {
            label: 'Local actions - Directions',
            share: 0.09,
            value: 791,
            flagged: false,
            target_share: null,
          },
          {
            label: 'Lead WhatsApp web',
            share: 0.05,
            value: 410,
            flagged: false,
            target_share: null,
          },
          { label: 'Clicks to call', share: 0.02, value: 151, flagged: false, target_share: null },
          {
            label: 'Local actions - Website visits',
            share: 0.01,
            value: 101,
            flagged: false,
            target_share: null,
          },
          { label: 'Lead formulario web', share: 0, value: 21, flagged: false, target_share: null },
        ],
        idea: 'conversion_value_map',
        unit: 'count',
        facts: [
          {
            label: 'Primary today',
            value:
              'Local actions - Other engagements, Local actions - Directions, Lead WhatsApp web, Clicks to call, Local actions - Website visits, Lead formulario web',
          },
          { label: 'Local actions - Other engagements', value: '6881 · primary · value 1' },
          { label: 'Local actions - Directions', value: '791 · primary · value 1' },
          { label: 'Lead WhatsApp web', value: '410 · primary · value 1' },
          { label: 'Clicks to call', value: '151 · primary · value 1' },
          { label: 'Local actions - Website visits', value: '101 · primary · value 1' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Which conversion is worth what',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:b86de5ca-2ff8-4972-914a-',
      detector: 'delivery_collapse',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'The account showed no ad on 11 days after it had started serving (2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31). At its served-day average that is about 409.4 conversions lost. Nothing raised an alarm while it happened.',
      evidence: { rule: 'acct_continuity_calendar', severity: 'medium' },
      platform_card: {
        idea: 'continuity_calendar',
        unit: 'money',
        facts: [
          { label: 'Dark days', value: '11' },
          { label: 'Conversions lost (served-day average)', value: '409.4' },
          { label: 'Dark', value: '2026-10-15 → 2026-10-19' },
          { label: 'Dark', value: '2026-10-26 → 2026-10-31' },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Dark 2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:dde07154-a989-4c70-87b2-',
      detector: 'post_click',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        "11 keywords with Quality Score 3 or less spent $4,323 MXN (29% of the keyword spend) across 2 services. A low score raises every click's price; a page and an ad group per service lifts it.",
      evidence: { rule: 'acct_quality_score_by_service', severity: 'medium' },
      platform_card: {
        bars: [
          {
            label: 'Grupo de anuncios 1',
            share: 0.73,
            value: 3165.34,
            flagged: true,
            target_share: null,
          },
          {
            label: 'Grupo de anuncios 1',
            share: 0.27,
            value: 1157.98,
            flagged: true,
            target_share: null,
          },
        ],
        idea: 'quality_score_by_service',
        unit: 'money',
        facts: [
          {
            label: 'Grupo de anuncios 1',
            value: '"entrenamiento funcional" QS 3, "gym 24 horas" QS 2 · $3,165 MXN',
          },
          {
            label: 'Grupo de anuncios 1',
            value: '"gym" QS 2, "gym cerca de mí" QS 3 · $1,158 MXN',
          },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Low Quality Score by service — one landing page per service',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: false,
      },
    },
    {
      id: 'platform_signal:e74cd593-8996-4c9b-9cbe-',
      detector: 'creative_supply',
      portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'PMax | Octubre | Easy Fit | Leads in PMax | Octubre | Easy Fit | Leads has AVERAGE ad strength and is missing 2 portrait marketing images, 1 youtube video (vertical), 1 youtube video (square).',
      evidence: { rule: 'G18_pmax_coverage', severity: 'low' },
      platform_card: {
        variant: 'google_pmax_asset_group',
        asset_groups: [
          {
            name: 'PMax | Octubre | Easy Fit | Leads',
            missing: [
              '2 portrait marketing images',
              '1 youtube video (vertical)',
              '1 youtube video (square)',
            ],
            ad_strength: 'AVERAGE',
          },
        ],
        campaign_name: 'PMax | Octubre | Easy Fit | Leads',
      },
    },
  ],
  pink: [
    {
      id: 'platform_signal:1cd25607-470f-480d-af7e-',
      detector: 'scale_readiness',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis: 'Eventos 2026 has no results in the last 7 days to price.',
      evidence: { rule: 'G03', severity: 'low' },
      platform_card: {
        variant: 'google_budget_limited',
        currency: 'MXN',
        projection: null,
        days_limited: null,
        result_label: 'purchases',
        campaign_name: 'Eventos 2026',
        budget_per_day: 100,
        cost_per_result: null,
        proposed_budget_per_day: null,
        budget_lost_impression_share: 0.3418283308943324,
      },
    },
    {
      id: 'platform_signal:56db7013-6a6e-43b6-b40e-',
      detector: 'creative_supply',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '"Curso ISO 22301 Fundamentos" is the best ad in ISO/IEC 22301: Business Continuity: $87.53 MXN per conversion on 3.5 conversions, against $319 MXN for "Norma ISO 22301 Certificación". Write a new ad from it in Google Ads.',
      evidence: { rule: 'G10', severity: 'low' },
      platform_card: {
        winner: { label: 'Curso ISO 22301 Fundamentos', conversions: 3.5, cost_per_result: 87.53 },
        variant: 'google_ad_winner',
        currency: 'MXN',
        comparator: { label: 'Norma ISO 22301 Certificación', cost_per_result: 318.63 },
        best_assets: [],
        window_days: 30,
        ad_group_name: 'ISO/IEC 22301: Business Continuity',
        campaign_name: 'Cursos-pink-elephant-2025',
      },
    },
    {
      id: 'platform_signal:6f238110-bfd6-446c-9efe-',
      detector: 'post_click',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '11 leads became 1 sale worth $737 MXN on $9,507 MXN of spend (ROAS 0.08). The lead count looks fine; the leads do not buy. Core keywords score low on Quality: "iso 27000" QS 1, "ISO 42001" QS 3, "continuidad del negocio" QS 2. The client ru',
      evidence: { rule: 'acct_lead_to_sale_funnel', severity: 'high' },
      platform_card: {
        bars: [
          { label: 'Clicks', share: null, value: 1608, flagged: false, target_share: null },
          { label: 'Leads', share: null, value: 11, flagged: false, target_share: null },
          { label: 'Sales', share: null, value: 1, flagged: true, target_share: null },
        ],
        idea: 'lead_to_sale_funnel',
        unit: 'count',
        facts: [
          { label: 'Clicks', value: '1608' },
          { label: 'Leads', value: '11' },
          { label: 'Sales', value: '1 · $737 MXN' },
          { label: 'ROAS', value: '0.08' },
          { label: '"iso 27000"', value: 'QS 1' },
          { label: '"ISO 42001"', value: 'QS 3' },
          { label: '"continuidad del negocio"', value: 'QS 2' },
        ],
        blocked:
          'Lead → sale in GoHighLevel → WooCommerce: no connector exists yet (Backend, MCP and Supabase searched 2026-10-29). This card uses Google’s own sale conversion and GA4 when it is linked.',
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Leads that do not become sales',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: true,
      },
    },
    {
      id: 'platform_signal:c28413a2-59e1-4996-b9e5-',
      detector: 'post_click',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        "15 keywords with Quality Score 3 or less spent $3,793 MXN (48% of the keyword spend) across 6 services. A low score raises every click's price; a page and an ad group per service lifts it. The client runs this account: this is a recommendat",
      evidence: { rule: 'acct_quality_score_by_service', severity: 'medium' },
      platform_card: {
        bars: [
          { label: 'ISO 27000', share: 0.52, value: 1986.68, flagged: true, target_share: null },
          {
            label: 'Evento ISO 42001 29 OCT',
            share: 0.26,
            value: 1002.82,
            flagged: true,
            target_share: null,
          },
          {
            label: 'ISO/IEC 22301: Business Continuity',
            share: 0.17,
            value: 642.41,
            flagged: true,
            target_share: null,
          },
          { label: 'Talleres ITSM', share: 0.02, value: 67.45, flagged: true, target_share: null },
          {
            label: 'Agilidad y Scrum',
            share: 0.02,
            value: 64.24,
            flagged: true,
            target_share: null,
          },
          {
            label: 'Curso de ITSM integratedITSM™ Essentials',
            share: 0.01,
            value: 29.88,
            flagged: true,
            target_share: null,
          },
        ],
        idea: 'quality_score_by_service',
        unit: 'money',
        facts: [
          { label: 'ISO 27000', value: '"iso 27000" QS 1, "iso27001 2022" QS 3 · $1,987 MXN' },
          {
            label: 'Evento ISO 42001 29 OCT',
            value: '"ISO 42001" QS 3, "AI governance" QS 3 · $1,003 MXN',
          },
          {
            label: 'ISO/IEC 22301: Business Continuity',
            value: '"continuidad del negocio" QS 2 · $642 MXN',
          },
          { label: 'Talleres ITSM', value: '"mesa de ayuda" QS 2 · $67.45 MXN' },
          {
            label: 'Agilidad y Scrum',
            value: '"Scrum Master" QS 3, "Scrum Agile" QS 2 · $64.24 MXN',
          },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Low Quality Score by service — one landing page per service',
        checklist: [],
        window_days: 30,
        campaign_name: null,
        recommend_only: true,
      },
    },
    {
      id: 'platform_signal:d916bc6c-8420-48d7-b9c6-',
      detector: 'scale_readiness',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis: 'Cursos-pink-elephant-2025 has no results in the last 7 days to price.',
      evidence: { rule: 'G03', severity: 'low' },
      platform_card: {
        variant: 'google_budget_limited',
        currency: 'MXN',
        projection: null,
        days_limited: null,
        result_label: 'purchases',
        campaign_name: 'Cursos-pink-elephant-2025',
        budget_per_day: 200,
        cost_per_result: null,
        proposed_budget_per_day: null,
        budget_lost_impression_share: 0.2042156950815794,
      },
    },
    {
      id: 'platform_signal:e11140c0-96fd-4804-b47e-',
      detector: 'dead_tail',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        '63 search terms from people who will not buy (free and downloads, students and homework, generic course browsing, support and how-to, jobs and salaries) spent $797 MXN (21% of the term spend) with no conversion. The client runs this account',
      evidence: { rule: 'acct_intent_negatives', severity: 'medium' },
      platform_card: {
        idea: 'intent_negatives',
        facts: [
          {
            label: 'Free and downloads',
            value: '$354 MXN · "certificación itil gratis", "curso itil v4 gratis"',
          },
          {
            label: 'Students and homework',
            value: '$238 MXN · "iso 42001 que es y para que sirve", "que estudiar a los 50 años"',
          },
          {
            label: 'Generic course browsing',
            value: '$138 MXN · "cursos disponibles", "cursos en línea"',
          },
          {
            label: 'Support and how-to',
            value: '$61.98 MXN · "cursos de soporte tecnico", "curso de soporte tecnico"',
          },
          {
            label: 'Jobs and salaries',
            value: '$5.29 MXN · "cursos para salir con trabajo", "liderazgo y trabajo en equipo"',
          },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Searches with the wrong intent — negative lists by theme',
        checklist: [],
        negatives: [
          { theme: 'Free and downloads', terms: ['certificación itil gratis'] },
          { theme: 'Students and homework', terms: ['iso 42001 que es y para que sirve'] },
          { theme: 'Generic course browsing', terms: ['cursos disponibles'] },
          { theme: 'Support and how-to', terms: ['cursos de soporte tecnico'] },
          { theme: 'Jobs and salaries', terms: ['cursos para salir con trabajo'] },
        ],
        window_days: 30,
        campaign_name: null,
        recommend_only: true,
      },
    },
    {
      id: 'platform_signal:fe13041a-6aba-4b69-9ba9-',
      detector: 'dead_tail',
      portfolio_ids: ['e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed'],
      impact_per_day: 0,
      impact_class: 'deferred',
      impact_basis:
        'Searches for other brands (coursera, udemy, platzi) spent $157 MXN with no conversion: people looking for a competitor rarely switch on an ad. The client runs this account: this is a recommendation to hand over, nothing here changes it.',
      evidence: { rule: 'acct_competitor_terms', severity: 'medium' },
      platform_card: {
        idea: 'competitor_terms',
        facts: [
          { label: 'Spend on competitor searches', value: '$157 MXN · 0 conversions' },
          { label: 'coursera', value: '$136 MXN · 4 terms' },
          { label: 'udemy', value: '$18.49 MXN · 5 terms' },
          { label: 'platzi', value: '$2.18 MXN · 1 term' },
          {
            label: 'Competitor list (inferred from the search terms)',
            value: 'axelos, coursera, domestika, peoplecert, platzi, simplilearn, udemy',
          },
        ],
        blocked: null,
        variant: 'google_account_finding',
        currency: 'MXN',
        headline: 'Competitor searches spend and do not convert',
        checklist: [],
        negatives: [
          { theme: 'coursera', terms: ['coursera business courses'] },
          { theme: 'udemy', terms: ['cyber security course udemy'] },
          { theme: 'platzi', terms: ['platzi com cursos'] },
        ],
        window_days: 30,
        campaign_name: null,
        recommend_only: true,
      },
    },
  ],
  portfolios: {
    vivo: [
      {
        id: 'e642c737-ddde-4622-af8f-4b5622da98d0',
        name: 'Test 1 — Google Ads (Vivo 47)',
        ad_account_id: '3710693645',
        objective: 'lead',
        level: 'campaign',
        mode: 'balanced',
        apply_mode: 'recommend',
        daily_total: 1629,
        period_budget: null,
        budget_source: 'observed',
        cpa_target: null,
        status: 'active',
        next_realloc_at: '2026-11-03T16:46:36.493439+00:00',
        adset_count: 2,
        pending_recommendations: 6,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 1179,
        stale_for_days: null,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: true,
        withdrawn_reason: null,
        platforms: ['google_ads'],
        currency: 'MXN',
        platform_writes: { google_ads: false },
        max_change_pct_per_cycle: null,
        target_metric: null,
      },
    ],
    easyfitG: [
      {
        id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
        name: 'Leads // Google Ads only',
        ad_account_id: '5251780631',
        objective: 'lead',
        level: 'campaign',
        mode: 'efficiency',
        apply_mode: 'recommend',
        daily_total: 1870,
        period_budget: null,
        budget_source: 'observed',
        cpa_target: 99,
        status: 'active',
        next_realloc_at: '2026-11-03T06:58:48.519718+00:00',
        adset_count: 4,
        pending_recommendations: 12,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 670,
        stale_for_days: null,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: true,
        withdrawn_reason: null,
        platforms: ['google_ads'],
        currency: 'MXN',
        platform_writes: { google_ads: false },
        max_change_pct_per_cycle: null,
        target_metric: null,
      },
      {
        id: '5aaf5931-7407-4940-aab6-52e914bced45',
        name: 'Test — Google Ads (Easy Fit)',
        ad_account_id: '5251780631',
        objective: 'lead',
        level: 'campaign',
        mode: 'balanced',
        apply_mode: 'recommend',
        daily_total: 0,
        period_budget: null,
        budget_source: 'observed',
        cpa_target: null,
        status: 'active',
        next_realloc_at: '2026-11-03T02:28:31.532675+00:00',
        adset_count: 1,
        pending_recommendations: 0,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: null,
        stale_for_days: 24,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: false,
        withdrawn_reason: 'missed_cycles',
        platforms: ['google_ads'],
        currency: 'MXN',
        platform_writes: { google_ads: false },
        max_change_pct_per_cycle: null,
        target_metric: null,
      },
    ],
    pink: [
      {
        id: 'e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed',
        name: 'Evento Webinar 29 Octubre',
        ad_account_id: '6619636193',
        objective: 'purchase',
        level: 'campaign',
        mode: 'balanced',
        apply_mode: 'recommend',
        daily_total: 100,
        period_budget: null,
        budget_source: 'observed',
        cpa_target: null,
        status: 'active',
        next_realloc_at: '2026-11-03T03:16:41.344795+00:00',
        adset_count: 1,
        pending_recommendations: 9,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 100,
        stale_for_days: null,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: true,
        withdrawn_reason: null,
        platforms: ['google_ads'],
        currency: 'MXN',
        platform_writes: { google_ads: false },
        max_change_pct_per_cycle: null,
        target_metric: null,
      },
    ],
    easyfitM: [
      {
        id: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
        name: 'Leads // Google Ads only',
        ad_account_id: 'act_521903353286118',
        objective: 'lead',
        level: 'adset',
        mode: 'balanced',
        apply_mode: 'recommend',
        daily_total: 2795,
        period_budget: null,
        budget_source: 'observed',
        cpa_target: null,
        status: 'active',
        next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
        adset_count: 1,
        pending_recommendations: 0,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 50,
        stale_for_days: null,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: true,
        withdrawn_reason: null,
        platforms: ['meta'],
        currency: 'MXN',
        platform_writes: {},
        max_change_pct_per_cycle: null,
        target_metric: null,
      },
      {
        id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
        name: 'Conversaciones Whatsapp',
        ad_account_id: 'act_521903353286118',
        objective: 'conversations',
        level: 'adset',
        mode: 'efficiency',
        apply_mode: 'autopilot',
        daily_total: 3000,
        period_budget: 90000,
        budget_source: 'fixed',
        cpa_target: 45,
        status: 'active',
        next_realloc_at: '2026-11-03T05:04:54.97548+00:00',
        adset_count: 7,
        pending_recommendations: 6,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 2994.436551724138,
        stale_for_days: null,
        roster_state: 'present',
        roster_missing_count: 0,
        last_cycle_current: true,
        withdrawn_reason: null,
        platforms: ['meta'],
        currency: 'MXN',
        platform_writes: {},
        max_change_pct_per_cycle: 0.2,
        target_metric: null,
      },
      {
        id: 'ec956b3d-c9b1-48ea-b55b-bda303e68f79',
        name: 'Tours Programados - Octubre',
        ad_account_id: 'act_521903353286118',
        objective: 'purchase',
        level: 'adset',
        mode: 'balanced',
        apply_mode: 'autopilot',
        daily_total: 460,
        period_budget: null,
        budget_source: 'fixed',
        cpa_target: 296,
        status: 'active',
        next_realloc_at: '2026-11-03T17:08:47.360392+00:00',
        adset_count: 3,
        pending_recommendations: 0,
        pending_budget_moves: 0,
        autopilot_paused: false,
        conserved_daily_total: 460,
        stale_for_days: 19,
        roster_state: 'absent',
        roster_missing_count: 3,
        last_cycle_current: false,
        withdrawn_reason: 'roster_absent',
        platforms: ['meta'],
        currency: 'MXN',
        platform_writes: {},
        max_change_pct_per_cycle: 0.2,
        target_metric: null,
      },
    ],
  },
  metrics: {
    easyfitG: {
      window: { label: 'd7', since: '2026-10-25', until: '2026-10-31', ends_yesterday: false },
      read_at: '2026-11-02T19:43:05.779080Z',
      brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
      autopilot: { on: 0, total: 2 },
      portfolios: { counted: 0, excluded: [] },
      prior_window: {
        label: 'd7',
        since: '2026-10-18',
        until: '2026-10-24',
        ends_yesterday: false,
      },
      headline_facts: { cheapest: [], top_spend: { platform: 'google_ads', share_of_spend: 1 } },
      results_by_kind: [
        {
          kind: 'leads',
          spend: 29.094547,
          results: 1,
          currency: 'MXN',
          platforms: [
            { spend: 29.094547, results: 1, platform: 'google_ads', cost_per_result: 29.094547 },
          ],
          cost_per_result: 29.094547,
        },
      ],
      decisions_waiting: 12,
      spend_by_currency: [{ spend: 29.094547, currency: 'MXN' }],
      totals_by_platform: [
        {
          spend: null,
          accounts: [
            { currency: 'USD', ingested: false, account_id: '1230084535936402' },
            { currency: 'USD', ingested: false, account_id: '1277692437548208' },
            { currency: 'USD', ingested: false, account_id: '1317403313414407' },
            { currency: 'USD', ingested: false, account_id: '1472300554278005' },
            { currency: 'MXN', ingested: false, account_id: '1474284901098956' },
            { currency: 'MXN', ingested: false, account_id: '521903353286118' },
            { currency: 'USD', ingested: false, account_id: '719747577886315' },
            { currency: 'MXN', ingested: false, account_id: '788361201542233' },
            { currency: 'USD', ingested: false, account_id: '905635138680924' },
          ],
          coverage: 'portfolios',
          currency: null,
          platform: 'meta',
          connected: true,
          prior_spend: null,
          share_of_spend: null,
          results_by_kind: [],
          spend_delta_pct: null,
          unclassified_spend: null,
        },
        {
          spend: 29.094547,
          accounts: [{ currency: 'MXN', ingested: true, account_id: '5251780631' }],
          coverage: 'account',
          currency: 'MXN',
          platform: 'google_ads',
          connected: true,
          prior_spend: 4288.836477,
          share_of_spend: 1,
          results_by_kind: [
            {
              kind: 'leads',
              spend: 29.094547,
              results: 1,
              prior_results: 178,
              cost_per_result: 29.094547,
              prior_cost_per_result: 24.094586949438202,
            },
          ],
          spend_delta_pct: -0.9932162144311104,
          unclassified_spend: 0,
        },
        {
          spend: null,
          accounts: [],
          coverage: 'account',
          currency: null,
          platform: 'tiktok_ads',
          connected: false,
          prior_spend: null,
          share_of_spend: null,
          results_by_kind: [],
          spend_delta_pct: null,
          unclassified_spend: null,
        },
      ],
    },
    easyfitM: {
      window: { label: 'd7', since: '2026-10-26', until: '2026-11-01', ends_yesterday: false },
      read_at: '2026-11-02T19:43:09.786494Z',
      brand_id: '148583e0-5538-462b-8d3a-acd25b80344e',
      autopilot: { on: 2, total: 3 },
      portfolios: {
        counted: 2,
        excluded: [{ reason: 'window', portfolio_id: 'ec956b3d-c9b1-48ea-b55b-bda303e68f79' }],
      },
      prior_window: {
        label: 'd7',
        since: '2026-10-19',
        until: '2026-10-25',
        ends_yesterday: false,
      },
      headline_facts: { cheapest: [], top_spend: { platform: 'meta', share_of_spend: 1 } },
      results_by_kind: [
        {
          kind: 'conversations',
          spend: 24543.57,
          results: 462,
          currency: 'MXN',
          platforms: [
            { spend: 24543.57, results: 462, platform: 'meta', cost_per_result: 53.12461038961039 },
          ],
          cost_per_result: 53.12461038961039,
        },
        {
          kind: 'leads',
          spend: 0,
          results: 0,
          currency: 'MXN',
          platforms: [{ spend: 0, results: 0, platform: 'meta', cost_per_result: null }],
          cost_per_result: null,
        },
      ],
      decisions_waiting: 6,
      spend_by_currency: [{ spend: 24543.57, currency: 'MXN' }],
      totals_by_platform: [
        {
          spend: 24543.57,
          accounts: [
            { currency: 'USD', ingested: false, account_id: '1296885445611472' },
            { currency: 'USD', ingested: false, account_id: '1472300554278005' },
            { currency: 'MXN', ingested: false, account_id: '1474284901098956' },
            { currency: 'MXN', ingested: true, account_id: '521903353286118' },
          ],
          coverage: 'portfolios',
          currency: 'MXN',
          platform: 'meta',
          connected: true,
          prior_spend: 18092.600000000002,
          share_of_spend: 1,
          results_by_kind: [
            {
              kind: 'conversations',
              spend: 24543.57,
              results: 462,
              prior_results: 469,
              cost_per_result: 53.12461038961039,
              prior_cost_per_result: 38.5769722814499,
            },
            {
              kind: 'leads',
              spend: 0,
              results: 0,
              prior_results: 0,
              cost_per_result: null,
              prior_cost_per_result: null,
            },
          ],
          spend_delta_pct: 0.35655295535191167,
          unclassified_spend: 0,
        },
        {
          spend: 0,
          accounts: [{ currency: 'MXN', ingested: true, account_id: '5251780631' }],
          coverage: 'account',
          currency: 'MXN',
          platform: 'google_ads',
          connected: true,
          prior_spend: 4317.931024,
          share_of_spend: 0,
          results_by_kind: [],
          spend_delta_pct: -1,
          unclassified_spend: 0,
        },
        {
          spend: null,
          accounts: [],
          coverage: 'account',
          currency: null,
          platform: 'tiktok_ads',
          connected: false,
          prior_spend: null,
          share_of_spend: null,
          results_by_kind: [],
          spend_delta_pct: null,
          unclassified_spend: null,
        },
      ],
    },
  },
  metaRead: [
    {
      id: 'delivery_collapse:94ca5d79-77cd-4973-9d9',
      detector: 'delivery_collapse',
      portfolio_ids: ['94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4'],
      impact_per_day: 2795,
      impact_class: 'recoverable',
      impact_basis:
        'Leads // Google Ads only: budgeted 2795/day and spent nothing across the 7-day window — 1 of 1 active ad sets dark across the 7-day window',
      evidence: {
        scope: 'portfolio',
        sample: 'ledger: the daily budget against the spend recorded',
        sample_k: null,
        sample_n: null,
        days_dark: null,
        portfolio: 'Leads // Google Ads only',
        adsets_dark: 1,
        sample_kind: 'ledger',
        adsets_active: 1,
        delivered_pct: 0,
        planned_per_day: 2795,
        collapse_line_pct: 10,
        delivered_per_day: 0,
        undelivered_per_day: 2795,
        oldest_dark_adset_days: 245,
      },
    },
  ],
};

const cards = (rows: readonly unknown[]): AccountCandidate[] =>
  rows.map((row) => accountCandidateSchema.parse(row));
const portfolios = (rows: readonly unknown[]): PortfolioListItem[] =>
  rows.map((row) => PortfolioListItemSchema.parse(row));
const idsOf = (rows: readonly PortfolioListItem[]) => new Set(rows.map((row) => row.id));

const VIVO_PORTFOLIOS = portfolios(REAL.portfolios.vivo);
const EASYFIT_GOOGLE_PORTFOLIOS = portfolios(REAL.portfolios.easyfitG);
const PINK_PORTFOLIOS = portfolios(REAL.portfolios.pink);
const EASYFIT_META_PORTFOLIOS = portfolios(REAL.portfolios.easyfitM);

describe('figureIn', () => {
  it('reads the first figure of a producer-worded value', () => {
    expect(figureIn('$1,179 MXN/day')).toBe(1179);
    expect(figureIn('3461 (85%)')).toBe(3461);
    expect(figureIn('$69.08 MXN')).toBe(69.08);
    expect(figureIn('no conversion')).toBeNull();
    expect(figureIn(null)).toBeNull();
  });
});

describe('portfolioSignalOf', () => {
  it('reads the plan every screen prints, the roster and the result kind', () => {
    const [leads, conversations, tours] = EASYFIT_META_PORTFOLIOS.map((row) =>
      portfolioSignalOf(row, 'meta'),
    );
    // budget_source observed: the plan is what the last cycle conserved, not daily_total.
    expect(leads).toMatchObject({ dailyBudget: 50, canWrite: true, resultKind: 'leads' });
    expect(conversations).toMatchObject({
      applyMode: 'autopilot',
      dailyBudget: 3000,
      goal: 45,
      pendingRecommendations: 6,
      maxChangePct: 0.2,
      resultKind: 'conversations',
    });
    expect(tours).toMatchObject({
      rosterAbsent: true,
      rosterMissing: 3,
      dailyBudget: 460,
      goal: 296,
      cycleCurrent: false,
      resultKind: 'purchases',
    });
  });

  it('reads Google writes switched off as a portfolio Continuum cannot write', () => {
    expect(portfolioSignalOf(PINK_PORTFOLIOS[0] as PortfolioListItem, 'google_ads').canWrite).toBe(
      false,
    );
    expect(
      portfolioSignalOf(EASYFIT_GOOGLE_PORTFOLIOS[0] as PortfolioListItem, 'google_ads'),
    ).toMatchObject({ dailyBudget: 670, goal: 99, pendingRecommendations: 12 });
  });
});

describe('portfoliosOfAccount', () => {
  it('keeps a Meta account its own portfolios', () => {
    expect(
      portfoliosOfAccount(EASYFIT_META_PORTFOLIOS, 'meta', 'act_521903353286118'),
    ).toHaveLength(3);
    expect(portfoliosOfAccount(EASYFIT_META_PORTFOLIOS, 'meta', '521903353286118')).toHaveLength(3);
    expect(
      portfoliosOfAccount(EASYFIT_META_PORTFOLIOS, 'meta', 'act_1296885445611472'),
    ).toHaveLength(0);
    expect(portfoliosOfAccount(EASYFIT_META_PORTFOLIOS, 'google_ads', '5251780631')).toHaveLength(
      0,
    );
  });

  it('keeps every Google portfolio but one anchored to another customer', () => {
    expect(portfoliosOfAccount(EASYFIT_GOOGLE_PORTFOLIOS, 'google_ads', '5251780631')).toHaveLength(
      2,
    );
    expect(portfoliosOfAccount(EASYFIT_GOOGLE_PORTFOLIOS, 'google_ads', '3710693645')).toHaveLength(
      0,
    );
  });
});

describe('googleAccountOf', () => {
  it('takes the first granted Google Ads customer, as the Google tab does', () => {
    const accounts = [
      {
        platform: 'meta_ads',
        account_id: 'act_521903353286118',
        name: 'Easyfit',
        status: null,
        currency: 'MXN',
      },
      {
        platform: 'google_ads',
        account_id: '5251780631',
        name: 'Easy Fit 2026',
        status: null,
        currency: null,
      },
    ];
    expect(googleAccountOf(accounts)?.account_id).toBe('5251780631');
    expect(googleAccountOf(accounts.slice(0, 1))).toBeNull();
  });
});

describe('googleFindingsFrom', () => {
  it("takes Vivo 47's figures as the cards computed them", () => {
    const findings = googleFindingsFrom(cards(REAL.vivo), idsOf(VIVO_PORTFOLIOS));
    expect(findings.inflated).toEqual({
      reported: 4051,
      attention: 3461,
      attentionShare: 0.85,
      real: 592,
      reportedCostPerResult: 10.09,
      realCostPerResult: 69.08,
      windowDays: 30,
    });
    expect(findings.brandTerms).toEqual({
      share: 0.51,
      brandSpend: 11937.38,
      nonBrandSpend: 11607.94,
    });
    expect(findings.budgetLost).toEqual([
      { rule: 'V3', campaign: 'VIVO 47-EKATAR', lostToBudget: 0.75, budgetPerDay: 1179 },
    ]);
    expect(findings.lowQuality).toEqual({ spend: 19943.25, services: 2, keywordSpendShare: 0.6 });
    expect(findings.valueMap).toEqual({ actions: 5, flatValue: 1 });
    expect(findings.delivery).toEqual([
      {
        campaign: 'Gourmetería',
        accountWide: false,
        suspended: false,
        darkDays: 30,
        darkSince: '2026-10-03',
        budgetPerDay: 567,
        reasons: ['BIDDING_STRATEGY_LEARNING'],
      },
    ]);
    expect(findings.cards.map((card) => card.rule)).toEqual(['V5', 'V2', 'E3', 'G12', 'V1', 'V3']);
  });

  it("takes Easy Fit's suspension, its dark days and its competitor spend", () => {
    const findings = googleFindingsFrom(cards(REAL.easyfitG), idsOf(EASYFIT_GOOGLE_PORTFOLIOS));
    expect(findings.delivery[0]).toMatchObject({
      campaign: 'Search | Octubre | Easy Fit',
      suspended: true,
      darkDays: 7,
      darkSince: '2026-10-26',
      budgetPerDay: 350,
    });
    expect(findings.darkRun).toEqual({ darkDays: 11, ongoing: false, latestSince: '2026-10-26' });
    expect(findings.competitorTerms?.spend).toBe(2150);
    expect(findings.lowQuality?.keywordSpendShare).toBe(0.29);
    expect(findings.valueMap).toEqual({ actions: 6, flatValue: 1 });
    expect(findings.pmaxAssets).toEqual(['PMax | Octubre | Easy Fit | Leads']);
  });

  it("takes Pink Elephant's funnel, off-intent terms, budget limits and winning ad", () => {
    const findings = googleFindingsFrom(cards(REAL.pink), idsOf(PINK_PORTFOLIOS));
    expect(findings.leadToSale).toEqual({ leads: 11, sales: 1, salesValue: 737, roas: 0.08 });
    expect(findings.intentTerms).toMatchObject({ spend: 797, terms: 63, share: 0.21 });
    expect(findings.competitorTerms).toEqual({
      spend: 157,
      competitors: ['coursera', 'udemy', 'platzi'],
    });
    expect(findings.budgetLost.map((row) => [row.rule, row.campaign])).toEqual([
      ['G03', 'Eventos 2026'],
      ['G03', 'Cursos-pink-elephant-2025'],
    ]);
    expect(findings.adWinner).toMatchObject({
      winner: 'Curso ISO 22301 Fundamentos',
      winnerCostPerResult: 87.53,
      comparatorCostPerResult: 318.63,
    });
  });

  it("leaves out the cards of another account's portfolios", () => {
    const findings = googleFindingsFrom(cards(REAL.vivo), new Set(['another-portfolio']));
    expect(findings.cards).toHaveLength(0);
    expect(findings.inflated).toBeNull();
  });

  it('files each card under its detector id', () => {
    expect(cards(REAL.pink).map(ruleOfCard)).toEqual(['G03', 'G10', 'P5', 'V5', 'G03', 'P3', 'E4']);
  });
});

describe('metaFindingsFrom', () => {
  it("reads Easy Fit Meta's idle portfolio from the account read", () => {
    const findings = metaFindingsFrom({ candidates: cards(REAL.metaRead), guards: [] });
    expect(findings.deliveryCollapse).toEqual([
      {
        portfolioId: '94ca5d79-77cd-4973-9d9d-4ae55ccd7ec4',
        portfolio: 'Leads // Google Ads only',
        plannedPerDay: 2795,
        deliveredPerDay: 0,
      },
    ]);
    expect(metaFindingsFrom(null).cards).toHaveLength(0);
  });
});

describe('windowSignalFrom', () => {
  it("is the account's own when it is the one account the producer ingested", () => {
    const google = windowSignalFrom(
      AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitG),
      'google_ads',
      '5251780631',
    );
    expect(google.window).toMatchObject({ days: 7, spend: 29.094547 });
    expect(google.window?.kinds[0]).toMatchObject({ kind: 'leads', results: 1 });
    const meta = windowSignalFrom(
      AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitM),
      'meta',
      'act_521903353286118',
    );
    expect(meta.window?.kinds.find((kind) => kind.kind === 'conversations')?.results).toBe(462);
  });

  it('says why when the producer cannot separate the account', () => {
    const other = windowSignalFrom(
      AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitM),
      'meta',
      'act_1296885445611472',
    );
    expect(other.window).toBeNull();
    expect(other.why).toBe(
      'El Optimizer mide otra cuenta de esta plataforma (521903353286118), no esta.',
    );
    const unread = windowSignalFrom(
      AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitG),
      'meta',
      'act_521903353286118',
    );
    expect(unread.why).toContain('todavía no mide');
  });
});

describe('googleCampaignsFrom', () => {
  it("folds Vivo 47's recorded top_campaigns into campaigns with their types", () => {
    const read = GoogleTopCampaignsSchema.parse({ ...vivoRecorded.top_campaigns, currency: 'MXN' });
    const signal = googleCampaignsFrom(read, 'leads');
    expect(signal.windowDays).toBe(30);
    expect(signal.campaigns[0]).toMatchObject({
      name: 'VIVO 47-EKATAR',
      type: 'search',
      spend: 36997.0645,
      results: 26.0088,
    });
    expect(new Set(signal.campaigns.map((campaign) => campaign.type))).toEqual(
      new Set(['search', 'display']),
    );
    expect(signal.campaigns.every((campaign) => campaign.spend > 0)).toBe(true);
  });
});

describe('metaCampaignsFrom', () => {
  // Easy Fit's branch campaigns as Meta reported them on 2026-10-31 (spend, impressions and
  // conversations), one ad set each.
  const branch = (
    campaignName: string,
    spend: number,
    impressions: number,
    conversations: number,
  ) =>
    ({
      id: `adset-${campaignName}`,
      name: `${campaignName} · Broad`,
      status: 'active',
      currentBudget: 500,
      ageDays: 30,
      campaignId: campaignName,
      campaignName,
      windows: {
        d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
        d7: { spend, purchases: 0, addToCarts: 0, clicks: 0, impressions, conversations },
        d14: { spend, purchases: 0, addToCarts: 0, clicks: 0, impressions, conversations },
      },
    }) as AdSetSnapshot;

  it('groups the ad sets by campaign with their CPM inputs and results', () => {
    const signal = metaCampaignsFrom(
      [
        branch('CAÑADAS // MENSAJES // Octubre 2026', 21654.56, 450415, 43),
        branch('OCTUBRE // ALEIRA // MENSAJES // 2026', 17527.54, 403819, 53),
        branch('ITESO // MENSAJES // AGOSTO 2026', 15607.43, 306072, 28),
      ],
      'conversations',
    );
    expect(
      signal.campaigns.map((campaign) => [campaign.name, campaign.results, campaign.adSets]),
    ).toEqual([
      ['CAÑADAS // MENSAJES // Octubre 2026', 43, 1],
      ['OCTUBRE // ALEIRA // MENSAJES // 2026', 53, 1],
      ['ITESO // MENSAJES // AGOSTO 2026', 28, 1],
    ]);
    const reading = readAdAccount(
      adAccountSignalsFrom({
        platform: 'meta',
        accountId: 'act_521903353286118',
        currency: 'MXN',
        portfolios: EASYFIT_META_PORTFOLIOS,
        approvalRequired: false,
        metaRead: null,
        metaSnapshots: [
          branch('CAÑADAS // MENSAJES // Octubre 2026', 21654.56, 450415, 43),
          branch('OCTUBRE // ALEIRA // MENSAJES // 2026', 17527.54, 403819, 53),
          branch('ITESO // MENSAJES // AGOSTO 2026', 15607.43, 306072, 28),
        ],
      }),
    );
    expect(reading.board.find((slot) => slot.module === 'branches')?.reason).toContain(
      'OCTUBRE // ALEIRA // MENSAJES // 2026 consigue conversaciones a $331 MXN',
    );
    expect(reading.board.find((slot) => slot.module === 'headroom')?.reason).toContain(
      '$43.40 MXN',
    );
  });
});

describe('adAccountSignalsFrom → readAdAccount on the real rows', () => {
  it('reads the four real accounts with portfolios into their modes', () => {
    const vivo = readAdAccount(
      adAccountSignalsFrom({
        platform: 'google_ads',
        accountId: '3710693645',
        currency: 'MXN',
        portfolios: VIVO_PORTFOLIOS,
        approvalRequired: false,
        googleCards: cards(REAL.vivo),
      }),
    );
    expect(vivo.mode).toBe('fix');
    expect(vivo.result.count).toBe(592);
    const easyFit = readAdAccount(
      adAccountSignalsFrom({
        platform: 'google_ads',
        accountId: '5251780631',
        currency: 'MXN',
        portfolios: EASYFIT_GOOGLE_PORTFOLIOS,
        approvalRequired: false,
        googleCards: cards(REAL.easyfitG),
        metrics: AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitG),
      }),
    );
    expect(easyFit.mode).toBe('fix');
    expect(easyFit.board[0]?.module).toBe('auction');
    const pink = readAdAccount(
      adAccountSignalsFrom({
        platform: 'google_ads',
        accountId: '6619636193',
        currency: 'MXN',
        portfolios: PINK_PORTFOLIOS,
        approvalRequired: false,
        googleCards: cards(REAL.pink),
      }),
    );
    expect(pink.mode).toBe('recommend');
    const meta = readAdAccount(
      adAccountSignalsFrom({
        platform: 'meta',
        accountId: 'act_521903353286118',
        currency: 'MXN',
        portfolios: EASYFIT_META_PORTFOLIOS,
        approvalRequired: false,
        metaRead: { candidates: cards(REAL.metaRead), guards: [] },
        metrics: AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitM),
      }),
    );
    expect(meta.mode).toBe('operate');
    expect(meta.result).toMatchObject({ count: 462, goal: 45, source: 'producer' });
  });

  it('reads an account with no portfolio as setting up, and says the window is not measured', () => {
    const tangassi = readAdAccount(
      adAccountSignalsFrom({
        platform: 'google_ads',
        accountId: '9343596627',
        currency: 'MXN',
        portfolios: [],
        approvalRequired: false,
        googleCards: [],
        metrics: AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitM),
      }),
    );
    expect(tangassi.mode).toBe('setup');
    expect(tangassi.missing?.[0]).toBe(
      'El Optimizer mide otra cuenta de esta plataforma (5251780631), no esta.',
    );
  });
});

// ── The same cards in Spanish ─────────────────────────────────────────────────
// Since decision 3 (2026-11-02) the engine writes every P8 string in the account's language
// (packages/optimization-engine/src/multiplatform/accountDetectors.ts). Rows stay English until
// deploy:optimizer runs and new cycles write Spanish, so the reading meets both. These are the
// production cards above as the new templates write them, with the same figures; the card builder
// keeps the first 240 characters of the reason (left(reason, 240)).

const CLIENT_RUNS_IT =
  ' El cliente administra esta cuenta: es una recomendación para entregarle, desde aquí no se cambia nada.';

const THEMES_ES: Record<string, string> = {
  'Free and downloads': 'Gratis y descargas',
  'Students and homework': 'Estudiantes y tareas',
  'Generic course browsing': 'Búsquedas genéricas de cursos',
  'Support and how-to': 'Soporte y tutoriales',
  'Jobs and salaries': 'Empleos y sueldos',
};

const VALUES_ES: [string, string][] = [
  [' per conversion Google reports', ' por conversión que Google reporta'],
  [
    ' of the conversions Google reports are visits or attention events',
    ' de las conversiones que Google reporta son visitas o eventos de interacción',
  ],
  ['/day', '/día'],
  [' · primary · value ', ' · principal · valor '],
  [' · secondary · value ', ' · secundaria · valor '],
  [' · 0 conversions', ' · 0 conversiones'],
  [' terms', ' términos'],
  [' term', ' término'],
];

const COMPETITOR_FACTS_ES = {
  'Spend on competitor searches': 'Gasto en búsquedas de competidores',
  'Competitor list (inferred from the search terms)':
    'Lista de competidores (inferida de los términos de búsqueda)',
};

type SpanishCard = {
  reason: string;
  headline: string;
  facts?: Record<string, string>;
  bars?: Record<string, string>;
  blocked?: string;
};

const SPANISH: Record<string, SpanishCard> = {
  'vivo:quality_score_by_service': {
    reason:
      '8 palabras clave con QS 3 o menos gastaron $19,943 MXN (60% del gasto en palabras clave) en 2 servicios, y todas llevan a la misma página. Un QS bajo sube el precio de cada clic; una página y un grupo de anuncios por servicio lo mejoran.',
    headline: '8 palabras clave con QS 3 o menos: $19,943 MXN, 60% del gasto en palabras clave',
  },
  'vivo:brand_vs_nonbrand': {
    reason:
      '51% del gasto en términos de búsqueda ($11,937 MXN) paga búsquedas de gente que escribió la marca, dentro de 2 campañas que también tienen que conseguir clientes nuevos. Las búsquedas de marca le quitan presupuesto a la captación de clientes nuevos.',
    headline: '51% del gasto en términos de búsqueda va a búsquedas de la marca',
    facts: {
      'Brand spend': 'Gasto de marca',
      'Non-brand spend': 'Gasto de no marca',
      'Not cost per lead': 'No es costo por lead',
      'Brand terms (inferred)': 'Términos de marca (inferidos)',
    },
    bars: { Brand: 'Marca', 'Non-brand': 'No marca' },
  },
  'vivo:conversion_value_map': {
    // Over 240 characters: the card keeps a reason cut before "Las 5 acciones…", and the
    // headline still says it.
    reason:
      '"www.vivo47.com.mx - GA4 (web) consulta_membresias", "www.vivo47.com.mx - GA4 (web) contacto" son acciones de lead que no son principales, mientras Google puja por "Lead formulario web". Las 5 acciones de conversión tienen el mismo valor, así que Google no distingue un contacto de un clic en el mapa.',
    headline:
      '2 acciones de lead no son principales y las 5 acciones de conversión tienen el mismo valor',
    facts: { 'Primary today': 'Principales hoy' },
  },
  'vivo:inflated_primary_conversion': {
    reason:
      '85% de las 4051 conversiones que Google reporta son visitas o eventos de interacción de una acción marcada como principal ("www.vivo47.com.mx - GA4 (web) user_engagement"). Solo 592 son leads o ventas. Google puja por lo que está marcado como principal, así que está comprando visitas. Nuestras lecturas ya excluyen estos eventos, pero la puja de Google no.',
    headline: 'La mayor parte de lo que Google cuenta como conversión es una visita',
    facts: {
      'Conversions Google reports': 'Conversiones que Google reporta',
      'Of them, visits and attention events': 'De ellas, visitas y eventos de interacción',
      'Real results (leads, sales)': 'Resultados reales (leads, ventas)',
      'Reported cost per conversion': 'Costo por conversión reportado',
      'Real cost per result': 'Costo real por resultado',
    },
    bars: {
      'Visits and attention events': 'Visitas y eventos de interacción',
      'Leads and sales': 'Leads y ventas',
    },
  },
  'vivo:capped_budget_locked': {
    reason:
      'VIVO 47-EKATAR pierde 75% de sus impresiones por presupuesto, pero la conversión principal de la cuenta registra visitas: más presupuesto hoy compra más visitas, no más leads. El aumento espera a que se corrija la conversión.',
    headline:
      'VIVO 47-EKATAR: 75% de las impresiones perdidas por presupuesto, con una conversión principal que registra visitas',
    facts: {
      'Lost to budget': 'Perdido por presupuesto',
      Budget: 'Presupuesto',
      'Reported cost per conversion': 'Costo por conversión reportado',
    },
    bars: { Shown: 'Mostradas', 'Lost to budget': 'Perdidas por presupuesto' },
  },
  'easyfitG:competitor_terms': {
    reason:
      'Las búsquedas de otras marcas (smart fit, station 24, anytime fitness, planet fitness, total fitness, sports world, golds gym) gastaron $2,150 MXN sin ninguna conversión: quien busca a un competidor rara vez cambia por un anuncio.',
    headline: 'Búsquedas de competidores: $2,150 MXN y 0 conversiones',
    facts: COMPETITOR_FACTS_ES,
  },
  'easyfitG:conversion_value_map': {
    reason:
      'Las 6 acciones de conversión tienen el mismo valor, así que Google no distingue un contacto de un clic en el mapa.',
    headline: 'Las 6 acciones de conversión tienen el mismo valor',
    facts: { 'Primary today': 'Principales hoy' },
  },
  'easyfitG:continuity_calendar': {
    reason:
      'La cuenta no mostró anuncios durante 11 días después de haber empezado a mostrarlos (2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31). Al promedio de sus días con anuncios, son unas 409.4 conversiones perdidas. Ninguna alerta avisó mientras ocurría.',
    headline: '11 días sin anuncios: 2026-10-15 → 2026-10-19, 2026-10-26 → 2026-10-31',
    facts: {
      'Dark days': 'Días sin anuncios',
      'Conversions lost (served-day average)':
        'Conversiones perdidas (promedio de los días con anuncios)',
      Dark: 'Sin anuncios',
      'Still dark since': 'Sigue sin anuncios desde',
    },
  },
  'easyfitG:quality_score_by_service': {
    reason:
      '11 palabras clave con QS 3 o menos gastaron $4,323 MXN (29% del gasto en palabras clave) en 2 servicios. Un QS bajo sube el precio de cada clic; una página y un grupo de anuncios por servicio lo mejoran.',
    headline: '11 palabras clave con QS 3 o menos: $4,323 MXN, 29% del gasto en palabras clave',
  },
  'pink:lead_to_sale_funnel': {
    reason: `11 leads se convirtieron en 1 venta por $737 MXN con $9,507 MXN de gasto (ROAS 0.08). La cantidad de leads se ve bien; los leads no compran. Las palabras clave centrales tienen QS bajo: "iso 27000" QS 1, "ISO 42001" QS 3, "continuidad del negocio" QS 2.${CLIENT_RUNS_IT}`,
    headline: '11 leads y 1 venta por $737 MXN: ROAS 0.08',
    facts: { Clicks: 'Clics', Sales: 'Ventas' },
    bars: { Clicks: 'Clics', Sales: 'Ventas' },
    blocked:
      'Lead → venta en GoHighLevel → WooCommerce: todavía no existe un conector (se buscó en el Backend, MCP y Supabase el 2026-10-29). Esta tarjeta usa la conversión de venta de Google y GA4 cuando está vinculado.',
  },
  'pink:quality_score_by_service': {
    reason: `15 palabras clave con QS 3 o menos gastaron $3,793 MXN (48% del gasto en palabras clave) en 6 servicios. Un QS bajo sube el precio de cada clic; una página y un grupo de anuncios por servicio lo mejoran.${CLIENT_RUNS_IT}`,
    headline: '15 palabras clave con QS 3 o menos: $3,793 MXN, 48% del gasto en palabras clave',
  },
  'pink:intent_negatives': {
    reason: `63 términos de búsqueda de gente que no va a comprar (gratis y descargas, estudiantes y tareas, búsquedas genéricas de cursos, soporte y tutoriales, empleos y sueldos) gastaron $797 MXN (21% del gasto en términos) sin ninguna conversión.${CLIENT_RUNS_IT}`,
    headline: '63 términos de búsqueda sin intención de compra: $797 MXN y 0 conversiones',
    facts: THEMES_ES,
  },
  'pink:competitor_terms': {
    reason: `Las búsquedas de otras marcas (coursera, udemy, platzi) gastaron $157 MXN sin ninguna conversión: quien busca a un competidor rara vez cambia por un anuncio.${CLIENT_RUNS_IT}`,
    headline: 'Búsquedas de competidores: $157 MXN y 0 conversiones',
    facts: COMPETITOR_FACTS_ES,
  },
};

type FindingCardOf = Extract<
  NonNullable<AccountCandidate['platform_card']>,
  { variant: 'google_account_finding' }
>;

function inSpanish(account: string, rows: readonly unknown[]): AccountCandidate[] {
  return cards(rows).map((candidate) => {
    const card = candidate.platform_card;
    if (card?.variant !== 'google_account_finding') return candidate;
    const es = SPANISH[`${account}:${card.idea}`];
    if (!es) throw new Error(`no Spanish twin for ${account}:${card.idea}`);
    const value = (text: string) =>
      VALUES_ES.reduce((out, [english, spanish]) => out.split(english).join(spanish), text);
    const spanishCard: FindingCardOf = {
      ...card,
      headline: es.headline,
      facts: card.facts.map((fact) => ({
        label: es.facts?.[fact.label] ?? fact.label,
        value: value(fact.value),
      })),
      bars: card.bars?.map((bar) => ({ ...bar, label: es.bars?.[bar.label] ?? bar.label })),
      negatives: card.negatives?.map((group) => ({
        ...group,
        theme: THEMES_ES[group.theme] ?? group.theme,
      })),
      blocked: es.blocked ?? card.blocked,
    };
    return accountCandidateSchema.parse({
      ...candidate,
      impact_basis: es.reason.slice(0, 240),
      platform_card: spanishCard,
    });
  });
}

/** What the English cards read, with P3's themes as the Spanish cards name them. */
function themesInSpanish(
  findings: ReturnType<typeof googleFindingsFrom>,
): ReturnType<typeof googleFindingsFrom> {
  const terms = findings.intentTerms;
  return {
    ...findings,
    intentTerms: terms
      ? { ...terms, themes: terms.themes.map((theme) => THEMES_ES[theme] ?? theme) }
      : null,
  };
}

const ACCOUNTS_ES = [
  ['vivo', REAL.vivo, VIVO_PORTFOLIOS],
  ['easyfitG', REAL.easyfitG, EASYFIT_GOOGLE_PORTFOLIOS],
  ['pink', REAL.pink, PINK_PORTFOLIOS],
] as const;

/** One P8 card built from scratch, for the ideas production holds no pending card of today. */
function finding(
  idea: FindingCardOf['idea'],
  rule: string,
  body: { reason: string; headline: string; campaign: string | null; facts: [string, string][] },
): AccountCandidate {
  return accountCandidateSchema.parse({
    id: `platform_signal:${rule}`,
    detector: 'creative_supply',
    portfolio_ids: [VIVO_PORTFOLIOS[0]?.id],
    impact_per_day: 0,
    impact_class: 'deferred',
    impact_basis: body.reason.slice(0, 240),
    evidence: { rule, severity: 'high' },
    platform_card: {
      variant: 'google_account_finding',
      idea,
      headline: body.headline,
      campaign_name: body.campaign,
      currency: 'MXN',
      window_days: 30,
      recommend_only: false,
      facts: body.facts.map(([label, value]) => ({ label, value })),
      checklist: [],
      blocked: null,
    },
  });
}

describe('the same cards in Spanish (decision 3)', () => {
  for (const [account, rows, owned] of ACCOUNTS_ES) {
    it(`reads ${account}'s cards in Spanish into the signals of the English ones`, () => {
      const english = googleFindingsFrom(cards(rows), idsOf(owned));
      const spanish = googleFindingsFrom(inSpanish(account, rows), idsOf(owned));
      expect(spanish).toEqual(themesInSpanish(english));
      expect(inSpanish(account, rows).map(ruleOfCard)).toEqual(cards(rows).map(ruleOfCard));
    });
  }

  it('reads the value map from the headline when the reason is cut before it', () => {
    // A longer list of action names pushes "Las 5 acciones…" past the 240 characters the card
    // keeps; the headline still says it.
    const cut = inSpanish('vivo', REAL.vivo).map((candidate) =>
      candidate.platform_card?.variant === 'google_account_finding' &&
      candidate.platform_card.idea === 'conversion_value_map'
        ? { ...candidate, impact_basis: candidate.impact_basis.slice(0, 180) }
        : candidate,
    );
    const valueMap = cut.find(
      (candidate) =>
        candidate.platform_card?.variant === 'google_account_finding' &&
        candidate.platform_card.idea === 'conversion_value_map',
    );
    expect(valueMap?.impact_basis).not.toContain('acciones de conversión tienen el mismo valor');
    expect(googleFindingsFrom(cut, idsOf(VIVO_PORTFOLIOS)).valueMap).toEqual({
      actions: 5,
      flatValue: 1,
    });
  });

  it('reads a dark run still going in either language', () => {
    const still = (label: string) =>
      cards(REAL.easyfitG).map((candidate) => {
        const card = candidate.platform_card;
        if (card?.variant !== 'google_account_finding' || card.idea !== 'continuity_calendar')
          return candidate;
        const facts = card.facts.map((fact, index) =>
          index === card.facts.length - 1 ? { ...fact, label } : fact,
        );
        return { ...candidate, platform_card: { ...card, facts } };
      });
    for (const label of ['Still dark since', 'Sigue sin anuncios desde']) {
      expect(googleFindingsFrom(still(label), idsOf(EASYFIT_GOOGLE_PORTFOLIOS)).darkRun).toEqual({
        darkDays: 11,
        ongoing: true,
        latestSince: '2026-10-26',
      });
    }
  });

  it('reads a Performance Max to rescue in either language (Vivo 47, 2026-10-31)', () => {
    const english = finding('pmax_rescue_or_pause', 'acct_pmax_rescue_or_pause', {
      reason:
        'SALES-PMAX-OCTUBRE costs $3,283 MXN per conversion against a target of $400 MXN; its asset groups rate AVERAGE and it loses 78% to rank. Rebuild its assets, or pause it and move its $450 MXN a day.',
      headline: 'Rescue or pause this Performance Max',
      campaign: 'SALES-PMAX-OCTUBRE',
      facts: [
        ['Cost per conversion', '$3,283 MXN'],
        ['Target', '$400 MXN'],
        ['Asset strength', 'Grupo de recursos 1: AVERAGE'],
        ['Lost to rank', '78%'],
      ],
    });
    const spanish = finding('pmax_rescue_or_pause', 'acct_pmax_rescue_or_pause', {
      reason:
        'SALES-PMAX-OCTUBRE cuesta $3,283 MXN por conversión frente a un CPA objetivo de $400 MXN; sus grupos de recursos tienen fuerza AVERAGE y pierde 78% por ranking. Rehaz sus recursos, o páusala y mueve sus $450 MXN al día.',
      headline:
        'SALES-PMAX-OCTUBRE: $3,283 MXN por conversión frente a un CPA objetivo de $400 MXN',
      campaign: 'SALES-PMAX-OCTUBRE',
      facts: [
        ['Costo por conversión', '$3,283 MXN'],
        ['CPA objetivo', '$400 MXN'],
        ['Fuerza de los recursos', 'Grupo de recursos 1: AVERAGE'],
        ['Perdido por ranking', '78%'],
      ],
    });
    const read = (candidate: AccountCandidate) =>
      googleFindingsFrom([candidate], idsOf(VIVO_PORTFOLIOS)).pmaxRescue;
    expect(read(english)).toEqual([
      { campaign: 'SALES-PMAX-OCTUBRE', costPerResult: 3283, target: 400, rankLost: 0.78 },
    ]);
    expect(read(spanish)).toEqual(read(english));
    const unpriced = (label: string, value: string) =>
      finding('pmax_rescue_or_pause', 'acct_pmax_rescue_or_pause', {
        reason: '',
        headline: 'x',
        campaign: 'SALES-PMAX-OCTUBRE',
        facts: [[label, value]],
      });
    expect(read(unpriced('Cost per conversion', 'no conversion'))[0]?.costPerResult).toBeNull();
    expect(read(unpriced('Costo por conversión', 'sin conversiones'))[0]?.costPerResult).toBeNull();
  });

  it('keeps the reading itself identical', () => {
    const reading = (
      rows: AccountCandidate[],
      portfolios: PortfolioListItem[],
      accountId: string,
    ) =>
      readAdAccount(
        adAccountSignalsFrom({
          platform: 'google_ads',
          accountId,
          currency: 'MXN',
          portfolios,
          approvalRequired: false,
          googleCards: rows,
          metrics: AccountPlatformMetricsSchema.parse(REAL.metrics.easyfitG),
        }),
      );
    for (const [account, rows, owned] of ACCOUNTS_ES) {
      const accountId = owned[0]?.ad_account_id ?? '';
      expect(reading(inSpanish(account, rows), [...owned], accountId)).toEqual(
        reading(cards(rows), [...owned], accountId),
      );
    }
  });
});
