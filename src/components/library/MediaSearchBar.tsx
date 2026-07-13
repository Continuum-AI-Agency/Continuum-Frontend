'use client';

import type {
  MediaKind,
  MediaSearchFilters,
  MediaSearchResultItem,
  MediaSource,
} from '@continuum/contracts';
import { Loader2, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  source?: MediaSource | null;
  kind?: MediaKind | null;
  // Scopes search to the open collection (server-side, inside the ranking RPC).
  collectionId?: string | null;
  tags?: readonly string[] | null;
  onResults: (items: MediaSearchResultItem[]) => void;
  onClear: () => void;
  className?: string;
};

// The route ranks semantically (embedded query vs. the analyzed description
// vectors) and unions in keyword hits the vector search cannot see. 'lexical'
// means NOTHING matched semantically — usually because this brand's media has
// not been analyzed. Read defensively: `strategy` rides alongside the contract.
export type SearchStrategy = 'semantic' | 'lexical' | 'hybrid';

export function readSearchStrategy(payload: unknown): SearchStrategy | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as { strategy?: unknown }).strategy;
  return value === 'semantic' || value === 'lexical' || value === 'hybrid' ? value : null;
}

export function MediaSearchBar({
  brandId,
  source,
  kind,
  collectionId,
  tags,
  onResults,
  onClear,
  className,
}: Props) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [strategy, setStrategy] = useState<SearchStrategy | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSearch() {
    setQuery('');
    setStrategy(null);
    onClear();
  }

  async function runSearch(q: string) {
    if (!q.trim()) {
      setStrategy(null);
      onClear();
      return;
    }
    setSearching(true);
    try {
      const filters: MediaSearchFilters = {};
      if (source) filters.source = source;
      if (kind) filters.kind = kind;
      if (collectionId) filters.collectionId = collectionId;
      if (tags && tags.length > 0) filters.tags = [...tags];
      const resp = await fetch('/api/library/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          mode: 'text',
          query: q,
          limit: 48,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        }),
      });
      const data = (await resp.json()) as unknown;
      const items = (data as { items?: MediaSearchResultItem[] }).items ?? [];
      setStrategy(readSearchStrategy(data));
      onResults(items);
    } catch (err) {
      console.error('[MediaSearchBar] search failed', err);
    } finally {
      setSearching(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(query);
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
            onClick={clearSearch}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </form>
      {strategy === 'lexical' && !searching && (
        <p className="px-1 text-[11px] leading-tight text-muted-foreground/70">
          Keyword results — this media hasn't been analyzed yet.
        </p>
      )}
    </div>
  );
}
