# Agents-ts Contract for Onboarding

This document is the contract the **agents-ts** backend repo must satisfy for the v2 onboarding flow in this repo to behave correctly. The frontend now validates each of these post-conditions and will surface a "Launch failed" toast (or mark a background job `error`) when the backend silently no-ops.

## Why this exists

The frontend used to mark the onboarding "done" the moment the SSE stream closed and the `approve` endpoint returned 200, without inspecting either response. As of the **Reliability A** changes (`src/lib/onboarding/agentClient.ts`, `src/components/onboarding/v2/state/agentPreview.ts`, `src/app/onboarding/actions.ts`), the frontend now refuses to lie about success. This means the backend must hold up its side of the contract or the user will see a real error instead of silent corruption.

---

## v3 (durable runs) — what the frontend now does

> **Live as of 2026-05-10.** The preview workflow is now durable + resumable. Closing the tab, refreshing, or losing network does not abort the work. Backend persists every event in `brand_profiles.preview_runs` + `preview_run_events`.

The frontend implements the four-endpoint contract:

1. **`POST /onboarding/brand-profiles/preview`** (mutation) — `runOnboardingPreview` in `src/lib/onboarding/agentClient.ts`. Captures the `X-Preview-Run-Id` response header (also surfaced via `onRunId` callback). Drops `X-Idempotency-Key` (server now dedups via input hash within a 60s window). Throws `PreviewRateLimitedError` with `retryAfterSeconds` on 429.
2. **`GET /onboarding/brand-profiles/preview/:runId`** (snapshot) — `fetchPreviewSnapshot(runId, { events? })`. Returns `null` on 404. Used to paint a `completed` run without opening an SSE.
3. **`GET /onboarding/brand-profiles/preview/:runId/events`** (resume SSE) — `resumeOnboardingPreview(runId, { lastEventId?, signal? })`. Sends `Last-Event-ID` header when `lastEventId > 0`. Sends `X-Onboarding-UX: rich` by default (override with `rich: false`).
4. **`GET /onboarding/brand-profiles/:brandId/preview/latest`** (discovery) — `fetchPreviewLatest(brandId)`. Returns `null` on 404. Includes `input_hash`.

### Mount-time decision tree (`src/components/onboarding/v2/OnboardingExperience.tsx`)

When the Brand DNA screen mounts and `agentPreview.status === "idle"`:

1. **Local `revealCache` hit?** Hydrate buckets immediately; emit `onboarding_reveal_cache_hit` telemetry. We persist `runId` + `inputHash` into the cache entry.
2. **Else discover:** call `fetchPreviewLatest(brandId)`.
3. **`latest.status === "running"`** → resume via `runAgentPreview({ resumeRunId: latest.run_id })`, which calls `resumeOnboardingPreview` under the hood.
4. **`latest.status === "completed"`** → `fetchPreviewSnapshot(latest.run_id)`, hydrate from `result`.
5. **No latest run, or `failed`/`partial`** → fall through to a fresh `runOnboardingPreview` POST.

### Input hash

`computePreviewInputHash({ payload, promptVersion })` mirrors backend's canonical input hash. The frontend implementation is **best-effort canonical SHA-256**: sorted object keys, undefined dropped, strict JSON for primitives, hash includes `rich: true` and `promptVersion`. If the hash mismatches the backend's, the worst case is "we miss the cache-hit-on-completed optimization and POST anyway" — backend's own 60s dedup window then catches the duplicate. Safe degradation, never wrong.

### Sequence numbers

The SSE consumer parses `id:` lines and exposes the highest seen sequence via the `onSequence(n)` callback. The agentPreview job runner doesn't currently persist this across page loads (server-side discovery + replay-from-zero is enough on remount), but the hook is in place for future cross-tab live-resume work.

### What we deliberately did NOT implement (yet)

- **Browser auto-reconnect with `Last-Event-ID`** within a single tab — requires either the EventSource polyfill or extra fetch+ReadableStream re-connect logic. For now: a mid-run network blip surfaces as "preview failed", and the user retries (which will spawn a fresh run after the 60s idempotency window or join the still-running one via discovery).
- **Polling endpoint 2 in tight loop** — explicitly forbidden by the contract; we use endpoint 3 for live data.

---

## Endpoints

### 1. `POST /onboarding/brand-profiles/preview` (SSE)

Streaming preview that produces voice / audience / business / website / **readiness** buckets while the user is on the Integrations screen.

#### Request body

```jsonc
POST /onboarding/brand-profiles/preview
Content-Type: application/json
Accept: text/event-stream
X-Onboarding-UX: rich               // OPTIONAL — opts into magical event grammar (see below)

{
  "brandProfile": { "id": "...", "brand_name": "...", "website_url": "..." },
  "runContext": {
    "user_id": "...",
    "brand_id": "...",
    "brand_name": "...",
    "created_at": "ISO8601",
    "platform_urls": ["https://..."],
    "integrated_platforms": ["meta", "google"],
    "brand_voice_tags": ["Bold", "Empathetic"],
    "integration_account_ids": []
  },
  "scrape": {                       // ADDED 2026-05 — optional, frontend sends when present
    "url": "https://...",
    "title": "string | null",
    "description": "string | null",
    "logoUrl": "string | null",
    "colors": ["#RRGGBB", ...],     // up to 5 dominant hex values, deterministic from CSS
    "typography": { "primary": "Inter | null", "secondary": "Geist Mono | null" }
  }
}
```

When `scrape` is **present**, the harness must:
- **Not re-fetch** the homepage HTML for primary metadata. May still fetch additional pages (about, pricing, blog) for richer LLM context.
- Treat the scrape's `colors` and `typography` as the **deterministic source of truth**. The `website` bucket palette/typography fields, if any, must echo these values verbatim — LLM passes must not contradict them.
- Use `scrape.title` / `scrape.description` / `scrape.logoUrl` to seed prompts and to fill `website.hero_statement` if the LLM website pass cannot find a stronger statement.

When `scrape` is **absent** (legacy callers, retries from a fresh session, server-side replays): backend behaves exactly as before — fetches the URL itself.

#### Required SSE event grammar

Each event uses the standard `event: <name>\ndata: <json>\n\n` framing.

| Event | When | Data shape |
|---|---|---|
| `event: data` | Each bucket lands | `{ "kind": "data", "section": "<section>", "data": <SectionPayload> }` |
| `event: stream` | Token-level streaming | `{ "kind": "stream", "section": "<section>", "delta": "..." }` |
| `event: status` | Section state transitions | `{ "kind": "status", "section": "<section>", "status": "running\|done\|error", "error": "..." }` |
| `event: complete` | End of run | `{ "kind": "complete", "phase": "preview", "status": "<status>", "result": <FinalResult> }` |
| `event: error` | Fatal error pre-stream | `{ "kind": "error", "message": "..." }` |

`<section>` is one of: `"brand_profile" | "voice" | "audience" | "website" | "business" | "readiness"`.

#### Critical: `complete.status` semantics

The frontend (`agentClient.ts:480`) **throws** unless `status` is one of: `"ok" | "success" | "done" | "completed" | "complete"`. Any other value (including `"error"`, `"skipped"`, `"partial"`, `""`, missing) marks the agent preview job as **failed**, which:

- Prevents `JobPersistor` from writing to `state.brand`
- Disables Launch until retry
- Toasts the user

If you genuinely succeeded, send `complete.status = "ok"`. If you partially succeeded but want the frontend to accept it, send `"ok"` and also emit a `status` event per failed section so the UI can render that section as degraded.

#### Critical: at least one bucket must populate

`runAgentPreview` (`src/components/onboarding/v2/state/agentPreview.ts:111`) **throws** if no bucket ever populated AND no stream content was emitted. An entirely silent run is treated as a failure even if `complete.status = "ok"`.

If you have no data to emit (e.g. scrape produced nothing usable), reject the request with HTTP 4xx **before** opening the SSE stream rather than streaming an empty success.

#### New `readiness` section (added 2026-05)

Emit one `event: data` with `section: "readiness"` after voice/audience/business/website complete:

```json
{
  "kind": "data",
  "section": "readiness",
  "data": {
    "overall_score": 72,
    "dimensions": {
      "value_proposition": { "score": 58, "rationale": "Hero reads as a feature list..." },
      "icp_clarity": { "score": 49, "rationale": "..." },
      "customer_pains": { "score": 72, "rationale": "..." },
      "success_metrics": { "score": 65, "rationale": "..." },
      "positioning": { "score": 64, "rationale": "..." },
      "messaging_coherence": { "score": 71, "rationale": "..." },
      "brand_identity": { "score": 84, "rationale": "..." }
    },
    "findings": [
      {
        "dimension": "icp_clarity",
        "score": 49,
        "severity": "medium",
        "headline": "ICP not clearly named",
        "detail": "Homepage uses 'teams' — too generic to anchor positioning.",
        "recommendation": "Name the segment in the hero (e.g. 'For B2B SaaS revops teams')."
      }
    ],
    "generated_at": "2026-05-09T17:32:11Z"
  }
}
```

Schema lives at `readinessAnalysisSchema` in `src/lib/onboarding/agentClient.ts:177`. Findings list = the lowest-scoring dimensions, severity-ranked (`<40 high`, `40-69 medium`, `≥70 low`). One LLM call after the existing passes complete is sufficient; reuse the same 30s timeout + structured-error envelope.

If readiness scoring fails, do **not** fail the whole stream — just omit the `readiness` event. The frontend renders the Brand DNA screen identically when readiness is absent.

#### Harness expectations (added 2026-05)

The `/preview` endpoint must:

1. **Run section workers in parallel inside one request.** Voice, audience, business, website all share the same scraped DOM + RAG context (brand_documents, brand_competitors, strategic embeddings). Run them with `Promise.all`. Readiness depends on all four — kick it after the others resolve.
2. **Emit each section's `data` event the moment that section completes.** Do not batch all four buckets into the final `complete` event. Streaming reveal is the whole point of the feature — the frontend updates the DNA grid live as buckets land.
3. **Emit `stream` events for prose sections** (voice, audience, business, website) at token-or-chunk granularity so the UI can show typing-style fill while the structured data is finalized. Streaming is optional per section but strongly preferred.
4. **Per-section try/catch.** A failure in one section emits `event: status` with `status: "error"` for that section and either omits the `event: data` or sends `data: null`. Other sections continue and the run still ends with `complete.status: "ok"` if at least one bucket populated. The frontend's at-least-one-bucket rule (`agentPreview.ts:117`) only fails when *every* section silently failed.
5. **Idempotency.** Same `(brand_id, scrape.url)` within a 60s window may short-circuit to the previous run's cached payload to avoid duplicate cost on user double-clicks. Hash the request body for the cache key.
6. **Hard timeouts.** 30s per LLM call (matches the edge-function pattern in `_shared/sseError.ts`). The whole preview must end within 90s — if not, send `complete.status: "partial"` (which the frontend rejects, surfacing a retryable error).
7. **`prompt_version`** (recommended). Include `complete.result.prompt_version: <int>` so the client cache can self-invalidate when backend prompts change without a frontend deploy. The frontend's `REVEAL_PROMPT_VERSION` constant is the current accepted version; bumping the backend integer with no frontend change still works (clients with old cache entries simply re-run).

#### Magical event grammar (optional, opt-in via header)

If frontend sends `X-Onboarding-UX: rich`, backend may emit:

| Event | Purpose | Example data |
|---|---|---|
| `event: data` `section: "first_impression"` | A 1-line brand-specific tagline emitted within ~1.5s of receiving the request, before the main passes complete. Lets the UI show real brand copy in the hero before the grid populates. | `{ "kind": "data", "section": "first_impression", "data": { "headline": "Linear, decoded — operator tooling for high-velocity teams." } }` |
| `event: spark` | Tiny progress signals during LLM work for the DNA progress pill. Frontend renders as transient chips. | `{ "kind": "spark", "section": "voice", "label": "Detected 5 personality adjectives" }` |

These are **opt-in and best-effort**. The frontend renders them when present, ignores them when absent. Backend should not emit them when the header is missing — keeps default payload small.

### 2. `POST /onboarding/brand-profiles/approve`

Called from `approveAndLaunchOnboardingAction` on Launch.

#### Required response

```json
{
  "brand_profile": {
    "id": "<uuid matching the request brandProfile.id>",
    "brand_name": "<non-empty string>",
    "description": "...",
    "brand_voice": { ... },
    "target_audience": { ... },
    "website_url": "..."
  }
}
```

The frontend (`agentClient.ts:632`) now throws if:
- `brand_profile.id` is missing or empty
- `brand_profile.brand_name` is missing or empty
- `brand_profile.id` does not equal the `brandProfile.id` we sent

This is a hard contract. If approve cannot persist the brand profile (DB error, validation failure, upstream LLM unavailable), return HTTP 5xx — do **not** return 200 with an empty stub.

### 3. `POST /onboarding/strategic-analyses/run`

Now **awaited** (was fire-and-forget). Frontend (`actions.ts:79`) blocks the Launch action until this returns.

#### Required response

Within 5 seconds, return:

```json
{ "run_id": "...", "task_id": "...", "status": "queued" }
```

Any of `run_id`, `task_id`, `status` is acceptable; presence of any one signals "we accepted the work." The actual analysis can run async on your side.

The frontend now also forwards two new fields in the request body:

```json
{
  "brand_id": "...",
  "readiness_score": 72,
  "readiness_findings": [ <ReadinessFinding>, ... ]
}
```

Use these to seed the Brand Profile brief before the strategic analysis pass.

---

## Failure modes the frontend now catches

| Backend behavior | Old result | New result |
|---|---|---|
| `complete.status = "error"` with empty stream | Marked done, empty state persisted | Marked error, no persist, toast on Launch |
| Approve returns `{}` | Marked done, downstream confused | Throws, "Launch failed" toast, Launch retried |
| Approve returns wrong `brand_profile.id` | Wrong brand wired | Throws, mismatch surfaced |
| Strategic analysis endpoint hangs or 5xx | Onboarding completed silently | Launch action blocks, user sees error |
| SSE stream closes with no events | `agentPreview` marked done, brand state cleared | Throws, marked error |
| JobPersistor writes empty patch | `brand` fields wiped to `undefined` | Patch dropped if every value is empty |
| Backend re-fetches site despite `scrape` in body | Wasted ~1–3s, duplicate I/O | Backend must skip homepage refetch when `scrape` present |

---

## Per-section response schemas

The TypeScript zod schemas in `src/lib/onboarding/agentClient.ts` are the **canonical contract**. Backend teams should regenerate types from these (or hand-mirror them). Each section's `event: data` payload must validate against the corresponding schema or the frontend `runOnboardingPreview` throws on parse.

| Section | Source-of-truth schema | File |
|---|---|---|
| `brand_profile` | `agentBrandProfileSchema` | `src/lib/onboarding/agentClient.ts` |
| `voice` | `brandVoiceSchema` | `src/lib/onboarding/agentClient.ts` |
| `audience` | `targetAudienceSchema` | `src/lib/onboarding/agentClient.ts` |
| `website` | `websiteSummarySchema` (nullable) | `src/lib/onboarding/agentClient.ts` |
| `business` | `businessSummarySchema` (nullable) | `src/lib/onboarding/agentClient.ts` |
| `readiness` | `readinessAnalysisSchema` | `src/lib/onboarding/agentClient.ts` |

---

## Client-side reveal cache

The frontend caches successful preview runs in `sessionStorage` via `useBrandProfileRevealCache` (`src/lib/onboarding/revealCache.ts`). Cache key = `${brandId}::${normalizedUrl}::v${REVEAL_PROMPT_VERSION}`. TTL: 24h. Behavior:

- **Cache hit on Brand-DNA mount** → frontend hydrates `agentPreview` job from cache; **no SSE call is made**.
- **Cache write** → only when `complete.status` is in the terminal-OK set AND a scrape was passed in. Failed/partial runs do not poison the cache.
- **Cache invalidation** → on Launch (post-approve), on Start Over, and on URL change.

Backend teams: when bumping prompt logic in a way that changes section payloads materially, also bump `complete.result.prompt_version`. Frontend can be updated to honor the new integer in a follow-up; old clients will simply continue using their cached entries until 24h TTL expires.

---

## Integration grant resolution (BPIA)

> **Frontend-side state of the world (live since 2026-05-10):** every brand's connected accounts are gated by a row in `brand_profiles.brand_integration_grants`. The grant is per-`(brand_profile_id, integration_id)` — one row per OAuth connection per brand. Asset-level granularity lives in `brand_profile_integration_accounts` (BPIA) which references `integration_accounts_assets.id`.

When agents-ts processes any of the following:
- A `runOnboardingPreview` request with `runContext.integration_account_ids`
- A `approveOnboardingBrandProfile` request with non-empty `runContext.integration_account_ids`
- A strategic-analysis run for a brand
- Any other token-requiring per-brand operation

…it MUST resolve OAuth tokens via `brand_profiles.get_brand_integration_token(brand_id, provider)` (returns the decrypted access token). **Never query `user_integrations` directly from a brand context** — that bypasses the grant gate and will silently expose tokens for integrations the user has not granted to the brand.

Per-asset filtering should use `get_brand_integration_summary(brand_id)` (RPC defined in `supabase/migrations/20260507120000_brand_summary_from_grants.sql`). The summary RPC requires an active row in `brand_integration_grants` and joins forward to BPIA + `integration_accounts_assets`. If a `runContext.integration_account_id` is not present in the summary, treat it as un-granted: skip it, log it, and DO NOT throw — the user may have revoked between request build and execution.

**Triggers maintained by the frontend (no backend action required):**
- `bpia_ensure_grant` (after-INSERT on BPIA): auto-creates the active grant. Means a fresh BPIA insert is sufficient — the grant pops into existence atomically.
- `bpia_revoke_grant_on_last_asset_delete` (after-DELETE on BPIA): soft-revokes the grant when the last asset for an integration is removed. Means agents-ts can trust that "no grant ⇒ user wants no access" without consulting BPIA counts.

If agents-ts ever inserts BPIA rows itself (e.g., asset auto-discovery during `approve`), use `assignBrandIntegrationAccount` semantics: insert the BPIA row with `integration_account_id` and let the trigger handle the grant. Do not insert directly into `brand_integration_grants` — the unique partial index `(brand_profile_id, integration_id) where revoked_at is null` will conflict on race.

## Operational guidance

- **Logging.** Each handler should log `{ function, request_id, brand_id, user_id, error_code }`. The frontend already logs `runId` / `taskId` at info level on success — match that on the backend so we can pivot per onboarding session.
- **Timeouts.** All upstream LLM calls inside agents-ts must have a ceiling (suggest 30s like the edge functions). A hung LLM should surface as `complete.status` ≠ ok, not as a stalled stream.
- **Idempotency.** Approve must be safe to retry — the frontend will resubmit on toast → user-tap → Launch. Frontend now sends `X-Idempotency-Key` on both `/preview` and `/approve` (per-launch UUID for approve, deterministic `preview:${brandId}:${url}` for preview). Backend must dedupe on this key within the documented 60s window.

---

## Changelog

- **2026-05-09** — Initial doc. Codifies the post-`Reliability A` contract; adds the `readiness` section spec.
- **2026-05-10** — Added preview-request `scrape` passthrough, harness-expectations section, magical event grammar (first_impression, spark), per-section schema table, client-side reveal cache contract.
- **2026-05-10** — Backend v2 live (`prompt_version: 1`). Frontend now sends `X-Onboarding-UX: rich`, parses `first_impression` + `spark` events, surfaces first-impression headline in BrandDnaScreen hero, surfaces latest spark label in DnaProgressPill, and accepts `understanding` / `audits` / `prompt_version` in `complete.result` (typed as passthrough until consumed).
- **2026-05-10** — `understanding` + `audits` now persisted to `brand_profiles.user_onboarding_states.state.brand`. Frontend sends `X-Idempotency-Key` on preview + approve. Added BPIA grant resolution section (token retrieval contract).
- **2026-05-10** — Backend v3 (durable runs). Frontend implements 4-endpoint contract: discovery → resume / snapshot / fresh POST. Added `fetchPreviewLatest`, `fetchPreviewSnapshot`, `resumeOnboardingPreview`, `computePreviewInputHash`, `PreviewRateLimitedError`. `runOnboardingPreview` exposes `X-Preview-Run-Id` via header capture + `onRunId` callback. SSE `id:` lines parsed for sequence (`onSequence`). **Removed** `X-Idempotency-Key` from preview request — backend dedups via input hash + 60s window. Reveal cache extended with `runId` + `inputHash`.
