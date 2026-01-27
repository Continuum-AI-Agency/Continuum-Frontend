"use client";

import { Box } from "@radix-ui/themes";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BrandEventsList } from "./BrandEventsList";
import { BrandQuestionsList } from "./BrandQuestionsList";
import { BrandTrendsGrid } from "./BrandTrendsGrid";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from "@/lib/schemas/brandInsights";

type BrandInsightsSignalsTabsProps = {
  trends: BrandInsightsTrend[];
  events: BrandInsightsEvent[];
  questionsByNiche: BrandInsightsQuestionsByNiche;
  brandId?: string;
};

export function BrandInsightsSignalsTabs({
  trends,
  events,
  questionsByNiche,
  brandId,
}: BrandInsightsSignalsTabsProps) {
  const sections = [
    { id: "trends", label: "Trends", component: <BrandTrendsGrid trends={trends} />, count: trends.length },
    { id: "events", label: "Events", component: <BrandEventsList events={events} />, count: events.length },
    { id: "questions", label: "Questions", component: <BrandQuestionsList questionsByNiche={questionsByNiche.questionsByNiche} />, count: Object.values(questionsByNiche.questionsByNiche).reduce((acc, n) => acc + n.questions.length, 0) },
    { id: "competitors", label: "Competitors", component: <CompetitorSearchPanel key={brandId ?? "competitors"} brandId={brandId} />, count: null },
  ].filter(s => s.count === null || s.count > 0);

  return (
    <Box className="flex flex-col h-full overflow-hidden">
      <Accordion type="multiple" defaultValue={["trends", "questions"]} className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {sections.map((section) => (
          <AccordionItem 
            key={section.id} 
            value={section.id} 
            className="border border-subtle rounded-md overflow-hidden bg-surface/30"
          >
            <AccordionTrigger className="hover:no-underline px-4 py-3 bg-surface/50 text-sm font-semibold">
              <div className="flex items-center gap-2">
                {section.label}
                {section.count !== null && (
                  <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded-full">
                    {section.count}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0 border-t border-subtle/30">
              <div className="p-2">
                {section.component}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Box>
  );
}
