'use client';

import type { CustomField, CustomFieldFilter } from '@continuum/contracts';
import { motion, useReducedMotion } from 'motion/react';
import {
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

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {showSource ? (
        <ChipRow
          label="Source"
          options={SOURCE_FILTERS}
          active={source}
          onSelect={onSourceChange}
          layoutId={`${layoutId}-source`}
          reduceMotion={!!reduceMotion}
          variant={variant}
        />
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
  const compact = variant === 'compact';
  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  return (
    <fieldset
      aria-label="Filter by tag"
      className={cn(
        'flex flex-wrap items-center gap-2 border-0 p-0',
        compact ? 'text-white/55' : 'text-muted-foreground',
      )}
    >
      <legend className="sr-only">Tags</legend>
      <span aria-hidden className="text-2xs font-semibold uppercase tracking-wide">
        Tags
      </span>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-2xl p-0.5',
          compact ? 'bg-white/5' : 'bg-muted/60',
        )}
      >
        {options.map(({ tag, count }) => {
          const isActive = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              aria-pressed={isActive}
              className={cn(
                'flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-medium',
                'transition-colors active:scale-[0.96]',
                compact
                  ? isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/55 hover:text-white/80'
                  : isActive
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span>{tag}</span>
              <span
                className={cn(
                  'tabular-nums',
                  compact ? 'text-white/40' : 'text-muted-foreground/60',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
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
