import { type FrontendCheckpointReport, hasReportContent, reportPayloadSchema } from './schemas';

const streamingReport = {
  executive_summary:
    'Your top-performing campaigns across the last 7 days are driven by the Advantage+ App suite...',
  main_performance_snapshot: [
    { metric: 'Total Spend (Top 3)', value: 102985.51, change: 0, is_positive: true },
    { metric: 'Total Revenue (Top 3)', value: 175126.11, change: 0, is_positive: true },
    { metric: 'Avg. ROAS (Top 3)', value: 1.7, change: 0, is_positive: true },
    { metric: 'Avg. CPA (Top 3)', value: 817.35, change: 0, is_positive: false },
  ],
  primary_performance_graph: {
    title: 'Campaign Efficiency Comparison (CPA vs ROAS)',
    type: 'bar',
    x_axis_label: 'Campaign',
    y_axis_label: 'Metric Value',
    series: [
      {
        name: 'ROAS',
        data: [
          { category: 'Influencer', value: 1.66 },
          { category: 'UDF', value: 1.92 },
          { category: '2024', value: 1.71 },
        ],
      },
      {
        name: 'CPA (Indexed / 100)',
        data: [
          { category: 'Influencer', value: 7.42 },
          { category: 'UDF', value: 8.04 },
          { category: '2024', value: 8.86 },
        ],
      },
    ],
  },
  campaign_table: [
    {
      campaign_name: 'ANDROID | FEED - App AdvantagePlus - Influencer',
      status: 'ACTIVE',
      spend: 41551.73,
      purchases: 56,
      cpa: 741.99,
      roas: 1.66,
      revenue: 69017.95,
    },
    {
      campaign_name: 'ANDROID | FEED - App AdvantagePlus - 2024',
      status: 'ACTIVE',
      spend: 55803.54,
      purchases: 63,
      cpa: 885.77,
      roas: 1.71,
      revenue: 95290.16,
    },
    {
      campaign_name: 'ANDROID | FEED - App AdvantagePlus - UDF',
      status: 'ACTIVE',
      spend: 5630.24,
      purchases: 7,
      cpa: 804.32,
      roas: 1.92,
      revenue: 10818.0,
    },
  ],
  strategic_analysis: [
    {
      title: 'Efficiency Leader: App AdvantagePlus - Influencer',
      description: "This campaign is your 'best' when considering a balance of scale and cost...",
    },
    {
      title: 'High-ROAS Specialist: App AdvantagePlus - UDF',
      description: 'At 1.92 ROAS, this campaign is your most profitable per dollar spent...',
    },
    {
      title: 'Volume Driver: App AdvantagePlus - 2024',
      description: 'This is your primary revenue engine, generating $95,290.16...',
    },
  ],
  next_steps: [
    {
      action: 'Scale Influencer Campaign',
      impact: 'High Impact on ROAS',
      recommendation: "Increase daily budget for the 'Influencer' campaign by 15-20%...",
    },
    {
      action: 'Audit 2024 Campaign Creatives',
      impact: 'CPA Reduction',
      recommendation:
        "Analyze which specific ad sets or creatives in the '2024' campaign are driving the $885 CPA...",
    },
    {
      action: 'Test UDF Scalability',
      impact: 'Incremental Profit',
      recommendation: "Gradually increase spend on the 'UDF' campaign...",
    },
  ],
};

const result = reportPayloadSchema.safeParse(streamingReport);

if (result.success && !('type' in result.data)) {
  const report = result.data as FrontendCheckpointReport;

  console.log('✓ Parsing successful');
  console.log('Has content:', hasReportContent(report));
  console.log('\n=== Report Structure ===');
  console.log('Executive summary:', report.executive_summary?.substring(0, 100) + '...');
  console.log('Performance snapshot:', report.performance_snapshot.length, 'metrics');
  console.log('Sections:', report.sections.length);
  console.log('Graphs:', report.graphs.length);
  console.log('Strategic recommendations:', report.strategic_recommendations.length);

  if (report.sections.length > 0) {
    const section = report.sections[0];
    console.log('\n=== First Section ===');
    console.log('Heading:', section.heading);
    console.log('Highlights:', section.highlights.length);
    console.log('Tables:', section.tables.length);
    if (section.tables.length > 0) {
      const t = section.tables[0];
      if ('headers' in t) console.log('Table headers:', t.headers.join(', '));
      console.log('Table rows:', section.tables[0].rows.length);
    }
  }
} else if (result.success) {
  console.log('Got direct answer');
} else {
  console.error('✗ Parsing failed:', result.error.format());
}
