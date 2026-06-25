// Canonical text-embedding configuration for the whole monorepo.
//
// Every text embedding — written or queried, on either side of the FE↔BE
// boundary and in the Supabase edge functions — uses Google `gemini-embedding-2`
// at 1536 output dimensions (Matryoshka / MRL truncation of the native 3072) so
// the vectors stay compatible with the existing `vector(1536)` columns. Writer
// and reader of any column MUST share this model + dimension or pgvector's `<=>`
// compares two different vector spaces and returns meaningless similarity with
// no error.
//
// The native model returns 3072 dims; we ALWAYS request `outputDimensionality:
// TEXT_EMBEDDING_DIM`. Omitting it returns 3072 and dimension-mismatches the
// columns.
//
// Edge functions run on Deno and cannot import this workspace package; their
// mirror lives at `supabase/functions/_shared/embeddingModel.ts`. Keep the two
// in lockstep — changing the model here means changing it there in the same PR.
export const TEXT_EMBEDDING_MODEL = 'gemini-embedding-2';
export const TEXT_EMBEDDING_DIM = 1536;

// Gemini task types: documents (stored vectors) vs. queries (search vectors).
// Same model + dim, different optimization — they remain in the same space.
export const TEXT_EMBEDDING_DOC_TASK_TYPE = 'RETRIEVAL_DOCUMENT';
export const TEXT_EMBEDDING_QUERY_TASK_TYPE = 'RETRIEVAL_QUERY';
