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
import { useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignData, CampaignNodeProps } from '../types';
import { OBJECTIVES, SPECIAL_CATEGORIES } from '../types/nodeOptions';

export const CampaignNode = memo(({ id, data, selected }: CampaignNodeProps<'campaign'>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();

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
                  Campaign
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
                {OBJECTIVES.find((o) => o.value === data.objective)?.label || 'No Objective Set'}
              </NodeDescription>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-3xs px-1 py-0 uppercase opacity-70">
                  {data.buyingType || 'AUCTION'}
                </Badge>
                {data.specialAdCategories?.length ? (
                  <Badge
                    variant="outline"
                    className="text-3xs px-1 py-0 uppercase text-blue-500 border-blue-500/30"
                  >
                    Special Cat.
                  </Badge>
                ) : null}
              </div>
            </div>

            <NodeProvenance data={data} />
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>Campaign Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddAdSet}>
            <Plus className="mr-2 h-4 w-4 text-primary" />
            Add Ad Set
            <ContextMenuItemInfo description="An ad set defines audience, budget, and delivery settings for its ads." />
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />
        <ContextMenuLabel>Configurations</ContextMenuLabel>

        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layout className="mr-2 h-4 w-4" />
              Set Objective
              <ContextMenuItemInfo
                className="ml-2 mr-4"
                description="Campaign objective tells delivery which business outcome to optimize toward."
              />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {OBJECTIVES.map((obj) => (
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
              <Settings className="mr-2 h-4 w-4" />
              Special Categories
              <ContextMenuItemInfo
                className="ml-2 mr-4"
                description="Special Ad Categories are required for regulated ad verticals."
              />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {SPECIAL_CATEGORIES.map((cat) => (
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
            <Copy className="mr-2 h-4 w-4" /> Duplicate
            <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            <ContextMenuItemInfo
              className="ml-2"
              description="A duplicate is an exact copy you can modify as a campaign variant."
            />
          </ContextMenuItem>
        </ContextMenuGroup>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo
            className="ml-2"
            description="Delete removes this campaign object from the current graph."
          />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

CampaignNode.displayName = 'CampaignNode';
