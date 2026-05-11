# Onboarding ↔ Agent Flow: Capability Gap Analysis

This document inventories everything the onboarding agent service produces, everything the v2 onboarding UI surfaces and persists, and the gaps between the two — including what's needed to round out a "Brand Guidelines" experience downstream.

Source files:
- Agent SSE schema: `src/lib/onboarding/agentClient.ts`
- Agent payload mapping: `src/lib/onboarding/mapping.ts`
- Persisted shape: `src/lib/onboarding/state.ts` (Zod, JSON in `user_onboarding_states.metadata`)
- DB-backed brand row: `brand_profiles` (columns: `id`, `brand_name`, `logo_path`, `tier`, `completed_at`, `created_by` — no DNA columns today)

---

## 1. What the agent produces

The `runOnboardingPreview` SSE stream emits these structured payloads. Each is parsed with a Zod schema in `agentClient.ts`.

### 1.1 `brand_profile` (`AgentBrandProfile`)
| Field | Type | Source schema |
|---|---|---|
| `id` | string | required |
| `brand_name` | string | required |
| `description` | string | optional |
| `brand_voice` | nested `BrandVoice` | optional |
| `target_audience` | nested `TargetAudience` | optional |
| `website_url` | string | optional |

### 1.2 `voice` (`BrandVoice`)
| Field | Type |
|---|---|
| `tone` | string |
| `voice_style` | string |
| `key_messaging` | string[] |
| `keywords` | string[] |
| `emoji_usage` | string |
| `mission` | string |
| `vision` | string |
| `core_values` | string[] |

Plus a streaming `delta` channel of free-form prose per section.

### 1.3 `audience` (`TargetAudience`)
| Field | Type |
|---|---|
| `summary` | string |
| `demographics` | string[] |
| `psychographics` | string[] |
| `behaviors` | string[] |
| `motivations` | string[] |
| `pain_points` | string[] |
| `goals` | string[] |
| `challenges` | string[] |
| `solutions` | string[] |
| `benefits` | string[] |
| `interests` | string[] |
| `buying_criteria` | string[] |
| `other` | string[] |

### 1.4 `business` (`BusinessSummary`, passthrough)
| Field | Type |
|---|---|
| `business_name` | string |
| `business_description` | string |
| `business_features` | string[] |
| `business_benefits` | string[] |
| `business_cta` | string |

### 1.5 `website` (`WebsiteSummary`)
| Field | Type |
|---|---|
| `website_url` | string |
| `hero_statement` | string |

### 1.6 `documents` (`DocumentsSummary`)
| Field | Type |
|---|---|
| `primary_topics` | string[] |
| `secondary_topics` | string[] |
| `notes` | string |

### 1.7 `connected_accounts` (`PlatformAgentResult[]`, passthrough)
Per-platform results — shape depends on the integration. Includes `provider` and arbitrary nested data.

### 1.8 Local scrape (`/api/onboarding/scrape`)
Not from the agent — extracted client-side from the URL HTML.
| Field | Type |
|---|---|
| `title` | string ⇒ used as initial brand name |
| `description` | string |
| `logoUrl` | string (favicon or og:image) |
| `colors` | string[] (top-5 frequent CSS colors) |
| `typography` | `{ primary, secondary }` (font-family declarations) |

---

## 2. What v2 onboarding actually surfaces / persists

### 2.1 Persisted to `user_onboarding_states.metadata` (Zod-validated)
Schema at `state.ts:64-93`. Every field below survives a refresh.

| Field | Source | Notes |
|---|---|---|
| `brand.name` | scrape `title` (first), user edit | EditableHeading on DNA screen |
| `brand.website` | URL screen submit | Triggers all jobs |
| `brand.logoPath` | scrape `logoUrl` | Rendered via `LogoSlot` |
| `brand.colors[]` | scrape `colors` | `ColorSwatch` strip |
| `brand.typography` | scrape `typography` | `FontSample` x2 |
| `brand.brandVoice` | derived from `voice.voice_style + tone + mission` | EditableProse |
| `brand.brandVoiceTags` | user-curated (`TonePicker`) | Independent of agent |
| `brand.targetAudience` | `audience.summary` | EditableProse |
| `brand.overview` | `business.business_description` ⤳ scrape `description` | EditableProse |
| `brand.tagline` | `website.hero_statement` ⤳ `business.business_cta` | Display only on DNA |
| `brand.values[]` | `voice.core_values` | Display chips |
| `connections.{platform}.connected` | OAuth callback | Set after popup closes |
| `completedAt` | `approveAndLaunchOnboardingAction` | Gates dashboard access |

### 2.2 Surfaced live (in-memory only — lost on refresh)
The full agent payload lives on `BackgroundJobsProvider.jobs.agentPreview.data` as `AgentPreviewBuckets`. The DNA screen reads it for richer rendering.

| Surface | Field rendered | Persists? |
|---|---|---|
| **Voice card** — Tone / Style / Emoji chips | `voice.{tone, voice_style, emoji_usage}` | ❌ in-memory |
| **Voice card** — Mission paragraph | `voice.mission` | ❌ |
| **Voice card** — Vision paragraph | `voice.vision` | ❌ |
| **Voice card** — Core values chips | `voice.core_values` | ✅ → `brand.values` |
| **Voice card** — Keywords chips | `voice.keywords` | ❌ |
| **Voice card** — Key messaging bullets | `voice.key_messaging` | ❌ |
| **Audience card** — Demographics list | `audience.demographics` | ❌ |
| **Audience card** — Psychographics list | `audience.psychographics` | ❌ |
| **Audience card** — Pain points / Goals / Buying criteria / Interests | `audience.{pain_points, goals, buying_criteria, interests}` | ❌ |
| **Overview card** — Features / Benefits chips | `business.{business_features, business_benefits}` | ❌ |
| **Identity card** — Hero statement quote | `website.hero_statement` | ✅ → `brand.tagline` |
| **Processing screen** — live streaming voice/audience/business prose | `*Stream` buffers | ❌ in-memory |

### 2.3 Channel state (post-launch)
| Surface | Field |
|---|---|
| Tour final stop | `data-tour-id="brand-trends"` on `BrandTrendsPanel` (post-launch) |
| Strategic analysis kickoff | `runStrategicAnalysisServer(brandId)` fired post-launch |

---

## 3. Gaps

### 3.1 Persistence gaps (data shown but lost on refresh)

The biggest gap is that **most of the agent's structured output never reaches the database**. If a user refreshes the DNA screen 30 minutes later, they lose:
- `voice.{tone, voice_style, mission, vision, keywords, key_messaging, emoji_usage}`
- `audience.{demographics, psychographics, behaviors, motivations, pain_points, goals, challenges, solutions, benefits, interests, buying_criteria}`
- `business.{business_features, business_benefits}`
- `documents.*` (we don't even render these yet)

The `OnboardingState.preview` field exists in the Zod schema (`state.ts:121-132`) and is designed to hold the full `OnboardingPreviewWorkflowResult`. **It is not currently being written.** Two-line fix: in `JobPersistor`, on `agentPreview.status === "done"`, also write `preview: { completedAt, payload: result }`. That gets the rich data into the JSON column and the next refresh restores everything.

### 3.2 `brand_profiles` schema gaps

`brand_profiles` only has `brand_name`, `logo_path`, `tier`, `completed_at`, `created_by`. The agent flow produces a full Brand Guidelines payload but it never gets first-class columns. Anything that reads `brand_profiles` directly (dashboard summaries, sidebar pill, AI Studio prompt seeds) sees nothing about voice, audience, palette, typography.

**Recommended migration** (see `docs.md` patterns elsewhere in the repo):
```sql
ALTER TABLE brand_profiles
  ADD COLUMN colors            jsonb DEFAULT '[]',
  ADD COLUMN typography        jsonb DEFAULT '{}',
  ADD COLUMN brand_voice       jsonb DEFAULT '{}',  -- full BrandVoice nested
  ADD COLUMN target_audience   jsonb DEFAULT '{}',  -- full TargetAudience nested
  ADD COLUMN business_summary  jsonb DEFAULT '{}',  -- full BusinessSummary
  ADD COLUMN website_summary   jsonb DEFAULT '{}',
  ADD COLUMN tagline           text,
  ADD COLUMN overview          text,
  ADD COLUMN core_values       jsonb DEFAULT '[]',
  ADD COLUMN keywords          jsonb DEFAULT '[]';
```
Then update `ensureBrandProfileRecord` (`storage.ts:103-108`) to write these columns at completion time.

### 3.3 Strategic analysis context gap

`runStrategicAnalysisServer(brandId)` is fire-and-forget at `actions.ts:137-141` and the analysis presumably reads `brand_profiles` (or re-queries onboarding state). With the data only living in JSON, the agent can't easily key off `brand_voice.core_values`, `audience.pain_points`, etc. for downstream prompts. Migration above unblocks that.

### 3.4 Brand Guidelines surface — not built yet

There is no Brand Guidelines page that consumes this data. The onboarding produces a complete guideline-grade dataset (palette, type, voice, mission, vision, values, audience), but it has no home in the rest of the app. **Suggested path**:

1. Add `/settings/brand-dna` (or similar) that renders the same `BrandDnaScreen` cards but pulls from the persisted `state.preview.payload` + `brand_profiles` columns.
2. Reuse the same edit affordances (`EditableHeading`, `EditableProse`, `TonePicker`, etc.).
3. Add a "Regenerate from URL" affordance that re-runs `runOnboardingPreview`.
4. Export the current Brand DNA as a PDF / markdown brief (good shareable artifact for designers / agencies).

### 3.5 Documents stream — surfaced nowhere

`runOnboardingPreview` returns `documents.{primary_topics, secondary_topics, notes}`, but onboarding does not collect or display documents in v2 (we removed the `DocumentUploader` step from the new flow). Either:
- Keep `DocumentUploader` parked in `src/components/onboarding/shared/` for the Settings → Knowledge tab (already there per recent Settings rebuild), and let the agent consume those.
- Or surface a one-line "topics we found" chip-row on the Brand DNA screen.

### 3.6 Trends pre-warm not wired in v2

Plan called for `process-brand-insights` to fire on URL submit so trends are warm by the time the dashboard tour reaches its final stop. Currently the only trends call is the post-launch `runStrategicAnalysisServer` which is async / fire-and-forget. Action: add a `trendsPrewarm` job runner alongside `scrape` and `agentPreview`, kick from `handleUrlSubmit`. (Job key already reserved in `BackgroundJobsProvider`.)

### 3.7 OAuth → integration assignment gap

The new IntegrationsScreen sets `connections.{platform}.connected = true` after popup close, but **does not call `syncIntegrationAccountsAction`** (the function that reads back `user_integrations` rows and binds them to the brand). Account-level binding happens later in Settings. Trade-off:
- ✅ Simpler v1 UX — user sees "Connected" immediately.
- ⚠️ `mapOnboardingStateToAgentPayload` can return empty `integration_account_ids`, so the strategic analysis sees no actual ad accounts attached on first launch.

For v1 this is acceptable; the dashboard will show data once the user binds accounts in Settings.

### 3.8 Voice tags vs voice schema duplication

`brand.brandVoiceTags` (user-curated enum from `BRAND_VOICE_TAGS`) and `voice.tone` / `voice.voice_style` (agent-extracted prose) are independent. The Tone of Voice card on DNA only edits the curated enum tags, not the agent's prose extraction. Acceptable for v1 — but a follow-up could either merge them or surface both side-by-side ("Continuum thinks: bold + technical · You curated: Professional, Innovative").

---

## 4. Quick-win priority list

1. **Persist `state.preview`** (2-line `JobPersistor` change, no schema change) — eliminates the refresh-loses-rich-DNA gap. **Land this immediately.**
2. **Add brand_profiles columns + `ensureBrandProfileRecord` writes** — unblocks downstream surfaces & strategic analysis.
3. **Build `/settings/brand-dna`** — gives the Brand Guidelines a permanent home; reuses 90% of v2 components.
4. **Wire `trendsPrewarm` job** — closes the dashboard tour loop ("Try it now with your trends!").
5. **Brand Guidelines export** (PDF / markdown) — high-leverage artifact for design / agency workflows.

## 5. What we capture today vs what a Brand Guidelines doc usually contains

| Brand Guidelines section | Captured? | Where |
|---|---|---|
| Logo (primary) | ✅ scrape | `brand.logoPath` |
| Logo variants (mono, inverted, lockups) | ❌ | Future: extend Logo upload |
| Color palette (primary) | ✅ scrape | `brand.colors[]` |
| Color palette (secondary, neutrals, semantic) | ⚠️ partial — only top 5 frequent | Need LLM curation pass |
| Typography (primary, secondary) | ✅ scrape | `brand.typography` |
| Typography scale (h1, h2, body, caption) | ❌ | Future |
| Voice & tone — descriptors | ✅ agent | `voice.tone`, `voice.voice_style` |
| Mission | ✅ agent | `voice.mission` |
| Vision | ✅ agent | `voice.vision` |
| Core values | ✅ agent | `voice.core_values` |
| Key messages / taglines | ✅ agent | `voice.key_messaging`, `business.business_cta`, `website.hero_statement` |
| Keywords / SEO terms | ✅ agent | `voice.keywords` |
| Emoji usage policy | ✅ agent | `voice.emoji_usage` |
| Target audience — segments | ✅ agent | `audience.demographics`, `psychographics` |
| Target audience — pain points / goals / motivations | ✅ agent | `audience.{pain_points, goals, motivations}` |
| Buying criteria | ✅ agent | `audience.buying_criteria` |
| Product / service description | ✅ agent | `business.business_description` |
| Features | ✅ agent | `business.business_features` |
| Benefits | ✅ agent | `business.business_benefits` |
| Imagery / photography style | ❌ | Future: scrape og:image patterns + LLM analysis |
| Iconography style | ❌ | Future |
| Spacing / grid system | ❌ | N/A — out of scope |
| Motion / animation principles | ❌ | Future |
| Voice examples (do / don't) | ❌ | Future: ask agent for example pairs |
| Competitor positioning | ❌ | Future: separate agent endpoint |
| Channel-specific guidelines | ❌ | Future: post-integration |

The agent flow already produces ~70% of a typical Brand Guidelines doc. Closing the persistence + surfacing gaps in this document gets the rest into the user's hands.
