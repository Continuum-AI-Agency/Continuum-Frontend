"use client";

import React, { useMemo } from "react";
import { Box, Callout } from "@radix-ui/themes";
import { LightningBoltIcon } from "@radix-ui/react-icons";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { TrendsDataTable } from "../organic/TrendsDataTable";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";

type BrandQuestionsListProps = {
  questionsByNiche: BrandInsightsQuestionsByNiche["questionsByNiche"];
  density?: "default" | "compact";
  scrollWithinSection?: boolean;
};

export function BrandQuestionsList({
  questionsByNiche,
}: BrandQuestionsListProps) {
  
  const allQuestions = useMemo(() => {
    return Object.entries(questionsByNiche ?? {}).flatMap(([audience, nicheQuestions]) =>
      (nicheQuestions.questions ?? []).map((question) => ({
        ...question,
        audience,
      }))
    );
  }, [questionsByNiche]);

  const mappedData = useMemo(() => allQuestions.map(q => ({
    id: q.id,
    title: q.question,
    summary: q.whyRelevant ?? q.contentTypeSuggestion ?? `Target: ${q.audience}`,
    momentum: "stable" as const,
    tags: ["question", q.audience],
    platforms: ["instagram", "linkedin"] as OrganicPlatformKey[],
  })), [allQuestions]);

  if (allQuestions.length === 0) {
    return (
      <Callout.Root color="gray" variant="surface">
        <Callout.Icon>
          <LightningBoltIcon />
        </Callout.Icon>
        <Callout.Text>
          We have not generated any audience questions for this brand yet. Trigger a generation to populate this view.
        </Callout.Text>
      </Callout.Root>
    );
  }

  return (
    <Box className="p-4 bg-surface/30 rounded border border-subtle">
      <TrendsDataTable
        data={mappedData}
        selectedTrendIds={[]}
        onToggleTrend={() => {}}
        activePlatforms={["instagram", "linkedin"]}
        showMomentumFilter={false}
      />
    </Box>
  );
}
