'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  type SessionFilterState,
  type SessionInitiatorFilter,
  setSessionInitiatorFilter,
  toggleSessionTagFilter,
} from '@/lib/agents/session-filters';
import { cn } from '@/lib/utils';

// The search + facet row shared by the Jaina and Organic conversation sidebars.
// Presentational: it owns only the debounce timer for the text input, because a
// keystroke must not become a request. Every other decision (what the filters
// mean, what to fetch) belongs to the caller.

const SEARCH_DEBOUNCE_MS = 300;

export type ChatHistoryFilterBarProps = {
  filters: SessionFilterState;
  onFiltersChange: (next: SessionFilterState) => void;
  /** Distinct tags across the visible sessions — the chip row. */
  availableTags: string[];
  /** Agents that can appear as initiators of this surface's sessions. */
  agentOptions?: Array<{ value: string; label: string }>;
  isSearching?: boolean;
  className?: string;
};

const INITIATOR_OPTIONS: Array<{ value: SessionInitiatorFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'user', label: 'Human' },
  { value: 'agent', label: 'AI' },
];

export function ChatHistoryFilterBar({
  filters,
  onFiltersChange,
  availableTags,
  agentOptions = [],
  isSearching = false,
  className,
}: ChatHistoryFilterBarProps) {
  const [draftQuery, setDraftQuery] = useState(filters.q);

  // The committed value wins when the caller resets the filters (e.g. "Clear"),
  // so the box never keeps showing a term that is no longer applied.
  useEffect(() => {
    setDraftQuery((current) => (current === filters.q ? current : filters.q));
  }, [filters.q]);

  useEffect(() => {
    if (draftQuery === filters.q) return;
    const timer = setTimeout(() => {
      onFiltersChange({ ...filters, q: draftQuery });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, filters, onFiltersChange]);

  return (
    <div className={cn('flex flex-col gap-2 border-b border-border/60 px-2 py-2', className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search conversations"
          aria-label="Search conversations"
          className="h-7 pl-7 pr-7 text-xs"
        />
        {draftQuery ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setDraftQuery('');
              onFiltersChange({ ...filters, q: '' });
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          type="single"
          value={filters.initiator}
          onValueChange={(value) =>
            value &&
            onFiltersChange(setSessionInitiatorFilter(filters, value as SessionInitiatorFilter))
          }
          aria-label="Filter by who started the conversation"
        >
          {INITIATOR_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} className="h-6 px-2 text-xs">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {isSearching ? (
          <span className="text-2xs text-muted-foreground" role="status">
            Searching…
          </span>
        ) : null}
      </div>

      {filters.initiator === 'agent' && agentOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {agentOptions.map((option) => {
            const isActive = filters.initiatorAgent === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    initiatorAgent: isActive ? '' : option.value,
                  })
                }
              >
                <Pill
                  variant={isActive ? 'default' : 'secondary'}
                  className={cn(!isActive && 'text-muted-foreground')}
                >
                  {option.label}
                </Pill>
              </button>
            );
          })}
        </div>
      ) : null}

      {availableTags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {availableTags.map((tag) => {
            const isActive = filters.tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={isActive}
                onClick={() => onFiltersChange(toggleSessionTagFilter(filters, tag))}
              >
                <Pill
                  variant={isActive ? 'default' : 'outline'}
                  className={cn(!isActive && 'text-muted-foreground')}
                >
                  #{tag}
                </Pill>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
