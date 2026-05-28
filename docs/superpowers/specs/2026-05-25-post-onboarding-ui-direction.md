# Continuum Singularity — Post-Onboarding UI Direction

> A vision document for the next-generation Continuum command-center UI. Plan-mode artifact; will be refined into per-module implementation plans in subsequent passes (one phase at a time).

---

## Context

After onboarding, Continuum currently drops users into `HomeBaseDashboard.tsx` — a query-string-driven switcher between a 692-line Instagram organic widget and a paid-media reporting widget. Organic content lives in a 2,083-line `OrganicMetricsDashboard.tsx`. Paid Media performance is concentrated in 3,000+ LOC workspace files. Agentic surfaces (Jaina, AI Studio, Chat, DCO logs, Command Palette) are scattered. The product reads as "metrics + tabs," not as a command center.

The brand promise is **"Build Continuity. Scale Personalization"** and the design system (`design.md` — *Continuum Singularity*) already specifies the visual language: OKLCH palette, Geist + Futura Maxi, 4pt scale, Liquid-Glass elevation, no neon glows, no electron-orbit clichés. The UI layer hasn't caught up to the design system.

**Goal:** Rebuild post-onboarding UX as a *Linear-dense, Vercel-traceable, Stripe-graceful* command center. Trends and signals lead; graphs are pulled into explore-only depth views; the agent is everywhere but never in the way; approvals and signals are first-class triage objects.

---

## Vision in One Paragraph

**Continuum becomes a triage console.** The Today briefing replaces the dashboard switcher. Each module (Organic, Paid Media, AI Studio) gets a consistent four-tab spine: a primary work surface, a signals/observability surface, an Explore surface for analysts who need real charts, and a scoped Agent tab. Every "insight," "trend," "anomaly," and "approval" shares a single `SignalCard` primitive that is hoverable for a data snapshot, pinnable into the agent's context tray, and traceable back to the moment it was detected. The agent is a page-local tab when you want a conversation, a topbar pill when you want async work, a floating prompt when you want to ping, and a command-palette utility when you want it inline — all four sharing one streaming protocol and one approval queue.

---

## 1. Shell — Singularity Console

The current sidebar + topbar architecture stays. It's clean and works. The refresh is content + density.

### Sidebar (left, 256px, collapsible)
- **Brand switcher** (top) — keep, polish. Avatar + name + chevron. Cmd-B shortcut to open.
- **Primary nav** (Phosphor icons, 24px, Regular weight):
  - Homebase
  - Organic
  - Paid Media
  - AI Studio
  - **Automations**  *(NEW top-level — orchestrates workflows across all agent types — see §7)*
  - Approvals  *(NEW top-level — count badge)*
  - Library  *(NEW — assets, templates, brand voice, generated reports — replaces scattered "settings" entries that are content-y)*
- **Footer**:
  - Integrations
  - Settings
  - User menu (theme, logout)

### Topbar (16px tall, sticky)
- **Left:** breadcrumb (single-level, current) → upgrade to `Module / Sub-route` two-level breadcrumb so users always know where they are when sub-tabs swap content.
- **Center:** **Command Palette trigger** (Linear pattern). Reads "Search or ask Continuum…" with a `⌘K` chip. This becomes the primary navigation accelerant.
- **Right (clustered, right-to-left):**
  - Theme toggle
  - Notifications bell (count badge)
  - **Agent Activity Pill** *(NEW)* — e.g. "2 running · 1 ready". Click → dropdown of recent agent runs. Toast fires on completion.
  - Active brand chip (visual confirmation of scope)

### Module Page Shell
Every module page gets a consistent layout:
```
PageHeader (title + module-level CTAs)
PageTabs (sub-nav, sticky under topbar)
PageSubTabs (when needed — filter pills, view switcher)
PageBody
```
Replace ad-hoc Tabs in each widget with one shared `PageTabs` primitive (sticky, keyboard-navigable, count badges, animated underline using `ease-standard` 50ms).

---

## 2. Homebase — "Today" Briefing

Replace `HomeBaseDashboard.tsx`'s `?view=paid|organic` switcher with a Linear-Inbox-meets-Vercel-Activity feed scoped to the **active brand**. No KPI tile grid at the top. No "Welcome back" hero. The page opens with what needs attention.

### Layout
Single column, max-w-[920px], 12px gap between cards. Subtle section separators (Geist 12px label-sm headers) but no card backgrounds inside cards (anti-bento). Right rail (320px on xl+) shows a compact "Live now" sliver: agent activity, integration status, brand health.

### Card families (ordered by default urgency)
1. **Approvals Waiting** — paid DCO actions, organic drafts pending review, integration grants pending acceptance
2. **Going Live Soon** — calendar items scheduled in the next 24-72h
3. **Trend Signals** — social trends that started momentum within the last week, scoped to brand
4. **Performance Signals** — metric anomalies detected in the last 24h (paid + organic) with traceable timestamps
5. **Agent Activity** — recent agent runs that finished while you were away; tap to review
6. **Onboarding Next Steps** — only renders if onboarding has unfinished sections

### Card shape (universal `SignalCard`)
- Source badge (e.g. `META · DCO`, `INSTAGRAM · TREND`, `JAINA · AGENT`)
- Title (Geist 14px, weight 500)
- One-line context (text-secondary)
- **No inline sparkline.** Hover → `SnapshotPopover` opens with the relevant chart (lazy-loaded; only renders if hovered)
- Primary action button (teal) + secondary (ghost)
- "Pin to context" icon → adds entity reference to agent context tray
- Timestamp (mono-data, e.g. "noticed 2h ago")
- Optional avatar/asset thumbnail (24px)

### Empty state
"All clear." Geist 14px, text-secondary, centered. A small accretion-disk illustration (existing brand asset). No fake "you have nothing to do" emoji. Grace.

---

## 3. Organic Module — Calendar + Observability

The user said: focus on calendar + agent, present information observability-style (Vercel-like), with a dashboard still accessible. Split the existing monolith.

### Tabs (`PageTabs`)
1. **Calendar** *(default)* — keep `OrganicCalendarWorkspace`. This is already strong. Trend selector stays.
2. **Drafts** *(NEW)* — queue of generated drafts awaiting approval. Each draft = `SignalCard` with primary action `Review`.
3. **Signals** *(NEW)* — Vercel-Activity-style feed. Trend cards, anomaly cards, recent-post-vs-baseline cards. Pinnable. No charts inline.
4. **Explore** *(NEW)* — the analyst's dashboard. Real charts live here. Demographics, follower trends, engagement breakdown. Properly designed (use design-taste-frontend's bento 2.0). This is where `OrganicMetricsDashboard.tsx` content goes — but reshaped, not as a 2,083-line file.
5. **Agent** — keep `OrganicAgentPanelLazy` (Jaina). Page-local. Extended with @-mention + grab-to-context (see §6).

### What goes away
- The inline 7-day strip charts and KPI tile grids that currently sit above the post grid
- The monolith. `OrganicMetricsDashboard.tsx` is split into `SignalsTab`, `ExploreTab`, and shared `PostGallery` + `PostSnapshotPanel` components.

---

## 4. Paid Media — Observability Stays, Performance Reborn

Observability is good — leave it. Performance tab is the redesign target.

### Tabs (`PageTabs`)
1. **Observability** *(default)* — keep current campaign-tree + timeline workspace
2. **Performance** *(REDESIGN)* — see below
3. **Approvals** — keep current `/paid-media/approvals` route, also surfaced in homebase
4. **Canvas** — keep `CampaignCanvas`
5. **Explore** *(NEW)* — analyst dashboard with proper charts (ROAS-over-time, audience overlap, fatigue curves, attribution paths). Module-scoped charts, designed properly, not bolted on.
6. **Agent** — Jaina scoped to paid, page-local

### Performance tab redesign
Current state (dirty): `CampaignPerformanceTab.tsx` is a recharts-heavy slab.

New layout:
- **Signals strip** at top — recent anomalies, DCO actions pending, launches in last 24h (compact horizontal row of `SignalCard`s, snap-scroll on mobile)
- **Campaign Performance Table** — one row per campaign. Columns: name, spend, ROAS, CTR, CPA, status, last-changed. Right-aligned numerics with mono-data, KPI delta chips (`+12% ↑` in success color, `-8% ↓` in error). **No inline sparklines.** Hover any row → `SnapshotPopover` with the actual chart (lazy-loaded recharts). Click → drill into campaign detail.
- **Filter rail** (sticky right) — date range, account, status, label
- **No tile grid at top.** Aggregates are summarized in a single dense header strip.

---

## 5. AI Studio — Leave Alone (Mostly)

User confirmed AI Studio is in a good spot. Limit changes to:
- Make the Studio canvas accept "context atoms" pushed in from the agent (drag a trend card into a node)
- Cross-module link: when an agent generates a creative inside Studio, it can be one-click-pushed into an Organic draft or Paid creative
- Standardize the new `PageTabs` chrome around the canvas (consistency)

---

## 6. Agentic Frontends — One Pattern, Four Surfaces

The user's direction is gold: **page-local tabs + global ping + command palette + topbar activity pill**, all sharing one async protocol with rich context pinning.

### Four entry points
1. **Page-local Agent tab** — long-form conversation, full chat history, the current Jaina pattern. Each module owns one.
2. **Floating Agent Action** (FAB, bottom-right) — quick prompt. Defaults to the "page-context agent" (Organic page → Organic Jaina; Paid page → Paid Jaina; Homebase → general). Opens a slide-up sheet, dismissible. Submitting fires async; user can close immediately.
3. **Command Palette (⌘K)** — search OR ask. Detects question-shaped input → routes to the contextual agent.
4. **Topbar Agent Activity Pill** — async run inbox + status. Click → dropdown showing running/ready/recent. Toast on completion with a `View` link.

### Async protocol
- Every agent invocation returns a `runId`. Frontend stores `{runId, status, sourceContext, startedAt}` in a Zustand `useAgentRunsStore` (persisted to sessionStorage, brand-namespaced).
- Status polls or SSE-subscribes against `/api/agent-runs/:id`.
- On completion: toast + topbar pill increments; user clicks → opens the run thread in the appropriate page-local tab OR in a slide-over sheet if they're on a different page.
- **Hook:** `useAgentRun(runId)` — components can subscribe to a specific run's state.

### Rich context — extending the @-mention pattern
The Organic Jaina @-mention for trends and the Paid Jaina @-mention for campaigns become a shared primitive: `ContextMention`.

**Mentionable entity types:**
- Trends (organic)
- Insights / metric anomalies (any module)
- Posts (organic)
- Campaigns, ad sets, ads (paid)
- Audiences (paid)
- DCO actions (paid)
- Approvals (any)
- Studio nodes (AI Studio)
- Library assets

Each renders as a colored pill in the chat composer with the entity's icon + label. The backend receives them as structured context atoms with IDs, not as text.

### "Grab to context" — net-new pattern
Any on-page `SignalCard` or insight surface exposes a **Pin** affordance (small 16px icon, ghost button). Click → entity is added to a persistent `ContextTray` that floats above the agent composer (and is visible globally when the FAB is open). User can then say "draft a post about these" and the agent receives the pinned entities as structured context.

Visually: `ContextTray` is a thin row of compact entity pills above the composer, dismissible per-pill (`×`). Max 8 pins. On agent submit, pins are sent as structured context and tray clears.

This is the *"point at content and add it to the chat"* mechanic the user asked for, generalized.

### Approval queue
A new top-level `/approvals` route + sidebar entry + topbar count badge. Cards from across modules (paid DCO, organic drafts, integration grants) appear here in a unified queue. Each module can also surface its scoped subset (paid module's Approvals tab shows only paid; the global route shows all). Single primitive (`ApprovalCard` extends `SignalCard`), single approval action shape.

---

## 7. Automations — Workflows You Can Trust

A new top-level surface that lets users define and run pre-configured agent workflows. Think of it as "AI Studio for non-canvas work" — recurring reports, trend-driven content briefs, anomaly investigations, ROAS-watch recipes, calendar backfills. **Automations are agent-agnostic:** a single Automation can dispatch to Organic Jaina, Paid Jaina, AI Studio canvas runs, or a general-purpose agent.

### Route structure
- `/automations` — Library (your saved automations + Continuum templates + recent activity)
- `/automations/[id]` — Detail (config, run history, output library)
- `/automations/new` — Create flow (wizard)
- Cross-page invocation: ⌘K palette → "Run automation: …" or invoke from any context-relevant module page

### Automation shape (data model)
```ts
Automation {
  id, name, description, brandId
  agent: 'organic-jaina' | 'paid-jaina' | 'studio-canvas' | 'general'
  prompt: string                       // supports @-mention ContextMention atoms
  tools: ToolId[]                      // checklist scoped to chosen agent
  context: ContextAtom[]               // pinned trends/campaigns/audiences/etc.
  trigger: ManualTrigger | ScheduleTrigger | EventTrigger
  output: OutputDestination            // library doc | drafts queue | approvals | notification
  createdBy, createdAt
}

AutomationRun {
  id, automationId, brandId
  triggeredBy: 'manual' | 'schedule' | `event:${EventType}`
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'needs-approval'
  contextSnapshot: ContextAtom[]       // entities at run time (data drift-safe)
  startedAt, completedAt, durationMs
  outputs: ArtifactRef[]               // generated docs, drafts, etc.
  agentRunId: string                   // links to useAgentRunsStore
}
```

### Three trigger types
1. **Manual** — Run-now button. Fires through the standard async agent protocol; topbar pill increments; toast on completion.
2. **Scheduled** — Cron with sensible presets (`daily 9am`, `weekly Mon 9am`, `monthly 1st 9am`, plus custom cron). The card surfaces next-scheduled timestamp.
3. **Event-driven** — Fired by system signals. v1 event catalog:
   - `trend.rising` (organic, scoped to brand niche)
   - `metric.anomaly` (paid OR organic, with threshold filter)
   - `roas.dropped` (paid, configurable threshold)
   - `calendar.empty_slots` (organic, lookahead window)
   - `dco.action_pending_stale` (paid, age threshold)
   - `campaign.completed` (paid)

### Layout — `/automations` (Library)
- **PageHeader:** title + "New Automation" primary button
- **PageTabs:** `Library` (default) · `Activity` · `Templates`
- **Library tab:**
  - Filter rail (left, sticky): agent type, trigger type, status
  - Templates strip (top, horizontal scroll): Continuum-built recipes the user can fork
  - Grid of `AutomationCard`s — name, agent badge, `TriggerBadge`, last-run timestamp, next-scheduled chip, success rate (last 10 runs)
- **Activity tab:** Vercel-deploys-page-style table of all recent runs across all automations. Columns: automation name, triggered by, status pill, duration (mono-data), started timestamp, output link. Row hover → snapshot popover with run summary.
- **Templates tab:** Continuum-published recipes with fork action

### Layout — `/automations/[id]` (Detail)
- **Header:** name, agent badge, trigger badge, **Run now** primary button, edit/duplicate/delete in overflow menu
- **PageTabs:** `Config` · `Run History` · `Outputs`
- **Config:** read-only summary of prompt, tools, context atoms, trigger, output destination. Edit button → reopens the create wizard pre-filled.
- **Run History:** table of `RunStatusRow` (status pill, triggered by, started, duration, output link)
- **Outputs:** accumulated artifacts (e.g. all generated reports for this automation)

### Create flow (`/automations/new`)
A 4-step wizard inside a slide-over sheet, reusing the onboarding v2 field/step patterns where applicable:
1. **Pick agent** — visual cards: Organic Jaina, Paid Jaina, AI Studio, General. Each shows what the agent excels at.
2. **Write prompt + pin context** — large `AutomationComposer` (Geist 14px) with @-mention support, `ContextTray` for pinning trends/campaigns/audiences. Live token estimate.
3. **Enable tools** — checklist scoped to chosen agent (e.g. Organic Jaina exposes `fetch_trends`, `draft_post`, `query_insights`; Paid Jaina exposes `fetch_campaign_metrics`, `propose_dco_action`, `analyze_roas`).
4. **Trigger + output** — `TriggerEditor` (manual/schedule/event picker with sub-config) + `OutputDestinationPicker` (Library doc / Organic Drafts / Approvals queue / Slack/email notification).

### Cross-module discovery
- **Module pages surface relevant automations.** Organic Signals tab shows a small "3 automations match this trend type" affordance. Paid Performance shows "Run ROAS Investigation" inline next to a flagged anomaly. Click → opens Create-flow pre-filled with the right agent + starting prompt + the entity pinned to context.
- **⌘K invocation:** typing "run [automation name]" lists matching saved automations; Enter runs manually.

### Templates to ship at v1
1. **Weekly Brand Performance Report** — paid Jaina + organic Jaina, schedule: weekly Mon 9am, output: Library doc + Slack notification
2. **Trend-Driven Content Brief** — organic Jaina, event: `trend.rising`, output: 3 drafts → Organic Drafts
3. **ROAS Anomaly Investigation** — paid Jaina, event: `roas.dropped` (>10%), output: investigation report → Approvals
4. **Calendar Backfill** — organic Jaina, event: `calendar.empty_slots` (>3 empty in next 7d), output: drafts → Organic Drafts
5. **Creative Refresh Recommendations** — paid Jaina, schedule: weekly Wed, output: variations → Approvals

### Primitives needed
| Primitive | Purpose |
|---|---|
| `AutomationCard` | Library card with agent + trigger badges, last-run, next-scheduled, success rate |
| `TriggerBadge` | Visual pill: ⚡ Manual / ⏱ Schedule / 📡 Event (Phosphor icons, color per type) |
| `RunStatusRow` | One row in a run history table (status pill, duration mono-data, output link) |
| `AutomationComposer` | Large prompt input with ContextMention + tool toggle inline |
| `TriggerEditor` | Sub-component (cron picker for schedule, event-type picker for event) |
| `OutputDestinationPicker` | Where results land (Library / Drafts / Approvals / Notification) |
| `AgentPickerCard` | Visual card in step 1 of the create wizard |

All consume the existing `ContextMention`, `ContextTray`, `PageTabs`, `EmptyState`, `SignalCard` primitives from §8 — no re-implementation.

### Cross-cutting integration
- **Topbar agent pill** — automation runs appear alongside ad-hoc agent runs (same async protocol, same `useAgentRunsStore`, tagged with `automationId` for jump-back)
- **Approvals queue** — automations that output to `approvals` land here, identical card shape to other approvals
- **Library** — automations that output reports/docs land here, browsable as a content type
- **Brand teardown** — `useAutomationsStore` registers with `storeRegistry` so brand switches wipe stale state

### Data plane (backend, briefly)
- New Supabase tables: `brand_automations`, `brand_automation_runs`
- New edge function: `run-automation` (dispatches to the chosen agent endpoint with prompt + tools + context + brand auth)
- New edge function: `automation-event-router` (listens to anomaly/trend/calendar/dco events via Postgres triggers or pg_cron polling, fires matching event-triggered automations)
- Schedules implemented via Supabase pg_cron OR a lightweight scheduler edge function — TBD in Phase E planning

---

## 8. Shared Design Primitives (Build Once, Use Everywhere)

These are the core new components. They should be the *only* way certain things are built post-launch.

| Primitive | Purpose | Used by |
|---|---|---|
| `SignalCard` | Universal triage card (trend, anomaly, approval, agent run) | Homebase, every module signals tab, approvals route |
| `SnapshotPopover` | Hover-revealed mini chart for a `SignalCard` | All signal cards that have time-series data |
| `ContextMention` | @-mention pill for any first-class entity | Every agent composer |
| `ContextTray` | Pinned-entities tray above agent composer | Global agent FAB, every page-local agent tab |
| `AgentActivityPill` | Topbar async run inbox | Shell |
| `PageTabs` | Consistent sub-tab nav with badges | Every module |
| `EmptyState` | Grace-first empty surface | Anywhere a list/feed can be empty |
| `TraceableInsight` | `SignalCard` variant with "noticed at" + jump-to-data | Anomalies and AI-detected insights |
| `DeltaChip` | `+12% ↑` / `-8% ↓` chip with semantic color | Performance tables, metric headers |
| `ContextSheet` | Slide-over sheet for agent runs viewed from a non-owning page | Topbar pill → click-through |

All built per `design.md` tokens. All built once in `src/components/ui/` or `src/components/console/`. **No re-implementations per module.**

---

## 9. What Gets Removed / Deprecated

- Inline sparklines (do not add; the few existing should be removed when their parent is touched)
- KPI tile grids at top of pages (replaced with signal-first layout + optional dense header strip)
- The `HomeBaseDashboard.tsx` `?view=` switcher
- The monolithic `OrganicMetricsDashboard.tsx` (split into Signals + Explore + shared sub-components)
- The current `CampaignPerformanceTab.tsx` (rebuilt as table-first with snapshot popovers)
- Per-module ad-hoc Tabs implementations (replaced with `PageTabs`)
- "Atomic electron orbiting nucleus" illustrations and any neon-glow active states still in the wild (per design.md — already a rule, enforce in audit)

---

## 10. Phased Rollout

### Phase A — Foundation (1–2 weeks, no feature flag — universal)
- Refresh shell: topbar with command palette center, agent activity pill right, two-level breadcrumb
- Build `PageTabs`, `SignalCard`, `SnapshotPopover`, `EmptyState`, `DeltaChip`, `ContextMention`, `ContextTray`, `ContextSheet`, `AgentActivityPill`, `TraceableInsight` primitives
- Build `useAgentRunsStore` (Zustand, brand-scoped, session-persisted)
- Wire up async agent protocol + toast on completion
- Add Approvals top-level route + sidebar entry + topbar badge

### Phase B — Homebase Today briefing (1 week, behind `feature-flag:homebase-v2`)
- Replace `HomeBaseDashboard.tsx` with new Today feed
- Wire data: approvals (existing tables), calendar (existing store), trend signals (existing `fetchBrandInsights`), performance anomalies (new lightweight anomaly detection or wired from existing edge fn data), agent activity (new store)
- A/B against existing view-switcher dashboard, kill old one after 2 weeks of stable usage

### Phase C — Organic refactor (1–2 weeks, behind `feature-flag:organic-v2`)
- Split `OrganicMetricsDashboard.tsx` into `SignalsTab`, `ExploreTab`, `PostGallery`, `PostSnapshotPanel`
- Add Drafts tab
- Extend Jaina agent with @-mention v2 + grab-to-context
- Migrate trend selector into the new shared `ContextMention` primitive

### Phase D — Paid Media performance redesign (1–2 weeks, behind `feature-flag:paid-performance-v2`)
- Rebuild `CampaignPerformanceTab.tsx` as a table-first layout with `SnapshotPopover` hover charts
- Add Explore tab with proper analyst dashboard
- Apply @-mention + grab-to-context patterns to paid Jaina

### Phase E — Automations (2–3 weeks, behind `feature-flag:automations-v1`)
- New `/automations` route (Library + Activity + Templates tabs) and `/automations/[id]` + `/automations/new`
- Supabase tables `brand_automations` + `brand_automation_runs` + RLS
- `run-automation` edge function (dispatches to chosen agent endpoint, threads through `useAgentRunsStore`)
- `automation-event-router` edge function for event-driven triggers
- `pg_cron` (or scheduler edge fn) for scheduled triggers
- Build all Automation primitives (§7): `AutomationCard`, `TriggerBadge`, `RunStatusRow`, `AutomationComposer`, `TriggerEditor`, `OutputDestinationPicker`, `AgentPickerCard`
- Ship 5 templates listed in §7
- Cross-module discovery (Organic + Paid surface "matching automations" affordances)
- ⌘K palette extension for invoking automations

### Phase F — Polish + audit pass (1 week)
- Invoke `/polish` for spacing, shadow, hover-state refinement
- Invoke `/delight` for empty states, micro-interactions, agent-completion moments
- Invoke `/critique` for adversarial review
- Run `/audit` for accessibility, contrast (WCAG 2.1 tool, not just OKLCH-L-delta)
- Reduced-motion verification on every animated surface

**Total estimated effort:** 8–11 weeks across a 1–2 person frontend rotation (1 additional engineer recommended for Phase E backend work).

---

## 11. Skills Pipeline

Per `design.md`'s skill strategy:

| Phase | Skill sequence |
|---|---|
| Direction (this doc) | `superpowers:brainstorming` → vision plan ✓ |
| Each module's plan | `impeccable teach` (one-time per module) → `impeccable` → `design-taste-frontend` → `frontend-design` |
| Implementation | `shadcn` (new primitives) + `build-components` + `next-best-practices` |
| Motion | `animate` (CSS-only) for hover/focus, `framer-motion-animator` for sheet/popover orchestration |
| Polish loop | `polish` → `delight` → `critique` → `audit` |

Every phase plan should run through the Codex plan review (`codex:rescue`) before user review, per project CLAUDE.md.

---

## 12. Critical Files (Touchpoints)

Modify (foundation):
- `src/app/(post-auth)/layout.tsx` — shell shape
- `src/components/DashboardLayoutShell.tsx` — main wrapper
- `src/components/dashboard-header.tsx` — topbar (add palette trigger center, agent pill right)
- `src/components/navigation/AppSidebar.tsx` — add Approvals + Library entries
- `src/components/navigation/CommandPalette.tsx` — extend with "ask agent" routing

Replace (homebase):
- `src/components/dashboard/HomeBaseDashboard.tsx` → new `TodayBriefing.tsx`
- `src/components/dashboard/views/PaidDashboardView.tsx` — removed
- `src/components/dashboard/server/OrganicDashboardDataWrapper.tsx` — repurposed as data source for signals

Refactor (organic, paid):
- `src/components/organic/OrganicMetricsDashboard.tsx` — split
- `src/components/organic/OrganicExperience.tsx` — re-shell with `PageTabs`
- `src/components/paid-media/performance/CampaignPerformanceTab.tsx` — rebuild
- `src/components/paid-media/PaidMediaReportingWidget.tsx` — feeds Performance tab data

New (primitives — `src/components/console/`):
- `SignalCard.tsx`, `SnapshotPopover.tsx`, `ContextMention.tsx`, `ContextTray.tsx`, `ContextSheet.tsx`, `AgentActivityPill.tsx`, `PageTabs.tsx`, `EmptyState.tsx`, `DeltaChip.tsx`, `TraceableInsight.tsx`, `ApprovalCard.tsx`

New (state):
- `src/lib/agent/useAgentRunsStore.ts` (Zustand, brand-scoped, sessionStorage-persisted, registered with `storeRegistry`)
- `src/lib/agent/useContextTrayStore.ts` (Zustand)

New (routes):
- `src/app/(post-auth)/approvals/page.tsx`
- `src/app/(post-auth)/library/page.tsx` (placeholder, formalizes a nav slot)
- `src/app/(post-auth)/automations/page.tsx`
- `src/app/(post-auth)/automations/[id]/page.tsx`
- `src/app/(post-auth)/automations/new/page.tsx`

New (Automations primitives — `src/components/automations/`):
- `AutomationCard.tsx`, `TriggerBadge.tsx`, `RunStatusRow.tsx`, `AutomationComposer.tsx`, `TriggerEditor.tsx`, `OutputDestinationPicker.tsx`, `AgentPickerCard.tsx`

New (Automations state + data):
- `src/lib/automations/useAutomationsStore.ts` (Zustand, brand-scoped, registered with `storeRegistry`)
- `src/lib/automations/types.ts` (Automation, AutomationRun, Trigger, OutputDestination types + Zod schemas)
- `supabase/functions/run-automation/index.ts` (dispatches to agent endpoints)
- `supabase/functions/automation-event-router/index.ts` (listens to system events, fires matching automations)
- `supabase/migrations/<timestamp>_add_brand_automations.sql` (tables + RLS)

---

## 13. Verification Plan

End-to-end checks before each phase ships:

**Shell + primitives (Phase A):**
- Open every existing module with new shell — no regressions (`bun test`, manual click-through)
- Cmd-K palette opens, routes work, "ask" routing fires agent
- Agent FAB pings agent; topbar pill increments; toast fires on completion
- Approvals route renders; sidebar badge reflects count
- `prefers-reduced-motion` honored on popover + sheet + toast
- WCAG 2.1 contrast pass via dev-tools (not OKLCH-L-delta proxy)

**Homebase (Phase B):**
- Brand switch re-keys the feed
- Empty state renders when no signals
- All card families load (mock + real data)
- Pin-to-context works across all card types
- Hover-snapshot lazy-loads (network tab confirms no chart bundle until hover)

**Automations (Phase E):**
- Manual run: trigger an automation from Library; topbar pill increments; toast on completion; output lands in the chosen destination
- Scheduled run: set cron; verify it fires on schedule (use admin time-stub tool for fast feedback)
- Event-driven run: simulate `roas.dropped` event; verify the matching automation fires, others don't
- Run history persists across sessions, brand-scoped, paginated
- ⌘K → "run X" invocation works for saved automations
- Wizard step navigation works keyboard-only; `prefers-reduced-motion` honored
- Cross-module affordance: trend card → "Create automation from this trend" pre-fills wizard correctly

**Organic / Paid (Phases C–D):**
- `PageTabs` keyboard nav (← →, Home, End)
- @-mention picks up new entity types
- Grab-to-context from a `SignalCard` adds correct entity ID to tray
- Snapshot popover renders correct chart for the hovered row
- No sparkline anywhere (visual regression check)
- Explore tab dashboards load with proper recharts wrappers — confirm Phase A primitives reused

**Cross-cutting:**
- Brand-scoped Zustand stores wiped on brand switch (per `storeRegistry`)
- Agent runs persist across page nav (sessionStorage, brand-namespaced)
- `bun run lint`, `bun run build`, `bun test` all green
- Manual: real screenshots run through `/critique` before marking phase done

---

## 14. Open Questions to Resolve in Phase A planning

1. **Server vs session persistence for agent runs** — sessionStorage is enough for "while you're working today" but loses runs on browser close. Confirm with user whether async runs should survive sessions (suggests server-side `agent_runs` table).
2. **Approvals route — flat list or grouped by module** — start flat (Linear-like single inbox), revisit if it scales.
3. **Cmd-K "ask agent" detection** — heuristic (question-shaped input ends in `?`, contains "how/why/what") or explicit toggle? Start heuristic with a visible "switch to Ask" affordance.
4. **"Live now" right rail on homebase** — does this need to exist, or is it redundant with topbar agent pill? Lean toward removing in Phase B if it adds noise.
5. **DCO action UX inside the new performance table** — does each action get a row, or are they grouped under their parent campaign? Probably grouped, with an "N pending" inline chip that expands.
6. **Automation scheduling backend** — `pg_cron` vs. a dedicated scheduler edge function vs. an external scheduler (e.g. Vercel Cron). Resolve in Phase E planning; pg_cron is simplest if already enabled.
7. **Automation permissions** — who in a brand can create/edit/run automations? Default to "anyone with brand access" v1; revisit if abuse vectors emerge (e.g. event-driven automations that spam approvals).
8. **Automation prompt versioning** — when a user edits a saved automation, do prior runs link to the historical prompt? Suggest yes — store `promptSnapshot` on each run.

---

## 15. Next Steps After This Plan Is Approved

1. **Phase A detailed plan** — invoke `gsd:plan-phase` for "Foundation: shell + primitives + agent protocol + approvals route." This is the unblocking phase; every later phase depends on its primitives.
2. **Per-phase Codex review** — each phase plan runs through `codex:rescue` before user review (per project CLAUDE.md).
3. **Impeccable teach refresh** — run `/impeccable teach` once to write the updated `.impeccable.md` with this direction, so all design skills pick up the new context automatically.
4. **Visual exploration (optional)** — when starting Phase B's homebase plan, consider the brainstorming visual companion for laying out the Today feed.

---
