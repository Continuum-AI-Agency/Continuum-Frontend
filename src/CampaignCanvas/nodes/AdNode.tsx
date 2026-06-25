"use client";
import React, { memo, useCallback, useMemo } from 'react';
import { type CampaignNodeProps, type CampaignCanvasNodeMap, type AdData, type AdFormat, type CreativeAssetType } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent
} from '@/components/ai-elements/node';
import { CheckCircle2, AlertCircle, XCircle, Megaphone, Copy, Trash2, Plus, Send } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import {
  DEFAULT_AD_FORMAT,
  isAdFormatCompatibleWithCreativeType,
} from '../types/adCreativeCompatibility';

import { Separator } from '@/components/ui/separator';

const AD_FORMATS: Array<{ value: AdFormat; label: string; description: string }> = [
  { value: 'IMAGE', label: 'Single Image', description: 'Single Image uses one static visual for each impression.' },
  { value: 'VIDEO', label: 'Single Video', description: 'Single Video uses one motion creative with optional audio.' },
  { value: 'CAROUSEL', label: 'Carousel', description: 'Carousel presents multiple swipeable cards in one ad unit.' },
  { value: 'COLLECTION', label: 'Collection', description: 'Collection combines a hero asset with product-style follow-up cards.' },
];

const CALL_TO_ACTIONS = [
  { value: 'LEARN_MORE', label: 'Learn More', description: 'Learn More invites users to explore details before deciding.' },
  { value: 'SHOP_NOW', label: 'Shop Now', description: 'Shop Now emphasizes immediate product browsing or purchase intent.' },
  { value: 'SIGN_UP', label: 'Sign Up', description: 'Sign Up prompts users to register or create an account.' },
  { value: 'BOOK_NOW', label: 'Book Now', description: 'Book Now directs users toward scheduling or reservation actions.' },
  { value: 'CONTACT_US', label: 'Contact Us', description: 'Contact Us encourages direct outreach through message or form.' },
  { value: 'DOWNLOAD', label: 'Download', description: 'Download prompts users to save a file or install an asset.' },
];

export const AdNode = memo(({ id, data, selected }: CampaignNodeProps<'ad'>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode, nodes, edges } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleHeadlineSave = useCallback((headline: string) => {
    updateNodeData(id, { headline });
  }, [id, updateNodeData]);

  const connectedCreativeAssetTypes = useMemo<CreativeAssetType[]>(() => {
    const creativeNodeIds = edges
      .filter((edge) => edge.source === id)
      .map((edge) => edge.target);

    return creativeNodeIds
      .map((creativeNodeId) => nodes.find((node) => node.id === creativeNodeId))
      .filter((node): node is CampaignCanvasNodeMap['creative'] => node?.type === 'creative')
      .map((node) => node.data.assetType ?? 'image');
  }, [edges, id, nodes]);

  const isFormatCompatibleWithConnectedCreatives = useCallback((adFormat: AdFormat) => {
    return connectedCreativeAssetTypes.every((assetType) =>
      isAdFormatCompatibleWithCreativeType(adFormat, assetType)
    );
  }, [connectedCreativeAssetTypes]);

  const handleFormatChange = useCallback((adFormat: AdData['adFormat']) => {
    if (!isFormatCompatibleWithConnectedCreatives(adFormat)) {
      return;
    }
    updateNodeData(id, { adFormat });
  }, [id, isFormatCompatibleWithConnectedCreatives, updateNodeData]);

  const handleCTAChange = useCallback((callToAction: AdData['callToAction']) => {
    updateNodeData(id, { callToAction });
  }, [id, updateNodeData]);

  const handleAddCreative = useCallback(() => {
    addConnectedNode(id, 'creative');
  }, [id, addConnectedNode]);

  const selectedAdFormat = data.adFormat ?? DEFAULT_AD_FORMAT;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node 
          handles={{ target: true, source: true }}
          selected={selected}
          className={cn(
            "hover:shadow-md transition-shadow cursor-pointer",
            data.validationStatus === 'error' && "border-destructive"
          )}
        >
          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500">
                  <Megaphone className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ad
                </NodeTitle>
              </div>
              <div className="flex items-center gap-1">
                {data.validationStatus === 'valid' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {data.validationStatus === 'warning' && <AlertCircle className="h-4 w-4 text-yellow-500" />}
                {data.validationStatus === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1">
            <h3 className="font-semibold text-foreground leading-tight">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>
            <Separator className="my-1.5 opacity-50" />
            <div className="text-xs font-medium text-foreground italic mb-1">
              <EditableLabel 
                value={data.headline || 'Add compelling headline...'} 
                onSave={handleHeadlineSave}
                className="cursor-text"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-70">
                {AD_FORMATS.find((format) => format.value === selectedAdFormat)?.label || 'Single Image'}
              </Badge>
              {data.callToAction && (
                <Badge variant="secondary" className="text-3xs px-1 py-0 uppercase h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  {CALL_TO_ACTIONS.find(c => c.value === data.callToAction)?.label || 'LEARN MORE'}
                </Badge>
              )}
            </div>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>Ad Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddCreative}>
            <Plus className="mr-2 h-4 w-4 text-pink-500" />
            Add Creative
            <ContextMenuItemInfo description="Creative is the visual asset (image or video) this ad uses." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        <ContextMenuLabel>Configurations</ContextMenuLabel>
        
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Megaphone className="mr-2 h-4 w-4" />
              Ad Format
              <ContextMenuItemInfo className="ml-2 mr-4" description="Ad format defines how creative is structured in placements." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {AD_FORMATS.map((format) => (
                <ContextMenuCheckboxItem
                  key={format.value}
                  checked={selectedAdFormat === format.value}
                  disabled={!isFormatCompatibleWithConnectedCreatives(format.value)}
                  onClick={() => handleFormatChange(format.value)}
                >
                  {format.label}
                  <ContextMenuItemInfo description={format.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Send className="mr-2 h-4 w-4" />
              Call to Action
              <ContextMenuItemInfo className="ml-2 mr-4" description="Call to action is the primary next-step prompt shown on the ad." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {CALL_TO_ACTIONS.map((cta) => (
                <ContextMenuCheckboxItem
                  key={cta.value}
                  checked={data.callToAction === cta.value || (!data.callToAction && cta.value === 'LEARN_MORE')}
                  onClick={() => handleCTAChange(cta.value)}
                >
                  {cta.label}
                  <ContextMenuItemInfo description={cta.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleDuplicate}>
            <Copy className="mr-2 h-4 w-4" /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            <ContextMenuItemInfo className="ml-2" description="A duplicate creates another ad with the same current setup." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo className="ml-2" description="Delete removes this ad object from the current graph." />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdNode.displayName = 'AdNode';
