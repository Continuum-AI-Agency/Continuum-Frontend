import type {
  BreakdownData,
  DemographicBreakdown,
  FormatBreakdown,
  PlacementBreakdown,
} from "./breakdowns.ts";

type InsightCategory = "formats" | "placements" | "audiences" | "creative";
type InsightSeverity = "positive" | "negative" | "neutral";

export type HeuristicInsight = {
  category: InsightCategory;
  text: string;
  severity: InsightSeverity;
  source: "computed";
  metric?: string;
  value?: number;
  delta?: number;
};

const MIN_SPEND_SHARE = 0.05;
const MIN_DELTA_PCT = 15;

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function fmtPct(value: number): string {
  return `${Math.round(value)}%`;
}

function fmtCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function fmtNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
};

const POSITION_LABELS: Record<string, string> = {
  feed: "Feed",
  story: "Stories",
  reels: "Reels",
  right_hand_column: "Right Column",
  search: "Search",
  marketplace: "Marketplace",
  video_feeds: "Video Feeds",
  instant_article: "Instant Articles",
  instream_video: "In-Stream Video",
  an_classic: "Audience Network",
};

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}
function positionLabel(p: string): string {
  return POSITION_LABELS[p] ?? p;
}

function computeFormatInsights(formats: FormatBreakdown[]): HeuristicInsight[] {
  if (formats.length < 2) return [];

  const insights: HeuristicInsight[] = [];
  const totalSpend = formats.reduce((s, f) => s + f.spend, 0);
  const sig = formats.filter(
    (f) => totalSpend > 0 && f.spend / totalSpend >= MIN_SPEND_SHARE
  );
  if (sig.length < 2) return [];

  const byCtr = [...sig].sort((a, b) => b.ctr - a.ctr);
  if (byCtr.length >= 2 && byCtr[0].ctr > 0 && byCtr[1].ctr > 0) {
    const delta = Math.round(
      ((byCtr[0].ctr - byCtr[1].ctr) / byCtr[1].ctr) * 100
    );
    if (Math.abs(delta) >= MIN_DELTA_PCT) {
      insights.push({
        category: "formats",
        text: `${capitalize(byCtr[0].format)} leads CTR at ${byCtr[0].ctr.toFixed(2)}%, ${fmtPct(Math.abs(delta))} ahead of ${capitalize(byCtr[1].format)}`,
        severity: "positive",
        source: "computed",
        metric: "ctr",
        value: byCtr[0].ctr,
        delta,
      });
    }
  }

  const byRoas = [...sig].sort((a, b) => b.roas - a.roas);
  if (byRoas.length >= 2 && byRoas[0].roas > 0) {
    insights.push({
      category: "formats",
      text: `${capitalize(byRoas[0].format)} delivers ${byRoas[0].roas.toFixed(2)}x ROAS on ${fmtPct(pct(byRoas[0].spend, totalSpend))} of spend`,
      severity: "positive",
      source: "computed",
      metric: "roas",
      value: byRoas[0].roas,
    });
  }

  const underperformers = sig.filter(
    (f) => f.roas < (byRoas[0]?.roas ?? 0) * 0.5 && pct(f.spend, totalSpend) >= 20
  );
  for (const up of underperformers) {
    insights.push({
      category: "formats",
      text: `${capitalize(up.format)} receives ${fmtPct(pct(up.spend, totalSpend))} of spend but ROAS is only ${up.roas.toFixed(2)}x`,
      severity: "negative",
      source: "computed",
      metric: "roas",
      value: up.roas,
    });
  }

  return insights.slice(0, 3);
}

function computePlacementInsights(
  placements: PlacementBreakdown[]
): HeuristicInsight[] {
  if (placements.length === 0) return [];

  const insights: HeuristicInsight[] = [];
  const totalConv = placements.reduce((s, p) => s + p.conversions, 0);
  const totalSpend = placements.reduce((s, p) => s + p.spend, 0);

  const byPlatform = new Map<
    string,
    { spend: number; conversions: number; clicks: number; impressions: number; conversion_value: number }
  >();
  for (const p of placements) {
    const e = byPlatform.get(p.publisher_platform) ?? {
      spend: 0, conversions: 0, clicks: 0, impressions: 0, conversion_value: 0,
    };
    e.spend += p.spend;
    e.conversions += p.conversions;
    e.clicks += p.clicks;
    e.impressions += p.impressions;
    e.conversion_value += p.conversion_value;
    byPlatform.set(p.publisher_platform, e);
  }

  if (totalConv > 0) {
    const sorted = [...byPlatform.entries()].sort(
      (a, b) => b[1].conversions - a[1].conversions
    );
    const [topPlatform, topMetrics] = sorted[0];
    const share = pct(topMetrics.conversions, totalConv);
    if (share >= 50 && sorted.length >= 2) {
      insights.push({
        category: "placements",
        text: `${platformLabel(topPlatform)} drives ${fmtPct(share)} of conversions, outpacing ${platformLabel(sorted[1][0])}`,
        severity: "positive",
        source: "computed",
        metric: "conversions",
        value: share,
      });
    }
  }

  const positions = new Map<string, PlacementBreakdown[]>();
  for (const p of placements) {
    const g = positions.get(p.publisher_platform) ?? [];
    g.push(p);
    positions.set(p.publisher_platform, g);
  }

  for (const [platform, group] of positions) {
    if (group.length < 2) continue;
    const sig = group.filter(
      (p) => totalSpend > 0 && p.spend / totalSpend >= MIN_SPEND_SHARE
    );
    if (sig.length < 2) continue;
    const sorted = [...sig].sort((a, b) => b.ctr - a.ctr);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.ctr > 0 && worst.ctr > 0) {
      const delta = Math.round(((best.ctr - worst.ctr) / worst.ctr) * 100);
      if (delta >= MIN_DELTA_PCT) {
        insights.push({
          category: "placements",
          text: `${positionLabel(best.platform_position)} outperforms ${positionLabel(worst.platform_position)} on ${platformLabel(platform)} by ${fmtPct(delta)} CTR`,
          severity: "positive",
          source: "computed",
          metric: "ctr",
          delta,
        });
      }
    }
  }

  for (const [platform, metrics] of byPlatform) {
    const roas = metrics.spend > 0 ? metrics.conversion_value / metrics.spend : 0;
    const spendShare = pct(metrics.spend, totalSpend);
    const convShare = pct(metrics.conversions, totalConv);
    if (convShare > spendShare + 15 && totalConv > 0) {
      insights.push({
        category: "placements",
        text: `${platformLabel(platform)} is efficient: ${fmtPct(convShare)} of conversions on only ${fmtPct(spendShare)} of spend (${roas.toFixed(2)}x ROAS)`,
        severity: "positive",
        source: "computed",
        metric: "roas",
        value: roas,
      });
    }
  }

  return insights.slice(0, 3);
}

function computeAudienceInsights(
  demographics: DemographicBreakdown[]
): HeuristicInsight[] {
  if (demographics.length === 0) return [];

  const insights: HeuristicInsight[] = [];
  const totalConv = demographics.reduce((s, d) => s + d.conversions, 0);
  const totalSpend = demographics.reduce((s, d) => s + d.spend, 0);

  const byAge = new Map<string, { spend: number; conversions: number; conversion_value: number }>();
  for (const d of demographics) {
    const e = byAge.get(d.age) ?? { spend: 0, conversions: 0, conversion_value: 0 };
    e.spend += d.spend;
    e.conversions += d.conversions;
    e.conversion_value += d.conversion_value;
    byAge.set(d.age, e);
  }

  if (totalConv > 0) {
    const sortedAge = [...byAge.entries()].sort((a, b) => b[1].conversions - a[1].conversions);
    if (sortedAge.length >= 2) {
      const [topAge, topMetrics] = sortedAge[0];
      const share = pct(topMetrics.conversions, totalConv);
      insights.push({
        category: "audiences",
        text: `${topAge} age group leads with ${fmtPct(share)} of conversions (${fmtNumber(topMetrics.conversions)} total)`,
        severity: "positive",
        source: "computed",
        metric: "conversions",
        value: share,
      });
    }

    for (const [age, metrics] of byAge) {
      const spendShare = pct(metrics.spend, totalSpend);
      const convShare = pct(metrics.conversions, totalConv);
      if (spendShare >= 15 && convShare < spendShare - 15) {
        insights.push({
          category: "audiences",
          text: `${age} receives ${fmtPct(spendShare)} of spend but only drives ${fmtPct(convShare)} of conversions`,
          severity: "negative",
          source: "computed",
          metric: "spend_efficiency",
          delta: convShare - spendShare,
        });
      }
    }
  }

  const byGender = new Map<string, { spend: number; conversions: number; conversion_value: number }>();
  for (const d of demographics) {
    const e = byGender.get(d.gender) ?? { spend: 0, conversions: 0, conversion_value: 0 };
    e.spend += d.spend;
    e.conversions += d.conversions;
    e.conversion_value += d.conversion_value;
    byGender.set(d.gender, e);
  }

  const male = byGender.get("male");
  const female = byGender.get("female");
  if (male && female && totalSpend > 0) {
    const mRoas = male.spend > 0 ? male.conversion_value / male.spend : 0;
    const fRoas = female.spend > 0 ? female.conversion_value / female.spend : 0;
    if (mRoas > 0 && fRoas > 0) {
      const better = fRoas > mRoas
        ? { label: "Female", roas: fRoas }
        : { label: "Male", roas: mRoas };
      const worse = fRoas > mRoas
        ? { label: "Male", roas: mRoas }
        : { label: "Female", roas: fRoas };
      const delta = Math.round(((better.roas - worse.roas) / worse.roas) * 100);
      if (delta >= MIN_DELTA_PCT) {
        insights.push({
          category: "audiences",
          text: `${better.label} audiences deliver ${fmtPct(delta)} higher ROAS (${better.roas.toFixed(2)}x vs ${worse.roas.toFixed(2)}x)`,
          severity: "neutral",
          source: "computed",
          metric: "roas",
          delta,
        });
      }
    }
  }

  return insights.slice(0, 3);
}

function computeCreativeInsights(data: BreakdownData): HeuristicInsight[] {
  const insights: HeuristicInsight[] = [];
  const { formats, devices, placements } = data;

  if (formats.length >= 2 && devices.length >= 2) {
    const mobile = devices.find(
      (d) => d.device_platform === "mobile_app" || d.device_platform === "mobile_web"
    );
    const desktop = devices.find((d) => d.device_platform === "desktop");
    if (mobile && desktop) {
      const total = mobile.clicks + desktop.clicks;
      if (total > 0) {
        const mobileShare = pct(mobile.clicks, total);
        if (mobileShare >= 70) {
          insights.push({
            category: "creative",
            text: `Mobile captures ${fmtPct(mobileShare)} of all clicks — prioritize mobile-first creative`,
            severity: "neutral",
            source: "computed",
            metric: "clicks",
            value: mobileShare,
          });
        }
      }
    }
  }

  const video = formats.find((f) => f.format === "video");
  const image = formats.find((f) => f.format === "image");
  if (video && image && video.ctr > 0 && image.ctr > 0) {
    const winner = video.ctr > image.ctr
      ? { label: "Video", ctr: video.ctr, loser: "Image" }
      : { label: "Image", ctr: image.ctr, loser: "Video" };
    const delta = Math.round(
      ((winner.ctr - Math.min(video.ctr, image.ctr)) /
        Math.min(video.ctr, image.ctr)) *
        100
    );
    if (delta >= MIN_DELTA_PCT) {
      insights.push({
        category: "creative",
        text: `${winner.label} creatives achieve ${fmtPct(delta)} higher CTR than ${winner.loser} (${winner.ctr.toFixed(2)}%)`,
        severity: "positive",
        source: "computed",
        metric: "ctr",
        delta,
      });
    }
  }

  const carousel = formats.find((f) => f.format === "carousel");
  if (carousel && carousel.conversions > 0 && image && image.conversions > 0) {
    const cCpa = carousel.spend / carousel.conversions;
    const iCpa = image.spend / image.conversions;
    if (cCpa > 0 && iCpa > 0) {
      const winner = cCpa < iCpa
        ? { label: "Carousel", cpa: cCpa, loser: "Image" }
        : { label: "Image", cpa: iCpa, loser: "Carousel" };
      const delta = Math.round(
        ((Math.max(cCpa, iCpa) - winner.cpa) / winner.cpa) * 100
      );
      if (delta >= MIN_DELTA_PCT) {
        insights.push({
          category: "creative",
          text: `${winner.label} format has ${fmtPct(delta)} lower CPA than ${winner.loser} (${fmtCurrency(winner.cpa)})`,
          severity: "positive",
          source: "computed",
          metric: "cpa",
          delta,
        });
      }
    }
  }

  return insights.slice(0, 3);
}

export function computeHeuristicInsights(data: BreakdownData): HeuristicInsight[] {
  return [
    ...computeFormatInsights(data.formats),
    ...computePlacementInsights(data.placements),
    ...computeAudienceInsights(data.demographics),
    ...computeCreativeInsights(data),
  ];
}
