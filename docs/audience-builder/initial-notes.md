# Audience Builder – initial notes (Dec 11, 2025)

## Goal
Ship “Unified Audience Objects” that a brand can save as presets and reuse across Continuum. Each preset must be:
- **Dual-layer**: psychographic (creative) + targeting (ad API–ready).
- **Interoperable**: mappable to Meta Marketing API (ad set `targeting` spec) and Google Ads API (audience/ReachPlan/Performance Max).
- **Data-rich**: backed by embeddings from our `ad_targeting` corpus and prior performance signals.
- **Hot & ready**: instantly usable for creative generation, DCO ad sets, and campaign nodes.

## UI primitives (new folder: `src/components/paid-media/audience-primitives/`)
- `AudienceLayerBadge` – shows which layer(s) are present: psychographic, targeting, platform overrides.
- `CompatibilityCallout` – highlights Meta/Google compatibility, warnings, or deprecations (e.g., Meta interest removals).
- `ReachBadge` – displays lower/upper bound reach (Meta), coverage/index (Google Ads Insights), and viability status.
- `LookalikeToggle` – 1–5% expansion control with seed validity messaging.
- `PromptPreviewCard` – renders deterministic creative prompt built from `psychographic_layer`.
- `TargetingSummaryList` – SSR summary of geo/age/interests/behaviors/devices and per-platform overrides.
- `PayloadDiffDrawer` – compares saved preset vs. proposed changes before save/publish.
- `SavedAudienceCard` – compact card with concept name, platform flags, last used, and health.
- `ViabilityStatusBar` – surface preflight blockers (empty payload, deprecated interests, API 429 risk).

## Desired functionality (high level)
- Create/edit audience presets (SSR pages) with a client leaf form (RHF + Zod) for both layers.
- Import from research: PDF/text → extractor prompt → Unified Audience Object JSON → editable draft.
- Suggest interests/behaviors via Supabase embedding functions (`match_ad_targeting*`) and MCP tags.
- Compatibility checks:
  - Meta: `geo_locations`, `age_min/max`, `interests`, `behaviors`, `device_platforms`; flag deprecated interests (Jan 15 2026 cutoff) and missing required geo/age. citeturn1search0
  - Google Ads: locations, age_ranges, genders, devices, user_interests/user_lists; support new PMax device targeting and age exclusions (Aug 2025). citeturn0search0turn1search1
- Preflight viability: reach estimation when available, empty-payload guards, platform-specific warnings.
- Lookalike/expansion: toggle stored in preset; enforce seed size and platform limits.
- Persistence: save presets under a brand profile; version and audit; RLS by brand/team.
- Reuse: DCO ad set selector pulls saved presets; campaign node assembles platform payloads.

## Frontend design
- **RSC-first** pages for new/edit; hydrate only form leaf and interactive previews.
- Respect `styleguide.md`; use Radix primitives + Tailwind utilities; ensure keyboard + screen reader parity.
- Layout: two-column split — left form fields (psychographic, targeting), right live previews (creative prompt, platform payload, compatibility).
- Skeletons + suspense for server data; optimistic updates for list/detail; toast + inline errors.
- No client-side secrets: all platform calls via server actions or API routes.

## Backend & Supabase (ad_targeting schema)
- Use stored procedures for embeddings: `match_ad_targeting`, `match_ad_targeting_interests`, `..._behaviors`, `..._demographics` to rank suggested interests/behaviors/demos from research text or freeform queries.
- Tables to draft (building on CON-79): `audiences`, `audience_versions` with JSONB columns for `psychographic_layer`, `targeting_layer`, `platform_overrides`, plus embeddings column for recall.
- RLS: brand/team ownership; block cross-brand reads/writes; log access for analytics.
- Versioning: immutable recorded versions for reproducibility; mutable draft; keep audit metadata for creative/campaign replay.
- API routes: `/api/audiences/meta/suggest`, `/api/audiences/google/suggest`, `/api/audiences/mcp/tags`, `/api/audiences/extract` (LLM extractor with PII redaction + strict JSON).

## Interop JSON shape (draft)
```json
{
  "audience_id": "aud_x",
  "brand_id": "brand_x",
  "concept_name": "Eco-Conscious Urban Professionals",
  "psychographic_layer": {
    "persona_description": "...",
    "visual_cues": "...",
    "emotional_hooks": ["..."]
  },
  "targeting_layer": {
    "platform": "meta|google",
    "geo_locations": ["US", "CA", "GB"],
    "age_range": {"min": 25, "max": 35},
    "interests": ["Sustainability", "Tesla"],
    "behaviors": ["Frequent International Travelers"],
    "devices": ["mobile", "desktop"],
    "user_lists": [],
    "lookalike": {"enabled": true, "percent": 3}
  },
  "platform_overrides": {
    "meta": { "interest_ids": [], "device_platforms": ["mobile", "desktop"] },
    "google": { "location_ids": [], "user_interest_ids": [], "age_ranges": [] }
  },
  "embedding": "vector-ref",
  "version": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

## How backend will be used by the frontend
- SSR pages call repository helpers to fetch preset JSON + compatibility warnings.
- Client form submits to server actions (`createAudience`, `updateAudience`) that:
  - validate via Zod (dual-layer + platform discriminators),
  - run platform compatibility checks (Meta/Google),
  - persist JSON + embedding + version row,
  - emit events for analytics.
- Suggestion chips in the form are sourced from Supabase `match_ad_targeting*` functions; payloads stay server-side to avoid secret leakage.

## Next steps
1) Finalize schemas (CON-78) with platform discriminated unions and override blocks.
2) Land persistence design (CON-79) with RLS and versioning doc.
3) Wire repository + server actions (CON-80, CON-94) to serve SSR pages (CON-91) and client form (CON-92).
4) Implement creative prompt bridge (CON-106) and campaign node viability checks (CON-107).
5) Backfill evaluation set for extractor (CON-104) and regression coverage (CON-99/100/101).
