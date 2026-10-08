'use client';

import {
  type CustomField,
  type CustomFieldFilter,
  HDR_DYNAMIC_RANGES,
  LIBRARY_FORMAT_GROUP_LABELS,
  LIBRARY_FORMAT_GROUPS,
  type LibraryMediaType,
  type LibraryNumericRange,
  type LibraryPlacement,
  type LibraryRangeFilters,
  type LibraryTechnicalFilters,
  type MediaReviewStatus,
  type MediaSource,
  type Project,
  VIDEO_CODEC_FAMILIES,
} from '@continuum/contracts';
import { Check, ChevronDown, Search, SlidersHorizontal, Tags, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useMemo, useState } from 'react';
import { ProjectChip } from '@/components/projects/ProjectChip';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CREATION_METHOD_GROUPS,
  compactFilters,
  KIND_FILTERS,
  type KindFilterValue,
  LIBRARY_RESOLUTION_PRESETS,
  type LibraryTagOption,
  libraryRatingField,
  SOURCE_FILTERS,
  type SourceFilterValue,
  type StructuredLibraryFilters,
  structuredFilterChips,
  withoutStructuredFilter,
} from '@/lib/media/filters';
import { cn } from '@/lib/utils';
import { FieldFilterChips } from './fields/FieldFilterChips';
import { SaveFiltersAsCollection } from './fields/SaveFiltersAsCollection';
import { SortByFieldPicker } from './fields/SortByFieldPicker';
import { reviewFilterOptions } from './review/reviewFilterOptions';
import { useReviewCustomStates, useReviewStateLabels } from './review/useReviewStateLabels';
import { useFieldFilterLiveRefresh } from './useLibraryLiveRefresh';

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
  // The brand whose review labels and custom states the Workflow options wear; custom
  // states filter on review_state_id alongside the base statuses.
  brandId?: string | null;
  reviewStateIds?: readonly string[];
  onReviewStateIdsChange?: (ids: string[]) => void;
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
  // Project scope. Same opt-in rule as tags: a surface with no projects loaded omits both
  // and the section does not render.
  projectOptions?: readonly Project[];
  selectedProjectIds?: readonly string[];
  onProjectIdsChange?: (projectIds: string[]) => void;
  // Custom-field chips follow the same opt-in rule as tags, and compose with the
  // source/kind/tag chips rather than replacing them: the API ANDs them together.
  customFields?: readonly CustomField[];
  fieldFilters?: readonly CustomFieldFilter[];
  onFieldFiltersChange?: (filters: CustomFieldFilter[]) => void;
  // Format groups, technical ranges and custom-field ranges (the ★ Rating control). One
  // handler for the set: a popover edit and a chip's removal both hand back all four.
  structuredFilters?: StructuredLibraryFilters;
  onStructuredFiltersChange?: (filters: StructuredLibraryFilters) => void;
  /** Format-group counts, computed without the Format filter itself. */
  familyCounts?: Readonly<Record<string, number>>;
  /** Custom review state id → matching assets. */
  reviewStateCounts?: Readonly<Record<string, number>>;
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
  brandId,
  reviewStateIds,
  onReviewStateIdsChange,
  used,
  onUsedChange,
  shared,
  onSharedChange,
  leadingOnly,
  onLeadingOnlyChange,
  tagOptions,
  selectedTags,
  onTagsChange,
  projectOptions,
  selectedProjectIds,
  onProjectIdsChange,
  customFields,
  fieldFilters,
  onFieldFiltersChange,
  structuredFilters = {},
  onStructuredFiltersChange,
  familyCounts,
  reviewStateCounts,
  variant = 'page',
  showSource = true,
  className,
}: Props) {
  const reduceMotion = useReducedMotion();
  useFieldFilterLiveRefresh(customFields?.[0]?.brandId ?? null, (fieldFilters ?? []).length > 0);
  const layoutId = variant === 'compact' ? 'studio-filter-pill' : 'library-filter-pill';

  if (variant === 'page' && mediaType && onMediaTypeChange && onCreatedWithChange) {
    const structuredChips = structuredFilterChips(structuredFilters, customFields);
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <AdvancedFilterPopover
          structuredFilters={structuredFilters}
          onStructuredFiltersChange={onStructuredFiltersChange}
          structuredCount={structuredChips.length}
          familyCounts={familyCounts}
          reviewStateCounts={reviewStateCounts}
          customFields={customFields ?? []}
          mediaType={mediaType}
          onMediaTypeChange={onMediaTypeChange}
          createdWith={createdWith ?? []}
          onCreatedWithChange={onCreatedWithChange}
          placements={placements ?? []}
          onPlacementsChange={onPlacementsChange}
          reviewStatuses={reviewStatuses ?? []}
          onReviewStatusesChange={onReviewStatusesChange}
          brandId={brandId ?? customFields?.[0]?.brandId ?? null}
          reviewStateIds={reviewStateIds ?? []}
          onReviewStateIdsChange={onReviewStateIdsChange}
          used={used}
          onUsedChange={onUsedChange}
          shared={shared}
          onSharedChange={onSharedChange}
          leadingOnly={leadingOnly ?? false}
          onLeadingOnlyChange={onLeadingOnlyChange}
          tagOptions={tagOptions ?? []}
          selectedTags={selectedTags ?? []}
          onTagsChange={onTagsChange}
          projectOptions={projectOptions ?? []}
          selectedProjectIds={selectedProjectIds ?? []}
          onProjectIdsChange={onProjectIdsChange}
        />
        {(selectedProjectIds ?? []).flatMap((projectId) => {
          const project = (projectOptions ?? []).find((option) => option.id === projectId);
          if (!project) return [];
          return [
            <span key={projectId} className="inline-flex min-h-8 items-center gap-1">
              <ProjectChip project={project} className="max-w-44" />
              <button
                type="button"
                onClick={() =>
                  onProjectIdsChange?.(
                    (selectedProjectIds ?? []).filter((item) => item !== projectId),
                  )
                }
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${project.name} project filter`}
              >
                <X className="size-3" />
              </button>
            </span>,
          ];
        })}
        {(selectedTags ?? []).map((tag) => (
          <RemovableChip
            key={tag}
            label={tag}
            removeLabel={`Remove ${tag} tag filter`}
            onRemove={() => onTagsChange?.((selectedTags ?? []).filter((item) => item !== tag))}
          />
        ))}
        {onStructuredFiltersChange
          ? structuredChips.map((chip) => (
              <RemovableChip
                key={chip.id}
                label={chip.label}
                removeLabel={`Remove ${chip.label} filter`}
                onRemove={() =>
                  onStructuredFiltersChange(withoutStructuredFilter(structuredFilters, chip.id))
                }
              />
            ))
          : null}
        {onFieldFiltersChange && customFields && customFields.length > 0 && (
          <FieldFilterChips
            fields={customFields}
            filters={fieldFilters ?? []}
            onChange={onFieldFiltersChange}
            variant={variant}
          />
        )}
        {customFields && customFields.length > 0 ? (
          <SortByFieldPicker fields={customFields} />
        ) : null}
        {customFields?.[0] ? (
          <SaveFiltersAsCollection
            brandId={customFields[0].brandId}
            query={{
              mediaType,
              createdWith: [...(createdWith ?? [])],
              tags: [...(selectedTags ?? [])],
              reviewStatuses: [...(reviewStatuses ?? [])],
              fieldFilters: [...(fieldFilters ?? [])],
              families: [...(structuredFilters.families ?? [])],
              ranges: structuredFilters.ranges,
              technical: structuredFilters.technical,
              fieldRanges: [...(structuredFilters.fieldRanges ?? [])],
              reviewStateIds: [...(reviewStateIds ?? [])],
            }}
            onSaved={() => onFieldFiltersChange?.([])}
          />
        ) : null}
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

// What the popover search matches the Technical section on.
const TECHNICAL_SEARCH_TERMS = [
  'Technical',
  'Duration',
  'Resolution',
  ...LIBRARY_RESOLUTION_PRESETS.map((preset) => preset.label),
  'Frame rate',
  'Bit rate',
  'File size',
  'Date added',
  'Codec',
  ...Object.values(VIDEO_CODEC_FAMILIES).map((family) => family.label),
  'HDR',
  'Transparency',
  'Alpha',
];

const RATING_STARS = [1, 2, 3, 4, 5] as const;

const toggleValue = <T extends string>(values: readonly T[], value: T): T[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

const PLACEMENT_OPTIONS: readonly { value: LibraryPlacement; label: string }[] = [
  { value: 'reel', label: 'Reel / short-form' },
  { value: 'story', label: 'Story' },
  { value: 'feed', label: 'Feed' },
  { value: 'ad', label: 'Ad' },
  { value: 'other', label: 'Other' },
];

function AdvancedFilterPopover({
  structuredFilters,
  onStructuredFiltersChange,
  structuredCount,
  familyCounts,
  reviewStateCounts,
  customFields,
  mediaType,
  onMediaTypeChange,
  createdWith,
  onCreatedWithChange,
  placements,
  onPlacementsChange,
  reviewStatuses,
  onReviewStatusesChange,
  brandId,
  reviewStateIds,
  onReviewStateIdsChange,
  used,
  onUsedChange,
  shared,
  onSharedChange,
  leadingOnly,
  onLeadingOnlyChange,
  tagOptions,
  selectedTags,
  onTagsChange,
  projectOptions,
  selectedProjectIds,
  onProjectIdsChange,
}: {
  structuredFilters: StructuredLibraryFilters;
  onStructuredFiltersChange?: (filters: StructuredLibraryFilters) => void;
  structuredCount: number;
  familyCounts?: Readonly<Record<string, number>>;
  reviewStateCounts?: Readonly<Record<string, number>>;
  customFields: readonly CustomField[];
  mediaType: LibraryMediaType;
  onMediaTypeChange: (value: LibraryMediaType) => void;
  createdWith: readonly MediaSource[];
  onCreatedWithChange: (values: MediaSource[]) => void;
  placements: readonly LibraryPlacement[];
  onPlacementsChange?: (values: LibraryPlacement[]) => void;
  reviewStatuses: readonly MediaReviewStatus[];
  onReviewStatusesChange?: (values: MediaReviewStatus[]) => void;
  brandId: string | null;
  reviewStateIds: readonly string[];
  onReviewStateIdsChange?: (ids: string[]) => void;
  used?: boolean | null;
  onUsedChange?: (value: boolean | null) => void;
  shared?: boolean | null;
  onSharedChange?: (value: boolean | null) => void;
  leadingOnly: boolean;
  onLeadingOnlyChange?: (value: boolean) => void;
  tagOptions: readonly LibraryTagOption[];
  selectedTags: readonly string[];
  onTagsChange?: (tags: string[]) => void;
  projectOptions: readonly Project[];
  selectedProjectIds: readonly string[];
  onProjectIdsChange?: (projectIds: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const matches = (label: string) => !normalized || label.toLocaleLowerCase().includes(normalized);
  // Each base status under the brand's own label, then its custom states (indented).
  const reviewOptions = reviewFilterOptions(
    useReviewStateLabels(brandId),
    useReviewCustomStates(brandId),
  ).filter((option) => option.kind === 'status' || onReviewStateIdsChange);
  const families = structuredFilters.families ?? [];
  const ratingField = libraryRatingField(customFields);
  const ratingMin = structuredFilters.fieldRanges?.find(
    (range) => range.fieldId === ratingField?.id,
  )?.min;
  const setRating = (stars: number | undefined) => {
    if (!ratingField || !onStructuredFiltersChange) return;
    const others = (structuredFilters.fieldRanges ?? []).filter(
      (range) => range.fieldId !== ratingField.id,
    );
    onStructuredFiltersChange({
      ...structuredFilters,
      fieldRanges: stars ? [...others, { fieldId: ratingField.id, min: stars }] : others,
    });
  };
  // The legacy single media types are sidebar destinations now; only Carousels is chosen here.
  const activeCount =
    (mediaType === 'carousel' ? 1 : 0) +
    structuredCount +
    createdWith.length +
    placements.length +
    reviewStatuses.length +
    reviewStateIds.length +
    (used == null ? 0 : 1) +
    (shared == null ? 0 : 1) +
    (leadingOnly ? 1 : 0) +
    selectedTags.length +
    selectedProjectIds.length;

  return (
    <Popover>
      <PopoverTrigger
        render={
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
        }
      />
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
          {LIBRARY_FORMAT_GROUPS.some((group) => matches(LIBRARY_FORMAT_GROUP_LABELS[group])) ||
          matches('Carousels') ? (
            <FilterSection label="Format">
              {onStructuredFiltersChange
                ? LIBRARY_FORMAT_GROUPS.filter((group) =>
                    matches(LIBRARY_FORMAT_GROUP_LABELS[group]),
                  ).map((group) => (
                    <FilterChoice
                      key={group}
                      label={LIBRARY_FORMAT_GROUP_LABELS[group]}
                      count={familyCounts?.[group]}
                      selected={families.includes(group)}
                      onClick={() =>
                        onStructuredFiltersChange({
                          ...structuredFilters,
                          families: toggleValue(families, group),
                        })
                      }
                    />
                  ))
                : null}
              {/* A carousel is a set of images or videos, not a file format, so it stays a
                  media-type choice beside the groups. */}
              {matches('Carousels') ? (
                <FilterChoice
                  label="Carousels"
                  selected={mediaType === 'carousel'}
                  onClick={() => onMediaTypeChange(mediaType === 'carousel' ? 'all' : 'carousel')}
                />
              ) : null}
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

          {onReviewStatusesChange && reviewOptions.some((option) => matches(option.label)) ? (
            <FilterSection label="Workflow">
              {reviewOptions
                .filter((option) => matches(option.label))
                .map((option) =>
                  option.kind === 'status' ? (
                    <FilterChoice
                      key={option.value}
                      label={option.label}
                      selected={reviewStatuses.includes(option.value)}
                      onClick={() =>
                        onReviewStatusesChange(toggleValue(reviewStatuses, option.value))
                      }
                    />
                  ) : (
                    <FilterChoice
                      key={option.value}
                      label={option.label}
                      count={reviewStateCounts?.[option.value]}
                      className="pl-4"
                      selected={reviewStateIds.includes(option.value)}
                      onClick={() =>
                        onReviewStateIdsChange?.(toggleValue(reviewStateIds, option.value))
                      }
                    />
                  ),
                )}
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

          {onStructuredFiltersChange && ratingField && ['Rating', 'Stars'].some(matches) ? (
            <FilterSection label="Rating">
              <div className="flex flex-wrap gap-1 px-2">
                {RATING_STARS.map((stars) => (
                  <PillChoice
                    key={stars}
                    label={`★ ${stars}+`}
                    ariaLabel={`Rated ${stars} or more`}
                    selected={ratingMin === stars}
                    onClick={() => setRating(ratingMin === stars ? undefined : stars)}
                  />
                ))}
              </div>
            </FilterSection>
          ) : null}

          {onStructuredFiltersChange && TECHNICAL_SEARCH_TERMS.some(matches) ? (
            <TechnicalSection filters={structuredFilters} onChange={onStructuredFiltersChange} />
          ) : null}

          {/* Two different empties, and only one of them should hide the section. NO PROJECTS
              AT ALL still renders, with a line saying where they come from: self-hiding at
              zero is the bug that made this feature invisible in production, and the filter
              bar had the same one as the bulk toolbar. No project matching the SEARCH text
              hides, because that is what a search does and every sibling section agrees. */}
          {onProjectIdsChange &&
          (projectOptions.length === 0 ||
            projectOptions.some((project) => matches(project.name))) ? (
            <FilterSection label="Project">
              {projectOptions.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  No projects yet — select assets and use Tag, or add one in Settings.
                </span>
              ) : (
                projectOptions
                  .filter((project) => matches(project.name))
                  .map((project) => (
                    <FilterChoice
                      key={project.id}
                      label={project.name}
                      selected={selectedProjectIds.includes(project.id)}
                      onClick={() =>
                        onProjectIdsChange(toggleValue(selectedProjectIds, project.id))
                      }
                    />
                  ))
              )}
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
  className,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent',
        className,
      )}
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

function PillChoice({
  label,
  ariaLabel,
  selected,
  onClick,
}: {
  label: string;
  ariaLabel?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        'min-h-8 rounded-full border border-border px-2.5 text-xs hover:bg-accent',
        selected && 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15',
      )}
    >
      {label}
    </button>
  );
}

function RemovableChip({
  label,
  removeLabel,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex min-h-8 max-w-44 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-foreground">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label={removeLabel}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Sets one end of a range; a min typed past the max swaps them rather than failing the schema. */
function withRangeBound(
  range: LibraryNumericRange | undefined,
  bound: 'min' | 'max',
  value: number | undefined,
): LibraryNumericRange | undefined {
  const next = compactFilters({ ...range, [bound]: value });
  if (next?.min !== undefined && next.max !== undefined && next.min > next.max) {
    return { min: next.max, max: next.min };
  }
  return next;
}

/** A date input's day as the ISO instant it starts at, locally; `addDays` 1 = the exclusive end. */
function dayStartIso(value: string, addDays = 0): string | undefined {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day + addDays).toISOString();
}

function dateInputValue(iso: string | undefined, offsetMs = 0): string {
  if (!iso) return '';
  const date = new Date(Date.parse(iso) + offsetMs);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A number committed on blur or Enter, not per keystroke: every commit is a navigation.
 * Keyed on the committed value so a chip removal elsewhere resets what it shows.
 */
function BoundInput({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
}) {
  return (
    <Input
      key={value ?? ''}
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      inputSize="sm"
      defaultValue={value ?? ''}
      placeholder={placeholder}
      aria-label={label}
      className="w-20 text-xs"
      onBlur={(event) => {
        const raw = event.target.value.trim();
        const parsed = raw === '' ? undefined : Number(raw);
        const next =
          parsed !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function RangeRow({
  label,
  unit,
  scale,
  range,
  onChange,
  minOnly = false,
}: {
  label: string;
  unit: string;
  // Stored units per displayed unit: ms per second, bits per megabit, bytes per MB.
  scale: number;
  range: LibraryNumericRange | undefined;
  onChange: (range: LibraryNumericRange | undefined) => void;
  minOnly?: boolean;
}) {
  const shown = (stored: number | undefined) => (stored === undefined ? undefined : stored / scale);
  const set = (bound: 'min' | 'max', value: number | undefined) =>
    onChange(
      withRangeBound(
        range,
        bound,
        value === undefined ? undefined : scale === 1 ? value : Math.round(value * scale),
      ),
    );
  const name = label.toLowerCase();
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label} <span className="text-2xs">({unit})</span>
      </span>
      <BoundInput
        label={`Minimum ${name} in ${unit}`}
        placeholder={minOnly ? 'At least' : 'Min'}
        value={shown(range?.min)}
        onCommit={(value) => set('min', value)}
      />
      {minOnly ? null : (
        <>
          <span aria-hidden className="text-xs text-muted-foreground">
            –
          </span>
          <BoundInput
            label={`Maximum ${name} in ${unit}`}
            placeholder="Max"
            value={shown(range?.max)}
            onCommit={(value) => set('max', value)}
          />
        </>
      )}
    </div>
  );
}

function TechnicalSection({
  filters,
  onChange,
}: {
  filters: StructuredLibraryFilters;
  onChange: (filters: StructuredLibraryFilters) => void;
}) {
  const ranges = filters.ranges ?? {};
  const technical = filters.technical ?? {};
  const videoCodecs = technical.videoCodecs ?? [];
  const created = ranges.createdAt ?? {};
  const hdr = HDR_DYNAMIC_RANGES.every((range) => technical.dynamicRanges?.includes(range));
  const setRanges = (patch: Partial<LibraryRangeFilters>) =>
    onChange({ ...filters, ranges: compactFilters({ ...ranges, ...patch }) });
  const setTechnical = (patch: Partial<LibraryTechnicalFilters>) =>
    onChange({ ...filters, technical: compactFilters({ ...technical, ...patch }) });
  const setCreated = (bound: 'after' | 'before', iso: string | undefined) =>
    setRanges({ createdAt: compactFilters({ ...created, [bound]: iso }) });

  return (
    <FilterSection label="Technical">
      <div className="space-y-2 px-2 pb-1">
        <RangeRow
          label="Duration"
          unit="s"
          scale={1000}
          range={ranges.durationMs}
          onChange={(durationMs) => setRanges({ durationMs })}
        />
        <fieldset
          aria-label="Resolution"
          className="flex min-w-0 items-center gap-1.5 border-0 p-0"
        >
          <span aria-hidden className="w-24 shrink-0 text-xs text-muted-foreground">
            Resolution
          </span>
          {LIBRARY_RESOLUTION_PRESETS.map((preset) => {
            const selected =
              ranges.resolution?.min === preset.min && ranges.resolution.max === undefined;
            return (
              <PillChoice
                key={preset.min}
                label={preset.label}
                selected={selected}
                onClick={() =>
                  setRanges({ resolution: selected ? undefined : { min: preset.min } })
                }
              />
            );
          })}
        </fieldset>
        <RangeRow
          label="Frame rate"
          unit="fps"
          scale={1}
          minOnly
          range={ranges.frameRate}
          onChange={(frameRate) => setRanges({ frameRate })}
        />
        <RangeRow
          label="Bit rate"
          unit="Mb/s"
          scale={1e6}
          minOnly
          range={ranges.bitRate}
          onChange={(bitRate) => setRanges({ bitRate })}
        />
        <RangeRow
          label="File size"
          unit="MB"
          scale={1e6}
          range={ranges.sizeBytes}
          onChange={(sizeBytes) => setRanges({ sizeBytes })}
        />
        <div className="flex items-center gap-1.5">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">Date added</span>
          <Input
            type="date"
            inputSize="sm"
            aria-label="Added on or after"
            value={dateInputValue(created.after)}
            onChange={(event) => setCreated('after', dayStartIso(event.target.value))}
            className="min-w-0 flex-1 px-1.5 text-xs"
          />
          <span aria-hidden className="text-xs text-muted-foreground">
            –
          </span>
          <Input
            type="date"
            inputSize="sm"
            aria-label="Added on or before"
            value={dateInputValue(created.before, -1)}
            onChange={(event) => setCreated('before', dayStartIso(event.target.value, 1))}
            className="min-w-0 flex-1 px-1.5 text-xs"
          />
        </div>
        <fieldset aria-label="Video codec" className="flex min-w-0 flex-wrap gap-1 border-0 p-0">
          {Object.entries(VIDEO_CODEC_FAMILIES).map(([codec, { label }]) => (
            <PillChoice
              key={codec}
              label={label}
              selected={videoCodecs.includes(codec)}
              onClick={() => setTechnical({ videoCodecs: toggleValue(videoCodecs, codec) })}
            />
          ))}
        </fieldset>
      </div>
      <FilterChoice
        label="HDR"
        selected={hdr}
        onClick={() => setTechnical({ dynamicRanges: hdr ? undefined : [...HDR_DYNAMIC_RANGES] })}
      />
      <FilterChoice
        label="Transparency (alpha)"
        selected={technical.hasAlpha === true}
        onClick={() => setTechnical({ hasAlpha: technical.hasAlpha === true ? undefined : true })}
      />
    </FilterSection>
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
      : matching.toSorted(
          (left, right) => right.count - left.count || left.tag.localeCompare(right.tag),
        );
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
        <PopoverTrigger
          render={
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
          }
        />
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
        <RemovableChip
          key={tag}
          label={tag}
          removeLabel={`Remove ${tag} tag filter`}
          onRemove={() => toggle(tag)}
        />
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
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
            >
              <span className="text-muted-foreground">{label}</span>
              <span>{activeLabel}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          }
        />
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
