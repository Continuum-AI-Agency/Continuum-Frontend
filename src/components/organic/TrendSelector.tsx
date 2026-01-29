"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { Trend } from "@/lib/organic/trends";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TrendsDataTable } from "./TrendsDataTable";
import type { OrganicTrendType } from "./primitives/types";

type TrendSelectorProps = {
  trendTypes: OrganicTrendType[];
  trends: Trend[];
  selectedTrendIds: string[];
  onToggleTrend: (trendId: string) => void;
  activePlatforms: OrganicPlatformKey[];
  maxSelections?: number;
  withContainer?: boolean;
  showHeader?: boolean;
  allowDrag?: boolean;
  allowSelect?: boolean;
  allowActions?: boolean;
  className?: string;
};

export function TrendSelector({
  trendTypes,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
  maxSelections,
  withContainer = true,
  showHeader = true,
  allowDrag = false,
  allowSelect = true,
  allowActions = true,
  className,
}: TrendSelectorProps) {
  const hasLimit = typeof maxSelections === "number" && Number.isFinite(maxSelections);

  const Wrapper: React.ElementType = withContainer ? GlassPanel : "div";
  const wrapperClassName = cn(withContainer ? "p-5" : "", className);

  return (
    <Wrapper className={cn("flex flex-col h-full", wrapperClassName)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 border-b border-subtle pb-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Content Ideas</p>
            <p className="text-lg font-semibold text-primary">Trends & Questions</p>
          </div>
          <div className="text-xs text-secondary bg-surface px-2 py-1 rounded border border-subtle">
            {selectedTrendIds.length}
            {hasLimit ? `/${maxSelections}` : ""} selected
          </div>
        </div>
      ) : null}

      <Accordion type="multiple" defaultValue={trendTypes.map(t => t.id)} className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
        {trendTypes.map((type) => (
          <AccordionItem key={type.id} value={type.id} className="border border-subtle rounded-md overflow-hidden bg-surface/30 px-0">
            <AccordionTrigger className="hover:no-underline px-4 py-3 bg-surface/50 text-sm font-semibold tracking-wide">
              <div className="flex items-center gap-2">
                {type.label}
                <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-full">
                  {type.groups.reduce((acc, g) => acc + g.trends.length, 0)}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0 border-t border-subtle/30">
              <div className="p-2">
                {type.groups.map((group) => (
                  <div key={group.id} className="space-y-2 mb-4 last:mb-0">
                    {type.groups.length > 1 && (
                      <p className="text-[10px] uppercase tracking-widest text-secondary font-bold px-2 pt-2 pb-1">
                        {group.title}
                      </p>
                    )}
                    <TrendsDataTable
                      data={group.trends}
                      selectedTrendIds={selectedTrendIds}
                      onToggleTrend={onToggleTrend}
                      activePlatforms={activePlatforms}
                      showMomentumFilter={type.id === "trends"}
                      allowDrag={allowDrag}
                      allowSelect={allowSelect}
                      allowActions={allowActions}
                    />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Wrapper>
  );
}
