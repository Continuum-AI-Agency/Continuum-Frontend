'use client';

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Megaphone,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import React, { memo, useCallback, useMemo } from 'react';
import { Node, NodeContent, NodeHeader, NodeTitle } from '@/components/ai-elements/node';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { EditableLabel } from '../components/EditableLabel';
import { NodeProvenance } from '../components/NodeProvenance';
import { useCampaignStore } from '../stores/useCampaignStore';
import type {
  AdData,
  AdFormat,
  CampaignCanvasNodeMap,
  CampaignNodeProps,
  CreativeAssetType,
} from '../types';
import {
  DEFAULT_AD_FORMAT,
  isAdFormatCompatibleWithCreativeType,
} from '../types/adCreativeCompatibility';
import { localizedNodeOptions } from '../types/nodeOptionPresentation';
import { AD_FORMATS, CALL_TO_ACTIONS } from '../types/nodeOptions';

export const AdNode = memo(({ id, data, selected }: CampaignNodeProps<'ad'>) => {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const callToActionsView = localizedNodeOptions(CALL_TO_ACTIONS, uiText, uiLocale);
  const adFormatsView = localizedNodeOptions(AD_FORMATS, uiText, uiLocale);
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode, nodes, edges } =
    useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  const handleHeadlineSave = useCallback(
    (headline: string) => {
      updateNodeData(id, { headline });
    },
    [id, updateNodeData],
  );

  const connectedCreativeAssetTypes = useMemo<CreativeAssetType[]>(() => {
    const creativeNodeIds = edges.filter((edge) => edge.source === id).map((edge) => edge.target);

    return creativeNodeIds
      .map((creativeNodeId) => nodes.find((node) => node.id === creativeNodeId))
      .filter((node): node is CampaignCanvasNodeMap['creative'] => node?.type === 'creative')
      .map((node) => node.data.assetType ?? 'image');
  }, [edges, id, nodes]);

  const isFormatCompatibleWithConnectedCreatives = useCallback(
    (adFormat: AdFormat) => {
      return connectedCreativeAssetTypes.every((assetType) =>
        isAdFormatCompatibleWithCreativeType(adFormat, assetType),
      );
    },
    [connectedCreativeAssetTypes],
  );

  const handleFormatChange = useCallback(
    (adFormat: AdData['adFormat']) => {
      if (!isFormatCompatibleWithConnectedCreatives(adFormat)) {
        return;
      }
      updateNodeData(id, { adFormat });
    },
    [id, isFormatCompatibleWithConnectedCreatives, updateNodeData],
  );

  const handleCTAChange = useCallback(
    (callToAction: AdData['callToAction']) => {
      updateNodeData(id, { callToAction });
    },
    [id, updateNodeData],
  );

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
            'hover:shadow-md transition-shadow cursor-pointer',
            data.validationStatus === 'error' && 'border-destructive',
          )}
        >
          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-500">
                  <Megaphone className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {uiText('ad_1d97c9f')}
                </NodeTitle>
              </div>
              <div className="flex items-center gap-1">
                {data.validationStatus === 'valid' && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {data.validationStatus === 'warning' && (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                )}
                {data.validationStatus === 'error' && (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
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
                {adFormatsView.find((format) => format.value === selectedAdFormat)?.label ||
                  uiText('single_image_8fd6bdf')}
              </Badge>
              {data.callToAction && (
                <Badge
                  variant="secondary"
                  className="text-3xs px-1 py-0 uppercase h-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                >
                  {CALL_TO_ACTIONS.find((c) => c.value === data.callToAction)?.label ||
                    'LEARN MORE'}
                </Badge>
              )}
            </div>
            <NodeProvenance data={data} />
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>{uiText('ad_actions_f066c13')}</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddCreative}>
            {uiText.rich('sentence_f21396fa222b', {
              v0: () => <Plus className="mr-2 h-4 w-4 text-pink-500" />,
              v1: () => (
                <ContextMenuItemInfo
                  description={uiText('creative_is_the_visual_asset_image_or_video_t_24faada')}
                />
              ),
            })}
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuLabel>{uiText('configurations_ae53d36')}</ContextMenuLabel>

        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              {uiText.rich('sentence_51b0e89bd552', {
                v0: () => <Megaphone className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('ad_format_defines_how_creative_is_structured__d288fcf')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {adFormatsView.map((format) => (
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
              {uiText.rich('sentence_3d1c61728ec7', {
                v0: () => <Send className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('call_to_action_is_the_primary_next_step_promp_55bb9a9')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {callToActionsView.map((cta) => (
                <ContextMenuCheckboxItem
                  key={cta.value}
                  checked={
                    data.callToAction === cta.value ||
                    (!data.callToAction && cta.value === 'LEARN_MORE')
                  }
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
            {uiText.rich('sentence_cbb73dcd8c7a', {
              v0: () => <Copy className="mr-2 h-4 w-4" />,
              v1: () => <ContextMenuShortcut>⌘D</ContextMenuShortcut>,
              v2: () => (
                <ContextMenuItemInfo
                  className="ml-2"
                  description={uiText('a_duplicate_creates_another_ad_with_the_same__c0edd8f')}
                />
              ),
            })}
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          {uiText.rich('sentence_cab0f08ddea5', {
            v0: () => <Trash2 className="mr-2 h-4 w-4" />,
            v1: () => <ContextMenuShortcut>⌫</ContextMenuShortcut>,
            v2: () => (
              <ContextMenuItemInfo
                className="ml-2"
                description={uiText('delete_removes_this_ad_object_from_the_curren_2c014c8')}
              />
            ),
          })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdNode.displayName = 'AdNode';
