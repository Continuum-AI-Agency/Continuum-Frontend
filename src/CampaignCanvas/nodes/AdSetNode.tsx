'use client';
import { Position } from '@xyflow/react';
import { AlertCircle, CheckCircle2, Copy, Layers, Plus, Trash2, XCircle } from 'lucide-react';
import React, { memo, useCallback } from 'react';
import {
  Node,
  NodeContent,
  NodeDescription,
  type NodeExtraHandle,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { EditableAmount } from '../components/EditableAmount';
import { EditableLabel } from '../components/EditableLabel';
import { NodeProvenance } from '../components/NodeProvenance';
import { useCampaignStore } from '../stores/useCampaignStore';
import { type AdSetData, AUDIENCE_HANDLE_ID, type CampaignNodeProps } from '../types';
import {
  billingEventForGoal,
  DEFAULT_OPTIMIZATION_GOAL,
  OPTIMIZATION_GOALS,
} from '../types/nodeOptions';

/** The ad set's side input: an audience lands here, on the left, never on top. */
const AUDIENCE_INPUT = [
  { type: 'target', position: Position.Left, id: AUDIENCE_HANDLE_ID },
] as const satisfies readonly NodeExtraHandle[];

const BUDGET_TYPES: Array<{ value: NonNullable<AdSetData['budgetType']>; label: string }> = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'LIFETIME', label: 'Lifetime' },
];

export const AdSetNode = memo(({ id, data, selected }: CampaignNodeProps<'ad-set'>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();
  const hasAudience = useCampaignStore((store) =>
    store.edges.some((edge) => edge.target === id && edge.targetHandle === AUDIENCE_HANDLE_ID),
  );
  const activeBudgetType = data.budgetType || 'DAILY';

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  // Billing follows the goal: Meta allows one billing event per goal, so it is set here
  // rather than offered as a second choice that could only ever disagree.
  const handleGoalChange = useCallback(
    (optimizationGoal: string) => {
      updateNodeData(id, { optimizationGoal, billingEvent: billingEventForGoal(optimizationGoal) });
    },
    [id, updateNodeData],
  );

  const handleAddAd = useCallback(() => {
    addConnectedNode(id, 'ad');
  }, [id, addConnectedNode]);

  const handleAddAudience = useCallback(() => {
    addConnectedNode(id, 'audience');
  }, [id, addConnectedNode]);

  const handleBudgetAmountSave = useCallback(
    (budgetAmount: number) => {
      updateNodeData(id, { budgetAmount: Math.max(0, budgetAmount) });
    },
    [id, updateNodeData],
  );

  const handleBudgetTypeChange = useCallback(
    (budgetType: NonNullable<AdSetData['budgetType']>) => {
      updateNodeData(id, { budgetType });
    },
    [id, updateNodeData],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node
          handles={{ target: true, source: true }}
          extraHandles={AUDIENCE_INPUT}
          selected={selected}
          className={cn(
            'overflow-visible hover:shadow-md transition-shadow cursor-pointer',
            data.validationStatus === 'error' && 'border-destructive',
          )}
        >
          <Toolbar isVisible={selected}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={handleDelete}
            >
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
            <div className="flex flex-col gap-1">
              <NodeDescription className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                {OPTIMIZATION_GOALS.find(
                  (g) => g.value === (data.optimizationGoal || DEFAULT_OPTIMIZATION_GOAL),
                )?.label ?? data.optimizationGoal}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-3xs px-1 py-0 opacity-80 h-4">
                  {data.billingEvent || 'IMPRESSIONS'}
                </Badge>
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
                          'flex-1 rounded-sm px-1.5 py-1 text-3xs font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                          isActive
                            ? 'bg-primary/15 text-foreground'
                            : 'text-muted-foreground hover:bg-primary/10',
                        )}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <NodeProvenance data={data} />
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
          <ContextMenuItem onClick={handleAddAudience} disabled={hasAudience}>
            <Plus className="mr-2 h-4 w-4 text-orange-500" />
            Add Audience
            <ContextMenuItemInfo
              description={
                hasAudience
                  ? 'This ad set already has its audience. Meta allows one targeting per ad set.'
                  : 'Audience defines who this ad set is allowed to reach. It feeds the ad set from the left.'
              }
            />
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuLabel>Configurations</ContextMenuLabel>

        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layers className="mr-2 h-4 w-4" />
              Optimization Goal
              <ContextMenuItemInfo
                className="ml-2 mr-4"
                description="Optimization goal is the result type the system tries to maximize."
              />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {OPTIMIZATION_GOALS.map((goal) => (
                <ContextMenuCheckboxItem
                  key={goal.value}
                  checked={
                    data.optimizationGoal === goal.value ||
                    (!data.optimizationGoal && goal.value === DEFAULT_OPTIMIZATION_GOAL)
                  }
                  onClick={() => handleGoalChange(goal.value)}
                >
                  {goal.label}
                  <ContextMenuItemInfo description={goal.description} />
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
            <ContextMenuItemInfo
              className="ml-2"
              description="A duplicate copies this ad set configuration for quick variant testing."
            />
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo
            className="ml-2"
            description="Delete removes this ad set object from the current graph."
          />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdSetNode.displayName = 'AdSetNode';
