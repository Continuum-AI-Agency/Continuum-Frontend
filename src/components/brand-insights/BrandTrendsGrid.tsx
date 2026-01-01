"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Callout,
  Flex,
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
import * as Accordion from "@radix-ui/react-accordion";

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
        <Accordion.Root type="single" collapsible className="space-y-3">
          {filteredTrends.map((trend) => (
            <Accordion.Item
              key={trend.id}
              value={trend.id}
              className={cn(
                "rounded-xl border border-subtle bg-surface shadow-lg",
                trend.isSelected && "border-violet-500/70 ring-1 ring-violet-500/40"
              )}
            >
              <Accordion.Header>
                <Accordion.Trigger className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                  <div className="min-w-0 space-y-1">
                    <Text size="3" weight="medium" className="text-white leading-tight line-clamp-2">
                      {trend.title}
                    </Text>
                  </div>
                  <Flex align="center" gap="2">
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
                    <ChevronDownIcon className="h-4 w-4 text-[var(--accent-11)] transition-transform data-[state=open]:rotate-180" />
                  </Flex>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                <Box className="space-y-3 px-4 pb-4 pt-1">
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

                  {trend.source && (
                    <Text size="1" color="gray">
                      Source: {trend.source}
                    </Text>
                  )}
                </Box>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </Box>
  );
}
