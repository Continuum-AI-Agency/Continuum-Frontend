"use client";

import React, { useMemo, useState } from "react";
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
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
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
}: BrandQuestionsListProps) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<SupportedPlatformKey | "all">("all");
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

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

  // Flatten questions for table display
  const allQuestions = useMemo(() => {
    return audienceEntries.flatMap((entry) =>
      entry.questions.map((question) => ({
        ...question,
        audience: entry.audience,
      }))
    );
  }, [audienceEntries]);

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

      {allQuestions.length === 0 ? (
        <Callout.Root color="gray" variant="surface">
          <Callout.Icon>
            <LightningBoltIcon />
          </Callout.Icon>
          <Callout.Text>
            No questions match the current filters. Adjust your search or regenerate insights.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <Box className="flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allQuestions.map((question) => {
                const isExpanded = expandedRows.has(question.id);
                const platformLabel =
                  getSupportedPlatformLabel(question.socialPlatform) ??
                  question.socialPlatform?.trim();
                return (
                  <React.Fragment key={question.id}>
                    <TableRow
                      className="group cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleRow(question.id)}
                    >
                      <TableCell>
                        <Button variant="ghost" size="sm" className="p-0 h-6 w-6">
                          <ChevronDownIcon
                            className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Text weight="medium" className="text-white line-clamp-2">
                          {question.question}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text size="2" color="gray">
                          {question.audience}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {platformLabel && (
                          <ShadcnBadge variant="outline">
                            {platformLabel}
                          </ShadcnBadge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Flex gap="1" wrap="wrap">
                          {question.isSelected && (
                            <ShadcnBadge variant="default">
                              <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                              Selected
                            </ShadcnBadge>
                          )}
                          {typeof question.timesUsed === "number" && question.timesUsed > 0 && (
                            <ShadcnBadge variant="secondary">
                              <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                              Used {question.timesUsed}x
                            </ShadcnBadge>
                          )}
                        </Flex>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-[var(--gray-2)] hover:bg-[var(--gray-2)]">
                        <TableCell colSpan={5} className="p-0 border-b">
                          <Box className="space-y-3 p-4">
                            {question.whyRelevant && (
                              <Text color="gray" size="2">
                                {question.whyRelevant}
                              </Text>
                            )}

                            {question.contentTypeSuggestion && (
                              <Box className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-3">
                                <Text size="1" color="teal">
                                  Content idea
                                </Text>
                                <Text size="2" color="gray">
                                  {question.contentTypeSuggestion}
                                </Text>
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
