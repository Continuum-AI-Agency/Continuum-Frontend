"use client";

import { useState, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import type {
  MediaKind,
  MediaSearchFilters,
  MediaSearchResultItem,
  MediaSource,
} from "@continuum/contracts";
import { cn } from "@/lib/utils";

type Props = {
  brandId: string;
  source?: MediaSource | null;
  kind?: MediaKind | null;
  onResults: (items: MediaSearchResultItem[]) => void;
  onClear: () => void;
  className?: string;
};

export function MediaSearchBar({ brandId, source, kind, onResults, onClear, className }: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSearch() {
    setQuery("");
    onClear();
  }

  async function runSearch(q: string) {
    if (!q.trim()) {
      onClear();
      return;
    }
    setSearching(true);
    try {
      const filters: MediaSearchFilters = {};
      if (source) filters.source = source;
      if (kind) filters.kind = kind;
      const resp = await fetch("/api/library/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId,
          mode: "text",
          query: q,
          limit: 48,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        }),
      });
      const data = (await resp.json()) as { items?: MediaSearchResultItem[] };
      onResults(data.items ?? []);
    } catch (err) {
      console.error("[MediaSearchBar] search failed", err);
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
    <form
      onSubmit={handleSubmit}
      className={cn(
        "relative flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 transition-colors focus-within:border-border focus-within:bg-background",
        className,
      )}
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
        placeholder="Search for anything…"
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
  );
}
