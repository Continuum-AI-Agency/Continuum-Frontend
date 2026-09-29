'use client';

/*
 * Putting assets on a creative: the inspector's picker and upload, and a drop onto the
 * node itself. One path, so a dropped file and a picked one land identically.
 *
 * Writes read the node FRESH from the store: an upload finishes long after the render
 * that started it, and several can finish together, so a closure's copy of `cards`
 * would drop whichever landed second.
 */

import { type DragEvent, useCallback, useState } from 'react';
import { useMediaUpload } from '@/components/library/useMediaUpload';
import { endAssetDrag, isAssetDrag, readAssetDrag } from '@/components/library/views/assetDrag';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { fetchAssetKinds } from '@/lib/paid-media/jaina-activity-client';
import { useCampaignStore } from '../stores/useCampaignStore';
import {
  CAROUSEL_MAX_CARDS,
  type CarouselCard,
  type CreativeAssetType,
  type CreativeData,
} from '../types';

export type PickedAsset = {
  id: string;
  kind: 'image' | 'video';
  thumbnailUrl?: string;
  assetUrl?: string;
};

export type Placement = {
  /** Set when the creative's format must follow the asset placed on it. */
  format?: CreativeAssetType;
  patch?: Partial<CreativeData>;
  notice: string | null;
};

/**
 * What placing `assets` on a creative changes.
 *
 * A single-asset creative takes the asset matching its format, else the first one — and
 * then its format follows that asset: a person who drops a video on an image slot means
 * "use this video", not "refuse".
 */
export function placementFor(current: CreativeData, assets: readonly PickedAsset[]): Placement {
  const format = current.assetType ?? 'image';

  if (format === 'carousel') {
    const existing = current.cards ?? [];
    const room = Math.max(0, CAROUSEL_MAX_CARDS - existing.length);
    const added: CarouselCard[] = assets.slice(0, room).map((asset) => ({
      mediaId: asset.id,
      kind: asset.kind,
      ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    }));
    return {
      ...(added.length > 0 ? { patch: { cards: [...existing, ...added] } } : {}),
      notice:
        assets.length > added.length
          ? `A carousel holds at most ${CAROUSEL_MAX_CARDS} cards, so ${assets.length - added.length} were left out.`
          : null,
    };
  }

  const asset = assets.find((entry) => entry.kind === format) ?? assets[0];
  if (!asset) return { notice: null };
  return {
    ...(asset.kind !== format ? { format: asset.kind } : {}),
    patch: { mediaId: asset.id, thumbnailUrl: asset.thumbnailUrl, assetUrl: asset.assetUrl },
    notice: null,
  };
}

const isMediaFile = (file: File) =>
  file.type.startsWith('image/') || file.type.startsWith('video/');

const carriesFiles = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

export function useCreativeAssetPlacement(nodeId: string) {
  const { activeBrandId } = useActiveBrandContext();
  const [notice, setNotice] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const place = useCallback(
    (assets: readonly PickedAsset[]) => {
      const store = useCampaignStore.getState();
      const current = store.nodes.find((entry) => entry.id === nodeId)?.data as
        | CreativeData
        | undefined;
      if (!current || assets.length === 0) return;
      const placement = placementFor(current, assets);
      if (placement.format) store.setCreativeFormat(nodeId, placement.format);
      if (placement.patch) store.updateNodeData(nodeId, placement.patch);
      setNotice(placement.notice);
    },
    [nodeId],
  );

  const { uploads, uploadFiles } = useMediaUpload(activeBrandId, {
    onUploaded: ({ file, uploaded }) => {
      const kind = file.type.startsWith('video/') ? 'video' : 'image';
      place([
        {
          id: uploaded.assetId,
          kind,
          assetUrl: uploaded.signedUrl,
          ...(kind === 'image' ? { thumbnailUrl: uploaded.signedUrl } : {}),
        },
      ]);
    },
  });

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!isAssetDrag(event) && !carriesFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    // Crossing into a child fires a leave on the parent; only leaving the node counts.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDropActive(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      setDropActive(false);
      const payload = readAssetDrag(event);
      const files = Array.from(event.dataTransfer?.files ?? []).filter(isMediaFile);
      if (!payload && files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();

      if (!payload) {
        void uploadFiles(files);
        return;
      }
      endAssetDrag();
      if (payload.brandId !== activeBrandId) {
        setNotice('That asset belongs to another brand.');
        return;
      }
      void fetchAssetKinds({ brandId: activeBrandId, assetIds: payload.assetIds }).then((kinds) =>
        place(
          payload.assetIds.flatMap((id) => {
            const kind = kinds[id];
            return kind ? [{ id, kind }] : [];
          }),
        ),
      );
    },
    [activeBrandId, place, uploadFiles],
  );

  return {
    brandId: activeBrandId,
    place,
    notice,
    uploads,
    uploadFiles,
    dropActive,
    dropHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
