"use client";
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { type CampaignNodeProps, type CampaignCanvasNodeMap, type AdFormat, type CreativeAssetType, type CreativeData } from '../types';
import { 
  Node,
} from '@/components/ai-elements/node';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Image as ImageIcon, Copy, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import {
  DEFAULT_CREATIVE_ASSET_TYPE,
  getAllowedAdFormatsForCreativeType,
} from '../types/adCreativeCompatibility';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';

const FALLBACK_PREVIEW_RATIO_BY_TYPE: Record<CreativeAssetType, number> = {
  image: 1,
  video: 16 / 9,
};

export function resolveCreativePreviewRatio(
  ratioValue: string | undefined,
  assetType: CreativeAssetType
): number {
  if (!ratioValue) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  const normalized = ratioValue.trim();
  const delimiter = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;

  if (!delimiter) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  const [widthPart, heightPart] = normalized.split(delimiter).map((value) => Number(value.trim()));
  if (!Number.isFinite(widthPart) || !Number.isFinite(heightPart) || widthPart <= 0 || heightPart <= 0) {
    return FALLBACK_PREVIEW_RATIO_BY_TYPE[assetType];
  }

  return widthPart / heightPart;
}

export const CreativeNode = memo(({ id, data, selected }: CampaignNodeProps<'creative'>) => {
  const { duplicateNode, removeNode, updateNodeData, nodes, edges } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);

  const connectedAdFormats = useMemo<AdFormat[]>(() => {
    const adNodeIds = edges
      .filter((edge) => edge.target === id)
      .map((edge) => edge.source);

    return adNodeIds
      .map((adNodeId) => nodes.find((node) => node.id === adNodeId))
      .filter((node): node is CampaignCanvasNodeMap['ad'] => node?.type === 'ad')
      .map((node) => node.data.adFormat ?? 'IMAGE');
  }, [edges, id, nodes]);

  const isAssetTypeCompatibleWithConnectedAds = useCallback((assetType: 'image' | 'video') => {
    const allowedAdFormats = getAllowedAdFormatsForCreativeType(assetType);
    return connectedAdFormats.every((adFormat) => allowedAdFormats.includes(adFormat));
  }, [connectedAdFormats]);

  const handleTypeChange = useCallback((assetType: 'image' | 'video') => {
    if (!isAssetTypeCompatibleWithConnectedAds(assetType)) {
      return;
    }
    updateNodeData(id, { assetType });
  }, [id, isAssetTypeCompatibleWithConnectedAds, updateNodeData]);

  const selectedAssetType = data.assetType ?? DEFAULT_CREATIVE_ASSET_TYPE;
  const [previewRatio, setPreviewRatio] = useState(() =>
    resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType)
  );

  useEffect(() => {
    setPreviewRatio(resolveCreativePreviewRatio(data.aspectRatio, selectedAssetType));
  }, [data.aspectRatio, selectedAssetType, data.thumbnailUrl]);

  const handlePreviewLoad = useCallback((image: HTMLImageElement) => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setPreviewRatio(image.naturalWidth / image.naturalHeight);
    }
  }, []);

  const handlePreviewDragStart = useCallback((event: React.DragEvent<HTMLImageElement>) => {
    event.preventDefault();
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Node 
          handles={{ target: true, source: false }}
          selected={selected}
          className="overflow-hidden border-border/60 p-0 transition-shadow hover:shadow-sm cursor-grab active:cursor-grabbing"
        >
          <AspectRatio ratio={previewRatio} className="w-full overflow-hidden bg-muted">
            {data.thumbnailUrl ? (
              <Image
                src={data.thumbnailUrl}
                alt="Creative Preview"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 240px"
                className="h-full w-full object-cover"
                draggable={false}
                onDragStart={handlePreviewDragStart}
                onLoadingComplete={handlePreviewLoad}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                <ImageIcon className="h-8 w-8 opacity-20" />
              </div>
            )}
          </AspectRatio>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Creative Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ImageIcon className="mr-2 h-4 w-4" />
              Asset Type
              <ContextMenuItemInfo className="ml-2 mr-4" description="Asset type defines whether creative is rendered as image or video." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuCheckboxItem 
                checked={selectedAssetType === 'image'}
                disabled={!isAssetTypeCompatibleWithConnectedAds('image')}
                onClick={() => handleTypeChange('image')}
              >
                Image
                <ContextMenuItemInfo description="Image assets are single-frame visuals for static placements." />
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem 
                checked={selectedAssetType === 'video'}
                disabled={!isAssetTypeCompatibleWithConnectedAds('video')}
                onClick={() => handleTypeChange('video')}
              >
                Video
                <ContextMenuItemInfo description="Video assets use motion content and may include audio." />
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            <ContextMenuItemInfo className="ml-2" description="A duplicate keeps the same creative settings as a starting variant." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo className="ml-2" description="Delete removes this creative object from the current graph." />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CreativeNode.displayName = 'CreativeNode';
