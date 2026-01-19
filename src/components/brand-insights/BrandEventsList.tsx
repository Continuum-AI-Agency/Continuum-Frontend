"use client";

import React from "react";
import { Badge, Box, Callout, Flex, Text } from "@radix-ui/themes";
import {
  CalendarIcon,
  ChevronDownIcon,
  CounterClockwiseClockIcon,
  LightningBoltIcon,
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

import type { BrandInsightsEvent } from "@/lib/schemas/brandInsights";

type BrandEventsListProps = {
  events: BrandInsightsEvent[];
};

function normalizeDate(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BrandEventsList({ events }: BrandEventsListProps) {
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

  if (events.length === 0) {
    return (
      <Callout.Root color="gray" variant="surface">
        <Callout.Icon>
          <LightningBoltIcon />
        </Callout.Icon>
        <Callout.Text>
          We do not have any dated events for this generation yet. Regenerate insights or adjust your window.
        </Callout.Text>
      </Callout.Root>
    );
  }

  const sortedEvents = [...events].sort((a, b) => {
    const aDate = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
    const bDate = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if ((b.timesUsed ?? 0) !== (a.timesUsed ?? 0)) return (b.timesUsed ?? 0) - (a.timesUsed ?? 0);
    return a.title.localeCompare(b.title);
  });

  return (
    <Box className="flex-1 min-h-0 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEvents.map((event) => {
            const isExpanded = expandedRows.has(event.id);
            const dateLabel = normalizeDate(event.date);
            return (
              <React.Fragment key={event.id}>
                <TableRow
                  className="group cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleRow(event.id)}
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
                      {event.title}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="2" color="gray">
                      {dateLabel || "—"}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Flex gap="1" wrap="wrap">
                      {event.isSelected && (
                        <ShadcnBadge variant="default">
                          <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                          Selected
                        </ShadcnBadge>
                      )}
                      {typeof event.timesUsed === "number" && event.timesUsed > 0 && (
                        <ShadcnBadge variant="secondary">
                          <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                          Used {event.timesUsed}x
                        </ShadcnBadge>
                      )}
                    </Flex>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="bg-[var(--gray-2)] hover:bg-[var(--gray-2)]">
                    <TableCell colSpan={4} className="p-0 border-b">
                      <Box className="space-y-3 p-4">
                        {event.description && (
                          <Text color="gray" size="2">
                            {event.description}
                          </Text>
                        )}

                        {event.opportunity && (
                          <Box className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
                            <Text size="1" color="blue">
                              Opportunity
                            </Text>
                            <Text size="2" color="gray">
                              {event.opportunity}
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
  );
}
