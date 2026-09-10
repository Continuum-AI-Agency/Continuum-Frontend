'use client';
import { AlertCircle, CheckCircle2, Copy, Layers, Plus, Trash2, XCircle } from 'lucide-react';
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
import type { CampaignNodeProps, OpenAiAdGroupData } from '../types';
import { microsToUnits, OpenAiRecordBadge, unitsToMicros } from './openAiNodeShared';

const BILLING_EVENTS: Array<{
  value: OpenAiAdGroupData['billingEventType'];
  label: string;
  description: string;
}> = [
  {
    value: 'impression',
    label: 'Impression',
    description: 'For an impressions campaign. The bid is a CPM — $60 CPM is 60,000 micros.',
  },
  {
    value: 'click',
    label: 'Click',
    description:
      'For click and conversion campaigns. Under conversion bidding this bid is the CPA even though billing stays per click.',
  },
];

export const OpenAiAdGroupNode = memo(
  ({ id, data, selected }: CampaignNodeProps<'openai-ad-group'>) => {
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
                    Ad Group
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
                Billed per {data.billingEventType === 'click' ? 'click' : 'impression'}
              </NodeDescription>

              <div className="flex items-center gap-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted-foreground">
                  Max bid
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
                  {data.contextHints.length} hint{data.contextHints.length === 1 ? '' : 's'}
                </Badge>
              ) : null}

              <OpenAiRecordBadge openAiId={data.openAiId} openAiStatus={data.openAiStatus} />
            </NodeContent>
          </Node>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-64">
          <ContextMenuLabel>Ad Group Actions</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuItem onClick={handleAddAd}>
              <Plus className="mr-2 h-4 w-4 text-primary" />
              Add Ad
              <ContextMenuItemInfo description="An ad carries the chat card a person actually sees." />
            </ContextMenuItem>
          </ContextMenuGroup>

          <ContextMenuSeparator />
          <ContextMenuLabel>Configuration</ContextMenuLabel>
          <ContextMenuGroup>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Layers className="mr-2 h-4 w-4" />
                Billing event
                <ContextMenuItemInfo
                  className="ml-2 mr-4"
                  description="Must match the campaign's goal: impression for CPM, click for both CPC and conversion campaigns."
                />
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
              Duplicate
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={() => removeNode(id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remove from canvas
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
);

OpenAiAdGroupNode.displayName = 'OpenAiAdGroupNode';
