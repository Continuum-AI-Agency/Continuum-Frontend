"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Callout,
  Flex,
  Grid,
  Heading,
  Select,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  CounterClockwiseClockIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  PinTopIcon,
} from "@radix-ui/react-icons";

import GlassCard from "@/components/ui/GlassCard";
import { Accordion } from "@/components/ui/Accordion";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";
import {
  filterAndSortQuestionsByNiche,
  getSupportedPlatformKey,
  getSupportedPlatformLabel,
  SUPPORTED_PLATFORMS,
  type SupportedPlatformKey,
} from "./questions-utils";

type BrandQuestionsListProps = {
  questionsByNiche: BrandInsightsQuestionsByNiche["questionsByNiche"];
  density?: "default" | "compact";
  scrollWithinSection?: boolean;
};

export function BrandQuestionsList({
  questionsByNiche,
  density = "default",
  scrollWithinSection = false,
}: BrandQuestionsListProps) {
  const isCompact = density === "compact";
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<SupportedPlatformKey | "all">("all");

  const totalQuestions = useMemo(() => {
    return Object.values(questionsByNiche ?? {}).reduce((total, niche) => {
      return total + (niche.questions?.length ?? 0);
    }, 0);
  }, [questionsByNiche]);

  const audienceEntries = useMemo(() => {
    return filterAndSortQuestionsByNiche(questionsByNiche, {
      query,
      onlySelected,
      platformFilter,
    });
  }, [questionsByNiche, query, onlySelected, platformFilter]);

  if (totalQuestions === 0) {
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
    <Box className="space-y-4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <TextField.Root
          value={query}
          placeholder="Search by question text or platform (YouTube, X/Twitter, LinkedIn)"
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-[260px]"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>

        <Flex align="center" gap="3" wrap="wrap">
          <Select.Root
            value={platformFilter}
            onValueChange={(value) => setPlatformFilter(value as SupportedPlatformKey | "all")}
          >
            <Select.Trigger placeholder="Platform" />
            <Select.Content>
              <Select.Item value="all">All platforms</Select.Item>
              <Select.Item value="youtube">{SUPPORTED_PLATFORMS.youtube.label}</Select.Item>
              <Select.Item value="x">{SUPPORTED_PLATFORMS.x.label}</Select.Item>
              <Select.Item value="linkedin">{SUPPORTED_PLATFORMS.linkedin.label}</Select.Item>
            </Select.Content>
          </Select.Root>

          <Flex align="center" gap="2">
            <Switch checked={onlySelected} onCheckedChange={(checked) => setOnlySelected(Boolean(checked))} />
            <Text size="2" color="gray">
              Show selected only
            </Text>
          </Flex>
        </Flex>
      </Flex>

      {audienceEntries.length === 0 ? (
        <Callout.Root color="gray" variant="surface">
          <Callout.Icon>
            <LightningBoltIcon />
          </Callout.Icon>
          <Callout.Text>
            No questions match the current filters. Adjust your search or regenerate insights.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <Accordion
          type="multiple"
          items={audienceEntries.map((entry) => ({
            value: entry.audience,
            header: (
              <Flex align="center" gap="2">
                <Text as="span" weight="medium">
                  {entry.audience}
                </Text>
                <Badge color="gray" variant="soft" radius="full">
                  {entry.questions.length}
                </Badge>
              </Flex>
            ),
            content: (
              <Box
                className={cn(
                  "space-y-5",
                  scrollWithinSection && (isCompact ? "max-h-[45vh] overflow-y-auto pr-1" : "max-h-[60vh] overflow-y-auto pr-1")
                )}
              >
                {(
                  [
                    "youtube",
                    "x",
                    "linkedin",
                  ] as SupportedPlatformKey[]
                )
                  .map((platformKey) => {
                    const platformQuestions = entry.questions.filter(
                      (question) => getSupportedPlatformKey(question.socialPlatform) === platformKey
                    );
                    if (platformQuestions.length === 0) return null;
                    const platformLabel = SUPPORTED_PLATFORMS[platformKey].label;
                    return (
                      <Box key={platformKey} className="space-y-3">
                        <Flex align="center" gap="2">
                          <Text weight="medium" size={isCompact ? "2" : "3"} className="text-white">
                            {platformLabel}
                          </Text>
                          <Badge color="gray" variant="soft" radius="full">
                            {platformQuestions.length}
                          </Badge>
                        </Flex>
                        <Grid columns={{ initial: "1", md: "2" }} gap="4">
                          {platformQuestions.map((question) => {
                            const supportedPlatformLabel = getSupportedPlatformLabel(question.socialPlatform);
                            return (
                              <GlassCard
                                key={question.id}
                                className={cn(
                                  "p-4 space-y-3 border border-border/60",
                                  question.isSelected && "border-teal-500/70 ring-1 ring-teal-500/40"
                                )}
                              >
                                <Flex align="start" justify="between" gap="2">
                                  <Heading size={isCompact ? "3" : "4"} className="text-white leading-tight">
                                    {question.question}
                                  </Heading>
                                  <Flex gap="1" align="center">
                                    {question.isSelected && (
                                      <Badge color="teal" variant="solid">
                                        <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                                        Selected
                                      </Badge>
                                    )}
                                    {typeof question.timesUsed === "number" && question.timesUsed > 0 && (
                                      <Badge color="green" variant="soft">
                                        <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                                        Used {question.timesUsed}x
                                      </Badge>
                                    )}
                                  </Flex>
                                </Flex>

                                {question.whyRelevant && (
                                  <Text color="gray" size={isCompact ? "1" : "2"}>
                                    {question.whyRelevant}
                                  </Text>
                                )}

                                {question.contentTypeSuggestion && (
                                  <Box className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
                                    <Text size="1" color="teal">
                                      Content idea
                                    </Text>
                                    <Text size={isCompact ? "1" : "2"} color="gray">
                                      {question.contentTypeSuggestion}
                                    </Text>
                                  </Box>
                                )}

                                {supportedPlatformLabel && (
                                  <Badge color="gray" variant="surface">
                                    {supportedPlatformLabel}
                                  </Badge>
                                )}
                              </GlassCard>
                            );
                          })}
                        </Grid>
                      </Box>
                    );
                  })
                  .filter(Boolean)}

                {platformFilter === "all" && (
                  (() => {
                    const otherQuestions = entry.questions.filter(
                      (question) => !getSupportedPlatformKey(question.socialPlatform)
                    );
                    if (otherQuestions.length === 0) return null;
                    return (
                      <Box key="other" className="space-y-3">
                        <Flex align="center" gap="2">
                          <Text weight="medium" size={isCompact ? "2" : "3"} className="text-white">
                            Other / Unspecified
                          </Text>
                          <Badge color="gray" variant="soft" radius="full">
                            {otherQuestions.length}
                          </Badge>
                        </Flex>
                        <Grid columns={{ initial: "1", md: "2" }} gap="4">
                          {otherQuestions.map((question) => (
                            <GlassCard
                              key={question.id}
                              className={cn(
                                "p-4 space-y-3 border border-border/60",
                                question.isSelected && "border-teal-500/70 ring-1 ring-teal-500/40"
                              )}
                            >
                              <Flex align="start" justify="between" gap="2">
                                <Heading size={isCompact ? "3" : "4"} className="text-white leading-tight">
                                  {question.question}
                                </Heading>
                                <Flex gap="1" align="center">
                                  {question.isSelected && (
                                    <Badge color="teal" variant="solid">
                                      <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                                      Selected
                                    </Badge>
                                  )}
                                  {typeof question.timesUsed === "number" && question.timesUsed > 0 && (
                                    <Badge color="green" variant="soft">
                                      <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                                      Used {question.timesUsed}x
                                    </Badge>
                                  )}
                                </Flex>
                              </Flex>

                              {question.whyRelevant && (
                                <Text color="gray" size={isCompact ? "1" : "2"}>
                                  {question.whyRelevant}
                                </Text>
                              )}

                              {question.contentTypeSuggestion && (
                                <Box className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
                                  <Text size="1" color="teal">
                                    Content idea
                                  </Text>
                                  <Text size={isCompact ? "1" : "2"} color="gray">
                                    {question.contentTypeSuggestion}
                                  </Text>
                                </Box>
                              )}
                            </GlassCard>
                          ))}
                        </Grid>
                      </Box>
                    );
                  })()
                )}
              </Box>
            ),
          }))}
        />
      )}
    </Box>
  );
}
