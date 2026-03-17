const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function handleMockMetrics(params: any) {
  const { range } = params;

  // MOCK DATA GENERATION
  // Random fluctuation helper
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

  const current = {
      spend: rand(5000, 15000),
      roas: rand(20000, 50000) / 10000, // 2.0000 - 5.0000
      impressions: rand(50000, 200000),
      clicks: rand(1000, 5000),
      conversions: rand(80, 450),
      ctr: 0,
      cpc: 0,
      cpa: 0,
  };

  // Calculated metrics
  current.ctr = Number(((current.clicks / current.impressions) * 100).toFixed(4));
  current.cpc = Number((current.spend / current.clicks).toFixed(4));
  current.cpa = Number((current.spend / current.conversions).toFixed(4));

  const previous = {
      spend: current.spend * 0.9,
      roas: Number((current.roas * 0.95).toFixed(4)),
      impressions: current.impressions * 0.92,
      clicks: current.clicks * 0.91,
      conversions: current.conversions * 0.9,
      ctr: 0,
      cpc: 0,
      cpa: 0,
  };
  previous.ctr = Number(((previous.clicks / previous.impressions) * 100).toFixed(4));
  previous.cpc = Number((previous.spend / previous.clicks).toFixed(4));
  previous.cpa = Number((previous.spend / previous.conversions).toFixed(4));

  const comparison = {
      spend: { current: current.spend, previous: previous.spend, percentageChange: 10 },
      roas: { current: current.roas, previous: previous.roas, percentageChange: 5 },
      impressions: { current: current.impressions, previous: previous.impressions, percentageChange: 8 },
      clicks: { current: current.clicks, previous: previous.clicks, percentageChange: 9 },
      ctr: { current: current.ctr, previous: previous.ctr, percentageChange: 1 },
      cpc: { current: current.cpc, previous: previous.cpc, percentageChange: 2 },
      cpa: { current: current.cpa, previous: previous.cpa, percentageChange: -2 },
  };

  // Generate 7 days of trend data
  const trends: Record<string, unknown>[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const spend = rand(500, 2500);
      const conversions = rand(8, 80);
      trends.push({
          date: d.toISOString().split('T')[0],
          spend,
          roas: rand(15000, 60000) / 10000,
          impressions: rand(5000, 30000),
          clicks: rand(100, 600),
          cpa: Number((spend / conversions).toFixed(4)),
      });
  }

  const responseData = {
    metrics: {
      spend: current.spend,
      roas: current.roas,
      impressions: current.impressions,
      clicks: current.clicks,
      ctr: current.ctr,
      cpc: current.cpc,
      cpa: current.cpa,
    },
    comparison,
    trends,
    range: {
        since: range?.since || "2025-01-01",
        until: range?.until || "2025-01-07",
        preset: range?.preset || "last_7d"
    }
  };

  return new Response(JSON.stringify(responseData), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}
