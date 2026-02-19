"use client";
import React, { memo, useCallback } from 'react';
import { type NodeProps } from '@xyflow/react';
import { type AudienceData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { Users, CheckCircle2, AlertCircle, XCircle, Copy, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

import { Separator } from '@/components/ui/separator';

const LOCATIONS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
];

const AGE_RANGES = [
  { min: 18, max: 24, label: '18-24' },
  { min: 25, max: 34, label: '25-34' },
  { min: 35, max: 44, label: '35-44' },
  { min: 45, max: 54, label: '45-54' },
  { min: 55, max: 64, label: '55-64' },
  { min: 65, max: 100, label: '65+' },
];

export const AudienceNode = memo(({ id, data, selected }: NodeProps<AudienceData>) => {
  const { duplicateNode, removeNode, updateNodeData } = useCampaignStore();

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback((newLabel: string) => {
    updateNodeData(id, { label: newLabel });
  }, [id, updateNodeData]);

  const handleGenderToggle = useCallback((gender: number) => {
    const currentGenders = data.genders || [];
    const nextGenders = currentGenders.includes(gender)
      ? currentGenders.filter(g => g !== gender)
      : [...currentGenders, gender];
    updateNodeData(id, { genders: nextGenders });
  }, [id, data.genders, updateNodeData]);

  const handleLocationToggle = useCallback((location: string) => {
    const current = data.locations || [];
    const next = current.includes(location)
      ? current.filter(l => l !== location)
      : [...current, location];
    updateNodeData(id, { locations: next });
  }, [id, data.locations, updateNodeData]);

  const handleAgeChange = useCallback((min: number, max: number) => {
    updateNodeData(id, { ageMin: min, ageMax: max });
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
              <div className="rounded-md bg-orange-500/10 p-1.5 text-orange-500">
                <Users className="h-4 w-4" />
              </div>
              <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audience
              </NodeTitle>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1">
            <h3 className="font-semibold text-foreground leading-tight">
              <EditableLabel value={data.label} onSave={handleLabelSave} />
            </h3>
            <Separator className="my-1.5 opacity-50" />
            <div className="flex flex-col gap-1">
              <NodeDescription className="text-xs text-muted-foreground">
                {data.locations?.length 
                  ? `${data.locations.length} locations` 
                  : 'Global targeting'}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-[8px] px-1 py-0 opacity-80 h-4">
                  {data.genders?.length === 1 
                    ? (data.genders[0] === 1 ? 'MEN' : 'WOMEN') 
                    : 'ALL GENDERS'}
                </Badge>
                {data.ageMin && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 opacity-80 h-4">
                    AGE: {data.ageMin}-{data.ageMax === 100 ? '65+' : data.ageMax}
                  </Badge>
                )}
              </div>
            </div>
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>Targeting Actions</ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Users className="mr-2 h-4 w-4" />
              Genders
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuCheckboxItem 
                checked={data.genders?.includes(1)} 
                onClick={() => handleGenderToggle(1)}
              >
                Men
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem 
                checked={data.genders?.includes(2)} 
                onClick={() => handleGenderToggle(2)}
              >
                Women
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layout className="mr-2 h-4 w-4" />
              Locations
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {LOCATIONS.map((loc) => (
                <ContextMenuCheckboxItem
                  key={loc.value}
                  checked={data.locations?.includes(loc.value)}
                  onClick={() => handleLocationToggle(loc.value)}
                >
                  {loc.label}
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Settings className="mr-2 h-4 w-4" />
              Age Range
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {AGE_RANGES.map((range) => (
                <ContextMenuCheckboxItem
                  key={range.label}
                  checked={data.ageMin === range.min && data.ageMax === range.max}
                  onClick={() => handleAgeChange(range.min, range.max)}
                >
                  {range.label}
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

AudienceNode.displayName = 'AudienceNode';
