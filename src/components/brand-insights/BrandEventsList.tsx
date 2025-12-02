import { Badge, Box, Callout, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import { CalendarIcon, CounterClockwiseClockIcon, LightningBoltIcon, PinTopIcon } from "@radix-ui/react-icons";

import GlassCard from "@/components/ui/GlassCard";
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
    <Grid columns={{ initial: "1", md: "2" }} gap="4">
      {sortedEvents.map((event) => {
        const dateLabel = normalizeDate(event.date);
        return (
          <GlassCard
            key={event.id}
            className={cn(
              "p-4 space-y-3 border border-border/60",
              event.isSelected && "border-blue-500/70 ring-1 ring-blue-500/40"
            )}
          >
            <Flex align="start" justify="between" gap="2">
              <Heading size="4" className="text-white leading-tight">
                {event.title}
              </Heading>
              <Flex gap="1" align="center">
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
              </Flex>
            </Flex>

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

            <Flex gap="2" wrap="wrap">
              {dateLabel && (
                <Badge color="gray" variant="surface">
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {dateLabel}
                </Badge>
              )}
            </Flex>
          </GlassCard>
        );
      })}
    </Grid>
  );
}
