"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type CampaignData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, AlertCircle, XCircle, Layout, Edit, Copy, Trash2, Plus } from 'lucide-react';
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
import { useCampaignStore } from '../stores/useCampaignStore';
import { EditableLabel } from '../components/EditableLabel';
import { cn } from '@/lib/utils';

const OBJECTIVES = [
  { value: 'OUTCOME_AWARENESS', label: 'Awareness' },
  { value: 'OUTCOME_TRAFFIC', label: 'Traffic' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engagement' },
  { value: 'OUTCOME_LEADS', label: 'Leads' },
  { value: 'OUTCOME_APP_PROMOTION', label: 'App Promotion' },
  { value: 'OUTCOME_SALES', label: 'Sales' },
];

export const CampaignNode = memo(({ id, data, selected }: NodeProps<CampaignData>) => {
  const { duplicateNode, removeNode, updateNodeData, addConnectedNode } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleObjectiveChange = useCallback((objective: string) => {
    updateNodeData(id, { objective } as any);
  }, [id, updateNodeData]);

  const handleAddAdSet = useCallback(() => {
    addConnectedNode(id, 'ad-set');
  }, [id, addConnectedNode]);

  const handleAddBudget = useCallback(() => {
    addConnectedNode(id, 'budget');
  }, [id, addConnectedNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node 
          handles={{ target: false, source: true }}
          selected={selected}
          className={cn(
            "hover:shadow-md transition-shadow cursor-pointer",
            data.validationStatus === 'error' && "border-destructive"
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
            <NodeDescription className="text-xs text-muted-foreground">
              {OBJECTIVES.find(o => o.value === data.objective)?.label || 'No Objective Set'}
            </NodeDescription>
            
            {data.metaId && (
              <>
                <Separator className="my-2" />
                <div className="pt-1">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Meta ID: {data.metaId}</span>
                </div>
              </>
            )}
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Campaign Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuItem onClick={handleAddAdSet}>
            <Plus className="mr-2 h-4 w-4 text-purple-500" />
            Add Ad Set
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddBudget}>
            <Plus className="mr-2 h-4 w-4 text-amber-500" />
            Add Budget
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layout className="mr-2 h-4 w-4" />
              Set Objective
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {OBJECTIVES.map((obj) => (
                <ContextMenuCheckboxItem
                  key={obj.value}
                  checked={data.objective === obj.value}
                  onClick={() => handleObjectiveChange(obj.value)}
                >
                  {obj.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
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

CampaignNode.displayName = 'CampaignNode';
