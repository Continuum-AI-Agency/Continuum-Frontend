# Organic Planner — Backend Hardening Spec

**Context:** The organic planner currently stores all draft content (calendar days, slots, backlog drafts) in-memory via a Zustand store. The frontend has been hardened to persist this state to `sessionStorage` so it survives hard navigation within a tab. The next layer is a Supabase-backed session that makes draft content durable across devices, browser restarts, and tabs.

---

## 1. New Table: `organic_draft_sessions`

Stores the planner's current draft state per brand per user per week. This is the "working draft" — not the final published content plan.

```sql
create table brand_profiles.organic_draft_sessions (
  id           uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null
    references brand_profiles.brand_profiles(id) on delete cascade,
  user_id      uuid not null
    references auth.users(id) on delete cascade,
  week_start_id text not null,
  -- e.g. "2026-04-07" — ISO date of the Monday that starts the week.
  -- Always the Monday, regardless of locale week start.

  days         jsonb not null default '[]',
  -- OrganicCalendarDay[] — full day/slot tree for this week.
  -- Drafts with status "placeholder" | "draft" | "scheduled" | "error".

  backlog_drafts jsonb not null default '[]',
  -- OrganicCalendarDraft[] — drafts in the backlog queue.

  saved_at     timestamptz not null default now(),

  unique(brand_profile_id, user_id, week_start_id)
);

-- Index for the common read path (load session for a user+brand+week).
create index on brand_profiles.organic_draft_sessions
  (brand_profile_id, user_id, week_start_id);
```

### RLS Policies

```sql
alter table brand_profiles.organic_draft_sessions enable row level security;

-- Users can only read their own sessions.
create policy "organic_draft_sessions_select"
  on brand_profiles.organic_draft_sessions for select
  using (user_id = auth.uid());

-- Users can insert/update their own sessions.
create policy "organic_draft_sessions_upsert"
  on brand_profiles.organic_draft_sessions for insert
  with check (user_id = auth.uid());

create policy "organic_draft_sessions_update"
  on brand_profiles.organic_draft_sessions for update
  using (user_id = auth.uid());

-- No delete — sessions are cheap; let them age out via a cleanup job.
```

---

## 2. API Endpoints Required

### `GET /api/organic/draft-session`

Load the saved draft session for the current user, brand, and week.

**Query params:**
- `brandProfileId: string`
- `weekStartId: string` (ISO date, e.g. `"2026-04-07"`)

**Response:**
```typescript
{
  days: OrganicCalendarDay[];
  backlogDrafts: OrganicCalendarDraft[];
  savedAt: string;  // ISO timestamp
} | null  // null when no session exists yet
```

**When to call:** On organic planner mount, only when `days.length === 0` in the Zustand store (i.e., sessionStorage is also empty — fresh tab, new device, or cleared storage).

---

### `POST /api/organic/draft-session`

Upsert the draft session for the current user + brand + week.

**Body:**
```typescript
{
  brandProfileId: string;
  weekStartId: string;
  days: OrganicCalendarDay[];
  backlogDrafts: OrganicCalendarDraft[];
}
```

**Response:** `{ savedAt: string }`

**When to call:** Debounced — 3 seconds after any change to `days` or `backlogDrafts` in the store. Use a ref to track the pending timer and cancel it on unmount.

**Important:** Strip `assetBase64` from `mediaSuggestion` before sending — store only `assetUrl`. The base64 field is a client-side rendering optimisation only.

---

## 3. Frontend Hook: `useOrganicDraftSession`

Create `src/components/organic/hooks/useOrganicDraftSession.ts`:

```typescript
// Loads from Supabase when the store is empty; saves on change.
export function useOrganicDraftSession({
  brandProfileId,
  weekStartId,
  calendarDays,
  backlogDrafts,
}: {
  brandProfileId: string | undefined;
  weekStartId: string;
  calendarDays: OrganicCalendarDay[];
  backlogDrafts: OrganicCalendarDraft[];
}) {
  const { setDays, addBacklogDraft } = useCalendarStore(...);
  const storeIsEmpty = calendarDays.length === 0
    || calendarDays.every((d) => d.slots.length === 0);

  // Load once on mount when the store is empty.
  const { data: savedSession } = useQuery({
    queryKey: ['organic-draft-session', brandProfileId, weekStartId],
    queryFn: () => fetchDraftSession(brandProfileId!, weekStartId),
    enabled: !!brandProfileId && storeIsEmpty,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!savedSession || !storeIsEmpty) return;
    if (savedSession.days.length > 0) {
      setDays(savedSession.days);
    }
    savedSession.backlogDrafts.forEach((d) => addBacklogDraft(d));
  }, [savedSession]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced save on change — only when populated.
  useEffect(() => {
    if (!brandProfileId || storeIsEmpty) return;
    const timer = setTimeout(() => {
      saveDraftSession({ brandProfileId, weekStartId, days: calendarDays, backlogDrafts });
    }, 3000);
    return () => clearTimeout(timer);
  }, [calendarDays, backlogDrafts, brandProfileId, weekStartId]);
}
```

Mount this hook inside `OrganicCalendarWorkspaceClient` alongside the existing `useAiStudioHandoff`.

---

## 4. Session Conflict Resolution (Multi-Tab Safety)

When the same user has the organic planner open in two tabs and both are saving, the last write wins (upsert on `unique(brand_profile_id, user_id, week_start_id)`). This is acceptable for the current use case.

For stricter multi-tab safety, add a Supabase Realtime subscription on the `organic_draft_sessions` table. When another tab saves a newer session (`saved_at` is after the current tab's last load), show a non-blocking toast:

> "Another tab updated your planner. Reload to see the latest?"

Do NOT auto-merge — the user should decide. Merging two divergent draft states is lossy.

```typescript
supabase
  .channel(`organic-draft-session:${brandProfileId}:${userId}:${weekStartId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'brand_profiles',
    table: 'organic_draft_sessions',
    filter: `brand_profile_id=eq.${brandProfileId}`,
  }, (payload) => {
    const remoteSavedAt = new Date(payload.new.saved_at);
    if (remoteSavedAt > localLastSavedAt) {
      showToast({ title: "Planner updated in another tab", ... });
    }
  })
  .subscribe();
```

---

## 5. Cleanup Job

Draft sessions are cheap but should be pruned. Add a Supabase scheduled function (pg_cron or Edge Function with cron trigger) to delete sessions older than 30 days:

```sql
-- Run weekly
delete from brand_profiles.organic_draft_sessions
where saved_at < now() - interval '30 days';
```

---

## 6. Data Shape Notes for Backend

- `days` is `OrganicCalendarDay[]` — each day has `id`, `label`, `dateLabel`, `slots: OrganicCalendarDraft[]`, and `suggestedTimes`.
- `OrganicCalendarDraft` fields relevant for persistence: `id`, `title`, `summary`, `captionPreview`, `status`, `platforms`, `format`, `timeLabel`, `dateLabel`, `mediaCount`, `publishingAssets` (excluding `assetBase64`), `seedTrendId`, `targetAccountId`, `creativeDirectionPrompt`, `thumbnailPrompt`.
- **Do NOT persist:** `mediaSuggestion.assetBase64`, `generationStage`, `generationAttempts`, `generationError`, `progress` (ephemeral generation state).
- The backend should validate the JSON shape with a Zod schema before writing — use the same schema already defined in `src/lib/organic/types.ts`.

---

## Priority Order

| Step | What | Owner |
|------|------|-------|
| 1 | Create `organic_draft_sessions` table + RLS | Backend |
| 2 | `GET /api/organic/draft-session` endpoint | Backend |
| 3 | `POST /api/organic/draft-session` endpoint | Backend |
| 4 | `useOrganicDraftSession` hook + wire into client | Frontend |
| 5 | Multi-tab Realtime subscription | Frontend |
| 6 | Cleanup cron job | Backend |
