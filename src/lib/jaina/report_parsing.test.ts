import { describe, expect, it } from 'bun:test';
import { reportPayloadSchema } from './schemas';

describe('Report Parsing Integration', () => {
  it('should parse the user-supplied lead strategist output', () => {
    const payload = {
      title: 'Best Performing Campaigns & Optimization Strategy',
      summary:
        "Account performance is currently anchored by the 'App AdvantagePlus' Feed campaigns, which are significantly outperforming the 'Selfservice' clusters. The 'Influencer' campaign is the most efficient driver of ROI with a 1.75 ROAS, while the '2024' campaign handles the highest volume of spend effectively. Conversely, the 'Selfservice' campaigns are currently dragging down the overall account ROAS (1.18) due to extremely low conversion efficiency.",
      date_range: 'Last 7 Days',
      key_metrics: [
        {
          label: 'Top Campaign ROAS',
          value: '1.75',
          sub_label: 'Influencer Feed',
        },
        {
          label: 'Total Purchases',
          value: '131',
          sub_label: 'Top 3 Campaigns',
        },
      ],
      sections: [
        {
          title: 'Campaign Performance Ranking',
          content:
            'The following table ranks the top-performing campaigns by ROAS and conversion volume.',
          graphs: [
            {
              type: 'bar',
              title: 'ROAS Comparison by Campaign',
              data: [{ label: 'Influencer - Feed', value: 1.75 }],
            },
          ],
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as any;
      expect(data.performance_snapshot).toBeDefined();
      expect(data.performance_snapshot.length).toBeGreaterThan(0);
      expect(data.data_integrity_notes).toContain('Date Range');
    }
  });

  it('should parse the highly unstructured specialist report payload', () => {
    const payload = {
      title: 'Integrated Account Performance Strategy',
      executive_summary:
        'Over the last 7 days, your account has maintained a blended ROAS of 1.12...',
      performance_snapshot: [{ label: 'Total Spend', value: 162916.33, status: 'neutral' }],
      strategy_and_insights: [
        { title: 'Conversion Efficiency Gap', content: 'A critical discrepancy exists...' },
      ],
      campaign_performance: [
        { campaign_name: 'ANDROID | SELFSERVICE', spend: 42266.4, status: 'Winner' },
      ],
      graphs: [
        {
          type: 'bar',
          title: 'ROAS by Top Campaigns',
          data: [{ x: 'Android Selfservice', y: 1.75 }],
        },
      ],
      recommendations: [
        { priority: 'High', action: 'Immediate Budget Reallocation', description: 'Shift 40%...' },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);

    if (!result.success) {
      console.error(
        'Specialist Report Parsing Error:',
        JSON.stringify(result.error.format(), null, 2),
      );
    }

    expect(result.success).toBe(true);

    if (result.success) {
      const data = result.data as any;
      expect(data.summary).toBeDefined();
      expect(data.performance_snapshot).toBeDefined();
      expect(data.performance_snapshot.length).toBeGreaterThan(0);
      expect(data.strategic_insights).toBeDefined();
      expect(data.strategic_insights.length).toBeGreaterThan(0);
      expect(data.charts).toBeDefined();
      expect(data.charts.length).toBeGreaterThan(0);
      expect(data.charts[0].data[0].value).toBe(1.75); // Mapping check
    }
  });

  it('should handle mixed string/object recommendations in permissive mode', () => {
    const payload = {
      summary: 'Short summary',
      recommendations: [
        'Just do it',
        { action: 'Refactor', description: 'Clean code', priority: 'Low' },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as any;
      expect(data.priority_recommendations.length).toBe(2);
      expect(data.priority_recommendations[0].action).toBe('Recommendation');
      expect(data.priority_recommendations[1].action).toBe('Refactor');
    }
  });

  it('should parse realtime output_text JSON with main_graph labels/datasets', () => {
    const payload = {
      summary:
        'The campaign ANDROID | FEED - App AdvantagePlus - UDF is currently the top performer by ROAS (1.92).',
      performance_snapshot: [
        {
          metric: 'Top ROAS',
          value: '1.92',
          change: 0,
          direction: 'none',
          context: 'ANDROID | FEED - App AdvantagePlus - UDF',
        },
      ],
      main_graph: {
        type: 'bar',
        labels: ['App AdvantagePlus - UDF', 'App AdvantagePlus - 2024'],
        datasets: [
          {
            label: 'ROAS',
            data: [1.92, 1.71],
          },
        ],
      },
      insights: [
        {
          title: 'Strategic Drain in SELFSERVICE Campaigns',
          description: 'Near-zero ROAS despite high spend.',
          impact: 'Critical',
          type: 'risk',
        },
      ],
      recommendations: [
        {
          action: 'Increase Budget',
          target: 'ANDROID | FEED - App AdvantagePlus - UDF',
          reasoning: 'Highest ROAS in the account (1.92).',
          expected_outcome: 'Improved blended account ROAS.',
        },
      ],
      campaign_table: [
        {
          campaign_name: 'ANDROID | FEED - App AdvantagePlus - UDF',
          spend: 5630.58,
          purchase_value: 10818.0,
          roas: 1.92,
          status: 'Winning Efficiency',
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);

    if (result.success) {
      const data = result.data as any;
      expect(data.graphs.length).toBe(1);
      expect(data.graphs[0].data.length).toBe(2);
      expect(data.graphs[0].data[0].value).toBe(1.92);
      expect(data.strategic_recommendations[0].description).toContain('Highest ROAS');
      expect(data.strategic_recommendations[0].target).toBe(
        'ANDROID | FEED - App AdvantagePlus - UDF',
      );
      expect(data.sections[0].tables[0].rows.length).toBe(1);
      expect(data.sections[0].highlights[0].severity).toBe('risk');
    }
  });

  it('should parse key_insights, action_plan, performance_table, and keep section summary distinct', () => {
    const payload = {
      summary: 'The analysis of the campaign reveals a clear performance hierarchy among ad sets.',
      performance_snapshot: [
        {
          label: 'Total Campaign Spend',
          value: 11241.35,
          change: 0.0,
          is_positive_change: true,
          prefix: '$',
        },
        {
          label: 'Aggregated Campaign ROAS',
          value: 1.23,
          change: 0.0,
          is_positive_change: true,
          suffix: 'x',
        },
      ],
      key_insights: [
        {
          title: 'Efficiency Leader: Top-Marcas',
          description: 'Most cost-effective segment.',
          metric: 'CPA',
          impact: 'POSITIVE',
        },
        {
          title: 'Wasted Spend',
          description: 'No purchase conversions.',
          metric: 'ROAS',
          impact: 'NEGATIVE',
        },
      ],
      charts: [
        {
          title: 'Ad Set Efficiency Comparison',
          type: 'BAR',
          data: [
            {
              name: 'Top-Marcas',
              CPA: 21.31,
              CTR: 1.64,
              ROAS: 1.64,
            },
            {
              name: 'Carruseles-Dinamicos',
              CPA: 22.25,
              CTR: 0.97,
              ROAS: 1.86,
            },
          ],
        },
      ],
      action_plan: [
        {
          type: 'PAUSE_UNDERPERFORMER',
          priority: 'HIGH',
          description: 'Pause the underperforming ad set.',
        },
      ],
      performance_table: [
        {
          'Ad Set Name': 'Top-Marcas',
          Spend: '$2,110.05',
          CPA: '$21.31',
          ROAS: '1.64x',
          CTR: '1.64%',
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as any;
      expect(data.executive_summary).toContain('clear performance hierarchy');
      expect(data.sections[0].summary).toBe('');
      expect(data.sections[0].highlights.length).toBe(2);
      expect(data.sections[0].highlights[0].severity).toBe('positive');
      expect(data.sections[0].highlights[1].severity).toBe('risk');
      expect(data.sections[0].tables.length).toBe(1);
      expect(data.strategic_recommendations.length).toBe(1);
      expect(data.strategic_recommendations[0].action).toBe('Pause Underperformer');
      expect(data.strategic_recommendations[0].type).toBe('Pause Underperformer');
      expect(data.strategic_recommendations[0].priority).toBe('HIGH');
      expect(data.graphs.length).toBe(3);
      expect(data.graphs[0].type).toBe('bar');
      expect(data.graphs[0].title).toContain('CPA');
      expect(data.graphs[0].data.length).toBe(2);
      expect(data.graphs[1].title).toContain('CTR');
      expect(data.graphs[2].title).toContain('ROAS');
      expect(data.performance_snapshot[0].prefix).toBe('$');
      expect(data.performance_snapshot[1].suffix).toBe('x');
    }
  });

  it('should map misspelled reccomendations keys to strategic_recommendations', () => {
    const payload = {
      summary: 'Summary',
      reccomendations: [
        {
          type: 'BUDGET_REALLOCATION',
          description: 'Shift budget to winners.',
          priority: 'HIGH',
        },
      ],
      priority_reccomendations: [
        {
          action: 'Pause Laggards',
          description: 'Pause lowest ROAS segment.',
          priority: 'MEDIUM',
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as any;
      expect(data.strategic_recommendations.length).toBe(2);
      expect(data.strategic_recommendations[0].action).toBe('Budget Reallocation');
      expect(data.strategic_recommendations[0].priority).toBe('HIGH');
      expect(data.strategic_recommendations[1].action).toBe('Pause Laggards');
      expect(data.strategic_recommendations[1].priority).toBe('MEDIUM');
    }
  });

  it('should parse category-based blocks and derive legacy render fields', () => {
    const payload = {
      executive_summary: 'Blocks-based synthesis output.',
      blocks: [
        {
          block_id: 'block-summary-1',
          category: 'summary_breakdown',
          scope: 'account',
          title: 'Account Breakdown',
          summary: 'Account-level findings and actions.',
          cached_sources: ['cache://account'],
          highlights: [
            {
              category: 'performance',
              title: 'Top Winner',
              text: 'Prospecting campaign delivered strongest ROAS.',
              impact: 'POSITIVE',
              severity: 'positive',
              evidence: ['ROAS 1.92'],
            },
          ],
          actions: [
            {
              title: 'Scale Prospecting Winner',
              rationale: 'Best-performing campaign has stable CPA and ROAS.',
              expected_impact: 'Improve blended ROAS',
              priority: 'HIGH',
            },
          ],
          tables: [
            {
              title: 'Campaign Snapshot',
              headers: ['Campaign', 'ROAS'],
              rows: [['Prospecting', '1.92']],
            },
          ],
        },
        {
          block_id: 'block-data-1',
          category: 'data',
          scope: 'campaign',
          title: 'Metric Snapshot',
          summary: 'Latest metric snapshot for decision making.',
          cached_sources: [],
          rows: [
            { metric: 'Spend', value: 1200, prefix: '$', status: 'neutral' },
            { metric: 'ROAS', value: 1.92, suffix: 'x', status: 'positive' },
          ],
          tables: [
            {
              headers: ['Segment', 'CPA'],
              rows: [['Prospecting', '21.31']],
            },
          ],
        },
        {
          block_id: 'block-graph-1',
          category: 'graph',
          scope: 'campaign',
          title: 'Trend Graphs',
          summary: 'Recent trend evolution.',
          cached_sources: [],
          graphs: [
            {
              title: 'ROAS Trend',
              type: 'line',
              series: [
                {
                  name: 'ROAS',
                  data: [
                    { x: 'Mon', y: 1.2 },
                    { x: 'Tue', y: 1.4 },
                  ],
                },
              ],
            },
            {
              title: 'Spend by Day',
              type: 'bar',
              data: [
                { label: 'Mon', value: 400 },
                { label: 'Tue', value: 800 },
              ],
            },
          ],
        },
        {
          block_id: 'block-insight-1',
          category: 'insight_recommendation',
          scope: 'account',
          title: 'Decision Layer',
          summary: 'Recommendations and follow-up questions.',
          cached_sources: [],
          items: [
            {
              item_type: 'recommendation',
              title: 'Reallocate Budget',
              summary: 'Shift 20% budget from low performers to winners.',
              payload: { priority: 'HIGH', expected_impact: 'Higher ROAS' },
            },
            {
              item_type: 'question',
              title: 'Approval Needed',
              summary: 'Can we move 20% budget this week?',
              payload: {},
            },
          ],
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);

    if (result.success) {
      const data = result.data as any;
      expect(data.blocks.length).toBe(4);
      expect(data.performance_snapshot.length).toBe(2);
      expect(data.sections.length).toBeGreaterThan(0);
      expect(data.strategic_recommendations.length).toBe(1);
      expect(data.strategic_recommendations[0].title).toBe('Reallocate Budget');
      expect(data.follow_up_questions).toContain('Can we move 20% budget this week?');
      expect(data.graphs.length).toBe(2);
    }
  });

  it('should normalize legacy block_type aliases into canonical categories', () => {
    const payload = {
      summary: 'Alias compatibility check',
      blocks: [
        {
          block_id: 'legacy-1',
          block_type: 'recommendations',
          scope: 'account',
          title: 'Legacy Recommendations',
          summary: 'Legacy recommendation payload.',
          cached_sources: [],
          recommendations: [
            {
              action: 'Pause Laggards',
              description: 'Pause lowest-ROAS ad sets.',
              priority: 'MEDIUM',
            },
          ],
        },
      ],
    };

    const result = reportPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);

    if (result.success) {
      const data = result.data as any;
      expect(data.blocks.length).toBe(1);
      expect(data.blocks[0].category).toBe('insight_recommendation');
      expect(data.strategic_recommendations.length).toBe(1);
      expect(data.strategic_recommendations[0].title).toBe('Pause Laggards');
    }
  });
});
