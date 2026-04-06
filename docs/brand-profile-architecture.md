# Brand Profile Architecture

Reference diagram for how brand profiles are configured, what they own, and how edge agents interact with them.

## Schema: `brand_profiles` (Postgres)

All tables live in the `brand_profiles` Postgres schema (not `public`). Supabase clients access them via `.schema("brand_profiles").from(...)`.

---

## Core Identity

```
brand_profiles
├── id            uuid PK
├── brand_name    text
├── created_by    uuid → auth.users
├── active        boolean          (soft-delete flag)
├── tier          int              (feature gating)
├── logo_path     text             (Supabase Storage path)
├── context       jsonb            (freeform brand metadata)
├── completed_at  timestamptz      (onboarding completion)
├── created_at    timestamptz
└── updated_at    timestamptz
```

---

## Full Ownership Graph

```
brand_profiles (root)
│
├── permissions (RBAC)
│   ├── user_id        → auth.users
│   ├── brand_profile_id
│   ├── role           text  (owner | admin | member)
│   ├── email          text
│   └── tier           int
│
├── user_onboarding_states
│   ├── brand_id
│   ├── user_id        → auth.users
│   └── state          jsonb
│       ├── brand.name
│       └── members[]  { email, role }   ← fallback authz source
│
├── invites
│
├── user_brand_preferences
│
│── RAG / Knowledge Base ──────────────────────────────────────
│
├── brand_documents
│   ├── id             uuid PK
│   ├── brand_id       → brand_profiles.id
│   ├── name           text
│   ├── source         text  (upload | google-drive | website | ...)
│   ├── storage_path   text  (bucket: "brand-docs")
│   ├── external_url   text
│   ├── mime_type      text
│   ├── size           bigint
│   ├── status         text  (processing | ready | error)
│   └── error_message  text
│       │
│       └── brand_document_chunks
│           ├── id           bigint PK
│           ├── document_id  → brand_documents.id
│           ├── chunk_index  int
│           ├── content      text
│           ├── embedding    vector(1536)  ← pgvector (Gemini gemini-embedding-001)
│           ├── tokens       int
│           └── created_at
│
├── brand_guidelines
│   └── brand_guideline_tags
│
├── brand_competitors
│
│── AI / Workflows ─────────────────────────────────────────────
│
├── canvas_workflows
│   ├── brand_profile_id
│   ├── name / description
│   └── nodes / edges  jsonb   (StudioCanvas graph)
│
├── canvas_rooms / canvas_sessions
│
├── prompt_templates
│   ├── brand_profile_id
│   ├── name / prompt
│   └── category / source
│
├── agent_sessions
│
│── Brand Intelligence ─────────────────────────────────────────
│
├── brand_reports
│   └── active  boolean   (soft-deleted on brand delete)
│
├── brand_html_reports
│
├── brand_report_drafts
│   └── brand_profile_id  (hard-deleted on brand delete)
│
├── strategic_analyses
│   ├── brand_id
│   └── active  boolean   (soft-deleted on brand delete)
│       │
│       ├── strategic_analysis_runs
│       └── strategic_analysis_embeddings
│           └── embedding  vector(1536)
│
│── Paid Media ─────────────────────────────────────────────────
│
├── paid_media_product_catalogs
│   └── paid_media_product_catalog_links
│       └── paid_media_catalog_products
│           ├── brand_id, catalog_id, external_product_id  (upsert key)
│           └── paid_media_product_ad_activity
│
├── paid_media_ad_objects
│
├── paid_media_campaign_indexes
│
├── reporting_cache
│   ├── cache_key    text  UNIQUE  ("meta:account_insights:{acct}:{preset}:{since}:{until}")
│   ├── provider     text  (meta | google)
│   ├── scope_type   text  (account_insights | campaigns | adsets | ads)
│   ├── account_id   text
│   ├── payload      jsonb
│   ├── fetched_at   timestamptz
│   └── expires_at   timestamptz   (TTL: 1h partial | 3d full | 12h edge)
│
│── Organic ────────────────────────────────────────────────────
│
├── organic_content_plans
├── organic_calendar_drafts
├── organic_published_posts
├── organic_publish_attempts
├── organic_chat_sessions / organic_chat_messages
├── organic_whatsapp_brands
│
│── Integrations ───────────────────────────────────────────────
│
├── brand_profile_integration_accounts   (assignment table)
│   ├── brand_profile_id
│   ├── integration_account_id  → integration_accounts_assets.id
│   ├── alias          text
│   └── settings       jsonb
│       │
│       └── integration_accounts_assets
│           ├── integration_id    → user_integrations.id
│           ├── type              text  (meta_ad_account | instagram_business_account | ...)
│           ├── name              text
│           ├── external_account_id text
│           └── status            text
│
├── brand_profile_user_integrations
│
│── Jaina (Conversational AI) ───────────────────────────────────
│
├── jaina_conversation_sessions
│   └── jaina_conversation_runs
│       ├── jaina_conversation_run_events
│       └── jaina_conversation_messages
│
└── chat_messages
```

---

## Authorization Flow (all edge functions)

```
Incoming Request (Bearer JWT)
        │
        ▼
supabase.auth.getUser(token)
        │
        ├─ FAIL → 401 Unauthorized
        │
        ▼
Check brand_profiles.permissions
  WHERE user_id = uid AND brand_profile_id = brandId
        │
        ├─ found → authorized ✓
        │
        ├─ not found → check brand_profiles.created_by = uid
        │               ├─ match → authorized ✓
        │               └─ no match → check user_onboarding_states.state.members[]
        │                               email match + role in (owner|admin)
        │                               ├─ match → authorized ✓
        │                               └─ no match → 403 Forbidden
```

---

## RAG Pipeline (embed_document → brand-draft-voice/audience)

```
INGESTION (embed_document edge function)
─────────────────────────────────────────────────────────────
Client POST { brandId, documentId, source, storagePath? }
        │
        ▼ (async, returns 202 immediately)
fetchBytes(_shared/source_adapters)
  ├── upload  → Supabase Storage bucket "brand-docs"
  ├── google-drive → fetch(externalUrl)
  └── website → fetch(externalUrl)
        │
        ▼
extractText(_shared/extract)
  ├── text/*  → TextDecoder UTF-8
  └── pdf/docx → ⚠️ TODO stub (UTF-8 fallback — produces garbage)
        │
        ▼
chunkText(_shared/chunk)
  size=2000 chars, overlap=200 chars
        │
        ▼
createEmbeddings (Gemini gemini-embedding-001, 1536d)
  batch size: 100 chunks/call
  taskType: RETRIEVAL_DOCUMENT
        │
        ▼
brand_profiles.brand_documents   status: processing → ready | error
brand_profiles.brand_document_chunks
  document_id, chunk_index, content, embedding(vector)


RETRIEVAL (brand-draft-voice / brand-draft-audience)
─────────────────────────────────────────────────────────────
User request (brandId, websiteUrl)
        │
        ▼
Gemini grounding phase (url_context + google_search)
  → groundingContext string
        │
        ▼
Gemini generation phase (while loop, max should be 5 rounds)
  model calls tool: search_brand_documents(query)
        │
        ▼
searchBrandDocs(brandId, query)
  ⚠️  createEmbedding via OpenAI text-embedding-3-small  ← MISMATCH with ingestion
        │
        ▼
supabase.rpc("match_brand_documents", {
  query_embedding,
  match_threshold: 0.5,
  match_count: 5,
  filter_brand_id: brandId
})
        │
        ▼
context string → back to Gemini as tool_response
        │
        ▼
Final text stream → SSE chunks → client


⚠️  MISMATCH: Ingest=Gemini gemini-embedding-001, Query=OpenAI text-embedding-3-small
    Vector spaces are incompatible. Retrieval quality is near-zero.
    Fix: use Gemini RETRIEVAL_QUERY taskType for all query embeddings.
```

---

## Insights Pipeline (brand insights → reporting_cache)

```
process-brand-insights edge function
  Input: { brand_id, generation_data: { trends[], events[], questions_by_niche } }
        │
        ▼
brand_insights_generations  (upsert on brand_id + week_start_date)
        │
        ├── brand_insights_trends
        │   embedding: OpenAI text-embedding-3-small
        ├── brand_insights_events
        │   embedding: OpenAI text-embedding-3-small
        └── brand_insights_questions
            embedding: OpenAI text-embedding-3-small
            ⚠️ All embedded sequentially — should batch with Promise.all


get-account-insights edge function
  Input: { brandId, adAccountId, range, forceRefresh }
        │
        ├── Cache HIT → reporting_cache (expires_at > now)  → return payload
        │
        └── Cache MISS
              │
              ▼
            get_meta_access_token RPC
              │
              ▼
            Meta API: placements + formats + demographics + devices breakdowns
              │
              ▼
            computeHeuristicInsights (pure function, 3 per category)
              │
              ▼
            generateLlmInsights (Gemini gemini-2.5-flash, 2 per category)
              │
              ▼
            Merge 5 per category → cache with TTL
              ├── Gemini succeeded → 3 days TTL
              └── Gemini failed   → 1 hour TTL (partial)
```

---

## Cache Key Patterns

| Scope | Key Pattern | TTL |
|-------|-------------|-----|
| Account insights | `meta:account_insights:{accountId}:{preset}:{since}:{until}` | 3d / 1h |
| Meta campaigns | `meta-edge:campaigns:{adAccountId}:all` | 12h |
| Meta adsets | `meta-edge:adsets:{adAccountId}:{scopeId}` | 12h |
| Meta ads | `meta-edge:ads:{adAccountId}:{scopeId}` | 12h |

All stored in `brand_profiles.reporting_cache`. Uses `insert` today — should be `upsert` on `cache_key` to prevent unbounded row growth.

---

## Integration Account Resolution

```
brand_profile_integration_accounts (assignment)
  brand_profile_id ──── brand_profiles.id
  integration_account_id ──── integration_accounts_assets.id
                                  type → TYPE_TO_PLATFORM_MAP
                                    meta_ad_account → "facebook"
                                    instagram_business_account → "instagram"
                                    youtube_channel → "youtube"
                                    google_ad_account → "googleAds"
                                    dv360_advertiser → "dv360"
                                    threads_profile → "threads"
                                  external_account_id (Meta act_xxx, Google customer ID)
                                  integration_id ──── user_integrations.id
```

Name resolution priority: `alias` → `account.name` → `external_account_id` → `"Account"`

---

## Brand Deletion Sequence (delete_brand_profile)

```
1. assertUserAccess (created_by OR owner/admin in onboarding_states)
2. brand_profiles.brand_reports           → UPDATE active=false
3. brand_profiles.strategic_analyses      → UPDATE active=false
4. brand_profiles.brand_profile_integration_accounts → DELETE (FK blocker)
5. brand_profiles.brand_report_drafts     → DELETE
6. brand_profiles.brand_profiles          → UPDATE active=false  (soft delete)

⚠️  Not cleaned: brand_documents, brand_document_chunks, canvas_workflows,
    prompt_templates, organic_*, paid_media_*, reporting_cache, insights_*
    These are orphaned on deletion.
```
