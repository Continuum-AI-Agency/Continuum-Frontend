"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type AdSetData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { CheckCircle2, AlertCircle, XCircle, Layers, Trash2, Copy, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCampaignStore } from '../stores/useCampaignStore';
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
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

import { Separator } from '@/components/ui/separator';

const OPTIMIZATION_GOALS = [
  { value: 'CONVERSIONS', label: 'Conversions' },
  { value: 'LANDING_PAGE_VIEWS', label: 'Landing Page Views' },
  { value: 'LINK_CLICKS', label: 'Link Clicks' },
  { value: 'IMPRESSIONS', label: 'Impressions' },
  { value: 'REACH', label: 'Reach' },
];

const BILLING_EVENTS = [
  { value: 'IMPRESSIONS', label: 'Impressions' },
  { value: 'LINK_CLICKS', label: 'Link Clicks' },
];

const BID_STRATEGIES = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Highest Volume' },
  { value: 'COST_CAP', label: 'Cost Cap' },
  { value: 'BID_CAP', label: 'Bid Cap' },
];

export const AdSetNode = memo(({ id, data, selected }: NodeProps<AdSetData>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleGoalChange = useCallback((optimizationGoal: string) => {
    updateNodeData(id, { optimizationGoal });
  }, [id, updateNodeData]);

  const handleBillingChange = useCallback((billingEvent: string) => {
    updateNodeData(id, { billingEvent });
  }, [id, updateNodeData]);

  const handleBidChange = useCallback((bidStrategy: string) => {
    updateNodeData(id, { bidStrategy });
  }, [id, updateNodeData]);

  const handleAddAd = useCallback(() => {
    addConnectedNode(id, 'ad');
  }, [id, addConnectedNode]);

  const handleAddAudience = useCallback(() => {
    addConnectedNode(id, 'audience');
  }, [id, addConnectedNode]);

  const handleAddBudget = useCallback(() => {
    addConnectedNode(id, 'budget');
  }, [id, addConnectedNode]);

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
          <Toolbar isVisible={selected}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Toolbar>

          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-purple-500/10 p-1.5 text-purple-500">
                  <Layers className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ad Set
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
            <div className="flex flex-col gap-1">
              <NodeDescription className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {OPTIMIZATION_GOALS.find(g => g.value === data.optimizationGoal)?.label || 'CONVERSIONS'}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-[8px] px-1 py-0 opacity-80 h-4">
                  {data.billingEvent || 'IMPRESSIONS'}
                </Badge>
                {data.bidStrategy && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 opacity-80 h-4 border-purple-500/20">
                    {BID_STRATEGIES.find(s => s.value === data.bidStrategy)?.label || 'Highest Vol'}
                  </Badge>
                )}
              </div>
            </div>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>Ad Set Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddAd}>
            <Plus className="mr-2 h-4 w-4 text-emerald-500" />
            Add Ad
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddAudience}>
            <Plus className="mr-2 h-4 w-4 text-orange-500" />
            Add Audience
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddBudget}>
            <Plus className="mr-2 h-4 w-4 text-amber-500" />
            Add Budget
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        <ContextMenuLabel>Configurations</ContextMenuLabel>
        
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layers className="mr-2 h-4 w-4" />
              Optimization Goal
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {OPTIMIZATION_GOALS.map((goal) => (
                <ContextMenuCheckboxItem
                  key={goal.value}
                  checked={data.optimizationGoal === goal.value || (!data.optimizationGoal && goal.value === 'CONVERSIONS')}
                  onClick={() => handleGoalChange(goal.value)}
                >
                  {goal.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Billing Event
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {BILLING_EVENTS.map((event) => (
                <ContextMenuCheckboxItem
                  key={event.value}
                  checked={data.billingEvent === event.value || (!data.billingEvent && event.value === 'IMPRESSIONS')}
                  onClick={() => handleBillingChange(event.value)}
                >
                  {event.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Bid Strategy
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {BID_STRATEGIES.map((strategy) => (
                <ContextMenuCheckboxItem
                  key={strategy.value}
                  checked={data.bidStrategy === strategy.value || (!data.bidStrategy && strategy.value === 'LOWEST_COST_WITHOUT_CAP')}
                  onClick={() => handleBidChange(strategy.value)}
                >
                  {strategy.label}
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
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdSetNode.displayName = 'AdSetNode';
