'use client';
import { AlertCircle, CheckCircle2, Copy, Layout, Plus, Trash2, XCircle } from 'lucide-react';
import { memo, useCallback } from 'react';
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
import { formatMicros, microsToUnits, OpenAiRecordBadge, unitsToMicros } from './openAiNodeShared';

const BIDDING_TYPES: Array<{
  value: OpenAiCampaignData['biddingType'];
  label: string;
  description: string;
}> = [
  {
    value: 'impressions',
    label: 'Impressions (CPM)',
    description: 'Pay per 1,000 impressions. Broad delivery for reach and awareness.',
  },
  {
    value: 'clicks',
    label: 'Clicks (CPC)',
    description: 'Pay per valid click. Delivery favors people likely to engage.',
  },
  {
    value: 'conversions',
    label: 'Conversions (oCPC)',
    description:
      'Still billed per click, but delivery optimizes toward one tracked conversion event. Requires conversion bidding enabled on the account.',
  },
];

export const OpenAiCampaignNode = memo(
  ({ id, data, selected }: CampaignNodeProps<'openai-campaign'>) => {
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
                    OpenAI Campaign
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
                  'Impressions (CPM)'}
              </NodeDescription>

              <div className="flex items-center gap-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Lifetime
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
                  {data.locationLabels.length} location{data.locationLabels.length === 1 ? '' : 's'}
                </Badge>
              ) : null}

              <OpenAiRecordBadge openAiId={data.openAiId} openAiStatus={data.openAiStatus} />
            </NodeContent>
          </Node>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-64">
          <ContextMenuLabel>Campaign Actions</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuItem onClick={handleAddAdGroup}>
              <Plus className="mr-2 h-4 w-4 text-primary" />
              Add Ad Group
              <ContextMenuItemInfo description="An ad group carries the bid and the billing event for its ads." />
            </ContextMenuItem>
          </ContextMenuGroup>

          <ContextMenuSeparator />
          <ContextMenuLabel>Configuration</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={isRecord}>
                <Layout className="mr-2 h-4 w-4" />
                Campaign goal
                <ContextMenuItemInfo
                  className="ml-2 mr-4"
                  description={
                    isRecord
                      ? 'OpenAI does not allow the goal to change after a campaign exists. Create a new campaign to optimize for something else.'
                      : 'How the campaign is billed and what delivery optimizes for.'
                  }
                />
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
              Duplicate
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={() => removeNode(id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove from canvas
              <ContextMenuItemInfo description="Removing a live campaign from the canvas schedules an archive on the next publish. Archiving cannot be undone." />
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

OpenAiCampaignNode.displayName = 'OpenAiCampaignNode';
