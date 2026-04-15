# Supabase Functions: Schema + Table Interaction Map

Last updated: 2026-04-14
Scope: `supabase/functions/**` (Edge Functions + shared helpers), cross-checked with `supabase/migrations/**` and `src/lib/supabase/types.ts`.

## 1) High-level interaction model

Most functions use one of three Supabase access patterns:

1. Service-role client + explicit user check (`auth.getUser(token)`) + app-level authorization checks.
2. Anon client + forwarded `Authorization` header relying on RLS.
3. Hybrid: anon client for caller auth, service client for privileged reads/writes.

Representative examples:

- Service role pattern: `fetch-meta-campaigns` creates service client, then verifies caller token.
  - `supabase/functions/fetch-meta-campaigns/index.ts:58`
  - `supabase/functions/fetch-meta-campaigns/index.ts:62`
- Anon + RLS pattern: `prompt_templates` / `ai_studio_workflows`.
  - `supabase/functions/prompt_templates/index.ts:20`
  - `supabase/functions/ai_studio_workflows/index.ts:25`
- Hybrid pattern: `update_integration_account_assets`.
  - `supabase/functions/update_integration_account_assets/index.ts:35`
  - `supabase/functions/update_integration_account_assets/index.ts:47`

## 2) Schemas touched from `supabase/functions`

Detected schemas used in Supabase queries:

- `brand_profiles`
- `DCO_Campaigns`
- `integrations`
- `public` (implicit `.from(...)` / `.rpc(...)` without `.schema(...)`)

## 3) Table inventory by schema

## `brand_profiles` tables

- `brand_competitors`
- `brand_document_chunks`
- `brand_documents`
- `brand_profile_integration_accounts`
- `brand_profiles`
- `brand_report_drafts`
- `brand_reports`
- `canvas_workflows`
- `integration_accounts_assets`
- `invites`
- `paid_media_ad_objects`
- `paid_media_catalog_products`
- `paid_media_product_ad_activity`
- `paid_media_product_catalogs`
- `permissions`
- `prompt_templates`
- `reporting_cache`
- `strategic_analyses`
- `user_brand_preferences`
- `user_integrations`
- `user_onboarding_states`

Notes:

- `reporting_cache` is the central cache table for paid/organic observability flows and shared cache helpers.
  - `supabase/functions/_shared/meta-edge-cache.ts:64`
  - `supabase/functions/get-account-insights/index.ts:78`
  - `supabase/functions/fetch-organic-analytics/index.ts:236`
- Migration confirms move from `public.reporting_cache` to `brand_profiles.reporting_cache`.
  - `supabase/migrations/20260120_move_reporting_cache_to_brand_profiles.sql:1`
  - `supabase/migrations/20260120_move_reporting_cache_to_brand_profiles.sql:3`

## `DCO_Campaigns` tables

- `rule_action_logs`
- `timeline_accounts`
- `timeline_ad_blocks`
- `timeline_events`

Examples:

- `supabase/functions/fetch-rule-action-logs/index.ts:189`
- `supabase/functions/fetch-timeline-accounts/index.ts:96`
- `supabase/functions/fetch-timeline-blocks/index.ts:625`
- `supabase/functions/fetch-timeline-blocks/index.ts:659`

## `integrations` tables

- `meta_ad_accounts`

Examples:

- `supabase/functions/fetch-ad-accounts-for-selector/index.ts:76`
- `supabase/functions/fetch-timeline-accounts/index.ts:112`

## `public` tables (implicitly targeted)

- `brand_insights_generations`
- `brand_insights_trends`
- `brand_insights_events`
- `brand_insights_questions`

Examples:

- `supabase/functions/process-brand-insights/index.ts:146`
- `supabase/functions/process-brand-insights/index.ts:165`
- `supabase/functions/process-brand-insights-context/index.ts:121`
- `supabase/functions/process-brand-insights-context/index.ts:139`

Migration evidence (public schema):

- `supabase/migrations/20251119_brand_insights_brand_id.sql:8`
- `supabase/migrations/20251119_brand_insights_brand_id.sql:11`
- `supabase/migrations/20251119_brand_insights_brand_id.sql:14`
- `supabase/migrations/20251119_brand_insights_brand_id.sql:17`

## 4) RPC inventory

## `public` RPCs used

- `get_meta_access_token`
- `get_google_access_token`
- `match_brand_documents`
- `match_brand_insights_trends`
- `match_brand_insights_events`
- `match_brand_insights_questions`
- `match_strategic_analysis_embeddings`

Examples:

- `supabase/functions/fetch-meta-campaigns/index.ts:90`
- `supabase/functions/paid-media-metrics/google/handler.ts:140`
- `supabase/functions/brand-draft-audience/geminiClient.ts:75`

Migration evidence for some public RPCs:

- `get_google_access_token`: `supabase/migrations/20260206_create_get_google_access_token_rpc.sql:1`
- Brand insights/vector match RPCs: `supabase/migrations/20260406000000_add_brand_insights_match_functions.sql:3`

## `brand_profiles` RPCs used

- `decrypt_token`

Example:

- `supabase/functions/fetch-organic-analytics/index.ts:63`

## 5) Auth/Admin API usage

Edge functions frequently call Supabase Auth APIs in addition to PostgREST queries:

- `auth.getUser` (widely used)
- `auth.admin.listUsers`
- `auth.admin.updateUserById`
- `auth.admin.generateLink`
- `auth.admin.getUserById`

Examples:

- `supabase/functions/admin-list-users/index.ts:156`
- `supabase/functions/brand_invite/index.ts:298`
- `supabase/functions/admin-set-admin/index.ts:50`
- `supabase/functions/impersonate-user/index.ts:49`

Auth-only (no table/RPC access) functions:

- `supabase/functions/jaina-speech-to-text/index.ts`
- `supabase/functions/jaina-speech-realtime/index.ts`
- `supabase/functions/admin-set-admin/index.ts`
- `supabase/functions/impersonate-user/index.ts`

## 6) Storage usage

Storage usage is minimal and centralized:

- Bucket: `brand-docs`
- Operation: `.download(path)`
- Location: `supabase/functions/_shared/source_adapters.ts:45`

No `supabase.functions.invoke(...)` calls were found inside `supabase/functions`.

## 7) Function groups by schema interaction

## Uses `DCO_Campaigns`

- `fetch-ad-accounts-for-selector`
- `fetch-campaigns-for-selector`
- `fetch-rule-action-logs`
- `fetch-timeline-accounts`
- `fetch-timeline-blocks`

## Uses `integrations`

- `fetch-ad-accounts-for-selector`
- `fetch-timeline-accounts`

## Uses `public` brand-insights tables and/or public RPCs

- `process-brand-insights`
- `process-brand-insights-context`
- `brand-draft-audience/geminiClient`
- `brand-draft-voice/geminiClient`
- plus token-RPC consumers (`fetch-meta-*`, `get-*insights`, `paid-media-metrics/*`, `fetch-organic-analytics`)

## Uses `brand_profiles`

Most business-domain functions (permissions, integrations, brand docs, cache, workflows, invites, admin tier/profile operations).

## 8) Drift / risk findings

1. `DCO_Campaigns` / `integrations` schema typing drift:
- `src/lib/supabase/types.ts` generated schema map includes `brand_profiles` and `public`, but not `DCO_Campaigns` or `integrations`.
  - `src/lib/supabase/types.ts:15`
  - `src/lib/supabase/types.ts:2161`

2. Timeline table naming mismatch risk:
- Functions query `DCO_Campaigns.timeline_ad_blocks`.
  - `supabase/functions/fetch-timeline-blocks/index.ts:609`
- Migration index script references `DCO_Campaigns.timeline_blocks`.
  - `supabase/migrations/20260227124500_add_dco_campaigns_composite_indexes.sql:18`

3. `get_meta_access_token` migration visibility gap:
- RPC is used broadly and exists in generated types, but no creation migration was found in `supabase/migrations` during this scan.
  - Usage: `supabase/functions/fetch-meta-campaigns/index.ts:90`
  - Typed: `src/lib/supabase/types.ts:3910`

4. `decrypt_token` signature divergence in generated types:
- `brand_profiles.decrypt_token` appears as `Args: { ct: string }`.
  - `src/lib/supabase/types.ts:2051`
- `public.decrypt_token` appears as `Args: { token_to_decrypt: string }`.
  - `src/lib/supabase/types.ts:3877`
- Functions call both conventions via schema-qualified RPC in places like organic analytics.
  - `supabase/functions/fetch-organic-analytics/index.ts:63`

## 9) Quick operational summary

- Primary domain schema: `brand_profiles`.
- Observability data source tables in edge endpoints: `brand_profiles.reporting_cache`, `DCO_Campaigns.rule_action_logs`, `DCO_Campaigns.timeline_*`.
- Token resolution depends on RPCs (`get_meta_access_token`, `get_google_access_token`, `decrypt_token`).
- Brand-insights generation/prefetch stack currently uses `public.brand_insights_*` plus vector-match RPCs.
