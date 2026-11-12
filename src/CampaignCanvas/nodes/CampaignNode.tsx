'use client';

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Layout,
  Plus,
  Settings,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import React, { memo, useCallback } from 'react';
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
import { usePersonEdit } from '../hooks/usePersonEdit';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignData, CampaignNodeProps } from '../types';
import { localizedNodeOptions } from '../types/nodeOptionPresentation';
import { OBJECTIVES, SPECIAL_CATEGORIES } from '../types/nodeOptions';

export const CampaignNode = memo(({ id, data, selected }: CampaignNodeProps<'campaign'>) => {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const specialCategoriesView = localizedNodeOptions(SPECIAL_CATEGORIES, uiText, uiLocale);
  const objectivesView = localizedNodeOptions(OBJECTIVES, uiText, uiLocale);
  const { duplicateNode, removeNode, addConnectedNode } = useCampaignStore();
  // Context-menu edits are a person's: they relabel what they change 'user_gave'.
  const updateNodeData = usePersonEdit();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  const handleObjectiveChange = useCallback(
    (objective: CampaignData['objective']) => {
      updateNodeData(id, { objective });
    },
    [id, updateNodeData],
  );

  const handleCategoryToggle = useCallback(
    (category: string) => {
      const current = data.specialAdCategories || [];
      const next = current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category];
      updateNodeData(id, { specialAdCategories: next });
    },
    [id, data.specialAdCategories, updateNodeData],
  );

  const handleAddAdSet = useCallback(() => {
    addConnectedNode(id, 'ad-set');
  }, [id, addConnectedNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node
          handles={{ target: false, source: true }}
          selected={selected}
          className={cn(
            'overflow-visible hover:shadow-md transition-shadow cursor-pointer',
            data.validationStatus === 'error' && 'border-destructive',
          )}
        >
          <NodeHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-500">
                  <Layout className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {uiText('campaign_268286d')}
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
            <div className="flex flex-col gap-0.5">
              <NodeDescription className="text-xs text-muted-foreground">
                {objectivesView.find((o) => o.value === data.objective)?.label ||
                  uiText('no_objective_set_10d3226')}
              </NodeDescription>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-70">
                  {data.buyingType || uiText('auction_ae6062b')}
                </Badge>
                {data.specialAdCategories?.length ? (
                  <Badge
                    variant="outline"
                    className="text-3xs px-1 py-0 uppercase text-blue-500 border-blue-500/30"
                  >
                    {uiText('special_cat_7d724cd')}
                  </Badge>
                ) : null}
              </div>
            </div>

            <NodeProvenance data={data} />
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>{uiText('campaign_actions_6d62b9f')}</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddAdSet}>
            {uiText.rich('sentence_c2d7c04594e2', {
              v0: () => <Plus className="mr-2 h-4 w-4 text-primary" />,
              v1: () => (
                <ContextMenuItemInfo
                  description={uiText('an_ad_set_defines_audience_budget_and_deliver_54bd2f8')}
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
              {uiText.rich('sentence_53cb67569052', {
                v0: () => <Layout className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('campaign_objective_tells_delivery_which_busin_5a4c308')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {objectivesView.map((obj) => (
                <ContextMenuCheckboxItem
                  key={obj.value}
                  checked={data.objective === obj.value}
                  onClick={() => handleObjectiveChange(obj.value)}
                >
                  {obj.label}
                  <ContextMenuItemInfo description={obj.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              {uiText.rich('sentence_2fd823cf52a8', {
                v0: () => <Settings className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('special_ad_categories_are_required_for_regula_6032a7d')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {specialCategoriesView.map((cat) => (
                <ContextMenuCheckboxItem
                  key={cat.value}
                  checked={data.specialAdCategories?.includes(cat.value)}
                  onClick={() => handleCategoryToggle(cat.value)}
                >
                  {cat.label}
                  <ContextMenuItemInfo description={cat.description} />
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
                  description={uiText('a_duplicate_is_an_exact_copy_you_can_modify_a_5f52bb8')}
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
                description={uiText('delete_removes_this_campaign_object_from_the__d24d306')}
              />
            ),
          })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CampaignNode.displayName = 'CampaignNode';
