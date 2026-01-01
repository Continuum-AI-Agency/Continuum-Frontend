"use client";

import { Badge, Box, Callout, Flex, Text } from "@radix-ui/themes";
import {
  CalendarIcon,
  ChevronDownIcon,
  CounterClockwiseClockIcon,
  LightningBoltIcon,
  PinTopIcon,
} from "@radix-ui/react-icons";
import * as Accordion from "@radix-ui/react-accordion";

import type { BrandInsightsEvent } from "@/lib/schemas/brandInsights";
import { cn } from "@/lib/utils";

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
    <Accordion.Root type="single" collapsible className="space-y-3">
      {sortedEvents.map((event) => {
        const dateLabel = normalizeDate(event.date);
        return (
          <Accordion.Item
            key={event.id}
            value={event.id}
            className={cn(
              "rounded-xl border border-subtle bg-surface shadow-lg",
              event.isSelected && "border-blue-500/70 ring-1 ring-blue-500/40"
            )}
          >
            <Accordion.Header>
              <Accordion.Trigger className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <div className="min-w-0 space-y-1">
                  <Text size="3" weight="medium" className="text-white leading-tight line-clamp-2">
                    {event.title}
                  </Text>
                  {dateLabel && (
                    <Flex align="center" gap="2" wrap="wrap">
                      <Badge color="gray" variant="surface">
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                        {dateLabel}
                      </Badge>
                    </Flex>
                  )}
                </div>
                <Flex gap="2" align="center">
                  {event.isSelected && (
                    <Badge color="blue" variant="solid">
                      <PinTopIcon className="mr-1 h-3.5 w-3.5" />
                      Selected
                    </Badge>
                  )}
                  {typeof event.timesUsed === "number" && event.timesUsed > 0 && (
                    <Badge color="green" variant="soft">
                      <CounterClockwiseClockIcon className="mr-1 h-3.5 w-3.5" />
                      Used {event.timesUsed}x
                    </Badge>
                  )}
                  <ChevronDownIcon className="h-4 w-4 text-[var(--accent-11)] transition-transform data-[state=open]:rotate-180" />
                </Flex>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
              <Box className="space-y-3 px-4 pb-4 pt-1">
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
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );
}
