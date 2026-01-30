# Paid Media - Current Capabilities (App Inspection)

## Summary
Paid Media today is primarily **read-only analysis**. The UI centers on ad-account selection, campaign lists, and analytics (metrics + trends), plus the Jaina analyst chat. There is no campaign creation, scheduling, or activation flow in the current frontend.

## Navigation context (tabs vs sidebar)
- The existing Paid Media experience already uses **internal tabs** (Jaina Analyst, Campaigns) inside a single Paid Media flow.
- If sidebar entries are added later, they should be treated as **shortcuts to these tabs**, not separate standalone pages.

## Proposed tab mapping (sidebar shortcuts → internal views)
- Inspiration/Research → Jaina Analyst (chat + analysis stream tied to selected ad account/campaign)
- Build/Campaigns → Campaigns tab (campaign list + selection context)
- Schedule/Queue/Flighting → Not available yet; placeholder until activation/pacing views exist
- Analytics/Performance → Paid Media Reporting widget (overview/trends metrics view)

## Q1. What paid media data do we actually have right now?
Based on the current code:

- **Ad accounts**: pulled from brand integrations, specifically Meta/Facebook accounts. (Meta is the only active platform in the UI.)
- **Campaign list**: fetched via `/api/campaigns` → `fetch-meta-campaigns` edge function. The UI expects `id`, `name`, `status`, and optionally `spend` and `roas`.
- **Metrics & trends**: fetched via `/api/paid-metrics` → `paid-media-metrics` edge function. The shared schema includes `spend`, `roas`, `impressions`, `clicks`, `ctr`, `cpc`, and a daily trend series.
- **Jaina Analyst**: uses `adAccountId` (and optionally campaign selection context) to stream analysis, but the underlying data inputs aren’t fully visible in the frontend.
- **Audiences**: there is an “Audience Builder” in the Primitives hub, but it is a placeholder/under‑construction UI that uses Brand Insights questions, not actual paid-audience objects or targeting data.

## Q2. Do we support scheduling/activation, or is this view-only?
- **View-only**. There are no Paid Media UI flows or API routes for scheduling, activation, or campaign creation. Current flows only read campaign lists and analytics.

## Q3. Should “Build” be renamed to “Campaigns” for paid?
- **Yes, if we follow current UI reality.** The paid media interface already calls the list view “Campaigns” and doesn’t expose any “build” or creation capabilities. If we later add campaign creation, we could reintroduce a distinct “Builder” surface, but today “Campaigns” is the accurate label.

## Key Evidence (files)
- `src/app/(post-auth)/paid-media/page.tsx`
- `src/app/(post-auth)/paid-media/PaidMediaClient.tsx`
- `src/components/paid-media/AdAccountSelector.tsx`
- `src/components/paid-media/CampaignList.tsx`
- `src/app/api/campaigns/route.ts`
- `src/app/api/paid-metrics/route.ts`
- `src/lib/schemas/paidMetrics.ts`
- `src/components/paid-media/PaidMediaReportingWidget.tsx`
- `src/components/paid-media/jaina/JainaChatSurface.tsx`
- `src/app/(post-auth)/primitives/page.tsx`
- `src/components/paid-media/PrimitivesHub.tsx`
- `src/components/paid-media/primitives/AudienceBuilderPrimitive.tsx`
