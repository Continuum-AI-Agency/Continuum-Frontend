# Organic - Current Capabilities (App Inspection)

## Summary
Organic today is a **planning and content‑drafting experience** driven by Brand Insights trends/questions, with a weekly calendar UI and draft generation. Analytics exist in the dashboard, but there is no dedicated Organic analytics tab yet.

## Navigation context (tabs vs sidebar)
- The Organic experience is a **single flow** today (planner/calendar workspace). There are no internal tabs, but any future sidebar entries should act as **shortcuts into views within this flow**, not separate standalone pages.

## Trend and inspiration data (what exists)
- Organic pulls **Brand Insights** (trends, events, and audience questions) and maps them into “trend types” for selection.
- These insights are **view-only** and are used to seed the planner and draft generation context.

## Scheduling / Queue (what exists)
- The Organic UI includes a **weekly calendar planner** with drag‑and‑drop and “unscheduled drafts.”
- This is **planning**, not publishing: there are no posting or activation APIs wired into the frontend. Scheduling appears to be internal planning and generation rather than platform posting.

## Analytics (what exists)
- Organic analytics are present only in the **dashboard widget** (Instagram organic metrics). There is no Organic‑specific analytics route in the navigation today.

## Proposed tab mapping (sidebar shortcuts → internal views)
- Inspiration → Trend selection + insights panels inside the Organic planner workspace (view-only)
- Build → Organic planner workspace (current calendar/draft generation)
- Schedule/Queue → Calendar view inside the planner workspace (drag/drop + unscheduled drafts list)
- Analytics → Dashboard Instagram Organic Reporting widget until a dedicated Organic analytics surface exists

## Key Evidence (files)
- `src/app/(post-auth)/organic/page.tsx`
- `src/components/organic/primitives/OrganicCalendarWorkspace.tsx`
- `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx`
- `src/app/api/organic/generate-calendar/route.ts`
- `src/app/api/organic/generate-daily-details-stream/route.ts`
- `src/components/dashboard/InstagramOrganicReportingWidget.tsx`
- `src/app/api/organic-metrics/instagram/route.ts`
