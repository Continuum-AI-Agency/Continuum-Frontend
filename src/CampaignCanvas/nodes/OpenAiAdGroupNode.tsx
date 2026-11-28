'use client';

import { AlertCircle, CheckCircle2, Copy, Layers, Plus, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useMemo } from 'react';
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { cn } from '@/lib/utils';
import { EditableAmount } from '../components/EditableAmount';
import { EditableLabel } from '../components/EditableLabel';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignNodeProps, OpenAiAdGroupData } from '../types';
import { microsToUnits, OpenAiRecordBadge, unitsToMicros } from './openAiNodeShared';

export const OpenAiAdGroupNode = memo(
  ({ id, data, selected }: CampaignNodeProps<'openai-ad-group'>) => {
    const uiText = useTranslations('scale');
    const BILLING_EVENTS: Array<{
      value: OpenAiAdGroupData['billingEventType'];
      label: string;
      description: string;
    }> = useMemo(
      () => [
        {
          value: 'impression',
          label: uiText('canvasBillingImpression'),
          description: uiText('for_an_impressions_campaign_the_bid_is_a_cpm__cc8b3f9'),
        },
        {
          value: 'click',
          label: uiText('canvasBillingClick'),
          description: uiText('for_click_and_conversion_campaigns_under_conv_4f99b6e'),
        },
      ],
      [uiText],
    );
    const updateNodeData = useCampaignStore((store) => store.updateNodeData);
    const removeNode = useCampaignStore((store) => store.removeNode);
    const duplicateNode = useCampaignStore((store) => store.duplicateNode);
    const addConnectedNode = useCampaignStore((store) => store.addConnectedNode);

    const handleLabelSave = useCallback(
      (label: string) => updateNodeData(id, { label }),
      [id, updateNodeData],
    );

    const handleBidSave = useCallback(
      (units: number) => updateNodeData(id, { maxBidMicros: unitsToMicros(units) }),
      [id, updateNodeData],
    );

    const handleBillingEventChange = useCallback(
      (billingEventType: OpenAiAdGroupData['billingEventType']) =>
        updateNodeData(id, { billingEventType }),
      [id, updateNodeData],
    );

    const handleAddAd = useCallback(
      () => addConnectedNode(id, 'openai-ad'),
      [id, addConnectedNode],
    );

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
                    <Layers className="h-4 w-4" />
                  </div>
                  <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {uiText('ad_group_33500c3')}
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

              <NodeDescription className="text-xs text-muted-foreground">
                {uiText.rich('sentence_6bae9f3c3a13', { event: data.billingEventType })}
              </NodeDescription>

              <div className="flex items-center gap-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {uiText('max_bid_460243e')}
                </span>
                <span className="text-sm font-medium text-foreground">
                  <EditableAmount
                    value={microsToUnits(data.maxBidMicros)}
                    currency={data.currencyCode ?? 'USD'}
                    onSave={handleBidSave}
                  />
                </span>
              </div>

              {data.contextHints?.length ? (
                <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-70">
                  {uiText.rich('sentence_e0bec8abb862', { count: data.contextHints.length })}
                </Badge>
              ) : null}

              <OpenAiRecordBadge openAiId={data.openAiId} openAiStatus={data.openAiStatus} />
            </NodeContent>
          </Node>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-64">
          <ContextMenuLabel>{uiText('ad_group_actions_7655095')}</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuItem onClick={handleAddAd}>
              {uiText.rich('sentence_1b5197711087', {
                v0: () => <Plus className="mr-2 h-4 w-4 text-primary" />,
                v1: () => (
                  <ContextMenuItemInfo
                    description={uiText('an_ad_carries_the_chat_card_a_person_actually_816390a')}
                  />
                ),
              })}
            </ContextMenuItem>
          </ContextMenuGroup>

          <ContextMenuSeparator />
          <ContextMenuLabel>{uiText('configuration_b332c34')}</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                {uiText.rich('sentence_318ff6e0d8bb', {
                  v0: () => <Layers className="mr-2 h-4 w-4" />,
                  v1: () => (
                    <ContextMenuItemInfo
                      className="ml-2 mr-4"
                      description={uiText('must_match_the_campaign_s_goal_impression_for_9cf872f')}
                    />
                  ),
                })}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-56">
                {BILLING_EVENTS.map((event) => (
                  <ContextMenuCheckboxItem
                    key={event.value}
                    checked={data.billingEventType === event.value}
                    onClick={() => handleBillingEventChange(event.value)}
                  >
                    {event.label}
                    <ContextMenuItemInfo description={event.description} />
                  </ContextMenuCheckboxItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuGroup>

          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => duplicateNode(id)}>
              <Copy className="mr-2 h-4 w-4" />
              {uiText('duplicate_02cdaab')}
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={() => removeNode(id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {uiText('remove_from_canvas_3e4656c')}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

OpenAiAdGroupNode.displayName = 'OpenAiAdGroupNode';
