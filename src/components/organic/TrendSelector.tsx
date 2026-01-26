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

import { TrendsDataTable } from "./TrendsDataTable";

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
  const hasLimit = typeof maxSelections === "number" && Number.isFinite(maxSelections);

  const Wrapper: React.ElementType = withContainer ? GlassPanel : "div";
  const wrapperClassName = cn(withContainer ? "p-5 space-y-4" : "space-y-4", className);

  return (
    <Wrapper className={wrapperClassName}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Insights</p>
            <p className="text-lg font-semibold text-primary">Trends & Questions</p>
          </div>
          <div className="text-xs text-secondary">
            {selectedTrendIds.length}
            {hasLimit ? `/${maxSelections}` : ""} selected
          </div>
        </div>
      ) : null}

      <TrendsDataTable
        data={trends}
        selectedTrendIds={selectedTrendIds}
        onToggleTrend={onToggleTrend}
        activePlatforms={activePlatforms}
      />
    </Wrapper>
  );
}
