import { Badge, Box, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from "@radix-ui/react-icons";

import { GlassPanel } from "@/components/ui/GlassPanel";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { BrandQuestionsList } from "./BrandQuestionsList";

type BrandQuestionsPanelProps = {
  questionsByNiche: BrandInsightsQuestionsByNiche;
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

function countQuestions(questionsByNiche: BrandInsightsQuestionsByNiche) {
  return Object.values(questionsByNiche.questionsByNiche ?? {}).reduce((total, niche) => {
    return total + (niche.questions?.length ?? 0);
  }, 0);
}

export function BrandQuestionsPanel({
  questionsByNiche,
  country,
  weekStartDate,
  generatedAt,
  status,
}: BrandQuestionsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt ?? questionsByNiche.generatedAt);
  const panelStatus = status ?? questionsByNiche.status;
  const totalQuestions = questionsByNiche.summary?.totalQuestions ?? countQuestions(questionsByNiche);

  return (
    <GlassPanel className="p-6 space-y-4">
      <Flex justify="between" align="start" wrap="wrap" gap="3">
        <Box className="space-y-1">
          <Flex align="center" gap="2">
            <ReaderIcon className="h-4 w-4 text-[var(--accent-11)]" />
            <Text size="1" color="gray">
              Brand Insights · Questions
            </Text>
          </Flex>
          <Heading size="5" className="text-white">
            Audience questions
          </Heading>
          <Text size="2" color="gray">
            Common questions and prompts surfaced from your niche and social data.
          </Text>
        </Box>

        <Flex align="center" wrap="wrap" gap="2" justify="end">
          {typeof totalQuestions === "number" && totalQuestions > 0 && (
            <Badge color="teal" variant="surface">
              {totalQuestions} questions
            </Badge>
          )}
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

      <BrandQuestionsList questionsByNiche={questionsByNiche.questionsByNiche} />
    </GlassPanel>
  );
}

