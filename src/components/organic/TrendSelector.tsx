"use client";

import { useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Text,
} from "@radix-ui/themes";

import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { Trend } from "@/lib/organic/trends";

type TrendSelectorProps = {
  trends: Trend[];
  selectedTrendIds: string[];
  onToggleTrend: (trendId: string) => void;
  activePlatforms: OrganicPlatformKey[];
  maxSelections?: number;
};

export function TrendSelector({
  trends,
  selectedTrendIds,
  onToggleTrend,
  activePlatforms,
  maxSelections,
}: TrendSelectorProps) {
  const activeSet = useMemo(() => new Set(selectedTrendIds), [selectedTrendIds]);
  const platformSet = useMemo(() => new Set(activePlatforms), [activePlatforms]);
  const hasLimit = typeof maxSelections === "number" && Number.isFinite(maxSelections);

  return (
    <Card>
      <Box p="4" className="space-y-4">
        <Flex justify="between" align="center" wrap="wrap" gap="2">
          <Heading size="4">Trending Topics</Heading>
          <Text size="1" color="gray">
            {selectedTrendIds.length}
            {hasLimit ? `/${maxSelections}` : ""} selected
          </Text>
        </Flex>

        <Grid columns={{ initial: "1", md: "2" }} gap="3">
          {trends.map((trend) => {
            const isSelected = activeSet.has(trend.id);
            const isRelevant = trend.platforms.some((platform) => platformSet.has(platform));
            const selectionDisabled =
              !isSelected && hasLimit && selectedTrendIds.length >= (maxSelections ?? 0);

            return (
              <Card
                key={trend.id}
                className={`transition ${
                  isSelected ? "border-violet-500 shadow-lg" : "border-gray-200 dark:border-gray-800"
                } ${selectionDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                onClick={() => {
                  if (selectionDisabled) return;
                  onToggleTrend(trend.id);
                }}
              >
                <Box p="3" className="space-y-3">
                  <Flex justify="between" align="center">
                    <Text weight="medium">{trend.title}</Text>
                    <Badge color={trend.momentum === "rising" ? "green" : trend.momentum === "cooling" ? "gray" : "blue"}>
                      {trend.momentum}
                    </Badge>
                  </Flex>
                  <Text size="2" color="gray">
                    {trend.summary}
                  </Text>
                  <Flex wrap="wrap" gap="2">
                    {trend.tags.map((tag) => (
                      <Badge key={tag} color="gray" size="1">
                        #{tag}
                      </Badge>
                    ))}
                  </Flex>
                  <Flex wrap="wrap" gap="2" align="center">
                    {trend.platforms.map((platform) => (
                      <Badge
                        key={platform}
                        color={platformSet.has(platform) ? "violet" : "gray"}
                        size="1"
                      >
                        {platform}
                      </Badge>
                    ))}
                  </Flex>
                  {!isRelevant && activePlatforms.length > 0 && (
                    <Text size="1" color="gray">
                      Not currently assigned to your connected platforms.
                    </Text>
                  )}
                  <Button
                    size="1"
                    variant={isSelected ? "solid" : "soft"}
                    color={isSelected ? "violet" : "gray"}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (selectionDisabled) return;
                      onToggleTrend(trend.id);
                    }}
                  >
                    {isSelected ? "Remove" : "Add to plan"}
                  </Button>
                </Box>
              </Card>
            );
          })}
        </Grid>
      </Box>
    </Card>
  );
}
