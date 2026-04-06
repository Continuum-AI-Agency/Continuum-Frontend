# Edge Agent RAG Audit

## Critical Finding — Embedding Model Mismatch

**RAG is effectively broken today.** Documents are indexed with `gemini-embedding-001` (in `embed_document`) but queried with OpenAI `text-embedding-3-small` (in `brand-draft-voice` and `brand-draft-audience`). The two models produce incompatible vector spaces. Cosine similarity between them is meaningless — the `match_brand_documents` RPC will return near-zero results or garbage ranks regardless of content relevance.

Both models happen to output 1536-dimensional vectors, which is why the schema accepts both silently. The fix is to standardize on one model end-to-end.

---

## Top Improvements by Impact

### 1. Unify the embedding model (Critical — RAG correctness)

**File:** `supabase/functions/embed_document/index.ts` + `brand-draft-voice/index.ts` + `brand-draft-audience/geminiClient.ts`

**Problem:** Indexing uses `gemini-embedding-001`; querying uses `openai/text-embedding-3-small`. Incompatible vector spaces.

**Fix:** Pick one model and use it everywhere. Recommended: stay on Gemini since the indexing pipeline is already there (saves an OpenAI dependency). Update `searchBrandDocs` in both draft functions to call Gemini embedding REST instead of OpenAI.

```typescript
// Replace in brand-draft-voice/index.ts and brand-draft-audience/geminiClient.ts
async function createQueryEmbedding(input: string, geminiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        taskType: "RETRIEVAL_QUERY",  // QUERY not DOCUMENT
        content: { parts: [{ text: input }] },
        outputDimensionality: 1536,
      }),
    }
  );
  const data = await res.json();
  return data.embedding.values;
}
```

Note: Use `taskType: "RETRIEVAL_QUERY"` for query embeddings and `"RETRIEVAL_DOCUMENT"` for document indexing — Gemini asymmetric embeddings are designed for this and meaningfully improve recall.

After fixing, reindex all existing `brand_document_chunks` with Gemini.

---

### 2. Add fetch timeouts (Speed + Durability)

**Files:** `_shared/source_adapters.ts`, `brand-draft-voice/geminiClient.ts`, `process-brand-insights/index.ts`

**Problem:** Every `fetch()` call has no timeout. A slow external URL, Meta API, or Gemini endpoint hangs the edge function until Deno's 150s wall-clock limit kills it, burning connection budget.

**Fix:** Wrap all external fetches with `AbortController`:

```typescript
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

Apply to: `fetchFromGoogleDrive`, `fetchFromStorage` (download), all Gemini API calls, all Meta API calls.

---

### 3. Parallelize brand-insights embedding (Speed — 10-50x faster)

**File:** `supabase/functions/process-brand-insights/index.ts`

**Problem:** Trends, events, and questions are embedded sequentially in `for` loops. 30 trends + 20 events + 50 questions = 100 serial OpenAI calls. Typical wall time: 15–30 seconds.

**Fix:** Batch with `Promise.all` using a concurrency limiter:

```typescript
async function embedBatch(texts: string[], openai: OpenAI, concurrency = 10): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const batch = await Promise.all(
      slice.map(text =>
        text.trim()
          ? openai.embeddings.create({ model: "text-embedding-3-small", input: text })
              .then(r => r.data[0]?.embedding ?? null)
              .catch(() => null)
          : Promise.resolve(null)
      )
    );
    results.push(...batch);
  }
  return results;
}
```

Also batch the subsequent DB inserts (`Promise.all` over `supabase.from(...).insert(rows)` slices) instead of one row at a time.

---

### 4. Cap the Gemini tool-call loop (Durability)

**File:** `supabase/functions/brand-draft-voice/geminiClient.ts`

**Problem:** `while(true)` in `streamGeminiTextDeltas` has no iteration limit. If the model repeatedly emits `function_call` parts, the loop runs forever consuming API quota.

**Fix:**

```typescript
const MAX_TOOL_ROUNDS = 5;
let rounds = 0;
while (true) {
  if (rounds++ >= MAX_TOOL_ROUNDS) {
    throw new Error(`Gemini tool loop exceeded ${MAX_TOOL_ROUNDS} rounds — aborting`);
  }
  // ... existing loop body
}
```

---

### 5. Fix chunk deduplication on re-embed (Durability)

**File:** `supabase/functions/embed_document/index.ts:215-232`

**Problem:** On re-processing a document, new chunks are `insert`ed without deleting old ones. The document accumulates duplicate or stale chunks. `match_brand_documents` returns outdated content.

**Fix:** Delete existing chunks before inserting, or use upsert with `onConflict: "document_id,chunk_index"`:

```typescript
// Before inserting chunks:
await supabase
  .schema("brand_profiles")
  .from("brand_document_chunks")
  .delete()
  .eq("document_id", input.documentId);
```

---

### 6. Add real PDF/DOCX extraction (Quality)

**File:** `supabase/functions/_shared/extract.ts:15`

**Problem:** PDF, DOCX, PPTX are TODO stubs that fall back to UTF-8 decode of binary bytes. Binary content produces garbage chunks that pollute the vector store and degrade retrieval quality for all queries.

**Fix:** Use Deno-compatible PDF text extraction. Options:
- `pdf-parse` via esm.sh for PDFs
- Convert DOCX via the Office Open XML (zip) structure using Deno's built-in zip support

Minimum viable fix: reject binary formats with a clear error rather than silently indexing garbage:

```typescript
if (mime === 'application/pdf' || mime?.includes('officedocument')) {
  throw new Error(`Extraction not yet supported for ${mime}. Please upload .txt, .md, or .csv.`);
}
```

---

### 7. Prevent reporting_cache unbounded growth (Durability)

**Files:** `supabase/functions/get-account-insights/index.ts`, `_shared/meta-edge-cache.ts`

**Problem:** Cache writes always `insert` — never `upsert`. Every cache miss adds a row. Old expired rows are never deleted. The table grows indefinitely.

**Fix:** Use upsert on `cache_key`:

```typescript
await supabase
  .schema("brand_profiles")
  .from("reporting_cache")
  .upsert(
    { cache_key: cacheKey, ...payload },
    { onConflict: "cache_key" }
  );
```

Also add a Postgres scheduled job or edge function cron to purge rows where `expires_at < now()`.

---

### 8. Upgrade to hybrid search (Quality)

**Files:** `brand-draft-voice/index.ts`, `brand-draft-audience/geminiClient.ts`

**Problem:** `match_brand_documents` is pure vector similarity (cosine). Exact brand terms, product names, and acronyms often have low cosine similarity even when highly relevant. Threshold of 0.5 can miss important brand-specific terminology.

**Fix:** Add full-text search as a fallback and blend results using Reciprocal Rank Fusion:

```sql
-- Add to match_brand_documents RPC or create match_brand_documents_hybrid:
WITH vector_results AS (
  SELECT id, content, 1 - (embedding <=> query_embedding) AS score, 'vector' AS source
  FROM brand_profiles.brand_document_chunks
  WHERE document_id IN (SELECT id FROM brand_profiles.brand_documents WHERE brand_id = filter_brand_id)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count * 3
),
text_results AS (
  SELECT id, content, ts_rank(to_tsvector('english', content), plainto_tsquery('english', query_text)) AS score, 'text' AS source
  FROM brand_profiles.brand_document_chunks
  WHERE document_id IN (SELECT id FROM brand_profiles.brand_documents WHERE brand_id = filter_brand_id)
    AND to_tsvector('english', content) @@ plainto_tsquery('english', query_text)
  LIMIT match_count * 3
)
-- RRF merge...
```

Until the RPC is updated, the quick win is to lower threshold to 0.35 and increase `match_count` to 10.

---

### 9. Add request-scoped AbortSignal propagation (Speed)

**File:** `supabase/functions/brand-draft-voice/index.ts:134`

**Problem:** `new AbortController().signal` is created fresh and never connected to the incoming request. If the client disconnects, the Gemini stream continues running, consuming tokens and holding the connection.

**Fix:**

```typescript
// Pass req.signal through:
const abortController = new AbortController();
req.signal?.addEventListener("abort", () => abortController.abort());

const deltas = await streamGeminiTextDeltas({
  ...
  signal: abortController.signal,
});
```

---

## Summary Table

| # | Issue | Files | Impact | Effort |
|---|-------|-------|--------|--------|
| 1 | Embedding model mismatch — RAG broken | `embed_document`, `brand-draft-voice`, `brand-draft-audience` | Critical | Medium |
| 2 | No fetch timeouts | `source_adapters`, `geminiClient`, `process-brand-insights` | High | Low |
| 3 | Sequential embedding loop | `process-brand-insights` | High (10-50x speedup) | Low |
| 4 | Unbounded tool-call loop | `brand-draft-voice/geminiClient` | High | Trivial |
| 5 | Chunk deduplication on re-embed | `embed_document` | Medium | Low |
| 6 | Binary file extraction stubs | `_shared/extract` | Medium | Medium |
| 7 | Cache table unbounded growth | `get-account-insights`, `meta-edge-cache` | Medium | Low |
| 8 | Pure vector search — no keyword fallback | `brand-draft-voice`, `brand-draft-audience` | Medium | Medium |
| 9 | AbortSignal not propagated | `brand-draft-voice` | Low | Trivial |
