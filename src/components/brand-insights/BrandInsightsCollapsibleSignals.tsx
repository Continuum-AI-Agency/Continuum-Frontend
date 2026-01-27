"use client"

import * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { TrendsDataTable } from "@/components/organic/TrendsDataTable"
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { OrganicTrend, OrganicTrendType } from "@/components/organic/primitives/types"

type BrandInsightsCollapsibleSignalsProps = {
  trends: BrandInsightsTrend[]
  events?: BrandInsightsEvent[]
  questionsByNiche?: BrandInsightsQuestionsByNiche
  activePlatforms: OrganicPlatformKey[]
  onToggleTrend: (id: string) => void
  selectedTrendIds: string[]
  maxTrendSelections?: number
}

export function BrandInsightsCollapsibleSignals({
  trends,
  events = [],
  questionsByNiche,
  activePlatforms,
  onToggleTrend,
  selectedTrendIds,
  maxTrendSelections,
}: BrandInsightsCollapsibleSignalsProps) {
  
  const mappedTrends = React.useMemo<OrganicTrend[]>(() => 
    trends.map(t => ({
      id: t.id,
      title: t.title,
      summary: t.description ?? t.relevanceToBrand ?? "",
      momentum: "rising", 
      tags: t.source ? [t.source] : [],
      platforms: activePlatforms as any,
    }))
  , [trends, activePlatforms]);

  const mappedQuestions = React.useMemo<OrganicTrend[]>(() => {
    const nicheMap = questionsByNiche?.questionsByNiche || {};
    return Object.entries(nicheMap).flatMap(([niche, data]) => 
      data.questions.map(q => ({
        id: q.id,
        title: q.question,
        summary: q.whyRelevant ?? q.contentTypeSuggestion ?? "",
        momentum: "stable" as const,
        tags: ["question", niche],
        platforms: activePlatforms as any,
      }))
    );
  }, [questionsByNiche, activePlatforms]);

  const mappedEvents = React.useMemo<OrganicTrend[]>(() => 
    events.map(e => ({
      id: e.id,
      title: e.title,
      summary: e.description ?? e.opportunity ?? "",
      momentum: "rising" as const,
      tags: ["event", e.date ?? ""],
      platforms: activePlatforms as any,
    }))
  , [events, activePlatforms]);

  const sections = [
    { id: "trends", label: "Market Trends", data: mappedTrends, showMomentum: true },
    { id: "events", label: "Key Events", data: mappedEvents, showMomentum: false },
    { id: "questions", label: "Audience Questions", data: mappedQuestions, showMomentum: false },
  ].filter(s => s.data.length > 0);

  return (
    <Accordion type="multiple" defaultValue={sections.map(s => s.id)} className="space-y-4">
      {sections.map((section) => (
        <AccordionItem 
          key={section.id} 
          value={section.id} 
          className="border border-subtle rounded-md overflow-hidden bg-surface/30 px-0"
        >
          <AccordionTrigger className="hover:no-underline px-4 py-3 bg-surface/50 text-sm font-semibold tracking-wide">
            <div className="flex items-center gap-2">
              {section.label}
              <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-full">
                {section.data.length}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <div className="max-h-[350px] overflow-y-auto custom-scrollbar p-2">
              <TrendsDataTable
                data={section.data as any}
                selectedTrendIds={selectedTrendIds}
                onToggleTrend={onToggleTrend}
                activePlatforms={activePlatforms}
                showMomentumFilter={section.showMomentum}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
