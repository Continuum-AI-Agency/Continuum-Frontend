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
      roas: rand(200, 500) / 100, // 2.00 - 5.00
      impressions: rand(50000, 200000),
      clicks: rand(1000, 5000),
      ctr: 0,
      cpc: 0,
  };

  // Calculated metrics
  current.ctr = (current.clicks / current.impressions) * 100;
  current.cpc = current.spend / current.clicks;

  const previous = {
      spend: current.spend * 0.9,
      roas: current.roas * 0.95,
      impressions: current.impressions * 0.92,
      clicks: current.clicks * 0.91,
      ctr: 0,
      cpc: 0,
  };
  previous.ctr = (previous.clicks / previous.impressions) * 100;
  previous.cpc = previous.spend / previous.clicks;

  const comparison = {
      spend: { current: current.spend, previous: previous.spend, percentageChange: 10 },
      roas: { current: current.roas, previous: previous.roas, percentageChange: 5 },
      impressions: { current: current.impressions, previous: previous.impressions, percentageChange: 8 },
      clicks: { current: current.clicks, previous: previous.clicks, percentageChange: 9 },
      ctr: { current: current.ctr, previous: previous.ctr, percentageChange: 1 },
      cpc: { current: current.cpc, previous: previous.cpc, percentageChange: 2 },
  };

  // Generate 7 days of trend data
  const trends: Record<string, unknown>[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      trends.push({
          date: d.toISOString().split('T')[0],
          spend: rand(500, 2500),
          roas: rand(150, 600) / 100,
          impressions: rand(5000, 30000),
          clicks: rand(100, 600)
      });
  }

  const responseData = {
    metrics: current,
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