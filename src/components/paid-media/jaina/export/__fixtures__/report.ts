import { checkpointReportV2Schema } from '@/lib/jaina/schemas';

// One block of EVERY category, parsed through the real report schema so a contract
// change breaks the fixture here rather than silently narrowing what the export
// bench covers.

const PERIOD = { since: '2026-03-01', until: '2026-03-14', requested_label: 'Last 14 days' };

function computed(over: Record<string, unknown> = {}) {
  return {
    source: 'computed',
    tool: 'get_campaign_performance',
    period: PERIOD,
    entity_label: 'Spring Sale 2026',
    record_count: 14,
    ...over,
  };
}

export const EXPORT_BENCH_REPORT = checkpointReportV2Schema.parse({
  language: 'en',
  executive_summary:
    'Spend rose **18%** against a stable CPA while ROAS held at 3.4x.\n\nThe Spring Sale campaign carried the account: it absorbed most of the added budget and still improved efficiency. Two ad sets are now delivery-capped and are the clearest place to scale next.',
  reasoning_trace: '',
  blocks: [
    {
      block_id: 'kpis',
      category: 'metric_grid',
      scope: 'current_account',
      title: 'Account performance',
      priority: 'primary',
      provenance: computed(),
      dataset_id: 'ds_kpis',
      metrics: [
        { label: 'Spend', value: 48219.44, unit: 'USD', format: 'currency', change: 18.2, change_direction: 'up', severity: 'neutral' },
        { label: 'ROAS', value: 3.42, unit: null, format: 'multiplier', change: 2.1, change_direction: 'up', severity: 'positive' },
        { label: 'CPA', value: 27.86, unit: 'USD', format: 'currency', change: 1.4, change_direction: 'down', severity: 'positive' },
        { label: 'CTR', value: 2.13, unit: null, format: 'percent', change: 0.4, change_direction: 'flat', severity: 'neutral' },
      ],
    },
    {
      block_id: 'spend-trend',
      category: 'chart',
      scope: 'current_account',
      title: 'Spend and ROAS over time',
      priority: 'primary',
      provenance: computed({ tool: 'get_daily_performance' }),
      chart_type: 'line',
      category_key: 'date',
      value_key: 'spend',
      x_axis_label: 'Date',
      y_axis_label: 'Spend (USD)',
      value_format: 'currency',
      currency_code: 'USD',
      description: 'Daily spend against realized ROAS.',
      annotation: 'Budget raised on 2026-03-07.',
      chart_config: {
        spend: { label: 'Spend', color: 'var(--chart-1)' },
        roas: { label: 'ROAS', color: 'var(--chart-2)' },
      },
      data: Array.from({ length: 14 }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, '0')}`,
        spend: 2800 + index * 190 + (index % 3) * 120,
        roas: Number((3.1 + (index % 5) * 0.12).toFixed(2)),
      })),
    },
    {
      block_id: 'placement-mix',
      category: 'chart',
      scope: 'current_account',
      title: 'Spend by placement',
      priority: 'secondary',
      provenance: computed({ tool: 'get_placement_breakdown', record_count: 4 }),
      chart_type: 'pie',
      category_key: 'placement',
      value_key: 'spend',
      value_format: 'currency',
      currency_code: 'USD',
      chart_config: {
        Feed: { label: 'Feed', color: 'var(--chart-1)' },
        Reels: { label: 'Reels', color: 'var(--chart-2)' },
        Stories: { label: 'Stories', color: 'var(--chart-3)' },
        Search: { label: 'Search', color: 'var(--chart-4)' },
      },
      data: [
        { placement: 'Feed', spend: 21400 },
        { placement: 'Reels', spend: 14820 },
        { placement: 'Stories', spend: 7300 },
        { placement: 'Search', spend: 4699 },
      ],
    },
    {
      block_id: 'top-ads',
      category: 'data_table',
      scope: 'current_account',
      title: 'Top ads by spend',
      priority: 'secondary',
      provenance: computed({ tool: 'get_top_ads', record_count: 5 }),
      dataset_id: 'ds_top_ads',
      notes: 'Ranked by spend over the reporting window.',
      columns: [
        { key: 'ad', label: 'Ad', format: 'creative', align: 'left' },
        { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
        { key: 'roas', label: 'ROAS', format: 'multiplier', align: 'right' },
        { key: 'ctr', label: 'CTR', format: 'percent', align: 'right' },
      ],
      rows: [
        { ad: 'Spring Hero — 9x16', spend: 9840.2, roas: 4.1, ctr: 2.9 },
        { ad: 'Testimonial — Ana', spend: 7412.0, roas: 3.8, ctr: 2.4 },
        { ad: 'Bundle Offer — Static', spend: 6188.75, roas: 3.2, ctr: 1.9 },
        { ad: 'UGC Unboxing', spend: 5021.4, roas: 2.9, ctr: 2.2 },
        { ad: 'Carousel — Best Sellers', spend: 4402.1, roas: 2.6, ctr: 1.7 },
      ],
      row_meta: [
        { entity_id: 'ad_1', currency: 'USD' },
        { entity_id: 'ad_2', currency: 'USD' },
        { entity_id: 'ad_3', currency: 'USD' },
        { entity_id: 'ad_4', currency: 'USD' },
        { entity_id: 'ad_5', currency: 'USD' },
      ],
      render_mode: 'table',
      card_fields: null,
    },
    {
      block_id: 'actions',
      category: 'insight_list',
      scope: 'current_account',
      title: 'What to do next',
      priority: 'primary',
      provenance: { source: 'model', tool: null, period: PERIOD, entity_label: 'Spring Sale 2026', record_count: null },
      items: [
        {
          item_type: 'action',
          title: 'Raise budget on the two delivery-capped ad sets',
          summary: 'Both are hitting their daily cap before 3pm.',
          rationale: 'Capped delivery with above-account ROAS is unspent headroom, not a performance risk.',
          impact: 'Est. +12% incremental conversions at flat CPA.',
          severity: 'positive',
          priority: 'now',
          cite_ids: [],
        },
        {
          item_type: 'insight',
          title: 'Stories placement is diluting efficiency',
          summary: 'Stories carries 15% of spend at 2.1x ROAS against a 3.4x account average.',
          rationale: 'The placement has underperformed for three consecutive weeks, so this is not variance.',
          impact: 'Reallocating would recover roughly $3.2k of monthly spend.',
          severity: 'watch',
          priority: 'this_week',
          cite_ids: [],
        },
      ],
    },
    {
      block_id: 'wow',
      category: 'comparison',
      scope: 'current_account',
      title: 'Week over week',
      priority: 'supplementary',
      provenance: computed({ tool: 'get_period_comparison' }),
      before_label: 'Mar 1–7',
      after_label: 'Mar 8–14',
      pairs: [
        { label: 'Spend', before: 21980.1, after: 26239.34, unit: 'USD', format: 'currency', change: 19.4, change_direction: 'up', severity: 'neutral', cite_ids: [] },
        { label: 'ROAS', before: 3.29, after: 3.54, unit: null, format: 'multiplier', change: 7.6, change_direction: 'up', severity: 'positive', cite_ids: [] },
        { label: 'CPA', before: 28.4, after: 27.4, unit: 'USD', format: 'currency', change: 3.5, change_direction: 'down', severity: 'positive', cite_ids: [] },
      ],
    },
    {
      block_id: 'risks',
      category: 'narrative',
      scope: 'current_account',
      title: 'Risks to watch',
      priority: 'supplementary',
      provenance: { source: 'model', tool: null, period: PERIOD, entity_label: 'Spring Sale 2026', record_count: null },
      body: 'Creative fatigue is the near-term risk. Frequency on the top ad crossed 3.1 this week and CTR has drifted down for four straight days.\n\nThe Spring Sale campaign now carries 63% of account spend, so a drop there would be difficult to absorb elsewhere at the current CPA.',
      // Names the media_map key, which is what routes through MediaText/MediaPreview
      // and gives the export's image-inlining step something real to do.
      highlights: [
        {
          category: 'Fatigue',
          text: 'Spring Hero — 9x16 is the most fatigued placement at frequency 3.1.',
          severity: 'watch',
        },
      ],
      citations: [],
    },
  ],
  follow_up_questions: ['Where can we scale next?', 'Which creatives are fatiguing fastest?'],
  // Same-origin so the export's inlining step has something real to fetch.
  media_map: {
    'Spring Hero — 9x16': {
      image_url: '/icon.png',
      thumbnail_url: '/icon.png',
      entity_type: 'ad',
      entity_id: 'ad_1',
    },
  },
  handoff_trace: [],
  execution_objectives: [],
  cached_sources: [],
  _meta: {
    schema_version: '2',
    block_count: 7,
    has_charts: true,
    has_media: true,
    primary_scope: 'current_account',
  },
});
