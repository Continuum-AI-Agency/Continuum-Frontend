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
import { CheckCircle2, AlertCircle, XCircle, Layers, Trash2, Copy, Edit, Plus } from 'lucide-react';
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
} from "@/components/ui/context-menu";
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';

import { Separator } from '@/components/ui/separator';

export const AdSetNode = memo(({ id, data, selected }: NodeProps<AdSetData>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
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
            <NodeDescription className="text-xs text-muted-foreground">
              {data.optimizationGoal || 'Optimizing for conversions'}
            </NodeDescription>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
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
        <ContextMenuGroup>
          <ContextMenuItem>
            <Edit className="mr-2 h-4 w-4" /> Edit Details
          </ContextMenuItem>
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
