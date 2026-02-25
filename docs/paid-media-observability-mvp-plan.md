# Paid Media Observability MVP Plan

Reference implementation guide: `docs/paid-media-observability-module.md`

## Goal
Deliver an observability-first paid media dashboard/timeline MVP that keeps current data contracts intact while improving clarity, filtering, and operational triage.

## Product Decisions (Locked)
- Default resolution is `daily`.
- Averages and KPI summaries come from DCO `timeline_blocks` data.
- Hybrid data model:
  - DCO timeline blocks = observability/data-science truth (summary + deltas + managed-state timeline).
  - Live Meta ingestion = baseline enrichment and fallback detail.
- Audit log is a full-width table dock below timeline and auto-filters by selected campaign.
- Targets/deltas come from database payloads (`deltas` in timeline blocks).
- Keep DB terms in UI now (no enum relabeling yet).
- Hourly view is only for DCO-managed assets; non-DCO entities are hidden in hourly mode.
- Campaign explorer allows only one expanded campaign at a time.
- Default entity ordering for triage:
  - active first
  - severity desc
  - spend desc tie-break
- MVP severity score:
  - `max(abs(ctr_delta_pct), abs(roas_delta_pct), abs(spend_delta_pct), abs(conversions_delta) * 10)`

## Scope
1. Data contract + timeline API updates
2. Dashboard information architecture refresh
3. Timeline observability enhancements
4. Campaign explorer interaction updates
5. Audit log docking + campaign sync
6. Tests for key behavior

## Implementation Plan

### 1) Data Contract + APIs
- Extend paid-media timeline request contract with optional `resolution: daily | hourly`.
- Pass resolution through:
  - Next route proxy (`/api/paid-media/timeline`)
  - Edge function `fetch-timeline-blocks`
- Enforce DB resolution filtering server-side.

### 2) Timeline Observability Surface
- Keep timeline range selector.
- Add resolution control in timeline UI (`daily` default).
- Build summary metric strip from latest block in selected range:
  - spend, clicks, impressions, conversions, cpc, ctr, roas
  - delta badges from block `deltas`
- Add stepped charts (`step` line style) for key metrics over selected blocks.

### 3) Campaign Explorer (Single-Expand + Filtering)
- Make campaign accordion `single` and `collapsible`.
- Add selection callback so parent knows currently opened campaign.
- Add `active only` filter control.
- In hourly mode, show only DCO-managed campaigns (derived from timeline payload).
- For ad set detail:
  - use live Meta fallback when DCO ad set detail is missing.
  - do not show DCO-specific delta UI for non-DCO-managed ad sets.

### 4) Audit Log Dock
- Move DCO actions to full-width dock below timeline/campaign explorer.
- Wire selected campaign -> `campaignId` filter in action logs hook/widget.
- Keep DB terms for status/scope/action in labels and filters.

### 5) Sorting + Triage
- Add severity-first sorting for DCO-managed campaign listing in MVP.
- Tie-break with spend desc.
- Preserve manual sort fallback where relevant.

### 6) Test Coverage
- Timeline route contract test for resolution passthrough.
- Campaign accordion test to enforce single-open behavior.
- DCO action log widget/hook test for selected-campaign filter syncing.

## Risks / Constraints
- Timeline blocks currently carry campaign+ad structure; ad set granularity can be incomplete.
- Per-entity deltas may be sparse; severity-first uses available block deltas in MVP.
- Hourly DCO-only filtering relies on DCO-management heuristics from timeline payload.

## MVP Exit Criteria
- Dashboard defaults to `daily` and renders block-driven metrics + deltas.
- Hourly toggle works and only shows DCO-managed entities.
- Only one campaign can be expanded at once.
- Audit log is docked full-width and auto-filters by selected campaign.
- Key route/component tests pass.
