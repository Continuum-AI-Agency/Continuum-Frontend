"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type BudgetData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { DollarSign, Copy, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';
import { EditableAmount } from '../components/EditableAmount';

import { Separator } from '@/components/ui/separator';

export const BudgetNode = memo(({ id, data, selected }: NodeProps<BudgetData>) => {
  const { duplicateNode, removeNode, updateNodeData } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleAmountSave = useCallback((newAmount: number) => {
    updateNodeData(id, { amount: newAmount });
  }, [id, updateNodeData]);

  const handleTypeChange = useCallback((type: 'DAILY' | 'LIFETIME') => {
    updateNodeData(id, { type });
  }, [id, updateNodeData]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node 
          handles={{ target: true, source: false }}
          selected={selected}
          className="hover:shadow-md transition-shadow cursor-pointer"
        >
          <NodeHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-amber-500/10 p-1.5 text-amber-500">
                <DollarSign className="h-4 w-4" />
              </div>
              <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Budget
              </NodeTitle>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1 text-center">
            <EditableAmount 
              value={data.amount || 0} 
              currency={data.currency || 'USD'} 
              onSave={handleAmountSave}
              className="font-bold text-2xl text-foreground tracking-tight cursor-text" 
            />
            <Separator className="my-2 opacity-50" />
            <NodeDescription className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">
              {data.type || 'DAILY'} BUDGET
            </NodeDescription>
            <div className="mt-2 text-xs font-medium">
              <EditableLabel value={data.label} onSave={handleLabelSave} className="opacity-70 hover:opacity-100" />
            </div>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <DollarSign className="mr-2 h-4 w-4" />
            Budget Type
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuCheckboxItem 
              checked={data.type === 'DAILY' || !data.type} 
              onClick={() => handleTypeChange('DAILY')}
            >
              Daily
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem 
              checked={data.type === 'LIFETIME'} 
              onClick={() => handleTypeChange('LIFETIME')}
            >
              Lifetime
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={handleDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

BudgetNode.displayName = 'BudgetNode';
