# Plan 009: Decide and document consolidation of analytics + charting libraries (design/spike)

> **Executor instructions**: This is a DESIGN/SPIKE plan. Produce decision docs + a follow-up implementation plan. Do NOT remove a live analytics SDK or rip out a charting library in this plan — that requires the sign-off this spike collects. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `grep -rn "mixpanel" Continuum-Frontend/src | head` and `grep -rln "recharts\|lightweight-charts" Continuum-Frontend/src`; confirm both stacks are still present. Working tree was dirty at the planned commit.

## Status

- **Priority**: P3
- **Effort**: M (decision) + L (later execution)
- **Risk**: MED
- **Depends on**: none
- **Category**: deps / perf
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

Two product-analytics SDKs are both live, double-instrumenting events and shipping two SDKs to the client; two charting libraries are both bundled. Each is a product/data-ownership decision, not a mechanical change — so this plan produces the decision + a scoped follow-up, with no production code until sign-off.

## Current state

- **Analytics — Mixpanel**: `mixpanel-browser` mounted in `src/app/(post-auth)/layout.tsx:57` via `src/components/analytics/MixpanelInit.tsx` (`mixpanel.init`).
- **Analytics — PostHog**: `posthog-js` (client) + `posthog-node` (server) across ~11 files, incl. `src/lib/posthog-server.ts` and client captures in login / onboarding-callback pages.
- **Charting — recharts**: ~10 files (`src/components/ui/chart.tsx`, `OrganicMetricsDashboard.tsx`, `CampaignTimelineWorkspace.tsx`, `PerformanceDetails.tsx`, `JainaReportCharts.tsx`, …).
- **Charting — lightweight-charts**: 4 paid-media files (`ObservabilityLightweightChart.tsx`, `BudgetPacingChart.tsx`, `CampaignAdSetWorkspace.tsx`, `PaidMediaDashboard.tsx`). Repo notes indicate it powers the TradingView-style multi-entity paid-media timeline (a deliberate UX).

## Commands you will need

| Purpose | Command (from `Continuum-Frontend/`) | Expected |
|---------|--------------------------------------|----------|
| Mixpanel events | `grep -rn "mixpanel\.\(track\|init\|identify\)" src` | inventory |
| PostHog events | `grep -rn "posthog\.\(capture\|identify\)" src` | inventory |
| Charting consumers | `grep -rln "recharts\|lightweight-charts" src` | inventory |

## Scope

**In scope**: a decision record (`docs/adr/`) and a follow-up implementation plan file. NO production code, NO dependency removal.

**Out of scope**: removing any analytics SDK or charting library (that is the follow-up, post sign-off).

## Git workflow

- Branch: `advisor/009-analytics-charting-spike`
- One commit: `docs: ADR for analytics + charting consolidation`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Analytics inventory + recommendation

Inventory every captured event per SDK (the two greps above), and identify dashboard owners (ask the data/growth owner). Write `docs/adr/NNNN-analytics-consolidation.md` recommending a single tool. Default recommendation: **keep PostHog** (already client + server here, broader usage) and **remove Mixpanel** — *pending data-owner sign-off*. The ADR must list: events currently only on Mixpanel that need porting, and the cutover risk to existing Mixpanel dashboards.

### Step 2: Charting decision

Confirm whether `lightweight-charts` is required for the paid-media TradingView-style timeline (repo notes say yes). Decide between: (a) keep both but ensure each is `next/dynamic`-imported only on its routes (so neither leaks into shared bundles), or (b) converge the simpler recharts charts onto one engine. Record the decision in the ADR (or a sibling `docs/adr/NNNN-charting-strategy.md`).

### Step 3: Write the follow-up implementation plan

Author a follow-up plan file (`plans/0NN-analytics-consolidation-impl.md` and/or `plans/0NN-charting-dynamic-import.md`) scoping the actual code work: for analytics — wrap `capture` behind one thin module, port remaining events, remove the losing SDK + its init; for charting — the dynamic-import boundaries and/or convergence steps. These execute only after sign-off.

## Test plan

- None (design artifact). The deliverable is the ADR(s) + follow-up plan(s).

## Done criteria

- [ ] `docs/adr/NNNN-analytics-consolidation.md` exists with a recommendation + event inventory + cutover risks.
- [ ] Charting decision recorded (keep-both-dynamic vs converge).
- [ ] A follow-up implementation plan file exists for each decision.
- [ ] Data/product owner sign-off captured in the ADR.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The data owner wants to keep Mixpanel (or both) → record the decision and close the analytics half (do not force removal).

## Maintenance notes

- Execute the follow-up plan(s) only after sign-off.
- This ties into bundle-size work: whichever libraries remain should be `next/dynamic`-loaded on the routes that use them, not pulled into shared client chunks.
