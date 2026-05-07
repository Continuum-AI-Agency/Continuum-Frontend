import type {
  BreakdownData,
  DemographicBreakdown,
  FormatBreakdown,
  ObjectiveBreakdown,
  PlacementBreakdown,
} from "./breakdowns.ts";
import type { AdCreativeBreakdown } from "./creative.ts";

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
  recommendation?: string;
  estimated_impact?: string;
  campaign_id?: string;
  adset_id?: string;
};

const MIN_SPEND_SHARE = 0.08;
const MIN_DELTA_PCT = 15;
const MIN_SPEND_THRESHOLD = 50;

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
  const qualified = formats.filter((f) => f.spend >= MIN_SPEND_THRESHOLD);
  if (qualified.length < 2) return [];
  const totalSpend = qualified.reduce((s, f) => s + f.spend, 0);
  const sig = qualified.filter(
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
    const shiftAmount = up.spend * 0.15;
    const roasGap = (byRoas[0]?.roas ?? 0) - up.roas;
    const estimatedGain = shiftAmount * roasGap;
    insights.push({
      category: "formats",
      text: `${capitalize(up.format)} receives ${fmtPct(pct(up.spend, totalSpend))} of spend but ROAS is only ${up.roas.toFixed(2)}x`,
      severity: "negative",
      source: "computed",
      metric: "roas",
      value: up.roas,
      recommendation: `Consider shifting 15% of ${capitalize(up.format)} budget (${fmtCurrency(shiftAmount)}) to ${capitalize(byRoas[0].format)}`,
      estimated_impact: estimatedGain > 0 ? `~${fmtCurrency(estimatedGain)} potential additional revenue` : undefined,
    });
  }

  return insights.slice(0, 3);
}

function computePlacementInsights(
  placements: PlacementBreakdown[]
): HeuristicInsight[] {
  if (placements.length === 0) return [];

  const insights: HeuristicInsight[] = [];
  const qualified = placements.filter((p) => p.spend >= MIN_SPEND_THRESHOLD);
  if (qualified.length === 0) return [];
  const totalConv = qualified.reduce((s, p) => s + p.conversions, 0);
  const totalSpend = qualified.reduce((s, p) => s + p.spend, 0);

  const byPlatform = new Map<
    string,
    { spend: number; conversions: number; clicks: number; impressions: number; conversion_value: number }
  >();
  for (const p of qualified) {
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
  for (const p of qualified) {
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
        recommendation: `Increase ${platformLabel(platform)} budget allocation to capitalize on efficiency`,
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
  const qualified = demographics.filter((d) => d.spend >= MIN_SPEND_THRESHOLD);
  if (qualified.length === 0) return [];
  const totalConv = qualified.reduce((s, d) => s + d.conversions, 0);
  const totalSpend = qualified.reduce((s, d) => s + d.spend, 0);

  const byAge = new Map<string, { spend: number; conversions: number; conversion_value: number }>();
  for (const d of qualified) {
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
  for (const d of qualified) {
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

function computeCreativeInsights(
  data: BreakdownData,
  adCreatives?: AdCreativeBreakdown[]
): HeuristicInsight[] {
  const insights: HeuristicInsight[] = [];

  if (adCreatives && adCreatives.length > 0) {
    const totalSpend = adCreatives.reduce((s, a) => s + a.spend, 0);
    const spendThreshold = Math.max(totalSpend * 0.02, MIN_SPEND_THRESHOLD);
    const qualified = adCreatives.filter((a) => a.spend >= spendThreshold);

    if (qualified.length > 0) {
      // Top performer: highest ROAS ad with ≥2% spend share
      const byRoas = [...qualified].sort((a, b) => b.roas - a.roas);
      if (byRoas[0].roas > 0) {
        const spendShare = pct(byRoas[0].spend, totalSpend);
        insights.push({
          category: "creative",
          text: `"${byRoas[0].ad_name}" is top ROAS creative at ${byRoas[0].roas.toFixed(1)}x (${fmtPct(spendShare)} of spend)`,
          severity: "positive",
          source: "computed",
          metric: "roas",
          value: byRoas[0].roas,
          recommendation: `Increase budget allocation to "${byRoas[0].ad_name}" to scale top performer`,
          campaign_id: byRoas[0].campaign_id || undefined,
          adset_id: byRoas[0].adset_id || undefined,
        });
      }

      // Worst performer: lowest ROAS ad with ≥10% spend share vs top performer
      const highSpend = qualified.filter((a) => pct(a.spend, totalSpend) >= 10);
      if (highSpend.length >= 2) {
        const sorted = [...highSpend].sort((a, b) => b.roas - a.roas);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        if (worst.roas < best.roas * 0.5) {
          const estimatedGain = worst.spend * (best.roas - worst.roas);
          insights.push({
            category: "creative",
            text: `"${worst.ad_name}" gets ${fmtPct(pct(worst.spend, totalSpend))} of spend but only ${worst.roas.toFixed(1)}x ROAS`,
            severity: "negative",
            source: "computed",
            metric: "roas",
            value: worst.roas,
            recommendation: `Reallocate budget from "${worst.ad_name}" to higher-performing creatives`,
            estimated_impact:
              estimatedGain > 0
                ? `~${fmtCurrency(estimatedGain)} potential revenue gain`
                : undefined,
            campaign_id: worst.campaign_id || undefined,
            adset_id: worst.adset_id || undefined,
          });
        }
      }

      // Fatigue risk: frequency ≥3.5 AND CTR below account average
      const avgCtr =
        qualified.reduce((s, a) => s + a.ctr, 0) / qualified.length;
      const fatigued = qualified.filter(
        (a) => a.frequency >= 3.5 && a.ctr < avgCtr
      );
      if (fatigued.length > 0) {
        const ad = fatigued[0];
        insights.push({
          category: "creative",
          text: `"${ad.ad_name}" showing fatigue: ${ad.frequency.toFixed(1)}x frequency, CTR ${ad.ctr.toFixed(2)}% vs ${avgCtr.toFixed(2)}% avg`,
          severity: "negative",
          source: "computed",
          metric: "frequency",
          value: ad.frequency,
          recommendation: `Refresh creative for "${ad.ad_name}" — high frequency with below-average CTR signals audience fatigue`,
          campaign_id: ad.campaign_id || undefined,
          adset_id: ad.adset_id || undefined,
        });
      }

      // Creative concentration: top 2 ads capturing >60% of spend
      const bySpend = [...qualified].sort((a, b) => b.spend - a.spend);
      if (bySpend.length >= 2) {
        const top2Share = pct(bySpend[0].spend + bySpend[1].spend, totalSpend);
        if (top2Share > 60) {
          insights.push({
            category: "creative",
            text: `Top 2 ads capture ${fmtPct(top2Share)} of creative spend — high concentration risk`,
            severity: "neutral",
            source: "computed",
            metric: "spend_concentration",
            value: top2Share,
            recommendation:
              "Test additional creative variations to reduce dependency on 2 ads",
          });
        }
      }
    }
  }

  // Fallback to format/device heuristics when ad-level data is absent or thin
  if (insights.length < 2) {
    const { formats, devices } = data;

    const mobile = devices.find(
      (d) =>
        d.device_platform === "mobile_app" || d.device_platform === "mobile_web"
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

    const video = formats.find((f) => f.format === "video");
    const image = formats.find((f) => f.format === "image");
    if (video && image && video.ctr > 0 && image.ctr > 0) {
      const winner =
        video.ctr > image.ctr
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
        const winner =
          cCpa < iCpa
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
  }

  return insights.slice(0, 3);
}

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_SALES: "Sales",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_APP_PROMOTION: "App Promotion",
  CONVERSIONS: "Conversions",
  LINK_CLICKS: "Traffic",
  REACH: "Reach",
  BRAND_AWARENESS: "Awareness",
  POST_ENGAGEMENT: "Engagement",
  VIDEO_VIEWS: "Video Views",
  LEAD_GENERATION: "Lead Gen",
  MESSAGES: "Messages",
  APP_INSTALLS: "App Installs",
};

function formatObjective(objective: string): string {
  return (
    OBJECTIVE_LABELS[objective] ??
    capitalize(objective.toLowerCase().replace(/_/g, " "))
  );
}

function computeObjectiveInsights(
  objectives: ObjectiveBreakdown[]
): HeuristicInsight[] {
  if (objectives.length < 2) return [];

  const insights: HeuristicInsight[] = [];
  const qualified = objectives.filter((o) => o.spend >= MIN_SPEND_THRESHOLD);
  if (qualified.length < 2) return [];

  const totalSpend = qualified.reduce((s, o) => s + o.spend, 0);

  const byRoas = [...qualified].sort((a, b) => b.roas - a.roas);
  if (byRoas[0].roas > 0 && byRoas.length >= 2) {
    const spendShare = pct(byRoas[0].spend, totalSpend);
    insights.push({
      category: "formats",
      text: `${formatObjective(byRoas[0].objective)} campaigns lead ROAS at ${byRoas[0].roas.toFixed(2)}x on ${fmtPct(spendShare)} of spend`,
      severity: "positive",
      source: "computed",
      metric: "roas",
      value: byRoas[0].roas,
    });
  }

  for (const obj of qualified) {
    if (
      obj.roas < (byRoas[0]?.roas ?? 0) * 0.5 &&
      pct(obj.spend, totalSpend) >= 20
    ) {
      const shiftAmount = obj.spend * 0.15;
      const roasGap = (byRoas[0]?.roas ?? 0) - obj.roas;
      const estimatedGain = shiftAmount * roasGap;
      insights.push({
        category: "formats",
        text: `${formatObjective(obj.objective)} campaigns get ${fmtPct(pct(obj.spend, totalSpend))} of spend but only ${obj.roas.toFixed(2)}x ROAS`,
        severity: "negative",
        source: "computed",
        metric: "roas",
        value: obj.roas,
        recommendation: `Consider reallocating 15% of ${formatObjective(obj.objective)} budget (${fmtCurrency(shiftAmount)}) to ${formatObjective(byRoas[0].objective)}`,
        estimated_impact:
          estimatedGain > 0
            ? `~${fmtCurrency(estimatedGain)} potential additional revenue`
            : undefined,
      });
    }
  }

  const byConv = [...qualified].sort((a, b) => b.conversions - a.conversions);
  if (byConv[0].conversions > 0 && byConv.length >= 2) {
    const totalConv = qualified.reduce((s, o) => s + o.conversions, 0);
    const convShare = pct(byConv[0].conversions, totalConv);
    if (convShare >= 40) {
      insights.push({
        category: "audiences",
        text: `${formatObjective(byConv[0].objective)} drives ${fmtPct(convShare)} of conversions across ${byConv[0].campaign_count} campaigns`,
        severity: "positive",
        source: "computed",
        metric: "conversions",
        value: convShare,
      });
    }
  }

  return insights.slice(0, 3);
}

function computePeriodInsights(
  current: BreakdownData,
  previous: BreakdownData
): HeuristicInsight[] {
  const insights: HeuristicInsight[] = [];

  const curSpend = current.placements.reduce((s, p) => s + p.spend, 0);
  const prevSpend = previous.placements.reduce((s, p) => s + p.spend, 0);
  const curConv = current.placements.reduce((s, p) => s + p.conversions, 0);
  const prevConv = previous.placements.reduce((s, p) => s + p.conversions, 0);
  const curConvValue = current.placements.reduce((s, p) => s + p.conversion_value, 0);
  const prevConvValue = previous.placements.reduce((s, p) => s + p.conversion_value, 0);

  const curRoas = curSpend > 0 ? curConvValue / curSpend : 0;
  const prevRoas = prevSpend > 0 ? prevConvValue / prevSpend : 0;

  if (prevSpend > MIN_SPEND_THRESHOLD && curSpend > MIN_SPEND_THRESHOLD) {
    const spendDelta = prevSpend > 0 ? Math.round(((curSpend - prevSpend) / prevSpend) * 100) : 0;
    const roasDelta = prevRoas > 0 ? Math.round(((curRoas - prevRoas) / prevRoas) * 100) : 0;
    const convDelta = prevConv > 0 ? Math.round(((curConv - prevConv) / prevConv) * 100) : 0;

    if (Math.abs(roasDelta) >= MIN_DELTA_PCT) {
      insights.push({
        category: "placements",
        text: `Account ROAS ${roasDelta > 0 ? "improved" : "declined"} ${fmtPct(Math.abs(roasDelta))} period-over-period (${prevRoas.toFixed(2)}x → ${curRoas.toFixed(2)}x)`,
        severity: roasDelta > 0 ? "positive" : "negative",
        source: "computed",
        metric: "roas",
        value: curRoas,
        delta: roasDelta,
        recommendation: roasDelta < 0 ? "Review recent changes to targeting, creative, or budget allocation" : undefined,
      });
    }

    if (Math.abs(convDelta) >= MIN_DELTA_PCT) {
      insights.push({
        category: "audiences",
        text: `Conversions ${convDelta > 0 ? "up" : "down"} ${fmtPct(Math.abs(convDelta))} vs prior period (${fmtNumber(prevConv)} → ${fmtNumber(curConv)})`,
        severity: convDelta > 0 ? "positive" : "negative",
        source: "computed",
        metric: "conversions",
        value: curConv,
        delta: convDelta,
      });
    }

    if (spendDelta > 20 && roasDelta < -10) {
      insights.push({
        category: "creative",
        text: `Spend increased ${fmtPct(spendDelta)} but ROAS dropped ${fmtPct(Math.abs(roasDelta))} — possible diminishing returns`,
        severity: "negative",
        source: "computed",
        metric: "spend_efficiency",
        recommendation: "Evaluate whether incremental spend is reaching saturated audiences",
      });
    }
  }

  return insights.slice(0, 3);
}

export function computeHeuristicInsights(
  data: BreakdownData,
  previousData?: BreakdownData,
  objectives?: ObjectiveBreakdown[],
  adCreatives?: AdCreativeBreakdown[]
): HeuristicInsight[] {
  const base = [
    ...computeFormatInsights(data.formats),
    ...computePlacementInsights(data.placements),
    ...computeAudienceInsights(data.demographics),
    ...computeCreativeInsights(data, adCreatives),
  ];

  if (objectives && objectives.length > 0) {
    base.push(...computeObjectiveInsights(objectives));
  }

  if (previousData) {
    base.push(...computePeriodInsights(data, previousData));
  }

  return base;
}
