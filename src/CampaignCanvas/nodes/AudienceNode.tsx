'use client';

import { Position } from '@xyflow/react';
import { Copy, Layout, Settings, Trash2, Users } from 'lucide-react';
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
import { EditableLabel } from '../components/EditableLabel';
import { NodeProvenance } from '../components/NodeProvenance';
import { useCampaignStore } from '../stores/useCampaignStore';
import type { AudienceData, CampaignNodeProps } from '../types';
import { countryList, localizedNodeOptions } from '../types/nodeOptionPresentation';
import { AGE_RANGES, LOCATIONS } from '../types/nodeOptions';

/** An audience has no parent: its one handle is the right-hand source into ad sets. */
const AUDIENCE_HANDLES = { target: false, source: { position: Position.Right } } as const;

export const AudienceNode = memo(({ id, data, selected }: CampaignNodeProps<'audience'>) => {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const locationsView = localizedNodeOptions(LOCATIONS, uiText, uiLocale, true);
  const ageRangesView = localizedNodeOptions(AGE_RANGES, uiText, uiLocale);
  const { duplicateNode, removeNode, updateNodeData } = useCampaignStore();
  const fedAdSetCount = useCampaignStore(
    (store) => store.edges.filter((edge) => edge.source === id).length,
  );
  const isGroup = data.mode === 'group';
  const scaffoldBacked = useCampaignStore((store) => store.hydration !== null);

  const handleDuplicate = useCallback(() => duplicateNode(id), [duplicateNode, id]);
  const handleDelete = useCallback(() => removeNode(id), [removeNode, id]);
  const handleLabelSave = useCallback(
    (newLabel: string) => {
      updateNodeData(id, { label: newLabel });
    },
    [id, updateNodeData],
  );

  const handleGenderToggle = useCallback(
    (gender: number) => {
      const currentGenders = data.genders || [];
      const nextGenders = currentGenders.includes(gender)
        ? currentGenders.filter((g) => g !== gender)
        : [...currentGenders, gender];
      updateNodeData(id, { genders: nextGenders });
    },
    [id, data.genders, updateNodeData],
  );

  const handleLocationToggle = useCallback(
    (location: string) => {
      const current = data.locations || [];
      const next = current.includes(location)
        ? current.filter((l) => l !== location)
        : [...current, location];
      updateNodeData(id, { locations: next });
    },
    [id, data.locations, updateNodeData],
  );

  const handleAgeChange = useCallback(
    (min: number, max: number) => {
      updateNodeData(id, { ageMin: min, ageMax: max });
    },
    [id, updateNodeData],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Node
          handles={AUDIENCE_HANDLES}
          selected={selected}
          className="hover:shadow-md transition-shadow cursor-pointer"
        >
          <NodeHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-orange-500/10 p-1.5 text-orange-500">
                  <Users className="h-4 w-4" />
                </div>
                <NodeTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {uiText('audience_545c023')}
                </NodeTitle>
              </div>
              <Badge
                variant="outline"
                className="h-5 px-1.5 text-3xs font-medium"
                data-testid="canvas-audience-mode"
              >
                {isGroup ? uiText('published_group_db5004c') : uiText('broad_3d9c053')}
              </Badge>
            </div>
          </NodeHeader>

          <NodeContent className="space-y-1">
            <h3 className="font-semibold text-foreground leading-tight">
              {scaffoldBacked ? (
                // A saved version does not keep an audience's name, so a scaffold shows it, never edits it.
                data.label
              ) : (
                <EditableLabel value={data.label} onSave={handleLabelSave} />
              )}
            </h3>
            <Separator className="my-1.5 opacity-50" />
            <div className="flex flex-col gap-1">
              <NodeDescription className="text-xs text-muted-foreground">
                {data.locations?.length
                  ? countryList(data.locations, uiLocale)
                  : isGroup
                    ? uiText('targeting_from_the_published_group_d6a189b')
                    : uiText('no_countries_yet_3403a3c')}
              </NodeDescription>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <Badge variant="secondary" className="text-3xs px-1 py-0 opacity-80 h-4">
                  {data.genders?.length === 1
                    ? data.genders[0] === 1
                      ? uiText('men_ec751a7')
                      : uiText('women_baeb0de')
                    : uiText('all_genders_211aa36')}
                </Badge>
                {data.ageMin ? (
                  <Badge variant="outline" className="text-3xs px-1 py-0 opacity-80 h-4">
                    {uiText.rich('sentence_676479687929', {
                      v0: data.ageMin,
                      v1: (data.ageMax ?? 65) >= 65 ? '65+' : (data.ageMax ?? ''),
                    })}
                  </Badge>
                ) : null}
                {isGroup && data.customAudiences?.length ? (
                  <Badge variant="outline" className="text-3xs px-1 py-0 opacity-80 h-4">
                    {uiText.rich('sentence_7da2c5423981', { count: data.customAudiences.length })}
                  </Badge>
                ) : null}
              </div>
              <span className="text-2xs text-muted-foreground" data-testid="canvas-audience-feeds">
                {fedAdSetCount === 0
                  ? uiText('not_feeding_an_ad_set_980f533')
                  : uiText('audience_feeds_count', { count: fedAdSetCount })}
              </span>
            </div>
            <NodeProvenance data={data} />
          </NodeContent>
        </Node>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel>
          {isGroup
            ? uiText('targeting_comes_from_the_published_group_81a6fb3')
            : uiText('targeting_actions_cafa755')}
        </ContextMenuLabel>
        <ContextMenuGroup>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isGroup}>
              {uiText.rich('sentence_51456ca566a9', {
                v0: () => <Users className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('gender_targeting_narrows_delivery_to_selected_37069ed')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuCheckboxItem
                checked={data.genders?.includes(1)}
                onClick={() => handleGenderToggle(1)}
              >
                {uiText.rich('sentence_d6abd224f890', {
                  v0: () => (
                    <ContextMenuItemInfo
                      description={uiText('men_targeting_includes_users_categorized_as_m_2952297')}
                    />
                  ),
                })}
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem
                checked={data.genders?.includes(2)}
                onClick={() => handleGenderToggle(2)}
              >
                {uiText.rich('sentence_4d75ddaede9a', {
                  v0: () => (
                    <ContextMenuItemInfo
                      description={uiText('women_targeting_includes_users_categorized_as_27a72dd')}
                    />
                  ),
                })}
              </ContextMenuCheckboxItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isGroup}>
              {uiText.rich('sentence_8a2a4f0c2f53', {
                v0: () => <Layout className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('location_targeting_limits_delivery_to_specifi_2e9f820')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {locationsView.map((loc) => (
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
            <ContextMenuSubTrigger disabled={isGroup}>
              {uiText.rich('sentence_27e4dae30745', {
                v0: () => <Settings className="mr-2 h-4 w-4" />,
                v1: () => (
                  <ContextMenuItemInfo
                    className="ml-2 mr-4"
                    description={uiText('age_range_sets_the_eligible_age_band_for_deli_2ef2f94')}
                  />
                ),
              })}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              {ageRangesView.map((range) => (
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
            {uiText.rich('sentence_cbb73dcd8c7a', {
              v0: () => <Copy className="mr-2 h-4 w-4" />,
              v1: () => <ContextMenuShortcut>⌘D</ContextMenuShortcut>,
              v2: () => (
                <ContextMenuItemInfo
                  className="ml-2"
                  description={uiText('a_duplicate_copies_this_audience_setup_for_qu_4e8a317')}
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
                description={uiText('delete_removes_this_audience_object_from_the__8f43708')}
              />
            ),
          })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

AudienceNode.displayName = 'AudienceNode';
