# Organic Planner Redesign (Spec + Scope)

## Context
The current Organic Planner page (`src/app/(post-auth)/organic/page.tsx` + `OrganicExperience`) is functional but not purpose‑built for end‑to‑end social content creation, scheduling, cross‑posting, and performance tracking. We need a clean, modern, minimalist tool that lets creators generate a full week of content from trends and publish/schedule across multiple platforms with confidence.

## Product Goal
Deliver an organic social media content creation + posting hub that supports:
1. **AI Content Generation** — multi‑day plans + per‑post copy from selected trends and active brand profile.
2. **Multi‑Platform Publisher** — one‑click cross‑posting to selected platforms/accounts.
3. **Performance Dashboard** — key metrics per platform and per post.

**Primary user story**
> As a content creator, I want to generate a full week of relevant content ideas from trending topics and publish them all at once, so I can save time and stay consistent.

## Design Principles
- **Clean**: minimal chrome, clear hierarchy, semantic colors.
- **Intuitive**: progressive disclosure, predictable actions, strong empty states.
- **Efficient**: fast multi‑select, bulk actions, inline editing, minimal clicks.
- **Whitespace with purpose**: generous but not wasteful; layout should fill width and encourage side‑by‑side content.

## Visual Identity
- Light, modern palette: whites + soft greens for success/primary, neutral grays for structure.
- High readability: strong typography hierarchy, low visual noise.
- Consistent Radix UI primitives + Tailwind utilities, aligned with `docs/styleguide.md`.

## Platform Roadmap
**Phase 1 (Instagram‑only MVP)**: Instagram (Feed / Reels / Stories / Carousels + Grid preview + Auto‑comments).  
**Why Instagram first**: Strong Instagram support makes the workflow interoperable with TikTok and YouTube Shorts later (vertical video + feed/grid semantics).  
**Phase 2 (multi‑platform expansion)**: Facebook, YouTube (Community + Shorts), then LinkedIn, TikTok, Twitter/X, Threads.  
**Inbox / Messaging**: **Coming soon** surfaces only until Phase 3.

---

## Information Architecture (IA)
Organic becomes a hub with three primary workspaces (Instagram‑only in MVP):
1. **Ideas / Plan** (default) — trends → week plan → drafts, with a feed‑style draft list toggle.
2. **Calendar** — schedule and publish Instagram posts.
3. **Performance** — Instagram metrics for published content.
4. **Inbox** — visible but **Coming soon** (disabled tab).

Navigation pattern:
- Top tabs inside Organic hub (Radix `Tabs`), matching other post‑auth pages.
- Persistent right‑side drawer for **Post Details / Composer** when a post is selected.

---

## Key Screens & Workflows

### 1. Plan Workspace
**Goal**: Select trends + platforms → generate a week plan → refine drafts.

Layout (full‑width, split):
- **Left rail (narrow)**: Trend selection + filters.
- **Main canvas (wide)**: Week plan grid (7‑day or 14‑day) with per‑day cards, plus a **Feed view** for draft browsing.
- **Right drawer (slide‑over)**: Post composer for selected card.

Flow:
1. User selects **trends** (from Brand Insights panels or curated list). Selected trends pass their IDs through generation requests (`selectedTrendIds`) for backend grounding.
2. User selects **Instagram account(s)** and desired content mix (Feed / Reel / Story / Carousel).
   - Account selection performs **availability checks** based on connected brand IG accounts and opt‑in user/team IG integrations.
   - Brand‑profile IG accounts vs user/team IG accounts are clearly differentiated.
   - User sets an **active Instagram account** for the plan; can be overridden per draft.
3. Click **Generate week plan** (7‑day default).
4. AI returns per‑day draft ideas with suggested media + copy + hashtags + CTA.
5. User edits any card inline or opens composer drawer.
6. Drafts can be bulk‑selected for scheduling/publishing. Omni‑posting is Phase 2.

AI Plan options:
- Duration: 3 / 5 / 7 / 14 days.
- Tone/voice (from brand profile, override allowed).
- Content mix toggles: educational / promotional / behind‑the‑scenes / community.

### 2. Composer / Post Details Drawer
**Goal**: Edit one post with realistic previews and automation setup.

Sections (progressive):
1. **Header**: Day, status (Draft/Scheduled/Published), platform icons, quick actions (duplicate, delete).
2. **Platform targets**:
   - Select platforms (toggle group).
   - Select account per platform (from brand profile + opt‑in team/user integrations).
   - Instagram target supports account switching per draft, with clear “Brand IG” vs “Team IG” grouping.
   - Cross‑post toggle (single click to mirror across selected targets) with per‑platform compatibility warnings.
3. **Media**:
   - Upload/select assets (image/video/carousel).
   - Carousel ordering via drag.
   - Format hints per platform (ratio, duration, max items).
   - Instagram‑specific post types: Feed, Reel, Story, Carousel (with grid placement preview for Feed/Carousel).
4. **Copy**:
   - Post text + hashtags.
   - Per‑platform overrides (collapsed by default).
   - AI rewrite controls (shorten, expand, more casual, more formal).
5. **Preview**:
   - Realistic Instagram preview using Radix `HoverCard`/`Tabs`:
     - IG feed / reel / story mock.
     - IG **profile grid preview** showing scheduled/published posts.
6. **Instagram customizations (critical MVP)**:
   - Add location to posts.
   - Tag users in media and captions.
   - Collaboration posts (invite collaborator account when supported).
   - Custom cover photo for Reels.
   - Toggle to share Reels to Feed.
6. **Scheduling**:
   - Date/time picker + timezone.
   - “Add to Calendar” / “Schedule all selected”.
7. **Automations** (Instagram MVP subset):
   - One‑click cross‑post (enabled here + in bulk bar).
   - Auto‑engagement toggles:
     - Auto‑like within X minutes.
     - Auto‑first comment (auto‑comments) within X minutes.
     - Auto‑repost/share after X hours (platform‑dependent).
   - Account picker for engagement (opt‑in list).
8. **Publish**:
   - Primary CTA: **Schedule** or **Publish now**.
   - Secondary: Save draft.

### 3. Calendar Workspace
**Goal**: Visual scheduling, drag/drop rescheduling, bulk publish.

Layout:
- Top bar: platform/account filters, status filter (Draft/Scheduled/Published), view toggle (Month/Week).
- Main calendar: grid with cards per scheduled **and published** post.
- Right drawer reused for details on selection.

Behavior:
- Drag card to new date/time (client DnD).
- Bulk bar when multiple selected (Schedule, Publish, Delete).
- One‑click cross‑post from calendar items is Phase 2 (omni‑posting).
- Hover card preview (Radix `HoverCard`) on calendar cards for quick media/caption peek.
- “Coming soon” badge for Inbox‑related actions.

### 4. Performance Workspace
**Goal**: Scan outcomes and iterate on content.

Layout:
- KPI strip: Views, Likes, Comments, Shares (total + delta).
- Filters: time range, platform, account, campaign/tag.
- Content table/card list: each published post with metrics and thumbnail.
- Drill‑in opens right drawer in read‑only with “Create similar” action.

Data:
- Aggregated metrics per platform.
- Per‑post breakdown.
- Trend/plan attribution for learning loops (later).

---

## Component Library (Storybook) Plan
We will build/extend Storybook and add a cohesive Organic component set.

### New primitives/components
- `OrganicHubTabs` (Plan/Calendar/Performance/Inbox)
- `TrendPickerPanel`
  - `TrendChip`, `TrendSearch`, `TrendFilterBar`
- `PlatformTargetSelector`
  - `PlatformToggleGroup`
  - `AccountMultiSelect` (brand + user/team opt‑ins)
  - `InstagramAccountSwitcher`
  - `PlatformAvailabilityBadge`
- `WeekPlanGrid`
  - `DayColumn`, `PostCard`, `PostStatusBadge`
- `DraftFeedView`
- `BulkActionBar`
- `PostComposerDrawer`
  - `MediaUploader`
  - `CarouselReorderList`
  - `CopyEditor`
  - `PerPlatformOverrideAccordion`
  - `SocialPreviewTabs` + platform previews (IG/FB/YT)
  - `InstagramGridPreview`
  - `InstagramCustomizationPanel`
  - `SchedulePicker`
  - `AutomationPanel`
- `OrganicCalendar`
  - `CalendarToolbar`, `CalendarPostCard`
  - `CalendarHoverPreview`
- `PerformanceDashboard`
  - `MetricKpiStrip`, `PerformancePostList`, `PlatformMetricLegend`
- `ComingSoonPanel` (Inbox + tagging placeholders)
- Reuse existing `ToastProvider` variants for success/warning/error feedback.

### Storybook scope
- **MVP**: primitives above + representative examples.
- **Later**: full state matrix, theming variants, motion specs.

---

## Data Model & APIs (Proposed)
We will wrap Supabase access behind server modules/actions (per architecture rules).

### Core entities
- `Trend`
  - `id`, `title`, `summary`, `source`, `platformHints[]`
- `SocialAccount`
  - `id`, `platform`, `handle`, `brandProfileId`, `ownerUserId?`, `teamMemberId?`, `optInForCrossPost`
- `ContentPlan`
  - `id`, `brandProfileId`, `dateStart`, `dateEnd`, `selectedTrendIds[]`, `createdBy`
- `PostDraft`
  - `id`, `planId`, `brandProfileId`, `day`, `platformTargets[]`, `copy`, `hashtags`, `media[]`, `status`
  - `instagram` (platform overrides)
    - `accountId`
    - `postType(feed|reel|story|carousel)`
    - `location`
    - `captionTags[]`
    - `mediaTags[]`
    - `collaboratorAccountId?`
    - `reelCoverAssetId?`
    - `shareReelToFeed:boolean`
- `MediaAssetRef`
  - `id`, `type(image|video)`, `path`, `ratio`, `duration?`, `carouselIndex?`
- `ScheduleEntry`
  - `id`, `draftId`, `scheduledAt`, `timezone`, `status(scheduled|published|failed)`
- `PublishJob`
  - `id`, `draftId`, `platform`, `accountId`, `submittedAt`, `resultUrl?`, `error?`
- `EngagementAutomation`
  - `id`, `draftId`, `type(auto_like|auto_comment|auto_share)`, `delayMinutes`, `accounts[]`, `payload?`
  - `auto_comment` payload supports Instagram first‑comment text and tagging.
- `PerformanceMetric`
  - `id`, `platform`, `postUrl`, `views`, `likes`, `comments`, `shares`, `capturedAt`

### API surfaces
- Server Actions:
  - `generateContentPlanAction({ trends, platforms, range, tone })`
  - `saveDraftAction({ draft })`
  - `scheduleDraftsAction({ draftIds, scheduledAt })`
  - `publishDraftsAction({ draftIds })`
  - `toggleAutomationAction({ draftId, automation })`
  - `fetchPerformanceAction({ brandProfileId, range, filters })`
- Route handlers for public/unauthenticated where needed (none planned for MVP).

### Caching strategy
- RSC fetch for Plan/Calendar/Performance initial data with `revalidate`.
- Client cache for drag/drop and inline edits; persist via debounced server actions.

---

## Accessibility & UX Notes
- All interactive controls use Radix primitives for keyboard + ARIA.
- Drawer focus‑trap; ESC closes; preserve scroll position.
- Empty states with clear CTAs (e.g., “Connect Instagram to start publishing”).
- Strong status feedback via toasts + inline errors.

---

## Phased Delivery

### Phase 0 — Foundation (Done / In Progress)
- Full‑width post‑auth layouts with minimal gutters (Dashboard, Organic, Settings, Admin, Paid Media).
- New toast system (success/warning/error with progress bar).
- Lint hygiene around images + hydration stabilization.

### Phase 1 — Instagram‑Only MVP (Next)
- Organic hub tabs (Ideas/Plan, Calendar, Performance, Inbox‑ComingSoon).
- Trend picker + Instagram account selection with availability checks.
- Week plan generation via AI (server action) + one‑off draft generation/revision with prompt.
- Post drafts CRUD + composer drawer.
- Media upload + carousel ordering + IG post types (Feed/Reels/Stories/Carousels).
- Realistic IG previews + **IG grid preview**.
- Calendar month/week with scheduling + drag/drop.
- Publish‑now and schedule flows for Instagram (single + bulk).
- Instagram customizations: location, caption/media tagging, collab posts, reel covers, share‑to‑feed toggle.
- Instagram auto‑comments (first comment) automation.
- Basic Instagram performance KPIs and per‑post list.

### Phase 2 — Expansion
- One‑click cross‑posting with account mapping.
- Per‑platform copy overrides and format validations.
- Auto‑engagement MVP (likes/comments/shares).
- Team opt‑in engagement accounts from integrations.
- Better media pipelines (video transcode hints, carousel limits).

### Phase 3 — Advanced + More Platforms
- Add LinkedIn/TikTok/Twitter/Threads targets and previews.
- Tagging UI (per‑platform API integration).
- Inbox functionality (DMs/comments) — replaces ComingSoon.
- Trend/plan attribution analytics + learning loop.
- Full Storybook coverage + visual regression.

---

## Explicit Out‑Of‑Scope (for MVP)
- Functional messaging inbox.
- Cross‑platform tagging beyond Instagram (other platforms later).
- Platforms beyond IG/FB/YT.
- Deep analytics pipeline (e.g., cohorting, long‑term attribution).
- Fully automated engagement requiring non‑opt‑in team accounts.

---

## Open Questions / Decisions Needed
1. AI generation backend: reuse existing `OrganicExperience` generation or new endpoint?
2. Media storage: continue Supabase Storage buckets or introduce a dedicated media service?
3. Preview fidelity targets per platform (static mock vs. pixel‑accurate).
4. Publish API sequencing and rate limits per platform.
5. Scheduling granularity defaults (e.g., suggested best times).
6. Instagram API coverage for collab posts, reel covers, and share‑to‑feed in MVP.
