'use client';

import { Position } from '@xyflow/react';
import { AlertCircle, CheckCircle2, Copy, Layers, Plus, Trash2, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import React, { memo, useCallback, useMemo } from 'react';
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
import { localizedNodeOptions } from '../types/nodeOptionPresentation';
import {
  billingEventForGoal,
  DEFAULT_OPTIMIZATION_GOAL,
  OPTIMIZATION_GOALS,
} from '../types/nodeOptions';

/** The ad set's side input: an audience lands here, on the left, never on top. */
const AUDIENCE_INPUT = [
  { type: 'target', position: Position.Left, id: AUDIENCE_HANDLE_ID },
] as const satisfies readonly NodeExtraHandle[];

export const AdSetNode = memo(({ id, data, selected }: CampaignNodeProps<'ad-set'>) => {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizationGoalsView = localizedNodeOptions(OPTIMIZATION_GOALS, uiText, uiLocale);
  const BUDGET_TYPES: Array<{ value: NonNullable<AdSetData['budgetType']>; label: string }> =
    useMemo(
      () => [
        { value: 'DAILY', label: uiText('daily_b36c261') },
        { value: 'LIFETIME', label: uiText('lifetime_bdcd897') },
      ],
      [uiText],
    );

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
                  {uiText('ad_set_8fa52e4')}
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
                {optimizationGoalsView.find(
                  (g) => g.value === (data.optimizationGoal || DEFAULT_OPTIMIZATION_GOAL),
                )?.label ?? data.optimizationGoal}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-3xs px-1 py-0 opacity-80 h-4">
                  {data.billingEvent || uiText('impressions_951ea23')}
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
                    {uiText('budget_type_7dc31fd')}
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
        <ContextMenuLabel>{uiText('ad_set_actions_2123b45')}</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddAd}>
            {uiText.rich('sentence_1b5197711087', {
              v0: () => <Plus className="mr-2 h-4 w-4 text-emerald-500" />,
              v1: () => (
                <ContextMenuItemInfo
                  description={uiText('an_ad_is_the_message_and_creative_shown_to_pe_2959fc8')}
                />
              ),
            })}
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddAudience} disabled={hasAudience}>
            {uiText.rich('sentence_939354ced2d6', {
              v0: () => <Plus className="mr-2 h-4 w-4 text-orange-500" />,
              v1: () => (
                <ContextMenuItemInfo
                  description={
                    hasAudience
                      ? uiText('this_ad_set_already_has_its_audience_meta_all_e3c367d')
                      : uiText('audience_defines_who_this_ad_set_is_allowed_t_f0f3ea0')
                  }
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
              {uiText.rich('sentence_0b86e57c3b98', {
                v0: () => <Layers className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('optimization_goal_is_the_result_type_the_syst_2149e7e')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {optimizationGoalsView.map((goal) => (
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
            {uiText.rich('sentence_cbb73dcd8c7a', {
              v0: () => <Copy className="mr-2 h-4 w-4" />,
              v1: () => <ContextMenuShortcut>⌘D</ContextMenuShortcut>,
              v2: () => (
                <ContextMenuItemInfo
                  className="ml-2"
                  description={uiText('a_duplicate_copies_this_ad_set_configuration__c238a9a')}
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
                description={uiText('delete_removes_this_ad_set_object_from_the_cu_d8730d5')}
              />
            ),
          })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AdSetNode.displayName = 'AdSetNode';
