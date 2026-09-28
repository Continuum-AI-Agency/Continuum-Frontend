'use client';

// Kanban board over ONE dimension, with drag-between-lanes. The dimension is the
// viewer's choice: review_status (the default — Unsorted → draft → in review → needs
// changes → approved) or ANY of the brand's custom fields; the lane shapes per type live
// in boardGrouping. Inside a collection the choice is saved to the collection's
// view_config.
//
// The two are NOT the same write, and the board must never confuse them. A drop
// on a review lane posts an audited review TRANSITION; a drop on a custom-field
// lane PUTs a field value. The lane id is what carries the distinction — it is
// built by encodeLaneId and read back by decodeLaneId, so the drop handler
// dispatches on a decoded target rather than on a guess about what the string
// meant.
//
// The board fetches the brand's assets from the existing listing route and groups
// them client-side. A custom-field grouping also reads every asset's value for that
// field in one request; an asset it does not name is (by definition) unset.

import {
  type CollectionViewConfig,
  type CustomField,
  type CustomFieldFilter,
  type CustomFieldValue,
  collectionViewConfigSchema,
  type MediaAsset,
  mediaReviewStatusSchema,
} from '@continuum/contracts';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast-imperative';
import { updateLibraryCollectionOperation } from '@/lib/library/creativeOperations';
import {
  listFieldValuesByAsset,
  serializeFieldFilters,
  setAssetFieldValue,
} from '@/lib/library/customFields';
import { setAssetReviewState, transitionReviewStatus } from '@/lib/library/review';
import { normalizeReviewStatus, REVIEW_STATUS_ORDER } from '@/lib/library/reviewStatus';
import { useLibraryAccess } from '@/lib/library/useBrandRole';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { useMentionTargets } from '../detail/useMentionTargets';
import { useReviewCustomStates, useReviewStateLabels } from '../review/useReviewStateLabels';
import { BoardCardContent } from './BoardCard';
import { BoardColumn } from './BoardColumn';
import {
  type BoardGrouping,
  boardAcceptsDrops,
  buildBoardLanes,
  decodeLaneId,
  dropValue,
} from './boardGrouping';

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
  selectedAssetIds?: ReadonlySet<string>;
  onToggleSelected?: (asset: MediaAsset) => void;
  groupBy: string;
  onGroupByChange: (groupBy: string) => void;
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

// assetId → the value it holds for `field`, in one read of the field's values. An asset
// the map does not name is unset.
function fetchValueByAssetId(brandId: string, field: CustomField) {
  return listFieldValuesByAsset({ brandId, fieldId: field.id });
}

async function fetchCollectionViewConfig(
  brandId: string,
  collectionId: string,
): Promise<CollectionViewConfig | null> {
  const response = await fetch(`/api/library/collections?brandId=${encodeURIComponent(brandId)}`);
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    collections?: { id: string; viewConfig?: unknown }[];
  };
  const collection = payload.collections?.find((candidate) => candidate.id === collectionId);
  const parsed = collectionViewConfigSchema.safeParse(collection?.viewConfig ?? {});
  return parsed.success ? parsed.data : null;
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
  selectedAssetIds,
  onToggleSelected,
  groupBy,
  onGroupByChange,
}: LibraryBoardViewProps) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<MediaAsset | null>(null);
  const [valueByAssetId, setValueByAssetId] = useState<Map<string, CustomFieldValue>>(new Map());
  const { brandRole, canEdit } = useLibraryAccess(brandId, {
    collectionId: filters.collectionId,
  });
  const acceptsDrops = boardAcceptsDrops(brandRole, canEdit);
  const reviewLabels = useReviewStateLabels(brandId);
  const customStates = useReviewCustomStates(brandId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Every field can group the board; the lane shapes live in boardGrouping.
  const groupableFields = customFields ?? [];

  // A field deleted (or made non-groupable) while it was the board's group-by
  // must not strand the board on a dimension that no longer exists.
  const groupField =
    groupBy === 'review_status'
      ? null
      : (groupableFields.find((field) => field.id === groupBy) ?? null);
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
      setValueByAssetId(new Map());
      return;
    }
    let cancelled = false;
    fetchValueByAssetId(brandId, groupField)
      .then((map) => {
        if (!cancelled) setValueByAssetId(map);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey serializes filters
  }, [brandId, filterKey, refreshKey, groupField]);

  // Live, brand-wide: another member's field write or review move lands in this board's
  // lanes as the row arrives — merged in place, no refetch and no reload.
  const groupFieldId = groupField?.id ?? null;
  useEffect(() => {
    return subscribeToPostgresChanges({
      label: `library-board-${brandId}`,
      bindings: [
        {
          event: '*',
          schema: 'media',
          table: 'asset_field_values',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row, meta) => {
            const source = meta.eventType === 'DELETE' ? meta.old : row;
            if (!groupFieldId || source.field_id !== groupFieldId) return;
            const assetId = String(source.asset_id ?? '');
            if (!assetId) return;
            setValueByAssetId((prev) => {
              const next = new Map(prev);
              if (meta.eventType === 'DELETE') next.delete(assetId);
              else next.set(assetId, row.value as CustomFieldValue);
              return next;
            });
          },
        },
        {
          event: 'UPDATE',
          schema: 'media',
          table: 'assets',
          filter: `brand_id=eq.${brandId}`,
          onRow: (row) => {
            const reviewStatus = mediaReviewStatusSchema.safeParse(row.review_status);
            if (!reviewStatus.success) return;
            setAssets((prev) =>
              prev
                ? prev.map((item) =>
                    item.id === row.id
                      ? {
                          ...item,
                          reviewStatus: reviewStatus.data,
                          reviewStateId:
                            typeof row.review_state_id === 'string' ? row.review_state_id : null,
                        }
                      : item,
                  )
                : prev,
            );
          },
        },
      ],
    });
  }, [brandId, groupFieldId]);

  const members = useMentionTargets(
    groupField?.type === 'user' || groupField?.type === 'user_multi' ? brandId : null,
  );
  const lanes = useMemo(
    () =>
      buildBoardLanes({
        grouping,
        assets: assets ?? [],
        valueByAssetId,
        members: members ?? [],
        reviewLabels,
        customStates,
      }),
    [grouping, assets, valueByAssetId, members, reviewLabels, customStates],
  );

  // Inside a collection the grouping is the collection's, not the viewer's: it is
  // read from view_config when the collection opens and written back on change, so
  // everyone who opens the board sees the same lanes.
  const collectionId = filters.collectionId;
  const [viewConfig, setViewConfig] = useState<CollectionViewConfig | null>(null);
  useEffect(() => {
    setViewConfig(null);
    if (!collectionId) return;
    let cancelled = false;
    fetchCollectionViewConfig(brandId, collectionId).then((config) => {
      if (cancelled || !config) return;
      setViewConfig(config);
      if (config.groupBy && config.groupBy !== groupBy) onGroupByChange(config.groupBy);
    });
    return () => {
      cancelled = true;
    };
    // Read once per collection; groupBy changes are written, not re-read.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [brandId, collectionId]);

  const chooseGroupBy = (next: string) => {
    onGroupByChange(next);
    if (!collectionId || !viewConfig || viewConfig.groupBy === next) return;
    const nextConfig = { ...viewConfig, groupBy: next };
    setViewConfig(nextConfig);
    updateLibraryCollectionOperation(createSupabaseBrowserClient(), {
      brandId,
      collectionId,
      viewConfig: nextConfig,
    }).catch((err: unknown) => {
      // A system view (or someone else's) cannot be re-configured; the board still
      // regroups for this viewer.
      console.warn('[LibraryBoardView] could not save the grouping', err);
    });
  };

  const setLocalValue = useCallback((assetId: string, value: CustomFieldValue) => {
    setValueByAssetId((prev) => {
      const next = new Map(prev);
      if (value === null) next.delete(assetId);
      else next.set(assetId, value);
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    if (!acceptsDrops) return;
    const asset = (assets ?? []).find((candidate) => candidate.id === String(event.active.id));
    setActiveAsset(asset ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveAsset(null);
    if (!acceptsDrops) return;
    const { active, over } = event;
    if (!over) return;

    const target = decodeLaneId(String(over.id));
    if (!target) return;

    const assetId = String(active.id);
    const asset = (assets ?? []).find((candidate) => candidate.id === assetId);
    if (!asset) return;

    if (target.kind === 'review_status' || target.kind === 'review_state') {
      const from = {
        reviewStatus: normalizeReviewStatus(asset.reviewStatus),
        reviewStateId: asset.reviewStateId ?? null,
      };
      const to = {
        reviewStatus: target.status,
        reviewStateId: target.kind === 'review_state' ? target.stateId : null,
      };
      if (from.reviewStatus === to.reviewStatus && from.reviewStateId === to.reviewStateId) return;
      const place = (fields: typeof from) =>
        setAssets((prev) =>
          prev ? prev.map((item) => (item.id === assetId ? { ...item, ...fields } : item)) : prev,
        );
      place(to);
      // A base lane is a plain transition; a custom-state lane goes through the
      // library-review edge function, which records the state on the event.
      const write =
        target.kind === 'review_state'
          ? setAssetReviewState({ brandId, assetId, stateId: target.stateId })
          : transitionReviewStatus({ brandId, assetId, toStatus: target.status });
      write.catch((err: unknown) => {
        place(from);
        toast.error(`Move failed · ${(err as Error).message}`);
      });
      return;
    }

    if (!groupField || target.fieldId !== groupField.id) return;
    const current = valueByAssetId.get(assetId) ?? null;
    const next = dropValue(groupField, target.optionId, current);
    if (next === undefined) {
      toast.info(`${groupField.name} lanes group by range — set the value on the asset`);
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    setLocalValue(assetId, next);
    // The unset lane is a real destination: dropping there CLEARS the value.
    setAssetFieldValue({ brandId, assetId, fieldId: groupField.id, value: next }).catch(
      (err: unknown) => {
        setLocalValue(assetId, current);
        toast.error(`Move failed · ${(err as Error).message}`);
      },
    );
  };

  if (assets === null) return <BoardSkeleton />;

  return (
    <div className="flex h-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <GroupByPicker
          label={groupField?.name ?? REVIEW_GROUPING_LABEL}
          fields={groupableFields}
          onSelect={(fieldId) => chooseGroupBy(fieldId ?? 'review_status')}
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
            <BoardColumn
              key={lane.id}
              lane={lane}
              onOpenDetail={onOpenDetail}
              selectedAssetIds={selectedAssetIds}
              onToggleSelected={onToggleSelected}
            />
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
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Columns3 className="size-3.5" />
            <span>Group by</span>
            <span className="font-medium text-foreground">{label}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        }
      />
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
