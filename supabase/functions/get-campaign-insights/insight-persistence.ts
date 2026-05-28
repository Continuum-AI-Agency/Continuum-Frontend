// Persists campaign insights to brand_profiles.paid_media_insight_snapshots +
// paid_media_campaign_insights so agents (Jaina, future automations) have a durable
// log of LLM/heuristic flags. Mirrors the shape used by the frontend
// (GeneratedCampaignInsight) so consumers can treat both writers as one feed.

// deno-lint-ignore-file no-explicit-any

type Severity = "info" | "opportunity" | "warning" | "critical";
type Status = "strong" | "watch" | "risk" | "unknown";

type RawInsight = {
  text?: string;
  title?: string;
  summary?: string;
  category?: string;
  metric?: string;
  severity?: string;
  recommendation?: string;
  estimated_impact?: string;
};

function mapSeverity(raw: string | undefined): Severity {
  switch (raw) {
    case "positive":
      return "opportunity";
    case "negative":
      return "warning";
    case "critical":
      return "critical";
    case "neutral":
    default:
      return "info";
  }
}

function deriveStatus(severity: Severity): Status {
  switch (severity) {
    case "opportunity":
      return "strong";
    case "critical":
    case "warning":
      return "risk";
    default:
      return "unknown";
  }
}

function shortTitle(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= 90) return trimmed;
  const cutoff = trimmed.slice(0, 90);
  const lastSpace = cutoff.lastIndexOf(" ");
  return (lastSpace > 50 ? cutoff.slice(0, lastSpace) : cutoff) + "…";
}

export async function persistGeneratedInsights(args: {
  supabase: any;
  brandId: string;
  adAccountId: string;
  campaignId: string;
  campaignName: string | null;
  rangePreset: string;
  rangeSince: string;
  rangeUntil: string;
  insights: RawInsight[];
  generatedAt: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<void> {
  const {
    supabase, brandId, adAccountId, campaignId, campaignName,
    rangePreset, rangeSince, rangeUntil, insights, generatedAt, log,
  } = args;

  if (insights.length === 0) return;

  // Per-day dedup: don't write a second server snapshot for the same brand+account+range
  // on the same UTC day. Re-runs within the day still benefit from the cache, and we avoid
  // bloating history with cache-hit-driven snapshots.
  const today = generatedAt.slice(0, 10);
  const dayStart = `${today}T00:00:00Z`;
  const { data: existing, error: existingError } = await supabase
    .schema("brand_profiles")
    .from("paid_media_insight_snapshots")
    .select("id")
    .eq("brand_id", brandId)
    .eq("ad_account_id", adAccountId)
    .eq("range_preset", rangePreset)
    .eq("source", "server")
    .gte("computed_at", dayStart)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    log("paid_media_insight_snapshots existence check failed", existingError);
    return;
  }
  if (existing) {
    log("paid_media_insight_snapshots: server snapshot already exists for today, skipping");
    return;
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .schema("brand_profiles")
    .from("paid_media_insight_snapshots")
    .insert({
      brand_id: brandId,
      ad_account_id: adAccountId,
      platform: "meta",
      range_preset: rangePreset,
      range_since: rangeSince,
      range_until: rangeUntil,
      peer_set_size: 0,
      insight_count: insights.length,
      computed_by: null,
      source: "server",
      computed_at: generatedAt,
    })
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    log("paid_media_insight_snapshots insert failed", snapshotError);
    return;
  }

  const rows = insights.map((raw) => {
    const severity = mapSeverity(raw.severity);
    const status = deriveStatus(severity);
    const text = raw.text ?? raw.summary ?? raw.title ?? "Insight";
    const title = raw.title ?? shortTitle(text, "Campaign insight");
    const summary = raw.summary ?? text;
    const metric = (raw.metric ?? "unknown").toLowerCase();

    return {
      snapshot_id: snapshot.id,
      brand_id: brandId,
      ad_account_id: adAccountId,
      campaign_id: campaignId,
      campaign_name: campaignName,
      scope: "campaign",
      severity,
      status,
      primary_metric: metric,
      title,
      summary,
      recommendation: raw.recommendation ?? null,
      source: "matrix",
      evidence: [
        {
          campaignId,
          campaignName: campaignName ?? "",
          metric,
          currentValue: 0,
          percentileRank: 0,
          direction: "neutral",
          status,
          evidenceWindow: rangePreset,
          category: raw.category ?? null,
          estimatedImpact: raw.estimated_impact ?? null,
          originalText: text,
        },
      ],
    };
  });

  const { error: insightsError } = await supabase
    .schema("brand_profiles")
    .from("paid_media_campaign_insights")
    .insert(rows);

  if (insightsError) {
    log("paid_media_campaign_insights insert failed; rolling back snapshot", insightsError);
    await supabase
      .schema("brand_profiles")
      .from("paid_media_insight_snapshots")
      .delete()
      .eq("id", snapshot.id);
    return;
  }

  log(`paid_media_campaign_insights: persisted ${rows.length} rows for snapshot ${snapshot.id}`);
}
