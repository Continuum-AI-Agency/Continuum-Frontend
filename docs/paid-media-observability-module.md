# Paid Media Observability Module

## Purpose
This module turns paid media campaign management data into an observability workspace.

It is designed for high-density, multi-entity monitoring:
- Many campaigns visible at once.
- Drill-down into ad sets without leaving context.
- KPI trends over time with DCO target overlays.
- Docked audit log for automated DCO actions.

This document is the implementation handoff for future agents.

## Product Vision
Treat paid media like infrastructure observability:
- Campaigns are top-level entities (like services/clusters).
- Ad sets are nested entities (like routes/pods).
- KPIs are time-series signals.
- DCO deltas define expected vs actual behavior.
- Action logs provide auditability.

### Operating Principles
- Keep existing DB contracts unchanged.
- Use DB terms directly in UI for now.
- `daily` is default resolution.
- `hourly` is DCO-only scope.
- Blend two sources:
  - DCO timeline blocks: truth for deltas, target context, and block summaries.
  - Live Meta ingestion: baseline metrics and entity enrichment.

## Module Boundaries

### Primary UI Entry
- `src/components/paid-media/dashboard/PaidMediaDashboard.tsx`

Responsibilities:
- Load campaigns from `fetch-meta-campaigns`.
- Enrich each campaign with `/api/paid-metrics` trends/comparison.
- Render unified explorer + timeline workspace.
- Dock DCO action log below and sync selected campaign.

### Core Workspace (Explorer + Timeline)
- `src/components/paid-media/dashboard/CampaignTimelineWorkspace.tsx`

Responsibilities:
- Single surface for campaign list, ad set list, and time-series context.
- One expanded campaign at a time.
- KPI sort and direction controls.
- Active-only filtering for campaigns and ad sets.
- DCO-aware behavior:
  - hourly filtering to DCO-managed campaigns only,
  - red target overlays,
  - denominator summary (`actual / target`).
- Fallback from live ad set fetch to timeline-derived ad sets.
- Meta rate-limit cooldown handling.

### Docked Action Log
- `src/components/dashboard/DCOActionsWidget.tsx`
- `src/hooks/useDCOActionLogs.ts`
- `supabase/functions/fetch-rule-action-logs/index.ts`

Responsibilities:
- Full-width audit table under workspace.
- Auto-filter by selected campaign from dashboard.
- Server-side pagination, filtering, and sorting.

## Data Sources and Contracts

### 1) Timeline Blocks (DCO)
- Hook: `src/hooks/timeline/useTimelineBlocks.ts`
- API route: `src/app/api/paid-media/timeline/route.ts`
- Edge function: `supabase/functions/fetch-timeline-blocks/index.ts`
- Type model: `src/types/timeline/index.ts`

Core block fields:
- `block_start`, `block_end`: inclusive time window boundary for each block payload.
- `resolution`: `daily` or `hourly`.
- `summary`: aggregate KPI values for the block.
- `deltas`: target-relative deltas (for example `ctr_delta_pct`, `roas_delta_pct`, `spend_delta_pct`, `conversions_delta`).
- `campaigns[]`: nested campaign/ad set/ad timeline structure.
- `events[]`: timeline events tied to entities.

Important behavior:
- The edge function normalizes/derives `metrics_daily` where missing.
- The hook merges campaigns/events across returned blocks and stitches ad segments.

### 2) Live Meta Campaign/Ad Set/Ad Fetch
- `supabase/functions/fetch-meta-campaigns/index.ts`
- `supabase/functions/fetch-meta-adsets/index.ts`
- `supabase/functions/fetch-meta-ads/index.ts`

All three:
- Authenticate via bearer token.
- Resolve Meta token via RPC `get_meta_access_token`.
- Return normalized payloads for frontend consumption.

### 3) Paid Metrics Enrichment
- API proxy: `src/app/api/paid-metrics/route.ts`
- Edge dispatcher: `supabase/functions/paid-media-metrics/index.ts`
- Meta handler: `supabase/functions/paid-media-metrics/meta/handler.ts`

Provides entity-level:
- `metrics` (current aggregate),
- `comparison` (current/previous/%change),
- `trends` (time-series).

## Hybrid Model and Precedence

### What comes from DCO timeline blocks
- Block summaries shown in account context.
- DCO deltas used for target overlays and delta signaling.
- DCO-managed detection heuristic (campaign has ad sets with ads in timeline payload).

### What comes from live Meta
- Campaign/ad set/ad catalog and baseline detail.
- Per-entity trend and comparison data via `paid-media-metrics`.

### Fallback behavior
- If live ad set fetch fails, timeline ad sets are used when available.
- If an asset is not DCO-managed:
  - no DCO target/delta overlay is shown,
  - baseline metrics still render from live data.

## Time and Resolution Semantics

### Defaults
- Resolution defaults to `daily`.
- Date range defaults to dashboard preset (`last_7d`, `last_14d`, `last_30d`).

### Hourly mode
- Only DCO-managed campaigns are shown.
- Non-DCO entities are filtered out in workspace list.

### Block boundaries
`block_start` and `block_end` are the authoritative mapping boundaries for timeline block payloads. UI trend and summary context should be interpreted against those boundaries, not against arbitrary local buckets.

## UI Interaction Model

### Selection model
- Expanded campaign (`expandedCampaignId`): one open at a time.
- Focused campaign/ad set controls top chart context.
- Metric selection is shared context (`selectedMetric`) for top chart and expanded ad set chart.

### Filtering and sorting
- `Active only` hides non-active campaigns.
- Inside expanded campaign, `Active only` also hides non-active ad sets.
- Sort controls apply KPI ordering (`highest`/`lowest`) for campaigns and ad sets.

### Top chart behavior
- Area chart with stepped rendering (`type="stepAfter"`).
- Campaign baseline series + ad set comparison lines.
- Target overlay for DCO-supported KPIs (`spend`, `roas`, `ctr`):
  - dashed red target series,
  - red reference line,
  - denominator badge: `actual / target (ratio%)`.

### Row spark behavior
- Each KPI cell renders a mini stepped area sparkline.
- Campaign and ad set rows both support KPI click-to-focus.
- DCO target line appears in KPI spark where applicable.

### KPI radar tooltip
- Hover campaign/ad set name to open radar tooltip.
- Uses normalized delta position:
  - center = no delta,
  - outward = positive,
  - inward = negative.

## Cache and Freshness

### Meta edge cache (campaigns/adsets/ads)
- Shared helper: `supabase/functions/_shared/meta-edge-cache.ts`
- TTL: 1 hour.
- Storage table: `brand_profiles.reporting_cache`.

Cache keys:
- Campaigns: `meta-edge:campaigns:{adAccountId}:all`
- Ad sets: `meta-edge:adsets:{adAccountId}:{campaignId}`
- Ads: `meta-edge:ads:{adAccountId}:{adSetId}:{dateScopeSuffix}` (encoded in scope segment)

Response headers:
- `X-Cache: HIT` when served from cache.
- `X-Cache: MISS` when fetched live and cached.

### Metrics cache
`paid-media-metrics/meta` also caches entity trend payloads in `brand_profiles.reporting_cache` for 1 hour, keyed by provider/scope/account/range.

## Rate Limit and Resilience

### Meta user request limit
`fetch-meta-adsets` recognizes Meta rate-limit signatures (code `17`, subcode `2446079`) and returns:
- HTTP `429`,
- `Retry-After: 60`.

### Frontend cooldown
`CampaignTimelineWorkspace`:
- detects rate-limit error text,
- applies a 60s local cooldown,
- avoids repeated ad set calls during cooldown,
- surfaces user-visible retry timing.

### Anti-hang protections
Ad set loads are protected by:
- in-flight request dedupe (`inFlightAdSetLoads`),
- stale-loading timeout window (`AD_SET_LOADING_STALE_MS`),
- explicit promise timeouts around edge invoke and metrics fetch.

## Auth, Security, and Scope Checks

### Timeline edge
`fetch-timeline-blocks` enforces:
- bearer token auth,
- brand membership via `brand_profiles.permissions`,
- brand/account scope consistency on `DCO_Campaigns.timeline_blocks`.

### Other edge fetchers
Campaign/ad set/ad fetchers require authenticated user token and Meta token resolution by account.

## End-to-End Request Flows

### Dashboard load
1. `PaidMediaDashboard` invokes `fetch-meta-campaigns`.
2. For each campaign, `/api/paid-metrics` enriches metrics/comparison/trends.
3. `CampaignTimelineWorkspace` requests timeline blocks via `/api/paid-media/timeline`.
4. Workspace derives DCO context, sorting/filtering, and chart overlays.
5. DCO action log table loads and auto-filters by selected campaign.

### Campaign expansion
1. User expands campaign row.
2. Workspace requests ad sets via `fetch-meta-adsets`.
3. On success, each ad set optionally enriched by `/api/paid-metrics`.
4. On failure, timeline-derived ad sets are used if present.

## Known Current Constraints
- DCO delta values currently applied from latest block context, not per-row per-interval historical deltas.
- `paid-media-metrics/meta` comparison values are partly placeholder logic (mock previous-period math).
- Timeline merge in `useTimelineBlocks` is intentionally pragmatic and not a full canonical stitch engine.
- DCO action widget still uses mixed Radix + shadcn composition and can be visually simplified later.

## Maintenance Guide for Future Agents

### When adding a new KPI
1. Add to `MetricKey` and `KPI_COLUMNS` in `CampaignTimelineWorkspace.tsx`.
2. Update formatters/labels and trend extraction mapping.
3. Ensure chart tooltip and denominator logic handles the KPI.
4. Decide whether KPI supports DCO target overlay.

### When changing resolution behavior
1. Keep API schema in `src/app/api/paid-media/timeline/route.ts` aligned.
2. Keep edge filter logic in `fetch-timeline-blocks` aligned.
3. Preserve hourly DCO-only filtering contract unless explicitly changing product rules.

### When modifying ad set loading
1. Keep fallback to timeline ad sets.
2. Keep rate-limit cooldown guard.
3. Keep in-flight and stale-loading guards to prevent UI hangs.

### When changing cache policy
1. Update helper TTL in `_shared/meta-edge-cache.ts`.
2. Confirm cache key scope avoids collisions.
3. Validate `X-Cache` headers for quick diagnostics.

## Debugging Runbook

### “Failed to fetch ad sets from Meta API”
Check in order:
1. Edge logs for `fetch-meta-adsets` attempt summary and Meta error envelope.
2. If code `17`/subcode `2446079`, this is account rate limit, not schema break.
3. Confirm cooldown is active client-side; retry after `Retry-After`.
4. Verify fallback ad sets are present from timeline blocks.

### Timeline mismatch vs expected range
1. Verify `startDate`, `endDate`, and `resolution` sent by workspace.
2. Confirm route validation accepted payload.
3. Confirm edge query filters by `block_end >= startDate` and `block_start <= endDate`.
4. Confirm block `summary`/`deltas` correspond to selected block window.

### Campaign/ad set list feels stale
1. Check `X-Cache` header (`HIT` vs `MISS`) from Meta edge fetchers.
2. Confirm 1-hour freshness window expectations.
3. Use refresh controls for immediate re-fetch (still cache-bounded unless key/range changes).

## Suggested Tests to Keep Stable
- One expanded campaign at a time in workspace.
- Active-only hides inactive ad sets when campaign is expanded.
- Hourly mode excludes non-DCO campaigns.
- Rate-limit error from ad set fetch triggers cooldown messaging.
- Timeline proxy rejects invalid schema payloads and forwards edge errors.
- Action log widget updates campaign filter when selection changes.

## File Index
- `src/components/paid-media/dashboard/PaidMediaDashboard.tsx`
- `src/components/paid-media/dashboard/CampaignTimelineWorkspace.tsx`
- `src/hooks/timeline/useTimelineBlocks.ts`
- `src/app/api/paid-media/timeline/route.ts`
- `supabase/functions/fetch-timeline-blocks/index.ts`
- `src/components/dashboard/DCOActionsWidget.tsx`
- `src/hooks/useDCOActionLogs.ts`
- `supabase/functions/fetch-rule-action-logs/index.ts`
- `src/app/api/paid-metrics/route.ts`
- `supabase/functions/paid-media-metrics/index.ts`
- `supabase/functions/paid-media-metrics/meta/handler.ts`
- `supabase/functions/fetch-meta-campaigns/index.ts`
- `supabase/functions/fetch-meta-adsets/index.ts`
- `supabase/functions/fetch-meta-ads/index.ts`
- `supabase/functions/_shared/meta-edge-cache.ts`
- `docs/paid-media-observability-mvp-plan.md`

## Relationship to MVP Plan
Use `docs/paid-media-observability-mvp-plan.md` for scope intent and milestone framing.
Use this document for implementation truth and module operation details.
