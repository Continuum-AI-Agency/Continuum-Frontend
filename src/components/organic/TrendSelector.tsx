"use client";

import { useEffect, useMemo, useState } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon, MixerHorizontalIcon } from "@radix-ui/react-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs } from "@/components/ui/StableTabs";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { Trend } from "@/lib/organic/trends";

type TrendSelectorProps = {
  trends: Trend[];
  selectedTrendIds: string[];
  onToggleTrend: (trendId: string) => void;
  activePlatforms: OrganicPlatformKey[];
  maxSelections?: number;
  withContainer?: boolean;
  showHeader?: boolean;
  className?: string;
};

export function TrendSelector({
  trends,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
  maxSelections,
  withContainer = true,
  showHeader = true,
  className,
}: TrendSelectorProps) {
  const activeSet = useMemo(() => new Set(selectedTrendIds), [selectedTrendIds]);
  const platformSet = useMemo(() => new Set(activePlatforms), [activePlatforms]);
  const hasLimit = typeof maxSelections === "number" && Number.isFinite(maxSelections);
  const trendTypes = useMemo(() => {
    const order = ["rising", "stable", "cooling"] as const;
    const typeMap = order
      .map((type) => ({ type, items: trends.filter((trend) => trend.momentum === type) }))
      .filter((entry) => entry.items.length > 0);
    return typeMap;
  }, [trends]);

  const defaultTab = trendTypes[0]?.type ?? "rising";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  useEffect(() => {
    if (!trendTypes.find((entry) => entry.type === activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, defaultTab, trendTypes]);

  const platformLabel = (platform: OrganicPlatformKey) =>
    platform === "linkedin" ? "LinkedIn" : platform === "tiktok" ? "TikTok" : platform[0]?.toUpperCase() + platform.slice(1);

  const groupedByPlatform = (items: Trend[]) => {
    const groups = new Map<string, Trend[]>();
    items.forEach((trend) => {
      const primary =
        trend.platforms.find((platform) => platformSet.has(platform)) ?? trend.platforms[0] ?? "other";
      const key = primary ?? "other";
      groups.set(key, [...(groups.get(key) ?? []), trend]);
    });

    const orderedKeys = [
      ...activePlatforms,
      ...Array.from(groups.keys()).filter((key) => !activePlatforms.includes(key as OrganicPlatformKey)),
    ];

    return orderedKeys
      .filter((key) => groups.has(key))
      .map((key) => ({ id: key, label: platformLabel(key as OrganicPlatformKey), trends: groups.get(key) ?? [] }));
  };

  const Wrapper: React.ElementType = withContainer ? GlassPanel : "div";
  const wrapperClassName = cn(withContainer ? "p-5 space-y-4" : "space-y-4", className);

  return (
    <Wrapper className={wrapperClassName}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Trends</p>
            <p className="text-lg font-semibold text-primary">Trending topics</p>
          </div>
          <div className="text-xs text-secondary">
            {selectedTrendIds.length}
            {hasLimit ? `/${maxSelections}` : ""} selected
          </div>
        </div>
      ) : null}

      {trendTypes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-subtle bg-default/40 p-6 text-sm text-secondary">
          No trends available yet.
        </div>
      ) : (
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} activationMode="manual">
          <Tabs.List className="flex flex-wrap gap-2 rounded-full border border-subtle bg-surface/70 p-1">
            {trendTypes.map((entry) => (
              <Tabs.Trigger
                key={entry.type}
                value={entry.type}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold capitalize text-secondary transition",
                  "data-[state=active]:bg-brand-primary/20 data-[state=active]:text-primary"
                )}
              >
                {entry.type}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {trendTypes.map((entry) => {
            const groups = groupedByPlatform(entry.items);
            return (
              <Tabs.Content key={entry.type} value={entry.type} className="mt-3">
                <AccordionPrimitive.Root
                  type="multiple"
                  defaultValue={groups.slice(0, 2).map((group) => group.id)}
                  className="space-y-2"
                >
                  {groups.map((group) => (
                    <AccordionPrimitive.Item
                      key={group.id}
                      value={group.id}
                      className="rounded-xl border border-subtle bg-surface/70"
                    >
                      <AccordionPrimitive.Header>
                        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-primary">
                          {group.label}
                          <ChevronDownIcon className="transition-transform group-data-[state=open]:rotate-180" />
                        </AccordionPrimitive.Trigger>
                      </AccordionPrimitive.Header>
                      <AccordionPrimitive.Content className="px-3 pb-3">
                        <div className="grid gap-2">
                          {group.trends.map((trend) => {
                            const isSelected = activeSet.has(trend.id);
                            const isRelevant = trend.platforms.some((platform) => platformSet.has(platform));
                            const selectionDisabled =
                              !isSelected && hasLimit && selectedTrendIds.length >= (maxSelections ?? 0);

                            const toggle = () => {
                              if (selectionDisabled) return;
                              onToggleTrend(trend.id);
                            };

                            return (
                              <HoverCard key={trend.id} openDelay={200} closeDelay={120}>
                                <div
                                  className={cn(
                                    "group flex items-center justify-between gap-2 rounded-lg border px-2 py-2 transition",
                                    isSelected
                                      ? "border-brand-primary/60 bg-brand-primary/10 shadow-brand-glow"
                                      : "border-subtle bg-default/40 hover:border-brand-primary/40",
                                    selectionDisabled && "cursor-not-allowed opacity-60"
                                  )}
                                >
                                  <HoverCardTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={toggle}
                                      className="text-left text-xs font-semibold text-primary"
                                    >
                                      {trend.title}
                                    </button>
                                  </HoverCardTrigger>
                                  <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon-sm">
                                          <MixerHorizontalIcon />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={toggle}>
                                          {isSelected ? "Remove from plan" : "Add to plan"}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                                          Ignore
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                <HoverCardContent side="right" align="start" className="w-[280px]">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-primary">{trend.title}</span>
                                      <span className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary uppercase tracking-wide">
                                        {trend.momentum}
                                      </span>
                                    </div>
                                    <p className="text-xs text-secondary">{trend.summary}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {trend.tags.map((tag) => (
                                        <span
                                          key={tag}
                                          className="rounded-full border border-subtle bg-default px-2 py-0.5 text-[10px] text-secondary"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {trend.platforms.map((platform) => (
                                        <span
                                          key={platform}
                                          className={cn(
                                            "rounded-full border px-2 py-0.5 text-[10px] text-secondary",
                                            platformSet.has(platform)
                                              ? "border-brand-primary/40 bg-brand-primary/10 text-primary"
                                              : "border-subtle bg-default"
                                          )}
                                        >
                                          {platformLabel(platform)}
                                        </span>
                                      ))}
                                    </div>
                                    {!isRelevant && activePlatforms.length > 0 ? (
                                      <p className="text-[11px] text-secondary">
                                        Not currently assigned to your connected platforms.
                                      </p>
                                    ) : null}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            );
                          })}
                        </div>
                      </AccordionPrimitive.Content>
                    </AccordionPrimitive.Item>
                  ))}
                </AccordionPrimitive.Root>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      )}
    </Wrapper>
  );
}
