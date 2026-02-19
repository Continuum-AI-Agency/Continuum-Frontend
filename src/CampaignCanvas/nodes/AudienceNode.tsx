"use client";
import React, { memo, useCallback } from 'react';
import { type CampaignNodeProps, type AudienceData } from '../types';
import { 
  Node, 
  NodeHeader, 
  NodeTitle, 
  NodeContent,
  NodeDescription 
} from '@/components/ai-elements/node';
import { Users, Copy, Trash2, Layout, Settings } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuGroup,
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
import { Badge } from '@/components/ui/badge';
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';

import { Separator } from '@/components/ui/separator';

const LOCATIONS = [
  { value: 'MX', label: 'Mexico', description: 'Mexico targeting restricts delivery to users located in Mexico.' },
  { value: 'BR', label: 'Brazil', description: 'Brazil targeting restricts delivery to users located in Brazil.' },
  { value: 'AR', label: 'Argentina', description: 'Argentina targeting restricts delivery to users located in Argentina.' },
  { value: 'CO', label: 'Colombia', description: 'Colombia targeting restricts delivery to users located in Colombia.' },
  { value: 'CL', label: 'Chile', description: 'Chile targeting restricts delivery to users located in Chile.' },
  { value: 'PE', label: 'Peru', description: 'Peru targeting restricts delivery to users located in Peru.' },
  { value: 'EC', label: 'Ecuador', description: 'Ecuador targeting restricts delivery to users located in Ecuador.' },
  { value: 'UY', label: 'Uruguay', description: 'Uruguay targeting restricts delivery to users located in Uruguay.' },
  { value: 'PY', label: 'Paraguay', description: 'Paraguay targeting restricts delivery to users located in Paraguay.' },
  { value: 'BO', label: 'Bolivia', description: 'Bolivia targeting restricts delivery to users located in Bolivia.' },
  { value: 'CR', label: 'Costa Rica', description: 'Costa Rica targeting restricts delivery to users located in Costa Rica.' },
  { value: 'PA', label: 'Panama', description: 'Panama targeting restricts delivery to users located in Panama.' },
  { value: 'DO', label: 'Dominican Republic', description: 'Dominican Republic targeting restricts delivery to users located in the Dominican Republic.' },
];

const AGE_RANGES = [
  { min: 18, max: 24, label: '18-24', description: 'Targets adults between ages 18 and 24.' },
  { min: 25, max: 34, label: '25-34', description: 'Targets adults between ages 25 and 34.' },
  { min: 35, max: 44, label: '35-44', description: 'Targets adults between ages 35 and 44.' },
  { min: 45, max: 54, label: '45-54', description: 'Targets adults between ages 45 and 54.' },
  { min: 55, max: 64, label: '55-64', description: 'Targets adults between ages 55 and 64.' },
  { min: 65, max: 100, label: '65+', description: 'Targets adults age 65 and older.' },
];

export const AudienceNode = memo(({ id, data, selected }: CampaignNodeProps<'audience'>) => {
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
              <ContextMenuItemInfo className="ml-2 mr-4" description="Gender targeting narrows delivery to selected gender groups." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuCheckboxItem 
                checked={data.genders?.includes(1)} 
                onClick={() => handleGenderToggle(1)}
              >
                Men
                <ContextMenuItemInfo description="Men targeting includes users categorized as male." />
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem 
                checked={data.genders?.includes(2)} 
                onClick={() => handleGenderToggle(2)}
              >
                Women
                <ContextMenuItemInfo description="Women targeting includes users categorized as female." />
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Layout className="mr-2 h-4 w-4" />
              Locations
              <ContextMenuItemInfo className="ml-2 mr-4" description="Location targeting limits delivery to specific geographies." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {LOCATIONS.map((loc) => (
                <ContextMenuCheckboxItem
                  key={loc.value}
                  checked={data.locations?.includes(loc.value)}
                  onClick={() => handleLocationToggle(loc.value)}
                >
                  {loc.label}
                  <ContextMenuItemInfo description={loc.description} />
                </ContextMenuCheckboxItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Settings className="mr-2 h-4 w-4" />
              Age Range
              <ContextMenuItemInfo className="ml-2 mr-4" description="Age range sets the eligible age band for delivery." />
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {AGE_RANGES.map((range) => (
                <ContextMenuCheckboxItem
                  key={range.label}
                  checked={data.ageMin === range.min && data.ageMax === range.max}
                  onClick={() => handleAgeChange(range.min, range.max)}
                >
                  {range.label}
                  <ContextMenuItemInfo description={range.description} />
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
            <ContextMenuItemInfo className="ml-2" description="A duplicate copies this audience setup for quick experimentation." />
          </ContextMenuItem>
        </ContextMenuGroup>
        
        <ContextMenuSeparator />
        
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
          <ContextMenuItemInfo className="ml-2" description="Delete removes this audience object from the current graph." />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AudienceNode.displayName = 'AudienceNode';
