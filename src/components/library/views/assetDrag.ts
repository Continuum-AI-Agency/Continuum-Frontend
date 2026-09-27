'use client';

// Native HTML5 drag-and-drop of Library assets: onto another card (stack as a new
// version) or onto a collection (add to it). No DnD library — the payload rides a
// private MIME type on the DataTransfer.

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

function collectionIdOf(event: DragEvent<HTMLElement>): string | null {
  const own = event.currentTarget.dataset.collectionId;
  if (own) return own;
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest<HTMLElement>('[data-collection-id]')?.dataset.collectionId ?? null;
}

/**
 * Drop handlers that ADD dragged assets to a collection. Attach them to a row that
 * carries `data-collection-id`, or to any ancestor of such rows (delegation).
 */
export function useCollectionAssetDrop({
  brandId,
  collectionName,
  onDropped,
}: {
  brandId: string;
  collectionName: (collectionId: string) => string | undefined;
  onDropped?: (collectionId: string, assetIds: string[]) => void;
}) {
  const [overCollectionId, setOverCollectionId] = useState<string | null>(null);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isAssetDrag(event)) return;
    const collectionId = collectionIdOf(event);
    if (!collectionId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    setOverCollectionId(collectionId);
  }, []);

  const onDragLeave = useCallback(() => setOverCollectionId(null), []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      setOverCollectionId(null);
      const collectionId = collectionIdOf(event);
      const payload = readAssetDrag(event);
      if (!collectionId || !payload || payload.brandId !== brandId) return;
      event.preventDefault();
      event.stopPropagation();
      endAssetDrag();
      const name = collectionName(collectionId) ?? 'collection';
      mutateCollectionMembershipOperation(createSupabaseBrowserClient(), {
        brandId,
        collectionId,
        assetIds: payload.assetIds,
        mode: 'add',
      })
        .then(() => {
          toast.success(`Added ${payload.assetIds.length} to ${name}`);
          onDropped?.(collectionId, payload.assetIds);
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : `Adding to ${name} failed`);
        });
    },
    [brandId, collectionName, onDropped],
  );

  return { overCollectionId, onDragOver, onDragLeave, onDrop };
}
