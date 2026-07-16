'use client';

import type {
  CustomField,
  CustomFieldFilter,
  LibraryMediaType,
  LibraryPlacement,
  MediaReviewStatus,
  MediaSource,
} from '@continuum/contracts';
import { Check, ChevronDown, Search, SlidersHorizontal, Tags, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CREATION_METHOD_GROUPS,
  KIND_FILTERS,
  type KindFilterValue,
  type LibraryTagOption,
  SOURCE_FILTERS,
  type SourceFilterValue,
} from '@/lib/media/filters';
import { cn } from '@/lib/utils';
import { FieldFilterChips } from './fields/FieldFilterChips';

type Props = {
  source: SourceFilterValue;
  kind: KindFilterValue;
  onSourceChange: (value: SourceFilterValue) => void;
  onKindChange: (value: KindFilterValue) => void;
  mediaType?: LibraryMediaType;
  onMediaTypeChange?: (value: LibraryMediaType) => void;
  createdWith?: readonly MediaSource[];
  onCreatedWithChange?: (values: MediaSource[]) => void;
  placements?: readonly LibraryPlacement[];
  onPlacementsChange?: (values: LibraryPlacement[]) => void;
  reviewStatuses?: readonly MediaReviewStatus[];
  onReviewStatusesChange?: (values: MediaReviewStatus[]) => void;
  used?: boolean | null;
  onUsedChange?: (value: boolean | null) => void;
  shared?: boolean | null;
  onSharedChange?: (value: boolean | null) => void;
  leadingOnly?: boolean;
  onLeadingOnlyChange?: (value: boolean) => void;
  // Tag chips render only when a change handler and a non-empty vocabulary are
  // provided, so surfaces without tag filtering (studio sheet, pickers) opt out
  // by omission.
  tagOptions?: readonly LibraryTagOption[];
  selectedTags?: readonly string[];
  onTagsChange?: (tags: string[]) => void;
  // Custom-field chips follow the same opt-in rule as tags, and compose with the
  // source/kind/tag chips rather than replacing them: the API ANDs them together.
  customFields?: readonly CustomField[];
  fieldFilters?: readonly CustomFieldFilter[];
  onFieldFiltersChange?: (filters: CustomFieldFilter[]) => void;
  // Visual density: "page" for the library route, "compact" for the studio sheet.
  variant?: 'page' | 'compact';
  // The full Library page already exposes source in its collection sidebar.
  // Embedded pickers can keep this row visible because they have no sidebar.
  showSource?: boolean;
  className?: string;
};

export function LibraryFilterBar({
  source,
  kind,
  onSourceChange,
  onKindChange,
  mediaType,
  onMediaTypeChange,
  createdWith,
  onCreatedWithChange,
  placements,
  onPlacementsChange,
  reviewStatuses,
  onReviewStatusesChange,
  used,
  onUsedChange,
  shared,
  onSharedChange,
  leadingOnly,
  onLeadingOnlyChange,
  tagOptions,
  selectedTags,
  onTagsChange,
  customFields,
  fieldFilters,
  onFieldFiltersChange,
  variant = 'page',
  showSource = true,
  className,
}: Props) {
  const reduceMotion = useReducedMotion();
  const layoutId = variant === 'compact' ? 'studio-filter-pill' : 'library-filter-pill';

  if (variant === 'page' && mediaType && onMediaTypeChange && onCreatedWithChange) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <AdvancedFilterPopover
          mediaType={mediaType}
          onMediaTypeChange={onMediaTypeChange}
          createdWith={createdWith ?? []}
          onCreatedWithChange={onCreatedWithChange}
          placements={placements ?? []}
          onPlacementsChange={onPlacementsChange}
          reviewStatuses={reviewStatuses ?? []}
          onReviewStatusesChange={onReviewStatusesChange}
          used={used}
          onUsedChange={onUsedChange}
          shared={shared}
          onSharedChange={onSharedChange}
          leadingOnly={leadingOnly ?? false}
          onLeadingOnlyChange={onLeadingOnlyChange}
          tagOptions={tagOptions ?? []}
          selectedTags={selectedTags ?? []}
          onTagsChange={onTagsChange}
        />
        {(selectedTags ?? []).map((tag) => (
          <span
            key={tag}
            className="inline-flex min-h-8 max-w-44 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-foreground"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              onClick={() => onTagsChange?.((selectedTags ?? []).filter((item) => item !== tag))}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label={`Remove ${tag} tag filter`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {onFieldFiltersChange && customFields && customFields.length > 0 && (
          <FieldFilterChips
            fields={customFields}
            filters={fieldFilters ?? []}
            onChange={onFieldFiltersChange}
            variant={variant}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {showSource ? (
        variant === 'page' ? (
          <FacetSelect
            label="Created with"
            options={SOURCE_FILTERS}
            active={source}
            onSelect={onSourceChange}
          />
        ) : (
          <ChipRow
            label="Source"
            options={SOURCE_FILTERS}
            active={source}
            onSelect={onSourceChange}
            layoutId={`${layoutId}-source`}
            reduceMotion={!!reduceMotion}
            variant={variant}
          />
        )
      ) : null}
      <ChipRow
        label="Format"
        options={KIND_FILTERS}
        active={kind}
        onSelect={onKindChange}
        layoutId={`${layoutId}-kind`}
        reduceMotion={!!reduceMotion}
        variant={variant}
      />
      {onTagsChange && tagOptions && tagOptions.length > 0 && (
        <TagChipRow
          options={tagOptions}
          selected={selectedTags ?? []}
          onChange={onTagsChange}
          variant={variant}
        />
      )}
      {onFieldFiltersChange && customFields && customFields.length > 0 && (
        <FieldFilterChips
          fields={customFields}
          filters={fieldFilters ?? []}
          onChange={onFieldFiltersChange}
          variant={variant}
        />
      )}
    </div>
  );
}

const MEDIA_TYPE_OPTIONS: readonly { value: LibraryMediaType; label: string }[] = [
  { value: 'all', label: 'All assets' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'carousel', label: 'Carousels' },
  { value: 'project_file', label: 'Project files' },
];

const PLACEMENT_OPTIONS: readonly { value: LibraryPlacement; label: string }[] = [
  { value: 'reel', label: 'Reel / short-form' },
  { value: 'story', label: 'Story' },
  { value: 'feed', label: 'Feed' },
  { value: 'ad', label: 'Ad' },
  { value: 'other', label: 'Other' },
];

const REVIEW_OPTIONS: readonly { value: MediaReviewStatus; label: string }[] = [
  { value: 'in_review', label: 'In review' },
  { value: 'needs_changes', label: 'Needs changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'draft', label: 'Draft' },
];

function AdvancedFilterPopover({
  mediaType,
  onMediaTypeChange,
  createdWith,
  onCreatedWithChange,
  placements,
  onPlacementsChange,
  reviewStatuses,
  onReviewStatusesChange,
  used,
  onUsedChange,
  shared,
  onSharedChange,
  leadingOnly,
  onLeadingOnlyChange,
  tagOptions,
  selectedTags,
  onTagsChange,
}: {
  mediaType: LibraryMediaType;
  onMediaTypeChange: (value: LibraryMediaType) => void;
  createdWith: readonly MediaSource[];
  onCreatedWithChange: (values: MediaSource[]) => void;
  placements: readonly LibraryPlacement[];
  onPlacementsChange?: (values: LibraryPlacement[]) => void;
  reviewStatuses: readonly MediaReviewStatus[];
  onReviewStatusesChange?: (values: MediaReviewStatus[]) => void;
  used?: boolean | null;
  onUsedChange?: (value: boolean | null) => void;
  shared?: boolean | null;
  onSharedChange?: (value: boolean | null) => void;
  leadingOnly: boolean;
  onLeadingOnlyChange?: (value: boolean) => void;
  tagOptions: readonly LibraryTagOption[];
  selectedTags: readonly string[];
  onTagsChange?: (tags: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (label: string) => !normalized || label.toLocaleLowerCase().includes(normalized);
  const activeCount =
    (mediaType === 'all' ? 0 : 1) +
    createdWith.length +
    placements.length +
    reviewStatuses.length +
    (used == null ? 0 : 1) +
    (shared == null ? 0 : 1) +
    (leadingOnly ? 1 : 0) +
    selectedTags.length;
  const toggleValue = <T extends string>(values: readonly T[], value: T): T[] =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
        >
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          Filter
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-1.5 text-primary">{activeCount}</span>
          ) : null}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="sticky top-0 z-10 border-b border-border bg-popover p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search filters and tags"
              aria-label="Search library filters"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="max-h-[min(65vh,32rem)] space-y-4 overflow-y-auto p-3">
          {MEDIA_TYPE_OPTIONS.some((option) => matches(option.label)) ? (
            <FilterSection label="Media type">
              {MEDIA_TYPE_OPTIONS.filter((option) => matches(option.label)).map((option) => (
                <FilterChoice
                  key={option.value}
                  label={option.label}
                  selected={mediaType === option.value}
                  onClick={() => onMediaTypeChange(option.value)}
                />
              ))}
            </FilterSection>
          ) : null}

          {CREATION_METHOD_GROUPS.some((option) => matches(option.label)) ? (
            <FilterSection label="Created with">
              {CREATION_METHOD_GROUPS.filter((option) => matches(option.label)).map((option) => (
                <FilterChoice
                  key={option.value}
                  label={option.label}
                  selected={createdWith.includes(option.value)}
                  onClick={() => onCreatedWithChange(toggleValue(createdWith, option.value))}
                />
              ))}
            </FilterSection>
          ) : null}

          {onPlacementsChange && PLACEMENT_OPTIONS.some((option) => matches(option.label)) ? (
            <FilterSection label="Use / placement">
              {PLACEMENT_OPTIONS.filter((option) => matches(option.label)).map((option) => (
                <FilterChoice
                  key={option.value}
                  label={option.label}
                  selected={placements.includes(option.value)}
                  onClick={() => onPlacementsChange(toggleValue(placements, option.value))}
                />
              ))}
            </FilterSection>
          ) : null}

          {onReviewStatusesChange && REVIEW_OPTIONS.some((option) => matches(option.label)) ? (
            <FilterSection label="Workflow">
              {REVIEW_OPTIONS.filter((option) => matches(option.label)).map((option) => (
                <FilterChoice
                  key={option.value}
                  label={option.label}
                  selected={reviewStatuses.includes(option.value)}
                  onClick={() => onReviewStatusesChange(toggleValue(reviewStatuses, option.value))}
                />
              ))}
              {onSharedChange && matches('Shared') ? (
                <FilterChoice
                  label="Shared"
                  selected={shared === true}
                  onClick={() => onSharedChange(shared === true ? null : true)}
                />
              ) : null}
            </FilterSection>
          ) : null}

          {(onUsedChange || onLeadingOnlyChange) &&
          ['Used', 'Unused', 'Leading version'].some(matches) ? (
            <FilterSection label="Performance">
              {onUsedChange && matches('Used') ? (
                <FilterChoice
                  label="Used"
                  selected={used === true}
                  onClick={() => onUsedChange(used === true ? null : true)}
                />
              ) : null}
              {onUsedChange && matches('Unused') ? (
                <FilterChoice
                  label="Unused"
                  selected={used === false}
                  onClick={() => onUsedChange(used === false ? null : false)}
                />
              ) : null}
              {onLeadingOnlyChange && matches('Leading version') ? (
                <FilterChoice
                  label="Leading version"
                  selected={leadingOnly}
                  onClick={() => onLeadingOnlyChange(!leadingOnly)}
                />
              ) : null}
            </FilterSection>
          ) : null}

          {onTagsChange && tagOptions.some(({ tag }) => matches(tag)) ? (
            <FilterSection label="Tags">
              {tagOptions
                .filter(({ tag }) => matches(tag))
                .map(({ tag, count }) => (
                  <FilterChoice
                    key={tag}
                    label={tag}
                    count={count}
                    selected={selectedTags.includes(tag)}
                    onClick={() => onTagsChange(toggleValue(selectedTags, tag))}
                  />
                ))}
            </FilterSection>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 px-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function FilterChoice({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
    >
      <span className="flex size-4 items-center justify-center">
        {selected ? <Check className="size-3.5 text-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  );
}

function TagChipRow({
  options,
  selected,
  onChange,
  variant,
}: {
  options: readonly LibraryTagOption[];
  selected: readonly string[];
  onChange: (tags: string[]) => void;
  variant: 'page' | 'compact';
}) {
  const [query, setQuery] = useState('');
  const [tagSort, setTagSort] = useState<'frequency' | 'az'>('frequency');
  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matching = normalized
      ? options.filter(({ tag }) => tag.toLocaleLowerCase().includes(normalized))
      : [...options];
    return tagSort === 'az'
      ? matching.toSorted((left, right) => left.tag.localeCompare(right.tag))
      : matching.toSorted((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
  }, [options, query, tagSort]);

  if (variant === 'compact') {
    return (
      <ChipRow
        label="Tags"
        options={options.map(({ tag, count }) => ({ value: tag, label: `${tag} ${count}` }))}
        active={selected[0] ?? ''}
        onSelect={toggle}
        layoutId="compact-tag-pill"
        reduceMotion
        variant="compact"
      />
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
      <legend className="sr-only">Filter by tag</legend>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <Tags className="size-3.5 text-muted-foreground" />
            Tags
            {selected.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 text-primary">
                {selected.length}
              </span>
            ) : null}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tags"
              aria-label="Search tags"
              className="h-9 pl-8"
            />
          </div>
          <fieldset className="mb-2 flex items-center gap-1">
            <legend className="sr-only">Sort tags</legend>
            {(
              [
                { value: 'frequency', label: 'Most used' },
                { value: 'az', label: 'A–Z' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={tagSort === option.value}
                onClick={() => setTagSort(option.value)}
                className={cn(
                  'rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-accent',
                  tagSort === option.value && 'bg-accent font-medium text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-5 text-center text-xs text-muted-foreground">No tags found.</p>
            ) : (
              visible.map(({ tag, count }) => {
                const isActive = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(tag)}
                    aria-pressed={isActive}
                    className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="flex size-4 items-center justify-center">
                      {isActive ? <Check className="size-3.5 text-primary" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{tag}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selected.map((tag) => (
        <span
          key={tag}
          className="inline-flex min-h-8 max-w-44 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-foreground"
        >
          <span className="truncate">{tag}</span>
          <button
            type="button"
            onClick={() => toggle(tag)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label={`Remove ${tag} tag filter`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </fieldset>
  );
}

function FacetSelect<T extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
}) {
  const activeLabel = options.find((option) => option.value === active)?.label ?? label;
  return (
    <fieldset aria-label={`Filter by ${label.toLowerCase()}`} className="border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <span className="text-muted-foreground">{label}</span>
            <span>{activeLabel}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5">
          {options.map((option) => {
            const isActive = option.value === active;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
                aria-pressed={isActive}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex size-4 items-center justify-center">
                  {isActive ? <Check className="size-3.5 text-primary" /> : null}
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </fieldset>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  active,
  onSelect,
  layoutId,
  reduceMotion,
  variant,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
  layoutId: string;
  reduceMotion: boolean;
  variant: 'page' | 'compact';
}) {
  const compact = variant === 'compact';
  return (
    <fieldset
      aria-label={`Filter by ${label.toLowerCase()}`}
      className={cn(
        'flex items-center gap-2 border-0 p-0',
        compact ? 'text-white/55' : 'text-muted-foreground',
      )}
    >
      <legend className="sr-only">{label}</legend>
      <span aria-hidden className="text-2xs font-semibold uppercase tracking-wide">
        {label}
      </span>
      <div
        className={cn(
          'inline-flex items-center rounded-full p-0.5',
          compact ? 'bg-white/5' : 'bg-muted/60',
        )}
      >
        {options.map((opt) => {
          const isActive = opt.value === active;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              aria-pressed={isActive}
              className={cn(
                'relative min-h-8 rounded-full px-3 text-xs font-medium tabular-nums',
                'transition-[color] [transition-property:color] active:scale-[0.96]',
                compact
                  ? isActive
                    ? 'text-white'
                    : 'text-white/55 hover:text-white/80'
                  : isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  className={cn(
                    'absolute inset-0 rounded-full shadow-sm',
                    compact ? 'bg-white/15' : 'bg-background',
                  )}
                  transition={
                    reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.3 }
                  }
                />
              )}
              <span className="relative z-10">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
