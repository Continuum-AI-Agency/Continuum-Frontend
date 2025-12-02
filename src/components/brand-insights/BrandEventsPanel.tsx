import { Badge, Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from "@radix-ui/react-icons";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type { BrandInsightsEvent } from "@/lib/schemas/brandInsights";
import { BrandEventsList } from "./BrandEventsList";

type BrandEventsPanelProps = {
  events: BrandInsightsEvent[];
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
};

function formatDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BrandEventsPanel({ events, country, weekStartDate, generatedAt, status }: BrandEventsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt);

  return (
    <GlassPanel className="p-6 space-y-4">
      <Flex justify="between" align="start" wrap="wrap" gap="3">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <ReaderIcon className="h-4 w-4 text-[var(--accent-11)]" />
            <Text size="1" color="gray">
              Brand Insights · Events
            </Text>
          </Flex>
          <Heading size="5" className="text-white">
            Time-bound opportunities
          </Heading>
          <Text size="2" color="gray">
            Key dates and campaigns aligned to the latest generation window.
          </Text>
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          {country && (
            <Badge color="gray" variant="surface">
              <GlobeIcon className="mr-1 h-3.5 w-3.5" />
              {country}
            </Badge>
          )}
          {weekLabel && (
            <Badge color="indigo" variant="surface">
              <CalendarIcon className="mr-1 h-3.5 w-3.5" />
              Week of {weekLabel}
            </Badge>
          )}
          {generatedLabel && (
            <Badge color="green" variant="surface">
              <ClockIcon className="mr-1 h-3.5 w-3.5" />
              Updated {generatedLabel}
            </Badge>
          )}
          {status && (
            <Badge color="amber" variant="surface">
              {status}
            </Badge>
          )}
        </Flex>
      </Flex>

      <Separator size="4" />

      <BrandEventsList events={events} />
    </GlassPanel>
  );
}

