# Account Audit Scorecard — Jaina Layer

## Context

This is a **second layer** of insights, separate from the existing account/campaign performance insights. The current insights layer answers "how are metrics performing?" — this layer answers "is the account set up correctly?"

Inspired by competitor pattern: scored dimensions with percentage grades and specific actionable findings per dimension.

## Current Insights Architecture (Layer 1 — already built)

- **Edge functions**: `get-account-insights`, `get-campaign-insights`
- **Data source**: Meta Insights API (metrics: spend, CTR, ROAS, conversions)
- **Pipeline**: `fetchBreakdowns` → `computeHeuristics` → `detectAnomalies` → 4 parallel Gemini sub-agents
- **Output**: Text insights with severity (positive/negative/neutral), recommendations, estimated impact
- **Cache**: 3-day TTL with background refresh at <6h remaining
- **Shared code**: `get-campaign-insights` imports from `get-account-insights` (breakdowns, anomalies, compute)

## Account Audit (Layer 2 — Jaina)

### What It Is

A structured evaluation of account **configuration quality** and **operational hygiene**. Each dimension gets:
1. A percentage score (0–100%)
2. Specific findings — actionable issues or confirmations
3. Severity per finding (critical / warning / passing)

### Dimensions

| Dimension | What It Evaluates | Meta API Data Needed |
|-----------|-------------------|---------------------|
| **Schedule** | Dayparting, weekend adjustments, running during zero-conversion hours | Ad set `targeting.day_parting`, hourly insights (`time_increment=1` won't work — need `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`) |
| **Placement** | Quality of placements, exclusion lists, sensitive content categories | Ad set `targeting.publisher_platforms`, `targeting.facebook_positions`, `targeting.excluded_publisher_categories`, account-level block lists |
| **Creatives** | Format optimization (vertical mobile), variation count per ad group, asset diversity | Ad creative assets (`ad.creative{asset_feed_spec}`), ad count per ad set, image/video dimensions |
| **Attribution** | Conversion model type, cross-device tracking, pixel/CAPI setup | Ad set `attribution_spec`, pixel `last_fired_time`, conversion events config |
| **Negatives** | Negative keyword hygiene, placement exclusions, audience exclusions | Ad set `targeting.exclusions`, negative keyword lists (if search campaigns), excluded audiences |
| **Budget** | Budget distribution across campaigns, CBO vs ABO mix, spending limits | Campaign `daily_budget`, `lifetime_budget`, `budget_optimization`, ad set `daily_budget` |

### Scoring Rubric (Draft)

Each dimension is scored by evaluating **rules** — each rule has a weight and produces pass/fail/partial:

```
Schedule Score = weighted_avg([
  { rule: "not_running_24_7_with_zero_conversion_hours", weight: 3 },
  { rule: "has_weekend_bid_adjustments", weight: 2 },
  { rule: "dayparting_aligned_to_conversion_hours", weight: 2 },
])
```

Score = (sum of passing rule weights / sum of all rule weights) * 100

### Findings Format

```typescript
type AuditFinding = {
  dimension: "schedule" | "placement" | "creatives" | "attribution" | "negatives" | "budget";
  rule_id: string;
  severity: "critical" | "warning" | "passing";
  text: string;           // "Ads run 24/7 despite zero leads generated overnight"
  recommendation: string; // "Add dayparting to exclude 12am-6am"
  weight: number;
  passed: boolean;
};

type DimensionScore = {
  dimension: string;
  score: number;          // 0-100
  findings: AuditFinding[];
};

type AccountAudit = {
  overall_score: number;
  dimensions: DimensionScore[];
  generated_at: string;
  expires_at: string;
};
```

### Key Differences from Layer 1

| Aspect | Layer 1 (Insights) | Layer 2 (Audit) |
|--------|-------------------|-----------------|
| Question | "How are metrics trending?" | "Is the setup correct?" |
| Data | Metrics API (aggregated stats) | Structural API (settings, targeting, assets) |
| Compute | Anomaly detection + Gemini | Rule-based scoring + optional Gemini for findings text |
| Fetch cost | Light (4 parallel breakdown calls) | Heavy (campaign configs, ad sets, creatives, pixel status) |
| Cache TTL | 3 days | 7 days (structure changes infrequently) |
| Trigger | On dashboard load | On-demand / weekly scheduled |

### Meta API Endpoints Required

These are **different** from what Layer 1 uses:

```
# Campaign structure
GET /act_{id}/campaigns?fields=name,objective,daily_budget,lifetime_budget,budget_optimization,status

# Ad set targeting & config
GET /act_{id}/adsets?fields=name,targeting,attribution_spec,daily_budget,optimization_goal,billing_event,status

# Ad creatives
GET /act_{id}/ads?fields=name,creative{asset_feed_spec,object_story_spec,image_url,video_id},status

# Hourly performance (for schedule scoring)
GET /act_{id}/insights?breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&fields=spend,actions

# Pixel health
GET /act_{id}/adspixels?fields=name,last_fired_time,is_created_by_business
```

### Architecture Proposal

```
[Frontend: "Account Audit" tab or panel]
       ↓
[Next.js API route: /api/paid-media/account-audit]
       ↓
[Supabase Edge Function: get-account-audit]
       ↓
  ┌─────────────┐
  │ Parallel fetch structural data:
  │  - campaigns (configs)
  │  - ad sets (targeting, attribution)
  │  - ads (creative assets)
  │  - hourly insights
  │  - pixel status
  └─────────────┘
       ↓
  ┌─────────────┐
  │ Score each dimension:
  │  - Evaluate rules against data
  │  - Compute weighted scores
  │  - Generate findings
  └─────────────┘
       ↓
  ┌─────────────┐
  │ Optional: Gemini pass
  │  - Refine finding text
  │  - Add cross-dimension insights
  │  - Prioritize recommendations
  └─────────────┘
       ↓
  [Cache in reporting_cache, 7-day TTL]
       ↓
  [Return scored audit with findings]
```

### Open Questions

1. **Which dimensions are MVP?** Schedule + Placement + Creatives are highest signal. Attribution and Negatives may require additional API permissions.
2. **Gemini involvement**: Pure rule-based scoring is deterministic and fast. Gemini could add a "summary" layer or rephrase findings — but is it worth the latency for an audit?
3. **Hourly insights availability**: `hourly_stats_aggregated_by_advertiser_time_zone` may not be available for all account types. Need fallback.
4. **Creative asset depth**: `asset_feed_spec` gives us format info but not image dimensions. May need to fetch actual media metadata for "vertical mobile optimization" scoring.
5. **Pixel/CAPI check**: Requires business-level permissions (`adspixels` endpoint). Verify our token scope supports this.
6. **Scoring calibration**: The competitor shows scores like 63%, 55%, 89%, 91% — these feel calibrated to be useful (not all 90%+). Our rubric weights need tuning against real accounts.
