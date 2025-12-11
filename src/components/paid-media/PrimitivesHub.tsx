"use client";

import { type ReactElement, useState } from "react";
import { Badge, Box, Button, Card, Callout, Flex, Grid, Heading, Separator, Text } from "@radix-ui/themes";
import {
  ArrowLeftIcon,
  BackpackIcon,
  Component1Icon,
  FileTextIcon,
  MixerHorizontalIcon,
  PersonIcon,
} from "@radix-ui/react-icons";

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

function SkeletonBar({ width = "100%" }: { width?: string }) {
  return (
    <Box
      className="rounded-md"
      style={{
        width,
        height: "10px",
        background: "linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.16), rgba(255,255,255,0.08))",
      }}
      aria-hidden
    />
  );
}

function AudienceDetail() {
  return (
    <Card className="glass-panel">
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
              <Text size="2" color="gray">Concept name</Text>
              <SkeletonBar width="70%" />
              <SkeletonBar width="55%" />
            </Flex>
          </Card>
          <Card variant="surface" className="border border-[var(--glass-border)] p-4">
            <Flex direction="column" gap="2">
              <Text size="2" color="gray">Objectives</Text>
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
              <Badge color="amber" radius="full">Preflight</Badge>
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
  );
}

function PlaceholderDetail({ title }: { title: string }) {
  return (
    <Card className="glass-panel">
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <FileTextIcon />
          <Heading size="4" className="text-white">
            {title}
          </Heading>
        </Flex>
        <Text color="gray">
          Coming soon. We’ll wire this into the same primitives surface so teams can reuse tone, visuals, and personas
          across channels.
        </Text>
        <Separator size="4" />
        <Text color="gray">Add requirements and sample assets here to keep the build aligned.</Text>
      </Flex>
    </Card>
  );
}

export function PrimitivesHub() {
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
            <AudienceDetail />
          ) : (
            <PlaceholderDetail title={activeCard?.title ?? "Coming soon"} />
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
