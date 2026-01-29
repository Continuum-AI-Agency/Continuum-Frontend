"use client";

import React, { useState } from "react";
import { Box, Text, Flex, Badge, Tabs } from "@radix-ui/themes";
import { motion, AnimatePresence } from "framer-motion";
import { BrandTrendsGrid } from "./BrandTrendsGrid";
import { BrandEventsList } from "./BrandEventsList";
import { BrandQuestionsList } from "./BrandQuestionsList";
import { CompetitorSearchPanel } from "../competitors/CompetitorSearchPanel";
import type { BrandInsightsTrend, BrandInsightsEvent, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";

type Props = {
  trends: BrandInsightsTrend[];
  events?: BrandInsightsEvent[];
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  brandId?: string;
};

export function BrandTrendsTabs({ trends, events = [], questionsByNiche, brandId }: Props) {
  const [activeTab, setActiveTab] = useState<string>("trends");

  const questionsCount = React.useMemo(() => {
    if (!questionsByNiche?.questionsByNiche) return 0;
    return Object.values(questionsByNiche.questionsByNiche).reduce((total, niche) => {
      return total + (niche.questions?.length ?? 0);
    }, 0);
  }, [questionsByNiche]);

  return (
    <Box className="flex flex-col h-full min-h-0">
      <Tabs.Root 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex flex-col h-full min-h-0"
      >
        <Tabs.List size="2" className="shrink-0 mb-4 px-1">
          <Tabs.Trigger value="trends">
            <Flex align="center" gap="2">
              Trends
              <Badge variant="soft" size="1" color="indigo">
                {trends.length}
              </Badge>
            </Flex>
          </Tabs.Trigger>
          <Tabs.Trigger value="events">
            <Flex align="center" gap="2">
              Events
              <Badge variant="soft" size="1" color="green">
                {events.length}
              </Badge>
            </Flex>
          </Tabs.Trigger>
          <Tabs.Trigger value="questions">
            <Flex align="center" gap="2">
              Questions
              <Badge variant="soft" size="1" color="amber">
                {questionsCount}
              </Badge>
            </Flex>
          </Tabs.Trigger>
          <Tabs.Trigger value="competitors">
            <Flex align="center" gap="2">
              Competitors
            </Flex>
          </Tabs.Trigger>
        </Tabs.List>

        <Box className="flex-1 min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full w-full"
            >
              <Box className="h-full min-h-0">
                {activeTab === "trends" && (
                  <Box className="h-full min-h-0">
                    <BrandTrendsGrid trends={trends} />
                  </Box>
                )}
                {activeTab === "events" && (
                  <Box className="h-full min-h-0">
                    <BrandEventsList events={events} />
                  </Box>
                )}
                {activeTab === "questions" && (
                  <Box className="h-full min-h-0">
                    <BrandQuestionsList questionsByNiche={questionsByNiche?.questionsByNiche ?? {}} />
                  </Box>
                )}
                {activeTab === "competitors" && (
                  <Box className="h-full min-h-0 overflow-y-auto custom-scrollbar p-1">
                    <CompetitorSearchPanel brandId={brandId} />
                  </Box>
                )}
              </Box>
            </motion.div>
          </AnimatePresence>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
