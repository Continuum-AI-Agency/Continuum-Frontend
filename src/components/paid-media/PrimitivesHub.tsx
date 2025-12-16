"use client";

import { type ReactElement, useState } from "react";
import { Badge, Box, Button, Card, Flex, Grid, Heading, Text } from "@radix-ui/themes";
import {
  ArrowLeftIcon,
  FileTextIcon,
  MixerHorizontalIcon,
  PersonIcon,
} from "@radix-ui/react-icons";

import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { AudienceBuilderPrimitive } from "./primitives/AudienceBuilderPrimitive";
import { BrandGuidelinesPrimitive } from "./primitives/BrandGuidelinesPrimitive";
import { BrandPersonasPrimitive } from "./primitives/BrandPersonasPrimitive";

type PrimitiveId = "audience" | "guidelines" | "personas";

type PrimitiveCardConfig = {
  id: PrimitiveId;
  title: string;
  status: "coming-soon" | "under-construction";
  summary: string;
  icon: ReactElement;
  accent: string;
};

const primitiveCards: PrimitiveCardConfig[] = [
  {
    id: "audience",
    title: "Audience Builder",
    status: "under-construction",
    summary: "Reusable, dual-layer audience presets that stay compatible with Meta and Google.",
    icon: <MixerHorizontalIcon />,
    accent: "linear-gradient(135deg, rgba(139,92,246,0.42), rgba(59,130,246,0.34))",
  },
  {
    id: "guidelines",
    title: "Brand Guidelines",
    status: "coming-soon",
    summary: "A compact hub for voice, visuals, dos/don’ts, and approvals your teams can reuse.",
    icon: <FileTextIcon />,
    accent: "linear-gradient(135deg, rgba(34,197,94,0.32), rgba(59,130,246,0.28))",
  },
  {
    id: "personas",
    title: "Brand Personas",
    status: "coming-soon",
    summary: "Living personas that align creative tone, targeting, and narrative arcs.",
    icon: <PersonIcon />,
    accent: "linear-gradient(135deg, rgba(244,114,182,0.32), rgba(59,130,246,0.28))",
  },
];

function GlassCardButton({
  config,
  onSelect,
  disabled,
}: {
  config: PrimitiveCardConfig;
  onSelect: (id: PrimitiveId) => void;
  disabled?: boolean;
}) {
  return (
    <Card className="glass-panel h-full shadow-brand-glow transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl relative overflow-hidden">
      {!disabled && (
        <span className="sr-only">{config.title} card</span>
      )}
      {config.status === "coming-soon" && (
        <div className="pointer-events-none absolute -right-7 -top-1 rotate-6 bg-red-500 text-white text-[11px] font-semibold px-12 py-1.5 shadow-lg">
          Coming soon
        </div>
      )}
      <button
        type="button"
        onClick={() => !disabled && onSelect(config.id)}
        disabled={disabled}
        className="flex h-full w-full flex-col gap-4 rounded-lg p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <Box
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg"
              style={{ backgroundImage: config.accent, color: "var(--foreground)" }}
            >
              {config.icon}
            </Box>
            <Heading size="4" className="text-white">
              {config.title}
            </Heading>
          </Flex>
          <Badge color={config.status === "under-construction" ? "amber" : "gray"} variant="surface" radius="full">
            {config.status === "under-construction" ? "Under construction" : "Coming soon"}
          </Badge>
        </Flex>
        <Text color="gray">{config.summary}</Text>
        <Box
          className="mt-auto h-28 w-full overflow-hidden rounded-lg border border-[var(--glass-border)]"
          style={{
            backgroundImage: `${config.accent}, radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), transparent 40%)`,
            boxShadow: "var(--glass-shadow)",
          }}
          aria-hidden
        />
      </button>
    </Card>
  );
}

type PrimitivesHubProps = {
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  questionsError?: string | null;
};

const EMPTY_QUESTIONS_BY_NICHE: BrandInsightsQuestionsByNiche = {
  questionsByNiche: {},
  status: undefined,
  summary: undefined,
  generatedAt: undefined,
};

export function PrimitivesHub({ questionsByNiche, questionsError }: PrimitivesHubProps) {
  const safeQuestionsByNiche = questionsByNiche ?? EMPTY_QUESTIONS_BY_NICHE;
  const [active, setActive] = useState<PrimitiveId | null>(null);
  const activeCard = primitiveCards.find((card) => card.id === active);

  return (
    <Card className="glass-panel p-6 shadow-brand-glow w-full">
      {active ? (
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Button
              size="1"
              variant="ghost"
              onClick={() => setActive(null)}
              className="bg-transparent text-slate-200 hover:bg-white/5"
            >
              <ArrowLeftIcon /> Back
            </Button>
            <Badge
              color={activeCard?.status === "under-construction" ? "amber" : "gray"}
              variant="surface"
              radius="full"
            >
              {activeCard?.status === "under-construction" ? "Under construction" : "Coming soon"}
            </Badge>
          </Flex>

          <Flex align="center" gap="3">
            <Box
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundImage: activeCard?.accent, color: "var(--foreground)" }}
            >
              {activeCard?.icon}
            </Box>
            <div>
              <Heading size="5" className="text-white">
                {activeCard?.title}
              </Heading>
              <Text color="gray" size="2">
                {activeCard?.summary}
              </Text>
            </div>
          </Flex>

          {active === "audience" ? (
            <AudienceBuilderPrimitive
              questionsByNiche={safeQuestionsByNiche}
              questionsError={questionsError}
            />
          ) : active === "guidelines" ? (
            <BrandGuidelinesPrimitive />
          ) : (
            <BrandPersonasPrimitive />
          )}
        </Flex>
      ) : (
        <Flex direction="column" gap="4">
          <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="5">
            {primitiveCards.map((card) => (
              <GlassCardButton
                key={card.id}
                config={card}
                onSelect={setActive}
                disabled={card.status === "coming-soon"}
              />
            ))}
          </Grid>
        </Flex>
      )}
    </Card>
  );
}
