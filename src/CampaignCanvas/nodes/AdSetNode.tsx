"use client";
import React, { memo, useCallback } from 'react';
import { type CampaignNodeProps, type AdSetData } from '../types';
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
import { EditableAmount } from '../components/EditableAmount';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';

import { Separator } from '@/components/ui/separator';

const OPTIMIZATION_GOALS = [
  { value: 'CONVERSIONS', label: 'Conversions', description: 'Conversions optimization focuses on users likely to complete conversion events.' },
  { value: 'LANDING_PAGE_VIEWS', label: 'Landing Page Views', description: 'Landing Page Views optimization prioritizes users likely to fully load your page.' },
  { value: 'LINK_CLICKS', label: 'Link Clicks', description: 'Link Clicks optimization targets users likely to click your ad link.' },
  { value: 'IMPRESSIONS', label: 'Impressions', description: 'Impressions optimization prioritizes showing the ad as often as possible.' },
  { value: 'REACH', label: 'Reach', description: 'Reach optimization prioritizes unique people seeing the ad.' },
];

const BILLING_EVENTS = [
  { value: 'IMPRESSIONS', label: 'Impressions', description: 'Impressions billing charges based on ad views.' },
  { value: 'LINK_CLICKS', label: 'Link Clicks', description: 'Link Clicks billing charges when users click your ad link.' },
];

const BID_STRATEGIES = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Highest Volume', description: 'Highest Volume seeks the most results for your budget without a strict cost target.' },
  { value: 'COST_CAP', label: 'Cost Cap', description: 'Cost Cap aims to keep average result cost around your target cap.' },
  { value: 'BID_CAP', label: 'Bid Cap', description: 'Bid Cap sets a hard maximum bid your ad can place in auctions.' },
];

const BUDGET_TYPES: Array<{ value: NonNullable<AdSetData['budgetType']>; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'LIFETIME', label: 'Lifetime' },
];

export const AdSetNode = memo(({ id, data, selected }: CampaignNodeProps<'ad-set'>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();
  const activeBudgetType = data.budgetType || 'DAILY';

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

  const handleBudgetAmountSave = useCallback((budgetAmount: number) => {
    updateNodeData(id, { budgetAmount: Math.max(0, budgetAmount) });
  }, [id, updateNodeData]);

  const handleBudgetTypeChange = useCallback((budgetType: NonNullable<AdSetData['budgetType']>) => {
    updateNodeData(id, { budgetType });
  }, [id, updateNodeData]);

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
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
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
              <NodeDescription className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                {OPTIMIZATION_GOALS.find(g => g.value === data.optimizationGoal)?.label || 'CONVERSIONS'}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-3xs px-1 py-0 opacity-80 h-4">
                  {data.billingEvent || 'IMPRESSIONS'}
                </Badge>
                {data.bidStrategy && (
                  <Badge variant="outline" className="text-3xs px-1 py-0 opacity-80 h-4 border-primary/20">
                    {BID_STRATEGIES.find(s => s.value === data.bidStrategy)?.label || 'Highest Vol'}
                  </Badge>
                )}
              </div>
              <div className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 p-1.5">
                <div className="flex items-center justify-between gap-2">
                  <EditableAmount
                    value={data.budgetAmount ?? 0}
                    currency={data.budgetCurrency || 'USD'}
                    onSave={handleBudgetAmountSave}
                    className="text-xs font-semibold tracking-tight text-foreground/90 cursor-text"
                  />
                  <span className="text-3xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Budget Type
                  </span>
                </div>
                <div className="mt-1 inline-flex w-full rounded-sm border border-primary/25 bg-background/70 p-0.5">
                  {BUDGET_TYPES.map((type) => {
                    const isActive = activeBudgetType === type.value;

                    return (
                      <button
                        key={type.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleBudgetTypeChange(type.value);
                        }}
                        className={cn(
                          "flex-1 rounded-sm px-1.5 py-1 text-3xs font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
                          isActive
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-primary/10"
                        )}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
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
            <ContextMenuItemInfo description="An ad is the message and creative shown to people in this ad set." />
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddAudience}>
            <Plus className="mr-2 h-4 w-4 text-orange-500" />
            Add Audience
            <ContextMenuItemInfo description="Audience defines who this ad set is allowed to reach." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        <ContextMenuLabel>Configurations</ContextMenuLabel>
        
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layers className="mr-2 h-4 w-4" />
              Optimization Goal
              <ContextMenuItemInfo className="ml-2 mr-4" description="Optimization goal is the result type the system tries to maximize." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {OPTIMIZATION_GOALS.map((goal) => (
                <ContextMenuCheckboxItem
                  key={goal.value}
                  checked={data.optimizationGoal === goal.value || (!data.optimizationGoal && goal.value === 'CONVERSIONS')}
                  onClick={() => handleGoalChange(goal.value)}
                >
                  {goal.label}
                  <ContextMenuItemInfo description={goal.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Billing Event
              <ContextMenuItemInfo className="ml-2 mr-4" description="Billing event determines which user action triggers spend measurement." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {BILLING_EVENTS.map((event) => (
                <ContextMenuCheckboxItem
                  key={event.value}
                  checked={data.billingEvent === event.value || (!data.billingEvent && event.value === 'IMPRESSIONS')}
                  onClick={() => handleBillingChange(event.value)}
                >
                  {event.label}
                  <ContextMenuItemInfo description={event.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Bid Strategy
              <ContextMenuItemInfo className="ml-2 mr-4" description="Bid strategy controls how aggressively the system bids in auctions." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {BID_STRATEGIES.map((strategy) => (
                <ContextMenuCheckboxItem
                  key={strategy.value}
                  checked={data.bidStrategy === strategy.value || (!data.bidStrategy && strategy.value === 'LOWEST_COST_WITHOUT_CAP')}
                  onClick={() => handleBidChange(strategy.value)}
                >
                  {strategy.label}
                  <ContextMenuItemInfo description={strategy.description} />
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
            <ContextMenuItemInfo className="ml-2" description="A duplicate copies this ad set configuration for quick variant testing." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo className="ml-2" description="Delete removes this ad set object from the current graph." />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdSetNode.displayName = 'AdSetNode';
