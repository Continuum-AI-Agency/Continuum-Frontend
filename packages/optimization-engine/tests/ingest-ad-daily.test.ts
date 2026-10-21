// One ad-day from `paid_media.ad_breakdown_daily` → WindowMetrics. This mapper feeds the
// optimizer's ad-level attribution, and it mirrors the edge snapshot's taxonomy
// (supabase/functions/paid-media-metrics/meta), so the two count a lead the same way.
//
// The row shape is Easy Fit's (act_521903353286118, a QUALITY_LEAD ad set, 2026-09-19): Meta
// reports the same 2 leads as `lead` AND as its on-Facebook part `onsite_conversion.lead_grouped`.
// Summing every lead-like key scored 4 leads, halving the cost per lead the engine judges on
// (ledger DC-leads-double-counted).
import { describe, expect, test } from 'bun:test';
import { mapAdDailyRowToWindowMetrics } from '../src/ingest';

const adDay = (actions: Record<string, number>) => ({
  spend: 41.37,
  impressions: 1200,
  clicks: 30,
  link_clicks: 25,
  actions,
});

describe('mapAdDailyRowToWindowMetrics — leads', () => {
  test('reads `lead`, the aggregate, and never adds its parts to it', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({
        lead: 2,
        'onsite_conversion.lead_grouped': 2,
        leadgen_grouped: 2,
        offsite_complete_registration_add_meta_leads: 2,
      }),
    );
    expect(metrics.leads).toBe(2);
  });

  test('adds the disjoint parts only when the aggregate is absent', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({ 'offsite_conversion.fb_pixel_lead': 3, 'onsite_conversion.lead_grouped': 4 }),
    );
    expect(metrics.leads).toBe(7);
  });

  test('keeps omni_purchase authoritative over its components', () => {
    expect(mapAdDailyRowToWindowMetrics(adDay({ omni_purchase: 4, purchase: 2 })).purchases).toBe(
      4,
    );
  });
});

// Same rules as the edge's mapDayRow, measured on the same accounts (see its tests).
describe('mapAdDailyRowToWindowMetrics — conversations fall back per day', () => {
  test('reads messaging_conversation_started_7d when present, never adding the fallback', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({
        'onsite_conversion.messaging_conversation_started_7d': 5,
        'onsite_conversion.total_messaging_connection': 6,
      }),
    );
    expect(metrics.conversations).toBe(5);
  });

  test('falls back to total_messaging_connection on a day without the started counter', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({ 'onsite_conversion.total_messaging_connection': 3 }),
    );
    expect(metrics.conversations).toBe(3);
  });
});

describe('mapAdDailyRowToWindowMetrics — omni_ aggregates counted once', () => {
  test('landing page views, add-to-carts, signups and app installs read the aggregate alone', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({
        landing_page_view: 7,
        omni_landing_page_view: 7,
        add_to_cart: 4,
        omni_add_to_cart: 4,
        'offsite_conversion.fb_pixel_add_to_cart': 4,
        complete_registration: 2,
        omni_complete_registration: 2,
        'offsite_conversion.fb_pixel_complete_registration': 2,
        omni_app_install: 9,
        mobile_app_install: 9,
        app_install: 9,
      }),
    );
    expect(metrics.landingPageViews).toBe(7);
    expect(metrics.addToCarts).toBe(4);
    expect(metrics.signups).toBe(2);
    expect(metrics.appInstalls).toBe(9);
  });

  test('without the aggregate, reads the first counter present rather than summing overlaps', () => {
    const metrics = mapAdDailyRowToWindowMetrics(
      adDay({ add_to_cart: 3, 'offsite_conversion.fb_pixel_add_to_cart': 3 }),
    );
    expect(metrics.addToCarts).toBe(3);
  });
});
