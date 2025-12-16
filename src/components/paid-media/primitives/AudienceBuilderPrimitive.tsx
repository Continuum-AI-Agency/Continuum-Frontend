"use client";

import { Badge, Box, Button, Callout, Card, Flex, Grid, Heading, Separator, Text } from "@radix-ui/themes";
import {
  BackpackIcon,
  Component1Icon,
  LightningBoltIcon,
  MixerHorizontalIcon,
} from "@radix-ui/react-icons";

import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { BrandQuestionsList } from "@/components/brand-insights/BrandQuestionsList";

type AudienceBuilderPrimitiveProps = {
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  questionsError?: string | null;
};

function SkeletonBar({ width = "100%" }: { width?: string }) {
  return (
    <Box
      className="rounded-md"
      style={{
        width,
        height: "10px",
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.16), rgba(255,255,255,0.08))",
      }}
      aria-hidden
    />
  );
}

const EMPTY_QUESTIONS_BY_NICHE: BrandInsightsQuestionsByNiche = {
  questionsByNiche: {},
  status: undefined,
  summary: undefined,
  generatedAt: undefined,
};

export function AudienceBuilderPrimitive({ questionsByNiche, questionsError }: AudienceBuilderPrimitiveProps) {
  const safeQuestionsByNiche = questionsByNiche ?? EMPTY_QUESTIONS_BY_NICHE;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <Card className="glass-panel h-full">
          <Flex direction="column" gap="3">
            <Flex align="center" gap="2">
              <BackpackIcon />
              <Heading size="4" className="text-white">
                Audience Builder
              </Heading>
            </Flex>
            <Separator size="4" />
            <Grid columns={{ initial: "1", sm: "2" }} gap="4">
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Concept name
                  </Text>
                  <SkeletonBar width="70%" />
                  <SkeletonBar width="55%" />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray">
                    Objectives
                  </Text>
                  <SkeletonBar width="60%" />
                  <SkeletonBar width="40%" />
                </Flex>
              </Card>
            </Grid>
            <Separator size="4" />
            <Grid columns={{ initial: "1", sm: "2" }} gap="4">
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="2">
                    <MixerHorizontalIcon />
                    <Text weight="medium">Psychographic layer</Text>
                  </Flex>
                  <SkeletonBar width="90%" />
                  <SkeletonBar width="75%" />
                  <SkeletonBar width="60%" />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="2">
                    <Component1Icon />
                    <Text weight="medium">Targeting layer</Text>
                  </Flex>
                  <SkeletonBar width="85%" />
                  <SkeletonBar width="50%" />
                  <SkeletonBar width="45%" />
                </Flex>
              </Card>
            </Grid>
            <Separator size="4" />
            <Grid columns={{ initial: "1", sm: "2" }} gap="4">
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Text weight="medium">Behaviors</Text>
                  <SkeletonBar width="80%" />
                  <SkeletonBar width="68%" />
                  <SkeletonBar width="55%" />
                </Flex>
              </Card>
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Text weight="medium">Interests</Text>
                  <SkeletonBar width="82%" />
                  <SkeletonBar width="65%" />
                  <SkeletonBar width="48%" />
                </Flex>
              </Card>
            </Grid>
            <Grid columns={{ initial: "1" }} gap="4">
              <Card variant="surface" className="border border-[var(--glass-border)] p-4">
                <Flex direction="column" gap="2">
                  <Text weight="medium">Demographics</Text>
                  <SkeletonBar width="78%" />
                  <SkeletonBar width="52%" />
                  <SkeletonBar width="40%" />
                </Flex>
              </Card>
            </Grid>
            <Separator size="4" />
            <Card variant="surface" className="border border-[var(--glass-border)] p-4">
              <Flex direction="column" gap="2">
                <Flex align="center" gap="2">
                  <Badge color="amber" radius="full">
                    Preflight
                  </Badge>
                  <Text weight="medium">Compatibility & reach</Text>
                </Flex>
                <SkeletonBar width="80%" />
                <SkeletonBar width="65%" />
              </Flex>
            </Card>
            <Flex gap="2" justify="end">
              <Button disabled variant="solid" color="gray">
                Save preset (disabled)
              </Button>
            </Flex>
          </Flex>
        </Card>
      </div>

      <div className="lg:col-span-4">
        <Card className="glass-panel h-full">
          <Flex direction="column" gap="3">
            <Flex align="center" gap="2">
              <Heading size="4" className="text-white">
                Audience questions
              </Heading>
              <Badge color="teal" variant="surface" radius="full">
                Brand Insights
              </Badge>
            </Flex>
            <Text color="gray" size="2">
              Use these high-signal questions to refine audience segments and targeting.
            </Text>
            <Separator size="4" />
            {questionsError ? (
              <Callout.Root color="red" variant="surface">
                <Callout.Icon>
                  <LightningBoltIcon />
                </Callout.Icon>
                <Callout.Text>{questionsError}</Callout.Text>
              </Callout.Root>
            ) : (
              <Box className="max-h-[70vh] overflow-y-auto pr-2">
                <BrandQuestionsList
                  questionsByNiche={safeQuestionsByNiche.questionsByNiche}
                  density="compact"
                  scrollWithinSection
                />
              </Box>
            )}
          </Flex>
        </Card>
      </div>
    </div>
  );
}
