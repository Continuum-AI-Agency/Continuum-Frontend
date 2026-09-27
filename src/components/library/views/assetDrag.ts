'use client';

// Native HTML5 drag-and-drop of Library assets: onto another card (stack as a new
// version) or onto a collection. From inside collection A onto collection B it MOVES (as
// Finder does between folders); from the unfiled grid, or with Alt/Option held, it adds.
// No DnD library — the payload rides a private MIME type on the DataTransfer.

import { type DragEvent, useCallback, useState } from 'react';
import { toast } from '@/components/ui/toast-imperative';
import { mutateCollectionMembershipOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export const ASSET_DRAG_MIME = 'application/x-continuum-assets';

export type AssetDragPayload = { brandId: string; assetIds: string[] };

type DragEventLike = { dataTransfer: DataTransfer | null };

// The browser hides getData() until the drop, so a dragover target cannot read the
// ids to refuse itself. The page only ever runs one drag at a time, so the ids of
// the drag in flight are kept here from dragstart to dragend.
let assetIdsInFlight: readonly string[] = [];

/** Dragging a selected card drags the whole selection; an unselected card drags alone. */
export function assetIdsToDrag(assetId: string, selected: ReadonlySet<string>): string[] {
  return selected.has(assetId)
    ? [assetId, ...[...selected].filter((id) => id !== assetId)]
    : [assetId];
}

export function writeAssetDrag(event: DragEventLike, brandId: string, assetIds: string[]): void {
  if (!event.dataTransfer) return;
  const payload: AssetDragPayload = { brandId, assetIds };
  event.dataTransfer.setData(ASSET_DRAG_MIME, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'copyMove';
  assetIdsInFlight = assetIds;
}

export function endAssetDrag(): void {
  assetIdsInFlight = [];
}

/** True while an asset drag (not a file drag) is over the target. */
export function isAssetDrag(event: DragEventLike): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(ASSET_DRAG_MIME);
}

/** True while any asset drag is under way on the page. */
export function assetDragInFlight(): boolean {
  return assetIdsInFlight.length > 0;
}

export function assetDragInFlightIncludes(assetId: string): boolean {
  return assetIdsInFlight.includes(assetId);
}

export function readAssetDrag(event: DragEventLike): AssetDragPayload | null {
  const raw = event.dataTransfer?.getData(ASSET_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { brandId, assetIds } = parsed as Record<string, unknown>;
    if (typeof brandId !== 'string' || !Array.isArray(assetIds)) return null;
    const ids = assetIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return ids.length > 0 ? { brandId, assetIds: ids } : null;
  } catch {
    return null;
  }
}

export type CollectionDropMode = 'move' | 'copy' | 'none';

/** What a drop does: nothing onto the collection it came from, a copy with Alt/Option. */
export function collectionDropMode(input: {
  sourceCollectionId: string | null;
  targetCollectionId: string;
  altKey: boolean;
}): CollectionDropMode {
  if (input.sourceCollectionId === input.targetCollectionId) return 'none';
  return input.sourceCollectionId && !input.altKey ? 'move' : 'copy';
}

function collectionIdOf(event: DragEvent<HTMLElement>): string | null {
  const own = event.currentTarget.dataset.collectionId;
  if (own) return own;
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest<HTMLElement>('[data-collection-id]')?.dataset.collectionId ?? null;
}

type MembershipMutation = (input: {
  brandId: string;
  collectionId: string;
  assetIds: string[];
  mode: 'add' | 'remove';
}) => Promise<unknown>;

/**
 * Add to the target first, then take out of the source: a failed add changes nothing, and
 * a failed remove leaves the asset in BOTH (never in neither) and says so.
 */
export async function moveOrCopyIntoCollection(input: {
  mutate: MembershipMutation;
  brandId: string;
  assetIds: string[];
  targetCollectionId: string;
  sourceCollectionId: string | null;
}): Promise<'moved' | 'added' | 'added_not_removed' | 'failed'> {
  const { mutate, brandId, assetIds } = input;
  try {
    await mutate({ brandId, collectionId: input.targetCollectionId, assetIds, mode: 'add' });
  } catch {
    return 'failed';
  }
  if (!input.sourceCollectionId) return 'added';
  try {
    await mutate({ brandId, collectionId: input.sourceCollectionId, assetIds, mode: 'remove' });
    return 'moved';
  } catch {
    return 'added_not_removed';
  }
}

/**
 * Drop handlers that move (or, from the unfiled grid or with Alt/Option, add) dragged
 * assets into a collection. Attach them to a row that carries `data-collection-id`, or to
 * any ancestor of such rows (delegation). `sourceCollectionId` is the collection the grid
 * shows — where every drag on the page starts.
 */
export function useCollectionAssetDrop({
  brandId,
  sourceCollectionId,
  collectionName,
  onDropped,
}: {
  brandId: string;
  sourceCollectionId: string | null;
  collectionName: (collectionId: string) => string | undefined;
  onDropped?: (collectionId: string, assetIds: string[]) => void;
}) {
  const [overCollectionId, setOverCollectionId] = useState<string | null>(null);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (!isAssetDrag(event)) return;
      const collectionId = collectionIdOf(event);
      if (!collectionId) return;
      const mode = collectionDropMode({
        sourceCollectionId,
        targetCollectionId: collectionId,
        altKey: event.altKey,
      });
      if (mode === 'none') return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = mode;
      setOverCollectionId(collectionId);
    },
    [sourceCollectionId],
  );

  const onDragLeave = useCallback(() => setOverCollectionId(null), []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      setOverCollectionId(null);
      const collectionId = collectionIdOf(event);
      const payload = readAssetDrag(event);
      if (!collectionId || !payload || payload.brandId !== brandId) return;
      const mode = collectionDropMode({
        sourceCollectionId,
        targetCollectionId: collectionId,
        altKey: event.altKey,
      });
      if (mode === 'none') return;
      event.preventDefault();
      event.stopPropagation();
      endAssetDrag();
      const name = collectionName(collectionId) ?? 'collection';
      void moveOrCopyIntoCollection({
        mutate: (input) =>
          mutateCollectionMembershipOperation(createSupabaseBrowserClient(), input),
        brandId,
        assetIds: payload.assetIds,
        targetCollectionId: collectionId,
        sourceCollectionId: mode === 'move' ? sourceCollectionId : null,
      }).then((outcome) => {
        if (outcome === 'moved') toast.success(`Moved ${payload.assetIds.length} to ${name}`);
        if (outcome === 'added') toast.success(`Added ${payload.assetIds.length} to ${name}`);
        if (outcome === 'added_not_removed') {
          toast.error(`Added to ${name}, but could not take it out of the collection it came from`);
        }
        if (outcome === 'failed') toast.error(`Adding to ${name} failed`);
        if (outcome !== 'failed') onDropped?.(collectionId, payload.assetIds);
      });
    },
    [brandId, sourceCollectionId, collectionName, onDropped],
  );

  return { overCollectionId, onDragOver, onDragLeave, onDrop };
}
