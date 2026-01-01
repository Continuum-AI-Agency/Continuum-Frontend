"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Callout,
  Flex,
  Select,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  ChevronDownIcon,
  CounterClockwiseClockIcon,
  LightningBoltIcon,
  MagnifyingGlassIcon,
  PinTopIcon,
} from "@radix-ui/react-icons";
import * as AccordionPrimitive from "@radix-ui/react-accordion";

import { Accordion } from "@/components/ui/Accordion";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";
import {
  filterAndSortQuestionsByNiche,
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
                  "space-y-3",
                  scrollWithinSection &&
                    (isCompact ? "max-h-[45vh] overflow-y-auto pr-1" : "max-h-[60vh] overflow-y-auto pr-1")
                )}
              >
                <AccordionPrimitive.Root type="single" collapsible className="space-y-3">
                  {entry.questions.map((question) => {
                    const platformLabel =
                      getSupportedPlatformLabel(question.socialPlatform) ??
                      question.socialPlatform?.trim();
                    return (
                      <AccordionPrimitive.Item
                        key={question.id}
                        value={String(question.id)}
                        className={cn(
                          "rounded-xl border border-subtle bg-surface shadow-lg",
                          question.isSelected && "border-teal-500/70 ring-1 ring-teal-500/40"
                        )}
                      >
                        <AccordionPrimitive.Header>
                          <AccordionPrimitive.Trigger className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                            <div className="min-w-0 space-y-1">
                              <Text
                                size={isCompact ? "2" : "3"}
                                weight="medium"
                                className="text-white leading-tight line-clamp-2"
                              >
                                {question.question}
                              </Text>
                              {platformLabel && (
                                <Badge color="gray" variant="surface">
                                  {platformLabel}
                                </Badge>
                              )}
                            </div>
                            <Flex gap="2" align="center">
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
                              <ChevronDownIcon className="h-4 w-4 text-[var(--accent-11)] transition-transform data-[state=open]:rotate-180" />
                            </Flex>
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>
                        <AccordionPrimitive.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                          <Box className="space-y-3 px-4 pb-4 pt-1">
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
                          </Box>
                        </AccordionPrimitive.Content>
                      </AccordionPrimitive.Item>
                    );
                  })}
                </AccordionPrimitive.Root>
              </Box>
            ),
          }))}
        />
      )}
    </Box>
  );
}
