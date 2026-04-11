# Plan: Real Creative Insights

## Problem

The `"creative"` insight category currently derives signals from device distribution, aggregated format buckets, and account-level daily trends. It has no ad-level data — no ad names, no creative asset metadata, no per-ad performance. Gemini's creative sub-agent is essentially reasoning from the same format + device aggregates the heuristics already used.

## What "real" creative insights require

| Signal | Data needed | Source |
|---|---|---|
| Top/worst performing ads | Ad-level spend, CTR, ROAS | Meta Insights API `level=ad` |
| Creative fatigue | Frequency per ad | Meta Insights API `level=ad` + `frequency` field |
| Format winner per placement | Ad-level × placement cross-tab | Meta Insights API `level=ad`, `breakdowns=publisher_platform` |
| Headline / CTA / copy quality | Creative asset metadata | Meta Creative API `/{ad_id}?fields=creative{...}` |
| True per-ad CTR decay | Ad-level daily time series | Meta Insights API `level=ad`, `time_increment=1` |

## Approach: 3 phases (ship incrementally)

---

### Phase 1 — Ad-level performance (no metadata API calls)

One new parallel fetch in `generateFreshInsights`. Feeds both heuristics and Gemini.

**New file: `creative.ts`**

```
fetchAdLevelInsights(args) → AdCreativeBreakdown[]
```

- Calls `GET /act_{id}/insights` with `level=ad`, fields `ad_id,ad_name,spend,impressions,clicks,actions,action_values,frequency`
- Paginate up to 200 ads (limit=200, 1 page)
- Parse via existing `parseMetrics` + extract `frequency` from response
- Return `AdCreativeBreakdown[]`

```ts
type AdCreativeBreakdown = {
  ad_id: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  roas: number;
  frequency: number;   // avg times each person saw this ad
};
```

**Update `compute.ts`** — replace thin `computeCreativeInsights` with ad-level version:

- **Top performer**: highest ROAS ad with ≥2% spend share → `"[Ad Name] is top ROAS creative at Xx (Y% of spend)"`
- **Worst performer**: lowest ROAS ad with ≥10% spend share → budget reallocation recommendation
- **Fatigue risk**: ads with `frequency ≥ 3.5` AND `ctr < account average` → `"[Ad Name] showing fatigue signals: 3.8x frequency, CTR below average"`
- **Format concentration**: if top 2 ads by spend share >60% of total → creative concentration risk

**Update `gemini.ts` `buildCreativeContext`** — add top 10 ads by spend to context:

```
## Ad Performance (top 10 by spend)
- [Ad Name]: $X spend, Y% CTR, Zx ROAS, W freq, N conv
```

**Update `index.ts`** `generateFreshInsights`:

- Add `fetchAdLevelInsights` to the existing `Promise.all` block (Step 1)
- Thread `adCreatives` into `computeHeuristicInsights` and `generateParallelInsights`

**Signatures to update:**
- `computeHeuristicInsights(data, previousData?, objectives?, adCreatives?)` 
- `generateParallelInsights({ ..., adCreatives? })`

---

### Phase 2 — Creative asset metadata

After Phase 1 ships and proves stable.

**In `creative.ts`** add:

```
fetchCreativeMetadata(adIds: string[], accessToken: string) → CreativeMetadata[]
```

- Takes the top 20 ads by spend from Phase 1 results
- Batch: `GET /{ad_id}?fields=creative{thumbnail_url,title,body,call_to_action_type,object_type}`
- Run in parallel (20 concurrent fetches, no pagination needed)
- Fail gracefully — metadata enrichment is optional

```ts
type CreativeMetadata = {
  ad_id: string;
  creative_type: "image" | "video" | "carousel" | "collection" | "unknown";
  thumbnail_url?: string;
  headline?: string;
  body?: string;
  cta?: string;
};
```

**Enrich `AdCreativeBreakdown`** with metadata fields.

**Gemini creative context** now includes copy + CTA for top ads — enables headline quality analysis, CTA comparison, and copy angle insights.

---

### Phase 3 — Per-ad fatigue via daily time series

Most expensive; only worth it once Phase 1 fatigue heuristics prove insufficient.

- For top 5 ads by spend: fetch daily breakdown (`time_increment=1`, `level=ad`) over the selected range
- Compute per-ad CTR trend (linear regression slope)
- Negative slope + high frequency = confirmed fatigue
- Feed into anomaly detection as `dimension: "ad:{ad_id}"` anomalies

Skip for v1. Account-level daily CTR trend (already in `time_series`) + frequency heuristic is sufficient signal.

---

## Files touched

| File | Change |
|---|---|
| `creative.ts` | **New** — `fetchAdLevelInsights`, `fetchCreativeMetadata` (Phase 2), types |
| `breakdowns.ts` | Export `AdCreativeBreakdown` type (or define in `creative.ts`) |
| `compute.ts` | Replace `computeCreativeInsights` body; update `computeHeuristicInsights` signature |
| `gemini.ts` | Update `buildCreativeContext` to include ad-level rows |
| `index.ts` | Add fetch call to `Promise.all`, thread through |

## Open questions

1. **Double-count bug first?** The `PURCHASE_ACTION_TYPES = new Set(["purchase", "omni_purchase"])` issue should be fixed before this ships — otherwise creative ROAS comparisons will still be inflated. Fix: use only `"omni_purchase"`.
2. **Spend threshold for "top ads"**: 2% of period spend or absolute $50 minimum — whichever is larger. Prevents noise from test/paused ads.
3. **Cache key unchanged**: ad-level data rolls into the same 3-day cached payload. If the account runs many new ads mid-window this could be stale — acceptable for v1.
4. **Ad count cap**: 200 ads is generous. If an account has >200 active ads, we'll miss the long tail — acceptable since we only surface insights on top performers anyway.
