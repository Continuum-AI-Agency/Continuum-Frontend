'use client';

import { AlertCircle, CheckCircle2, Copy, Layout, Plus, Trash2, XCircle } from 'lucide-react';
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
import type { CampaignNodeProps, OpenAiCampaignData } from '../types';
import { microsToUnits, OpenAiRecordBadge, unitsToMicros } from './openAiNodeShared';

export const OpenAiCampaignNode = memo(
  ({ id, data, selected }: CampaignNodeProps<'openai-campaign'>) => {
    const uiText = useTranslations('scale');
    const BIDDING_TYPES: Array<{
      value: OpenAiCampaignData['biddingType'];
      label: string;
      description: string;
    }> = useMemo(
      () => [
        {
          value: 'impressions',
          label: uiText('impressions_cpm_80f020e'),
          description: uiText('pay_per_1_000_impressions_broad_delivery_for__ec127cf'),
        },
        {
          value: 'clicks',
          label: uiText('clicks_cpc_9b99e17'),
          description: uiText('pay_per_valid_click_delivery_favors_people_li_96facb3'),
        },
        {
          value: 'conversions',
          label: uiText('conversions_ocpc_0ae021d'),
          description: uiText('still_billed_per_click_but_delivery_optimizes_3a1fd7b'),
        },
      ],
      [uiText],
    );

    const updateNodeData = useCampaignStore((store) => store.updateNodeData);
    const removeNode = useCampaignStore((store) => store.removeNode);
    const duplicateNode = useCampaignStore((store) => store.duplicateNode);
    const addConnectedNode = useCampaignStore((store) => store.addConnectedNode);

    const isRecord = Boolean(data.openAiId);

    const handleLabelSave = useCallback(
      (label: string) => updateNodeData(id, { label }),
      [id, updateNodeData],
    );

    const handleBudgetSave = useCallback(
      (units: number) => updateNodeData(id, { lifetimeSpendLimitMicros: unitsToMicros(units) }),
      [id, updateNodeData],
    );

    const handleBiddingTypeChange = useCallback(
      (biddingType: OpenAiCampaignData['biddingType']) => {
        // The API refuses a bidding-type change after creation, so an existing campaign's
        // control is inert rather than an edit that fails at publish.
        if (isRecord) return;
        updateNodeData(id, { biddingType });
      },
      [id, isRecord, updateNodeData],
    );

    const handleAddAdGroup = useCallback(
      () => addConnectedNode(id, 'openai-ad-group'),
      [id, addConnectedNode],
    );

    return (
      <ContextMenu>
        <ContextMenuTrigger>
          <Node
            handles={{ target: false, source: true }}
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
                    <Layout className="h-4 w-4" />
                  </div>
                  <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {uiText('openai_campaign_4e4d507')}
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
                {BIDDING_TYPES.find((type) => type.value === data.biddingType)?.label ??
                  uiText('impressions_cpm_80f020e')}
              </NodeDescription>

              <div className="flex items-center gap-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {uiText('lifetime_bdcd897')}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {data.lifetimeSpendLimitMicros ? (
                    <EditableAmount
                      value={microsToUnits(data.lifetimeSpendLimitMicros)}
                      currency={data.currencyCode ?? 'USD'}
                      onSave={handleBudgetSave}
                    />
                  ) : (
                    <EditableAmount
                      value={0}
                      currency={data.currencyCode ?? 'USD'}
                      onSave={handleBudgetSave}
                    />
                  )}
                </span>
              </div>

              {data.locationLabels?.length ? (
                <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-70">
                  {uiText.rich('sentence_64af38e91728', {
                    count: data.locationLabels.length,
                  })}
                </Badge>
              ) : null}

              <OpenAiRecordBadge openAiId={data.openAiId} openAiStatus={data.openAiStatus} />
            </NodeContent>
          </Node>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-64">
          <ContextMenuLabel>{uiText('campaign_actions_6d62b9f')}</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuItem onClick={handleAddAdGroup}>
              {uiText.rich('sentence_8435ef517b1e', {
                v0: () => <Plus className="mr-2 h-4 w-4 text-primary" />,
                v1: () => (
                  <ContextMenuItemInfo
                    description={uiText('an_ad_group_carries_the_bid_and_the_billing_e_8693c97')}
                  />
                ),
              })}
            </ContextMenuItem>
          </ContextMenuGroup>

          <ContextMenuSeparator />
          <ContextMenuLabel>{uiText('configuration_b332c34')}</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={isRecord}>
                {uiText.rich('sentence_4dceb83c0e0c', {
                  v0: () => <Layout className="mr-2 h-4 w-4" />,
                  v1: () => (
                    <ContextMenuItemInfo
                      className="ml-2 mr-4"
                      description={
                        isRecord
                          ? uiText('openai_does_not_allow_the_goal_to_change_afte_349467f')
                          : uiText('how_the_campaign_is_billed_and_what_delivery__8efbf94')
                      }
                    />
                  ),
                })}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-56">
                {BIDDING_TYPES.map((type) => (
                  <ContextMenuCheckboxItem
                    key={type.value}
                    checked={data.biddingType === type.value}
                    disabled={isRecord}
                    onClick={() => handleBiddingTypeChange(type.value)}
                  >
                    {type.label}
                    <ContextMenuItemInfo description={type.description} />
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
              {uiText.rich('sentence_23658db467b7', {
                v0: () => <Trash2 className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    description={uiText('removing_a_live_campaign_from_the_canvas_sche_ba906d2')}
                  />
                ),
              })}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

OpenAiCampaignNode.displayName = 'OpenAiCampaignNode';
