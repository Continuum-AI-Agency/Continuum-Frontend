import 'server-only';

import { TEXT_EMBEDDING_DIM } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

// The Frontend deploys to Vercel and deliberately holds NO model API key. The
// query embedding is therefore minted by the `embed-search-query` edge function,
// which owns the Gemini secret — the same secret analyze_media uses to WRITE
// media.assets.embedding_text, so both sides of the vector space share one key
// custody. The edge fn is JWT-gated; we forward the caller's session.
const EMBED_FUNCTION = 'embed-search-query';

// The search bar embeds on every debounced keystroke, so a hung call must
// degrade to lexical rather than hold the request open.
const EMBED_TIMEOUT_MS = 8_000;

// Search is a hot path: one line per distinct failure reason, not per keystroke.
const loggedReasons = new Set<string>();

function warnOnce(reason: string, detail?: unknown): void {
  if (loggedReasons.has(reason)) return;
  loggedReasons.add(reason);
  console.warn(`[media/embedQuery] ${reason} — falling back to keyword search`, detail ?? '');
}

type EmbedFunctionResponse = { embedding?: unknown };

// Embeds a natural-language search string for `media.match_assets_by_text`.
// Fail-soft by contract: an unavailable function, an error, a timeout, or a
// wrong-width vector all return null so the caller falls back to keyword
// search. Never throws — an un-analyzed brand must still get results.
export async function embedSearchQuery(
  supabase: SupabaseClient,
  query: string,
): Promise<number[] | null> {
  const text = query.trim();
  if (!text) return null;

  try {
    const { data, error } = await supabase.functions.invoke<EmbedFunctionResponse>(EMBED_FUNCTION, {
      body: { query: text },
      // The user-scoped client already carries the caller's JWT; the edge fn
      // rejects anonymous callers so it cannot be used as a free oracle.
    });

    if (error) {
      warnOnce('embed-search-query invoke failed', error.message);
      return null;
    }

    const values = data?.embedding;
    if (!Array.isArray(values) || values.length === 0) {
      warnOnce('embed-search-query returned an empty embedding');
      return null;
    }
    if (values.length !== TEXT_EMBEDDING_DIM) {
      warnOnce(`embed-search-query returned ${values.length} dims, expected ${TEXT_EMBEDDING_DIM}`);
      return null;
    }
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      warnOnce('embed-search-query returned a non-numeric embedding');
      return null;
    }
    return values as number[];
  } catch (err) {
    warnOnce('embed-search-query threw', err);
    return null;
  }
}

export { EMBED_TIMEOUT_MS };
