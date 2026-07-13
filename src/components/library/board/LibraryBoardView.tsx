'use client';

// Kanban board over ONE single-select dimension, with drag-between-lanes. The
// dimension is the viewer's choice: review_status (the default — Unsorted →
// draft → in review → needs changes → approved) or any of the brand's custom
// single-select fields.
//
// The two are NOT the same write, and the board must never confuse them. A drop
// on a review lane posts an audited review TRANSITION; a drop on a custom-field
// lane PUTs a field value. The lane id is what carries the distinction — it is
// built by encodeLaneId and read back by decodeLaneId, so the drop handler
// dispatches on a decoded target rather than on a guess about what the string
// meant.
//
// v1 fetches the brand's assets from the existing listing route and groups them
// client-side. Grouping by a custom field additionally needs each asset's value
// for that field: the listing route can filter by a field, so one request per
// option builds the id → option map, and every asset it does not name is (by
// definition) unset.

import type { CustomField, CustomFieldFilter, MediaAsset } from '@continuum/contracts';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, Columns3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { serializeFieldFilters, setAssetFieldValue } from '@/lib/library/customFields';
import { isGroupableField } from '@/lib/library/customFieldValue';
import { transitionReviewStatus } from '@/lib/library/review';
import { normalizeReviewStatus, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { BoardCardContent } from './BoardCard';
import { BoardColumn } from './BoardColumn';
import { type BoardGrouping, buildBoardLanes, decodeLaneId } from './boardGrouping';

const PAGE_SIZE = 96;
const MAX_BOARD_ASSETS = 192;

const REVIEW_GROUPING: BoardGrouping = { kind: 'review_status' };
const REVIEW_GROUPING_LABEL = 'Review status';

// The board answers "what is in each lane", so it must honour whatever the
// viewer has narrowed to — chips, tag selection, collection, field filters, or
// an active search. Search results are passed in directly (assetsOverride)
// because they are ranked server-side and must not be re-fetched here.
export type LibraryBoardFilters = {
  source: MediaAsset['source'] | null;
  kind: MediaAsset['kind'] | null;
  tags: string[];
  collectionId: string | null;
  fieldFilters?: readonly CustomFieldFilter[];
};

export type LibraryBoardViewProps = {
  brandId: string;
  filters: LibraryBoardFilters;
  /** The brand's field vocabulary; the single-selects in it can group the board. */
  customFields?: readonly CustomField[];
  assetsOverride?: MediaAsset[] | null;
  /** Bumped by the viewer after a detail-modal mutation so the lanes re-read. */
  refreshKey?: number;
  onOpenDetail: (asset: MediaAsset) => void;
};

function boardQuery(
  brandId: string,
  filters: LibraryBoardFilters,
  fieldFilters: readonly CustomFieldFilter[],
  offset: number,
): string {
  const query = new URLSearchParams({
    brandId,
    offset: String(offset),
    limit: String(PAGE_SIZE),
  });
  if (filters.source) query.set('source', filters.source);
  if (filters.kind) query.set('kind', filters.kind);
  if (filters.tags.length > 0) query.set('tags', filters.tags.join(','));
  if (filters.collectionId) query.set('collectionId', filters.collectionId);
  if (fieldFilters.length > 0) query.set('fieldFilters', serializeFieldFilters(fieldFilters));
  return query.toString();
}

// The listing route caps limit at 96, so the board pages until it has a workable
// v1 snapshot (two pages) or the brand runs out of assets.
async function fetchBoardAssets(
  brandId: string,
  filters: LibraryBoardFilters,
  extraFieldFilters: readonly CustomFieldFilter[] = [],
): Promise<MediaAsset[]> {
  const fieldFilters = [...(filters.fieldFilters ?? []), ...extraFieldFilters];
  const collected: MediaAsset[] = [];
  let offset: number | null = 0;
  while (offset !== null && collected.length < MAX_BOARD_ASSETS) {
    const response = await fetch(
      `/api/library/assets?${boardQuery(brandId, filters, fieldFilters, offset)}`,
    );
    if (!response.ok) throw new Error(`Loading assets failed (${response.status})`);
    const payload = (await response.json()) as {
      items?: MediaAsset[];
      nextOffset?: number | null;
    };
    collected.push(...(payload.items ?? []));
    offset = payload.nextOffset ?? null;
  }
  return collected;
}

// assetId → the option it holds for `field`. One filtered listing per option:
// the route already knows how to answer "which assets hold this option", and an
// asset absent from every answer holds none.
async function fetchOptionByAssetId(
  brandId: string,
  filters: LibraryBoardFilters,
  field: CustomField,
): Promise<Map<string, string>> {
  const perOption = await Promise.all(
    field.options.map(async (option) => {
      const assets = await fetchBoardAssets(brandId, filters, [
        { fieldId: field.id, operator: 'any_of', values: [option.id] },
      ]);
      return [option.id, assets] as const;
    }),
  );
  const optionByAssetId = new Map<string, string>();
  for (const [optionId, assets] of perOption) {
    for (const asset of assets) optionByAssetId.set(asset.id, optionId);
  }
  return optionByAssetId;
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {REVIEW_STATUS_ORDER.map((status) => (
        <div key={status} className="flex w-56 shrink-0 flex-col gap-1.5">
          <Skeleton className="h-7 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function LibraryBoardView({
  brandId,
  filters,
  customFields,
  assetsOverride,
  refreshKey = 0,
  onOpenDetail,
}: LibraryBoardViewProps) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<MediaAsset | null>(null);
  const [groupByFieldId, setGroupByFieldId] = useState<string | null>(null);
  const [optionByAssetId, setOptionByAssetId] = useState<Map<string, string>>(new Map());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const groupableFields = useMemo(
    () => (customFields ?? []).filter(isGroupableField),
    [customFields],
  );

  // A field deleted (or made non-groupable) while it was the board's group-by
  // must not strand the board on a dimension that no longer exists.
  const groupField = groupableFields.find((field) => field.id === groupByFieldId) ?? null;
  const grouping: BoardGrouping = useMemo(
    () => (groupField ? { kind: 'custom_field', field: groupField } : REVIEW_GROUPING),
    [groupField],
  );

  // Serialized so the effects re-run on filter *value* changes, not on the
  // caller's object identity.
  const filterKey = `${filters.source ?? ''}|${filters.kind ?? ''}|${filters.tags.join(',')}|${filters.collectionId ?? ''}|${serializeFieldFilters(filters.fieldFilters ?? [])}`;

  useEffect(() => {
    if (assetsOverride) {
      setAssets(assetsOverride);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setAssets(null);
    setLoadError(null);
    fetchBoardAssets(brandId, filters)
      .then((items) => {
        if (!cancelled) setAssets(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAssets([]);
          setLoadError((err as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
    // filters is captured via filterKey; assetsOverride short-circuits the fetch.
    // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey serializes filters
  }, [brandId, filterKey, refreshKey, assetsOverride]);

  // Only a custom-field grouping needs values. Review status already rides on
  // the asset row, so the default board costs no extra request.
  useEffect(() => {
    if (!groupField) {
      setOptionByAssetId(new Map());
      return;
    }
    let cancelled = false;
    fetchOptionByAssetId(brandId, filters, groupField)
      .then((map) => {
        if (!cancelled) setOptionByAssetId(map);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey serializes filters
  }, [brandId, filterKey, refreshKey, groupField]);

  const lanes = useMemo(
    () => buildBoardLanes({ grouping, assets: assets ?? [], optionByAssetId }),
    [grouping, assets, optionByAssetId],
  );

  const setLocalOption = useCallback((assetId: string, optionId: string | null) => {
    setOptionByAssetId((prev) => {
      const next = new Map(prev);
      if (optionId === null) next.delete(assetId);
      else next.set(assetId, optionId);
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const asset = (assets ?? []).find((candidate) => candidate.id === String(event.active.id));
    setActiveAsset(asset ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveAsset(null);
    const { active, over } = event;
    if (!over) return;

    const target = decodeLaneId(String(over.id));
    if (!target) return;

    const assetId = String(active.id);
    const asset = (assets ?? []).find((candidate) => candidate.id === assetId);
    if (!asset) return;

    if (target.kind === 'review_status') {
      const fromStatus = normalizeReviewStatus(asset.reviewStatus);
      if (fromStatus === target.status) return;
      const toStatus = target.status;
      setAssets((prev) =>
        prev
          ? prev.map((item) => (item.id === assetId ? { ...item, reviewStatus: toStatus } : item))
          : prev,
      );
      transitionReviewStatus({ brandId, assetId, toStatus }).catch((err: unknown) => {
        setAssets((prev) =>
          prev
            ? prev.map((item) =>
                item.id === assetId ? { ...item, reviewStatus: fromStatus } : item,
              )
            : prev,
        );
        toast.error(`Move failed · ${(err as Error).message}`);
      });
      return;
    }

    const fromOptionId = optionByAssetId.get(assetId) ?? null;
    if (fromOptionId === target.optionId) return;
    setLocalOption(assetId, target.optionId);
    // The unset lane is a real destination: dropping there CLEARS the value.
    setAssetFieldValue({
      brandId,
      assetId,
      fieldId: target.fieldId,
      value: target.optionId,
    }).catch((err: unknown) => {
      setLocalOption(assetId, fromOptionId);
      toast.error(`Move failed · ${(err as Error).message}`);
    });
  };

  if (assets === null) return <BoardSkeleton />;

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <GroupByPicker
          label={groupField?.name ?? REVIEW_GROUPING_LABEL}
          fields={groupableFields}
          onSelect={setGroupByFieldId}
        />
        {loadError ? <p className="text-2xs text-destructive">{loadError}</p> : null}
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveAsset(null)}
      >
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {lanes.map((lane) => (
            <BoardColumn key={lane.id} lane={lane} onOpenDetail={onOpenDetail} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeAsset ? (
            <div className="w-52">
              <BoardCardContent asset={activeAsset} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// review_status sits in this menu as a FIRST-CLASS option beside the custom
// single-selects — it is not one of them (it is audited, and it is not stored in
// the fields table), but it is the same kind of question to ask of a board.
function GroupByPicker({
  label,
  fields,
  onSelect,
}: {
  label: string;
  fields: readonly CustomField[];
  onSelect: (fieldId: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Columns3 className="size-3.5" />
          <span>Group by</span>
          <span className="font-medium text-foreground">{label}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem className="text-xs" onSelect={() => onSelect(null)}>
          {REVIEW_GROUPING_LABEL}
        </DropdownMenuItem>
        {fields.map((field) => (
          <DropdownMenuItem key={field.id} className="text-xs" onSelect={() => onSelect(field.id)}>
            {field.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
