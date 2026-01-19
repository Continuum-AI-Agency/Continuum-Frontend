"use client";

import React, { useMemo, useState } from "react";
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

import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";
import { filterAndSortTrends } from "./trends-utils";
import { BrandTrendsGridSkeleton } from "./BrandTrendsSkeleton";

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
  isLoading?: boolean;
};

export function BrandTrendsGrid({ trends, isLoading = false }: BrandTrendsGridProps) {
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
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

  // Show skeleton when loading
  if (isLoading) {
    return <BrandTrendsGridSkeleton />;
  }

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
        <Box className="flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrends.map((trend) => {
                const isExpanded = expandedRows.has(trend.id);
                return (
                  <React.Fragment key={trend.id}>
                    <TableRow
                      className="group cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleRow(trend.id)}
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
                          {trend.title}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Flex gap="1" wrap="wrap">
                          {trend.isSelected && (
                            <ShadcnBadge variant="default">
                              <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                              Selected
                            </ShadcnBadge>
                          )}
                          {typeof trend.timesUsed === "number" && trend.timesUsed > 0 && (
                            <ShadcnBadge variant="secondary">
                              <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                              Used {trend.timesUsed}x
                            </ShadcnBadge>
                          )}
                        </Flex>
                      </TableCell>
                      <TableCell>
                        <Text size="2" color="gray">
                          {trend.source || "—"}
                        </Text>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-[var(--gray-2)] hover:bg-[var(--gray-2)]">
                        <TableCell colSpan={4} className="p-0 border-b">
                          <Box className="space-y-3 p-4">
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
