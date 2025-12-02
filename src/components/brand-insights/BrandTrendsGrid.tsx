"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Callout,
  Flex,
  Grid,
  Heading,
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
import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";
import { filterAndSortTrends } from "./trends-utils";

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
};

export function BrandTrendsGrid({ trends }: BrandTrendsGridProps) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);

  const filteredTrends = useMemo(() => {
    return filterAndSortTrends(trends, {
      query,
      onlySelected,
    });
  }, [trends, query, onlySelected]);

  if (trends.length === 0) {
    return (
      <Callout.Root color="gray" variant="surface">
        <Callout.Icon>
          <LightningBoltIcon />
        </Callout.Icon>
        <Callout.Text>
          We have not generated any trends for this brand yet. Trigger a generation to populate this view.
        </Callout.Text>
      </Callout.Root>
    );
  }

  return (
    <Box className="space-y-4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <TextField.Root
          value={query}
          placeholder="Search by title, description, or relevance"
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-[260px]"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>

        <Flex align="center" gap="3" wrap="wrap" justify="end">
          <Flex align="center" gap="2">
            <Switch
              checked={onlySelected}
              onCheckedChange={(checked) => setOnlySelected(Boolean(checked))}
            />
            <Text size="2" color="gray">
              Show selected only
            </Text>
          </Flex>
        </Flex>
      </Flex>

      {filteredTrends.length === 0 ? (
        <Callout.Root color="gray" variant="surface">
          <Callout.Icon>
            <LightningBoltIcon />
          </Callout.Icon>
          <Callout.Text>
            No trends match the current filters. Adjust your filters or regenerate insights.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <Grid columns={{ initial: "1", md: "2" }} gap="4">
          {filteredTrends.map((trend) => (
            <GlassCard
              key={trend.id}
              className={cn(
                "p-4 space-y-3 border border-border/60",
                trend.isSelected && "border-violet-500/70 ring-1 ring-violet-500/40"
              )}
            >
              <Flex align="start" justify="between" gap="2">
                <Heading size="4" className="text-white leading-tight">
                  {trend.title}
                </Heading>
                <Flex gap="1" align="center">
                  {trend.isSelected && (
                    <Badge color="violet" variant="solid">
                      <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                      Selected
                    </Badge>
                  )}
                  {typeof trend.timesUsed === "number" && trend.timesUsed > 0 && (
                    <Badge color="green" variant="soft">
                      <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                      Used {trend.timesUsed}x
                    </Badge>
                  )}
                </Flex>
              </Flex>

              {trend.description && (
                <Text color="gray" size="2">
                  {trend.description}
                </Text>
              )}

              {trend.relevanceToBrand && (
                <Box className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                  <Text size="1" color="violet">
                    Why it matters
                  </Text>
                  <Text size="2" color="gray">
                    {trend.relevanceToBrand}
                  </Text>
                </Box>
              )}

              <Flex gap="2" wrap="wrap">
              </Flex>
            </GlassCard>
          ))}
        </Grid>
      )}
    </Box>
  );
}
