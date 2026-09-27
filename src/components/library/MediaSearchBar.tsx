'use client';

import {
  type LibrarySearchParsedFilters,
  type LibrarySearchParseResponse,
  librarySearchParseRequestSchema,
  librarySearchParseResponseSchema,
  type MediaKind,
  type MediaReviewStatus,
  type MediaSearchFilters,
  type MediaSearchResultItem,
  type MediaSource,
} from '@continuum/contracts';
import { Loader2, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { http } from '@/lib/api/http';
import { SOURCE_LABEL } from '@/lib/media/filters';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  source?: MediaSource | null;
  kind?: MediaKind | null;
  // Scopes search to the open collection (server-side, inside the ranking RPC).
  collectionId?: string | null;
  tags?: readonly string[] | null;
  /** The brand's custom review states the listing is filtered to. */
  reviewStateIds?: readonly string[];
  /** The review statuses picked in the filter bar; OR'd with the custom states. */
  reviewStatuses?: readonly MediaReviewStatus[];
  onResults: (items: MediaSearchResultItem[]) => void;
  onClear: () => void;
  className?: string;
};

// The route ranks semantically (embedded query vs. the analyzed description
// vectors) and unions in keyword hits the vector search cannot see. 'lexical'
// means NOTHING matched semantically — usually because this brand's media has
// not been analyzed. Read defensively: `strategy` rides alongside the contract.
export type SearchStrategy = 'semantic' | 'lexical' | 'hybrid' | 'filters';

export function readSearchStrategy(payload: unknown): SearchStrategy | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { strategy?: unknown }).strategy;
  return value === 'semantic' || value === 'lexical' || value === 'hybrid' || value === 'filters'
    ? value
    : null;
}

// Words that only make sense as a filter: a kind, a date, a review state.
const FILTER_WORDS = new Set([
  'video',
  'videos',
  'clip',
  'clips',
  'footage',
  'image',
  'images',
  'photo',
  'photos',
  'picture',
  'pictures',
  'audio',
  'today',
  'yesterday',
  'week',
  'month',
  'year',
  'recent',
  'recently',
  'ago',
  'since',
  'tagged',
  'approved',
  'uploaded',
]);

// ponytail: a word-list heuristic decides when a query is worth a model round
// trip; swap for a cheap classifier if it misroutes real queries.
export function looksLikeNaturalLanguageQuery(query: string): boolean {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 3 || words.some((word) => FILTER_WORDS.has(word));
}

/** The interpreted filters narrow the chips already on — tags from both apply. */
export function mergeSearchFilters(
  chips: MediaSearchFilters,
  parsed: LibrarySearchParsedFilters,
): MediaSearchFilters {
  const tags = [...new Set([...(chips.tags ?? []), ...(parsed.tags ?? [])])];
  return { ...chips, ...parsed, ...(tags.length > 0 ? { tags } : {}) };
}

export type InterpretedFilterKey = 'kind' | 'tags' | 'source' | 'reviewStatus' | 'created';

const KIND_LABEL: Record<MediaKind, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  file: 'Project files',
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function interpretedFilterChips(
  filters: LibrarySearchParsedFilters,
): { key: InterpretedFilterKey; label: string }[] {
  const chips: { key: InterpretedFilterKey; label: string }[] = [];
  if (filters.kind) chips.push({ key: 'kind', label: KIND_LABEL[filters.kind] });
  if (filters.tags?.length) chips.push({ key: 'tags', label: `Tagged ${filters.tags.join(', ')}` });
  if (filters.source)
    chips.push({ key: 'source', label: SOURCE_LABEL[filters.source] ?? filters.source });
  if (filters.reviewStatus) {
    const status = filters.reviewStatus.replaceAll('_', ' ');
    chips.push({ key: 'reviewStatus', label: status[0].toUpperCase() + status.slice(1) });
  }
  if (filters.createdAfter || filters.createdBefore) {
    const from = filters.createdAfter ? shortDate(filters.createdAfter) : 'Any time';
    const to = filters.createdBefore ? shortDate(filters.createdBefore) : 'now';
    chips.push({ key: 'created', label: `${from} – ${to}` });
  }
  return chips;
}

export function withoutInterpretedFilter(
  filters: LibrarySearchParsedFilters,
  key: InterpretedFilterKey,
): LibrarySearchParsedFilters {
  const next = { ...filters };
  if (key === 'created') {
    delete next.createdAfter;
    delete next.createdBefore;
  } else {
    delete next[key];
  }
  return next;
}

function requestSearchParse(brandId: string, query: string): Promise<LibrarySearchParseResponse> {
  return http.request({
    path: '/api/media/library-search/parse',
    method: 'POST',
    body: librarySearchParseRequestSchema.parse({ brandId, query }),
    schema: librarySearchParseResponseSchema,
    cache: 'no-store',
  });
}

export function MediaSearchBar({
  brandId,
  source,
  kind,
  collectionId,
  tags,
  reviewStateIds,
  reviewStatuses,
  onResults,
  onClear,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [strategy, setStrategy] = useState<SearchStrategy | null>(null);
  // What the Backend read out of the last natural-language query; each one is a
  // removable chip, and removing it re-runs the search without re-asking the model.
  const [interpreted, setInterpreted] = useState<{
    query: string;
    filters: LibrarySearchParsedFilters;
    visualEmbedding: number[] | null;
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest request may paint results; a slow debounced keyword search
  // must not overwrite the interpreted one the user submitted after it.
  const requestSeq = useRef(0);

  function chipFilters(): MediaSearchFilters {
    const filters: MediaSearchFilters = {};
    if (source) filters.source = source;
    if (kind) filters.kind = kind;
    if (collectionId) filters.collectionId = collectionId;
    if (tags && tags.length > 0) filters.tags = [...tags];
    if (reviewStateIds && reviewStateIds.length > 0) filters.reviewStateIds = [...reviewStateIds];
    if (reviewStatuses && reviewStatuses.length > 0) filters.reviewStatuses = [...reviewStatuses];
    return filters;
  }

  function clearSearch() {
    requestSeq.current += 1;
    setQuery('');
    setStrategy(null);
    setInterpreted(null);
    onClear();
  }

  async function search(
    q: string,
    extra: LibrarySearchParsedFilters,
    seq: number,
    visualEmbedding?: number[] | null,
  ) {
    const filters = mergeSearchFilters(chipFilters(), extra);
    const resp = await fetch('/api/library/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId,
        mode: 'text',
        ...(q ? { query: q } : {}),
        ...(q && visualEmbedding ? { visualEmbedding } : {}),
        limit: 48,
        ...(Object.keys(filters).length > 0 ? { filters } : {}),
      }),
    });
    const data = (await resp.json()) as unknown;
    if (seq !== requestSeq.current) return;
    const items = (data as { items?: MediaSearchResultItem[] }).items ?? [];
    setStrategy(readSearchStrategy(data));
    onResults(items);
  }

  async function runSearch(q: string, options: { interpret: boolean }) {
    const trimmed = q.trim();
    const seq = ++requestSeq.current;
    if (!trimmed) {
      setStrategy(null);
      setInterpreted(null);
      onClear();
      return;
    }
    setSearching(true);
    try {
      if (options.interpret && looksLikeNaturalLanguageQuery(trimmed)) {
        const parsed = await requestSearchParse(brandId, trimmed).catch((err: unknown) => {
          console.error('[MediaSearchBar] query interpretation failed', err);
          return null;
        });
        if (seq !== requestSeq.current) return;
        // The image-space vector rides along even when nothing parsed into a
        // filter — "red sneakers on a beach" is exactly the untagged-footage case.
        const visualEmbedding = parsed?.visualEmbedding ?? null;
        if (parsed?.interpreted && Object.keys(parsed.filters).length > 0) {
          setInterpreted({ query: parsed.query, filters: parsed.filters, visualEmbedding });
          await search(parsed.query, parsed.filters, seq, visualEmbedding);
          return;
        }
        setInterpreted(null);
        await search(trimmed, {}, seq, visualEmbedding);
        return;
      }
      setInterpreted(null);
      await search(trimmed, {}, seq);
    } catch (err) {
      console.error('[MediaSearchBar] search failed', err);
    } finally {
      if (seq === requestSeq.current) setSearching(false);
    }
  }

  async function removeInterpretedFilter(key: InterpretedFilterKey) {
    if (!interpreted) return;
    const filters = withoutInterpretedFilter(interpreted.filters, key);
    const seq = ++requestSeq.current;
    if (Object.keys(filters).length === 0 && !interpreted.query) {
      clearSearch();
      return;
    }
    setInterpreted({ ...interpreted, filters });
    setSearching(true);
    try {
      await search(interpreted.query, filters, seq, interpreted.visualEmbedding);
    } catch (err) {
      console.error('[MediaSearchBar] search failed', err);
    } finally {
      if (seq === requestSeq.current) setSearching(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val, { interpret: false }), 500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(query, { interpret: true });
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 transition-colors focus-within:border-border focus-within:bg-background"
      >
        {searching ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Describe what you're looking for…"
          className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearSearch}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </form>
      {interpreted && interpretedFilterChips(interpreted.filters).length > 0 ? (
        <div data-testid="nl-search-filters" className="flex flex-wrap items-center gap-1 px-1">
          {interpretedFilterChips(interpreted.filters).map((chip) => (
            <span
              key={chip.key}
              data-testid="nl-search-filter"
              data-filter-key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 py-0.5 pr-1 pl-2 text-xs text-foreground"
            >
              {chip.label}
              <button
                type="button"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => void removeInterpretedFilter(chip.key)}
                className="rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {strategy === 'lexical' && !searching && (
        <p className="px-1 text-xs leading-tight text-muted-foreground/70">
          Keyword results — this media hasn't been analyzed yet.
        </p>
      )}
    </div>
  );
}
