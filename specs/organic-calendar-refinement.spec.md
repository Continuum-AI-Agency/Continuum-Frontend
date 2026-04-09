# Feature: Organic Calendar Refinement Roadmap

## Overview

A comprehensive refinement of the Organic Content Calendar targeting four domains: interaction feedback, error resilience, performance, and missing workflows. The calendar is the core social media planning surface — every improvement compounds across the daily workflow of content creation, scheduling, and publishing. Instagram-first publishing strategy; approval workflows deferred.

**Axioms:** Clarity (at-a-glance understanding), Resilience (graceful failure handling), Smoothness (polished transitions and feedback).

**Scope:** Pure refinement and gap-filling. No new product verticals, no multi-platform publishing expansion, no team collaboration features.

---

## Phase 1: Interaction Feedback

### FR-IF-001: Drag Ghost Overlay
When a user begins dragging a draft card or trend, the system shall render a semi-transparent (opacity 0.6) clone of the card that follows the cursor, replacing the current empty DragOverlay.

### FR-IF-002: Drop Zone Highlighting
While a drag operation is active, when the cursor enters a valid calendar day column, the system shall display a dashed border placeholder in the target slot with subtle `bg-brand-primary/5` tint. When the cursor leaves, the system shall remove the highlight within one animation frame.

### FR-IF-003: Invalid Drop Dimming
While a drag operation is active, the system shall dim non-droppable zones (e.g., past dates, full slots) to 40% opacity to communicate invalidity.

### FR-IF-004: Trend Seed Feedback
When a trend is dragged onto a calendar day, the system shall display a toast: "Placeholder created from '{trend title}'" with an undo action (5s timeout). The placeholder card shall display the trend title as a visual seed indicator.

### FR-IF-005: Streaming Completion Toast
When a draft transitions from `streaming` to `draft` status, the system shall show a subtle toast: "Draft ready: {title}" with a "View" action that selects the draft and opens the preview panel.

### FR-IF-006: Trend Selection Limit Feedback
While 5 trends are already selected, when the user attempts to select a 6th trend, the system shall show a toast: "Maximum 5 trends selected. Deselect one to add another." and prevent the selection.

### FR-IF-007: Time Input Format Hint
The time picker popover shall display a placeholder "e.g. 9:00 AM" in the custom time input field. When an invalid time format is entered, the system shall show inline validation text: "Use format like 9:00 AM or 14:00" and keep the popover open.

### FR-IF-008: Placeholder Visual Language
The system shall render `placeholder` status drafts with a dashed border (`border-dashed border-muted-foreground/30`), a subtle crosshatch pattern background, and a label "Awaiting generation" to distinguish them from real drafts.

### FR-IF-009: Duplicate Trend Drop Warning
While a day already contains a placeholder seeded from trend T, when the user drags trend T onto the same day, the system shall show a confirmation toast: "This trend is already seeded on {day}. Create another?" with Confirm/Cancel actions.

---

## Phase 2: Error Resilience

### FR-ER-001: Centralized Error Classifier
The system shall provide a `classifyOrganicError(error: unknown, context: string)` function that maps errors to `{ userMessage: string, severity: 'info' | 'warning' | 'error', action: 'toast' | 'inline' | 'banner', retryable: boolean }`.

**Error mappings:**
| Source Error | User Message | Severity | Action |
|---|---|---|---|
| HTTP 401 | "Session expired. Please sign in again." | error | toast + redirect |
| HTTP 429 | "Too many requests. Retrying in {n}s..." | warning | toast |
| HTTP 500 | "Something went wrong. Try again." | error | toast |
| Network error | "Connection lost. Check your network." | error | banner |
| Quota exceeded | "Storage full. Clearing old data..." | warning | toast |
| Generation timeout | "Generation is taking longer than expected." | warning | inline |
| Token expired (Instagram) | "Instagram connection expired. Reconnect in Settings." | error | toast + link |

### FR-ER-002: Inline Generation Errors
When a draft's `generationError` is set, the system shall display the error message directly on the card body (not hover-only) with a red error strip and a "Retry" button. The error text shall be truncated to 2 lines with a "Show more" expansion.

### FR-ER-003: Publish Retry Mechanism
When publishing fails with a retryable error, the system shall display a "Retry" button on the draft card and in the toast notification. The retry shall re-invoke the publish SSE endpoint with the same parameters. Maximum 2 automatic retries for transient (5xx, network) errors with exponential backoff (2s, 8s).

### FR-ER-004: AI Studio Handoff Error Feedback
When localStorage quota is exceeded during AI Studio handoff, the system shall:
1. Show a toast: "Preparing handoff... clearing old data"
2. Attempt progressive stripping (existing behavior)
3. If all attempts fail, show a toast: "Unable to prepare handoff. Try closing other tabs." with a "Copy link" fallback that copies the AI Studio URL without context

### FR-ER-005: Apply Response Sync Feedback
When an AI Studio apply response is detected and synced back to a draft, the system shall show a success toast: "Edits from AI Studio applied to '{draft title}'" with a "View" action. When the apply response is malformed, the system shall show an error toast and log the error shape.

### FR-ER-006: Optimistic Rollback
The Zustand store shall provide a `withOptimisticUpdate<T>(selector, mutation, serverSync)` helper that:
1. Captures a snapshot of `selector` state before `mutation`
2. Applies `mutation` immediately (optimistic)
3. Awaits `serverSync` promise
4. On rejection, rolls back to snapshot and shows a toast: "Changes couldn't be saved. Reverted."

### FR-ER-007: Empty State Guidance
When the calendar has zero drafts and zero placeholders, the system shall display an empty state with:
- Illustration or icon appropriate to the calendar
- Heading: "Plan your week"
- Body: "Drag trends from the sidebar or click + to create your first post"
- Primary CTA: "Add a post" (triggers `onAddPlaceholder`)

When no trends are available, the warning callout shall include a reason: "Brand insights are being generated..." (if in progress) or "Generate insights to unlock trend-based planning" (if not started), with a dismiss button.

---

## Phase 3: Performance + Testing

### FR-PT-001: Memoize OrganicMetricsDashboard Internals
The system shall wrap chart configuration objects and data transformations in `useMemo`. Recharts components that receive stable data shall be wrapped in `React.memo`. Target: eliminate re-renders when parent re-renders without metrics data changes.

### FR-PT-002: Memoize OrganicDraftPreview Carousel
The `resolveCarouselSlides()` computation in OrganicDraftPreview shall be wrapped in `useMemo` with dependency on `draft.publishingAssets` and `draft.mediaSuggestion`. The carousel navigation callbacks shall use `useCallback`.

### FR-PT-003: Stable Callback References
The following inline callbacks shall be extracted to `useCallback`:
- `OrganicCalendarWorkspaceClient.tsx:466` — `bulkApprove` forEach updater
- `OrganicCalendarWorkspaceClient.tsx:526-527` — DragOverlay empty callbacks (extract to module-level constants)
- `CalendarDraftCard` — time update handler, selection handler

### FR-PT-004: React.memo for List Children
`TrendWorkbench` individual trend items and `OrganicListView` draft rows shall be wrapped in `React.memo` to prevent re-renders when sibling items change.

### FR-PT-005: Test Coverage — OrganicCalendarWorkspaceClient
The system shall have tests covering:
- View mode switching (week/month/list) updates URL and renders correct component
- Draft selection opens preview panel
- Generate button disabled when no placeholders exist
- Clear button removes all drafts for current week
- Week navigation changes displayed date range

### FR-PT-006: Test Coverage — CalendarToolbar
The system shall have tests covering:
- View mode toggle renders 3 buttons with correct `aria-pressed` states
- Progress bar renders when `slotProgress` is non-null
- Status banners render for `complete`, `complete_with_errors`, and `error` grid statuses
- Retry button calls `onRetryGeneration` in error states

### FR-PT-007: Test Coverage — DraftPreviewPanel
The system shall have tests covering:
- Panel renders when `selectedDraft` is non-null
- Panel does not render when `selectedDraft` is null
- "Open in AI Studio" button disabled when `brandProfileId` is missing
- Close button calls `onClose`

### FR-PT-008: Test Coverage — OrganicDraftPreview
The system shall have tests covering:
- Renders draft title, caption, and media
- Approve button calls `onApprove` with correct draft ID
- Platform preview switches between Instagram/LinkedIn views
- Carousel navigation works for multi-slide drafts

### FR-PT-009: Accessibility — Focus Management
When the DraftPreviewPanel opens, the system shall trap focus within the panel. Pressing Escape shall close the panel and return focus to the previously focused draft card. The panel shall have `role="complementary"` and `aria-label="Draft preview"`.

### FR-PT-010: Accessibility — Keyboard DnD
The system shall display a help tooltip on first keyboard drag activation: "Use arrow keys to move, Enter to drop, Escape to cancel." The tooltip shall persist in `localStorage` as dismissed after first view.

---

## Phase 4: Missing Workflows

### FR-MW-001: Draft Duplication with Day Picker
While viewing a draft card, when the user selects "Duplicate" from the context menu, the system shall open a popover showing the 7 days of the current week. When the user selects a target day and confirms, the system shall create a new draft with:
- All content fields copied (title, summary, caption, creative direction, hashtags, media suggestions)
- Status reset to `draft`
- Title suffixed with " (copy)"
- New UUID generated
- `scheduledDate` set to the selected target day
- `timeLabel` set to the next available time slot on the target day

### FR-MW-002: Duplicate — Cross-Week
Where the target day picker is open, when the user clicks a "Next week" / "Previous week" navigation arrow, the system shall shift the displayed 7 days and allow selection of a day in an adjacent week.

### FR-MW-003: Hashtag Management Panel
While viewing a draft in the preview panel, the system shall display a "Hashtags" section showing three tiers: High Competition, Medium Competition, Low Competition. Each tier shall render its hashtags as removable chips. A text input at the bottom shall allow adding new hashtags (auto-detecting tier based on a simple character-count heuristic or defaulting to Medium).

### FR-MW-004: Bulk Reschedule
While multiple drafts are selected (via shift+click), when the user clicks "Reschedule" in the bulk action toolbar, the system shall open a date range picker. On confirm, the system shall distribute the selected drafts evenly across the new date range, preserving relative time ordering.

### FR-MW-005: Draft Templates — Save
While viewing a draft, when the user selects "Save as template" from the context menu, the system shall persist the draft's content fields (title pattern, caption structure, format, platform, creative direction, hashtag tiers) as a named template in `localStorage` (keyed `continuum:organic:templates:v1`). Maximum 20 templates.

### FR-MW-006: Draft Templates — Apply
While creating a new placeholder or editing an existing draft, the system shall offer a "From template" option that displays saved templates in a dropdown. Selecting a template shall populate all content fields while preserving the draft's schedule and ID.

### FR-MW-007: Post Performance Link
While viewing a published draft in the preview panel, where an `instagram_post_id` exists, the system shall display a "View performance" link that navigates to the Metrics tab with the post pre-selected (via URL parameter `?postId={instagram_post_id}`).

### FR-MW-008: Shift+Click Discoverability
When the user hovers over a draft card while holding Shift, the system shall display a subtle checkbox overlay in the card's top-left corner. On first multi-select action, the system shall show a tooltip: "Hold Shift and click to select multiple posts."

---

## Phase 5: AI Studio Handoff Polish (from existing plan)

### FR-AS-001: Exit Animation
When the user clicks "Open in AI Studio", the system shall play a fade-out + scale-down animation (200ms, ease-out-quart) on the calendar workspace before navigating. Navigation shall occur on `onAnimationComplete`.

### FR-AS-002: Entry Interstitial
While the AI Studio loads with `source=organic-planner`, the system shall display a branded interstitial card (300ms) showing "Loading creative workspace..." with the brand logo before revealing the canvas. This bridges the light-to-dark theme transition.

### FR-AS-003: Return Breadcrumb
While the AI Studio was opened from the organic planner (`source=organic-planner`), the system shall display a persistent "Back to Planner" breadcrumb in the top navigation bar. Clicking it shall navigate back to `/organic?draftId={draftId}&weekStart={weekStartId}`.

### FR-AS-004: Scroll Position Preservation
When navigating to AI Studio from the planner, the system shall store the planner's scroll position in `sessionStorage`. When returning to the planner, the system shall restore the scroll position after the calendar renders.

---

## Phase 6: View & Card Animations (from existing plan)

### FR-AN-001: Draft Card Entrance Stagger
When a `slot_completed` event replaces a streaming placeholder with a final draft, the system shall animate the card entrance with `AnimatePresence`: fade-in (opacity 0 to 1) + subtle scale (0.97 to 1.0), staggered by 50ms per card index within the day column.

### FR-AN-002: Progress Bar Smoothing
The generation progress bar inner element shall use `transition: width 1s ease-out` to prevent jumpy width changes during streaming updates.

### FR-AN-003: View Mode Crossfade
The week/month/list view branches shall be wrapped in `AnimatePresence mode="wait"` with a 150ms crossfade transition (opacity only, no layout shift).

---

## Non-Functional Requirements

### Performance
- Drag ghost overlay shall render at 60fps with no jank
- Toast notifications shall appear within 100ms of the triggering event
- Draft duplication shall complete within 50ms (client-side only)
- Memoized components shall reduce re-render count by >50% in React DevTools profiler
- DragOverlay shall not cause layout shifts in the calendar grid

### Accessibility
- All interactive elements shall have `aria-label` or `aria-labelledby` attributes
- Focus trap in DraftPreviewPanel shall comply with WAI-ARIA dialog pattern
- Color-coded status indicators shall have text alternatives (not color-only)
- Keyboard drag-and-drop shall be operable via arrow keys + Enter/Escape
- All toasts shall be announced by screen readers via `role="status"` or `aria-live="polite"`

### Bundle Size
- No new runtime dependencies for Phases 1-4
- Draft templates stored in localStorage shall not exceed 500KB total
- Dynamic imports for month/list views (already implemented) shall keep initial bundle under 200KB for the planner route

### Testing
- Each new component shall have co-located `.test.tsx` file
- Each new hook shall have co-located `.test.ts` file
- Test coverage target for organic module: 60% component, 90% hook/store
- All acceptance criteria shall map to at least one test case

---

## Acceptance Criteria

### AC-IF-001: Drag Ghost Visible
Given a user on the week view with at least one draft,
When they begin dragging a draft card (8px activation threshold),
Then a semi-transparent clone of the card follows the cursor,
And the original card dims to 40% opacity.

### AC-IF-002: Drop Zone Highlighted
Given a drag operation is in progress,
When the cursor enters a valid day column,
Then the target slot shows a dashed border with brand-primary tint,
And all non-droppable zones dim to 40% opacity.

### AC-IF-003: Trend Seed Creates Toast
Given a user drags a trend from the sidebar onto Tuesday,
When the drop completes,
Then a placeholder draft is created in Tuesday's slots,
And a toast appears: "Placeholder created from '{trend title}'" with an Undo action,
And the placeholder card displays the trend title.

### AC-IF-004: Max Trend Selection Enforced with Feedback
Given 5 trends are already selected,
When the user clicks a 6th trend,
Then the selection does not change,
And a toast appears: "Maximum 5 trends selected. Deselect one to add another."

### AC-IF-005: Streaming Completion Notified
Given a draft is in `streaming` status,
When the generation completes and status changes to `draft`,
Then a toast appears: "Draft ready: {title}" with a "View" action,
And clicking "View" selects the draft and opens the preview panel.

### AC-ER-001: Inline Error on Failed Draft
Given a draft has `generationError` set,
When the calendar renders,
Then the error message appears on the card body (not hover-only),
And a red top-edge strip is visible,
And a "Retry" button is shown on the card.

### AC-ER-002: Publish Retry Works
Given a draft publish failed with a 500 error,
When the user clicks "Retry" on the toast or card,
Then the publish SSE stream restarts,
And the progress indicators resume from the beginning.

### AC-ER-003: AI Studio Handoff Quota Recovery
Given localStorage is nearly full,
When the user clicks "Open in AI Studio",
Then the system shows a toast "Preparing handoff... clearing old data",
And attempts progressive stripping,
And navigates to AI Studio if any attempt succeeds,
Or shows an error toast with "Copy link" fallback if all fail.

### AC-ER-004: Apply Response Confirmation
Given the user returns from AI Studio with edits,
When the apply response is detected in localStorage,
Then the draft is updated with the new assets/captions,
And a success toast appears: "Edits from AI Studio applied to '{title}'".

### AC-PT-001: Memoization Reduces Renders
Given the OrganicDraftPreview is open,
When the parent component re-renders without changing the selected draft,
Then `resolveCarouselSlides` does not recompute (verified via React DevTools profiler).

### AC-PT-002: CalendarToolbar Tests Pass
Given the CalendarToolbar test suite exists,
When `bun test CalendarToolbar` runs,
Then all tests pass covering: view mode toggle, progress bar, status banners, retry button.

### AC-PT-003: Focus Trapped in Preview
Given the DraftPreviewPanel is open,
When the user presses Tab repeatedly,
Then focus cycles within the panel (does not escape to the calendar behind),
And pressing Escape closes the panel and returns focus to the draft card.

### AC-MW-001: Draft Duplication with Day Picker
Given a user right-clicks a draft card,
When they select "Duplicate" from the context menu,
Then a popover appears showing the 7 days of the current week,
And selecting a day and clicking "Clone" creates a copy with reset status and " (copy)" suffix,
And the new draft appears in the target day's slots.

### AC-MW-002: Hashtag Tier Display
Given a draft has hashtags in high/medium/low tiers,
When the user views the draft in the preview panel,
Then three labeled sections display the hashtags as removable chips,
And adding a new hashtag appends it to the Medium tier by default.

### AC-MW-003: Bulk Reschedule
Given 3 drafts are selected via shift+click,
When the user clicks "Reschedule" in the bulk action toolbar,
Then a date range picker opens,
And confirming distributes the 3 drafts evenly across the new range.

### AC-MW-004: Save and Apply Template
Given a user saves a draft as a template named "Weekly Promo",
When they later create a new placeholder and select "From template" > "Weekly Promo",
Then the placeholder populates with the template's content fields,
And the schedule/ID remain unchanged.

### AC-AS-001: Exit Animation Plays
Given a user clicks "Open in AI Studio",
When the animation begins,
Then the calendar workspace fades out and scales down over 200ms,
And navigation to AI Studio occurs only after the animation completes.

### AC-AS-002: Return Breadcrumb Visible
Given the AI Studio was opened from the organic planner,
When the AI Studio loads,
Then a "Back to Planner" breadcrumb is visible in the top navigation,
And clicking it returns to `/organic` with the correct `draftId` and `weekStart` params.

### AC-AN-001: Card Entrance Stagger
Given generation is in progress,
When a `slot_completed` event fires,
Then the new draft card animates in with fade + scale over 200ms,
And multiple completions in the same day are staggered by 50ms.

---

## Error Handling

| Error Condition | Severity | Display | User Message |
|---|---|---|---|
| Generation stream disconnect | error | inline banner | "Generation interrupted. {N} of {M} completed. Retry?" |
| Publish 401 (token expired) | error | toast + link | "Instagram connection expired. Reconnect in Settings." |
| Publish 500 (transient) | warning | toast + retry | "Publishing failed. Retrying..." |
| Publish unknown error | error | toast | "Publishing failed: {message}" |
| AI Studio handoff quota exceeded | warning | toast | "Preparing handoff... clearing old data" |
| AI Studio handoff total failure | error | toast + fallback | "Unable to prepare handoff. Try closing other tabs." |
| Apply response malformed | error | toast | "Could not apply AI Studio edits. Try again." |
| Draft duplication failure | warning | toast | "Could not duplicate draft." |
| Template save exceeds limit | warning | toast | "Maximum 20 templates. Delete one to save a new template." |
| Template storage full | error | toast | "Storage full. Clear old templates in settings." |
| Bulk reschedule with past dates | warning | inline | "Cannot schedule posts in the past. Adjust your date range." |
| Network offline during drag | info | banner | "You're offline. Changes will sync when reconnected." |

---

## Implementation TODO

### Phase 1: Interaction Feedback
- [ ] Implement `DragGhostOverlay` component rendering cloned card at 0.6 opacity
- [ ] Add drop zone highlighting to `CalendarDndContext` / `TimeGridCanvas` via `useDndMonitor`
- [ ] Add invalid zone dimming via CSS class toggle on non-droppable columns
- [ ] Add toast on trend-to-calendar drop in `useCalendarDnD`
- [ ] Add duplicate trend drop detection and confirmation in `useCalendarDnD`
- [ ] Add streaming-to-draft toast in `useDraftGeneration` completion handler
- [ ] Add max-selection toast in `store.ts` `toggleTrend` or `TrendWorkbench`
- [ ] Add placeholder text and validation to time picker popover in `CalendarDraftCard`
- [ ] Update placeholder card styling with dashed border + "Awaiting generation" label

### Phase 2: Error Resilience
- [ ] Create `src/lib/organic/error-handling.ts` with `classifyOrganicError`
- [ ] Add inline error display to `CalendarDraftCard` for failed drafts (replace hover-only)
- [ ] Add retry button to failed draft cards
- [ ] Add retry mechanism to `usePublishDraft` with exponential backoff (max 2 retries)
- [ ] Add retry button to publish error toast
- [ ] Add handoff quota feedback in `useAiStudioHandoff` (toast during progressive stripping)
- [ ] Add handoff total failure fallback (copy link)
- [ ] Add apply response success toast in `useAiStudioHandoff`
- [ ] Add apply response malformation error handling
- [ ] Implement `withOptimisticUpdate` helper in `store.ts`
- [ ] Add empty state component for zero-draft calendar
- [ ] Enhance no-trends callout with reason detection (generating vs not started)

### Phase 3: Performance + Testing
- [ ] Wrap OrganicMetricsDashboard chart configs in `useMemo`
- [ ] Wrap Recharts components in `React.memo`
- [ ] Wrap `resolveCarouselSlides()` in `useMemo` in OrganicDraftPreview
- [ ] Extract inline callbacks to `useCallback` in OrganicCalendarWorkspaceClient
- [ ] Extract DragOverlay empty callbacks to module-level constants
- [ ] Wrap TrendWorkbench trend items in `React.memo`
- [ ] Wrap OrganicListView draft rows in `React.memo`
- [ ] Write `OrganicCalendarWorkspaceClient.test.tsx` (5 test cases minimum)
- [ ] Write `CalendarToolbar.test.tsx` (4 test cases minimum)
- [ ] Write `DraftPreviewPanel.test.tsx` (4 test cases minimum)
- [ ] Write `OrganicDraftPreview.test.tsx` (4 test cases minimum)
- [ ] Add focus trap to DraftPreviewPanel (Radix FocusScope or custom)
- [ ] Add Escape key handler to DraftPreviewPanel
- [ ] Add keyboard DnD help tooltip (localStorage-dismissed)
- [ ] Add missing `aria-label` attributes to CalendarDraftCard interactive spans

### Phase 4: Missing Workflows
- [ ] Add "Duplicate" option to CalendarDraftCard context menu
- [ ] Create `DuplicateDayPicker` popover component (7-day grid + week nav)
- [ ] Implement draft cloning logic in store (`duplicateDraft` action)
- [ ] Add hashtag tier display to OrganicDraftPreview
- [ ] Add hashtag add/remove interactions
- [ ] Add "Reschedule" option to BulkActionToolbar
- [ ] Create date range picker for bulk reschedule
- [ ] Implement bulk reschedule distribution logic in store
- [ ] Add "Save as template" to CalendarDraftCard context menu
- [ ] Create template storage module (`src/lib/organic/templates.ts`)
- [ ] Add "From template" dropdown to placeholder creation flow
- [ ] Add "View performance" link for published drafts with `instagram_post_id`
- [ ] Add shift+hover checkbox overlay on draft cards
- [ ] Add first-use multi-select tooltip

### Phase 5: AI Studio Handoff Polish
- [ ] Add exit animation (Framer Motion) before `router.push` in `useAiStudioHandoff`
- [ ] Add entry interstitial component in AIStudioClient when `source=organic-planner`
- [ ] Add "Back to Planner" breadcrumb in AI Studio top nav
- [ ] Store/restore scroll position in `sessionStorage`

### Phase 6: View & Card Animations
- [ ] Add `AnimatePresence` entrance to draft cards on `slot_completed`
- [ ] Add staggered delay (50ms * index) for same-day completions
- [ ] Add `transition: width 1s ease-out` to Progress bar inner element
- [ ] Wrap view mode branches in `AnimatePresence mode="wait"` with 150ms crossfade

---

## Out of Scope

- Multi-platform publishing (Instagram + LinkedIn simultaneously) — deferred per product direction
- Content approval workflows (pending_review, approved, rejected states) — nice to have, not now
- Server-persisted AI Studio handoff via Supabase table — tracked in existing plan Phase 3a, separate initiative
- Team collaboration features (comments, reviewer assignment)
- Twitter/X, TikTok, YouTube publishing integration
- Cross-post campaign grouping
- E2E test suite (Playwright/Cypress) — tracked separately
- OrganicMetricsDashboard decomposition (1,809 lines) — separate refactoring initiative

---

## Open Questions

- [ ] Should draft templates persist to Supabase instead of localStorage for cross-device access?
- [ ] Should the hashtag tier heuristic use follower count data (requires Instagram Graph API) or stay simple (character count)?
- [ ] Should bulk reschedule support cross-week distribution or only within the current visible week?
- [ ] Should the keyboard DnD tooltip use a coach mark (pointing at the card) or a floating notification?
- [ ] Should the "View performance" link on published drafts open Metrics in a new tab or navigate in-place?
- [ ] Is there a maximum number of drafts per day before the calendar should warn about over-scheduling?

---

## Delivery Phases & Priority

| Phase | Domain | Effort | Impact | Dependencies |
|---|---|---|---|---|
| 1 | Interaction Feedback | M | Very High | None |
| 2 | Error Resilience | M | Very High | None |
| 3 | Performance + Testing | M | High | Phases 1-2 (tests cover new code) |
| 4 | Missing Workflows | L | High | Phase 1 (DnD for templates) |
| 5 | AI Studio Handoff Polish | M | Medium | Phase 2 (error handling) |
| 6 | View & Card Animations | S | Medium | Phase 1 (card entrance) |

Phases 1 and 2 can be executed in parallel. Phase 3 depends on 1-2 being complete (tests cover the new code). Phase 4 is independent but benefits from Phase 1's DnD improvements. Phases 5-6 are polish layers.
