import { Badge, Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from "@radix-ui/react-icons";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type {
  BrandInsightsEvent,
  BrandInsightsQuestionsByNiche,
  BrandInsightsTrend,
} from "@/lib/schemas/brandInsights";
import { BrandInsightsSignalsTabs } from "./BrandInsightsSignalsTabs";

type BrandInsightsSignalsPanelProps = {
  trends: BrandInsightsTrend[];
  events: BrandInsightsEvent[];
  questionsByNiche: BrandInsightsQuestionsByNiche;
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
  brandId?: string;
  actionSlot?: React.ReactNode;
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

function countQuestions(questionsByNiche: BrandInsightsQuestionsByNiche) {
  return Object.values(questionsByNiche.questionsByNiche ?? {}).reduce((total, niche) => {
    return total + (niche.questions?.length ?? 0);
  }, 0);
}

export function BrandInsightsSignalsPanel({
  trends,
  events,
  questionsByNiche,
  country,
  weekStartDate,
  generatedAt,
  status,
  brandId,
  actionSlot,
}: BrandInsightsSignalsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt ?? questionsByNiche.generatedAt);
  const panelStatus = status ?? questionsByNiche.status;
  const trendsCount = trends.length;
  const eventsCount = events.length;
  const questionsCount =
    questionsByNiche.summary?.totalQuestions ?? countQuestions(questionsByNiche);

  return (
    <GlassPanel className="p-6 space-y-4">
      <Flex justify="between" align="start" wrap="wrap" gap="3">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <ReaderIcon className="h-4 w-4 text-[var(--accent-11)]" />
            <Text size="1" color="gray">
              Brand Insights · Organic signals
            </Text>
          </Flex>
          <Heading size="5" className="text-white">
            Trends, events, and audience questions
          </Heading>
          <Text size="2" color="gray">
            Explore the latest generation window across your brand and niche.
          </Text>
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          {actionSlot}
          <Badge color="violet" variant="surface">
            {trendsCount} trends
          </Badge>
          <Badge color="indigo" variant="surface">
            {eventsCount} events
          </Badge>
          <Badge color="teal" variant="surface">
            {questionsCount} questions
          </Badge>
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
          {panelStatus && (
            <Badge color="amber" variant="surface">
              {panelStatus}
            </Badge>
          )}
        </Flex>
      </Flex>

      <Separator size="4" />

      <BrandInsightsSignalsTabs
        trends={trends}
        events={events}
        questionsByNiche={questionsByNiche}
        brandId={brandId}
      />
    </GlassPanel>
  );
}

