'use client';

import { AtSign, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import {
  type MentionAnalyticsContext,
  MentionSuggestionHover,
} from '@/components/chat/mention-suggestion-hover';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import { cn } from '@/lib/utils';

export type MentionPlatformOption = {
  id: string;
  label: string;
};

type MentionPickerMenuProps = {
  suggestions: AgentMentionSuggestion[];
  highlightedIndex: number;
  parentStack: AgentMentionSuggestion[];
  activeQuery: string;
  onHighlight: (index: number) => void;
  onSelect: (suggestion: AgentMentionSuggestion) => void;
  onBack: () => void;
  /** When set, KPI/pack hovers can load 7d metric series. */
  analytics?: MentionAnalyticsContext | null;
  /** Connected brand platforms — shown as a compact filter chip row. */
  platforms?: MentionPlatformOption[];
  selectedPlatform?: string | null;
  onPlatformChange?: (platformId: string) => void;
  className?: string;
};

const PLATFORM_SHORT: Record<string, string> = {
  instagram: 'IG',
  facebook: 'FB',
  tiktok: 'TT',
  youtube: 'YT',
  linkedin: 'LI',
};

/** Only render a leading visual when there is real media (image/video URL). */
function hasMediaPreview(suggestion: AgentMentionSuggestion): boolean {
  return Boolean(suggestion.preview?.url);
}

function SuggestionThumb({ suggestion }: { suggestion: AgentMentionSuggestion }) {
  const preview = suggestion.preview;
  if (!preview?.url) return null;
  if (preview.kind === 'video') {
    return (
      <video
        aria-hidden
        className="size-8 shrink-0 rounded-md border border-border/60 object-cover bg-muted"
        muted
        playsInline
        preload="metadata"
        src={preview.url}
      />
    );
  }
  return (
    <span className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
      <Image alt="" className="object-cover" fill sizes="32px" src={preview.url} unoptimized />
    </span>
  );
}

/** Compact live KPI readout: `12.4k` + green/red Δ% — stays small in the list. */
function MetricInlineStat({ suggestion }: { suggestion: AgentMentionSuggestion }) {
  if (suggestion.type !== 'kpi') return null;
  if (suggestion.reference?.metadata?.isPack === true || suggestion.badge === 'pack') return null;
  const meta = (suggestion.reference?.metadata ?? {}) as Record<string, unknown>;
  const value = typeof meta.value === 'number' ? meta.value : null;
  const delta = typeof meta.percentageChange === 'number' ? meta.percentageChange : null;
  const unit = typeof meta.unit === 'string' ? meta.unit : null;
  if (value == null && delta == null) return null;

  const valueLabel =
    value == null
      ? null
      : unit === 'percent' || unit === '%'
        ? `${value.toFixed(1)}%`
        : value >= 1000
          ? new Intl.NumberFormat(undefined, {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(value)
          : value.toLocaleString();

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5 leading-none">
      {valueLabel ? (
        <span className="text-xs font-semibold tabular-nums text-foreground">{valueLabel}</span>
      ) : null}
      {delta != null ? (
        <span
          className={cn(
            'text-2xs tabular-nums font-medium',
            delta >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1)}%
        </span>
      ) : null}
    </span>
  );
}

/**
 * shadcn Command-based context grabber menu.
 * Filtering/loading stay in the parent provider; this shell is visual + selection only.
 */
export function MentionPickerMenu({
  suggestions,
  highlightedIndex,
  parentStack,
  activeQuery,
  onHighlight,
  onSelect,
  onBack,
  analytics,
  platforms,
  selectedPlatform,
  onPlatformChange,
  className,
}: MentionPickerMenuProps) {
  const selectedKey =
    suggestions[highlightedIndex] != null
      ? `${suggestions[highlightedIndex].key}::${highlightedIndex}`
      : '';
  const inFolder = parentStack.length > 0;
  const currentFolder = parentStack[parentStack.length - 1] ?? null;
  const showPlatformFilter = Boolean(platforms && platforms.length > 0 && onPlatformChange);

  return (
    <div
      className={cn(
        'absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-full max-w-[28rem]',
        'overflow-hidden rounded-xl border border-border/70 bg-popover text-popover-foreground',
        'shadow-[0_18px_50px_-24px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/10',
        className,
      )}
    >
      <Command
        shouldFilter={false}
        value={selectedKey}
        onValueChange={(value) => {
          // Values are `${suggestion.key}::${index}` — recover the index first.
          const sep = value.lastIndexOf('::');
          if (sep >= 0) {
            const idx = Number.parseInt(value.slice(sep + 2), 10);
            if (Number.isFinite(idx) && idx >= 0 && idx < suggestions.length) {
              onHighlight(idx);
              return;
            }
          }
          const idx = suggestions.findIndex((s) => s.key === value);
          if (idx >= 0) onHighlight(idx);
        }}
        className="bg-transparent"
      >
        {/* Header: breadcrumb + optional query chip */}
        <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
          {inFolder ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Back"
              onClick={onBack}
            >
              <ChevronLeft className="size-4" />
            </Button>
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              <AtSign className="size-3.5" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            {inFolder ? (
              <Breadcrumb>
                <BreadcrumbList className="gap-1 text-xs sm:gap-1">
                  <BreadcrumbItem>
                    <span className="text-muted-foreground">Context</span>
                  </BreadcrumbItem>
                  {parentStack.map((parent, i) => (
                    <span key={parent.key} className="contents">
                      <BreadcrumbSeparator className="[&>svg]:size-3">
                        <ChevronRight />
                      </BreadcrumbSeparator>
                      <BreadcrumbItem>
                        {i === parentStack.length - 1 ? (
                          <BreadcrumbPage className="max-w-[10rem] truncate font-medium">
                            {parent.label}
                          </BreadcrumbPage>
                        ) : (
                          <span className="max-w-[7rem] truncate text-muted-foreground">
                            {parent.label}
                          </span>
                        )}
                      </BreadcrumbItem>
                    </span>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <p className="truncate text-xs font-medium text-foreground">Add context</p>
            )}
            <p className="truncate text-2xs text-muted-foreground">
              {currentFolder?.childrenLabel
                ? currentFolder.childrenLabel
                : activeQuery
                  ? `Matching “${activeQuery}”`
                  : 'Browse families or keep typing to search'}
            </p>
          </div>

          {activeQuery ? (
            <Badge variant="muted" className="max-w-[6rem] truncate font-normal">
              @{activeQuery}
            </Badge>
          ) : null}
        </div>

        {showPlatformFilter ? (
          <fieldset className="m-0 flex items-center gap-1.5 border-0 border-b border-border/50 px-2.5 py-1.5">
            <legend className="sr-only">Filter by platform</legend>
            <span className="mr-0.5 shrink-0 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Platform
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {platforms!.map((platform) => {
                const active = selectedPlatform === platform.id;
                return (
                  <button
                    key={platform.id}
                    type="button"
                    aria-pressed={active}
                    title={platform.label}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onPlatformChange?.(platform.id);
                    }}
                    className={cn(
                      'h-6 rounded-full border px-2 text-2xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/70 bg-background/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {PLATFORM_SHORT[platform.id] ?? platform.label.slice(0, 2).toUpperCase()}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <CommandList className="max-h-none overflow-visible">
          <ScrollArea className="h-[min(18rem,50vh)]">
            <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
              No references found.
            </CommandEmpty>
            <CommandGroup heading={inFolder ? undefined : undefined} className="p-1.5">
              {suggestions.map((suggestion, index) => {
                const isFamily = Boolean(suggestion.isFolder || suggestion.childrenLabel);
                const showMedia = hasMediaPreview(suggestion);
                // Always suffix with index so duplicate upstream ids (e.g. What's
                // Working cluster slugs) never collide as React/cmdk identities.
                const itemKey = `${suggestion.key}::${index}`;
                const secondary = suggestion.description ?? suggestion.childrenLabel ?? null;
                return (
                  <MentionSuggestionHover
                    key={itemKey}
                    suggestion={suggestion}
                    analytics={analytics}
                  >
                    <CommandItem
                      value={itemKey}
                      onMouseEnter={() => onHighlight(index)}
                      onSelect={() => onSelect(suggestion)}
                      className={cn(
                        'gap-2.5 rounded-lg px-2.5 py-2 aria-selected:bg-accent/80',
                        index === highlightedIndex && 'bg-accent/80 text-accent-foreground',
                      )}
                    >
                      {showMedia ? <SuggestionThumb suggestion={suggestion} /> : null}
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="truncate text-sm font-medium leading-tight">
                          {suggestion.label}
                        </span>
                        {secondary && !isFamily ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {secondary}
                          </span>
                        ) : isFamily && suggestion.childrenLabel ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {suggestion.childrenLabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <MetricInlineStat suggestion={suggestion} />
                        {isFamily ? (
                          <ChevronRight className="size-3.5 text-muted-foreground/70" />
                        ) : null}
                      </span>
                    </CommandItem>
                  </MentionSuggestionHover>
                );
              })}
            </CommandGroup>
          </ScrollArea>
        </CommandList>

        <Separator />
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-2xs text-muted-foreground">
          <span>
            <kbd className="rounded border border-border/70 bg-muted/50 px-1 py-px font-mono">
              ↑↓
            </kbd>{' '}
            navigate
            <span className="mx-1.5 text-border">·</span>
            <kbd className="rounded border border-border/70 bg-muted/50 px-1 py-px font-mono">
              ↵
            </kbd>{' '}
            select
            {inFolder ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                <kbd className="rounded border border-border/70 bg-muted/50 px-1 py-px font-mono">
                  esc
                </kbd>{' '}
                back
              </>
            ) : null}
          </span>
          <span className="tabular-nums">
            {suggestions.length} {suggestions.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </Command>
    </div>
  );
}
