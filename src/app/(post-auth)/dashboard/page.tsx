import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Tabs,
  Text,
  Separator,
} from "@radix-ui/themes";
import {
  LightningBoltIcon,
  Link2Icon,
  MagicWandIcon,
  RocketIcon,
  StopwatchIcon,
  Share2Icon,
} from "@radix-ui/react-icons";
import React from "react";

import { BrandEventsPanel } from "@/components/brand-insights/BrandEventsPanel";
import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import { BrandTrendsPanel } from "@/components/brand-insights/BrandTrendsPanel";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import { fetchOnboardingMetadata, ensureOnboardingState } from "@/lib/onboarding/storage";
import { needsOnboardingReminder } from "@/lib/onboarding/reminders";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const glassPanelStyle: React.CSSProperties = {
  backgroundColor: "var(--glass-bg)",
  borderColor: "var(--glass-border)",
  boxShadow: "var(--glass-shadow)",
};

const glassPanelClassName = "backdrop-blur-xl border";

export default async function DashboardPage() {
  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId ?? null;
  const activeBrandState = activeBrandId ? metadata.brands[activeBrandId] : null;
  const activeBrandName =
    activeBrandState?.brand.name && activeBrandState.brand.name.trim().length > 0
      ? activeBrandState.brand.name
      : "Untitled brand";
  const showOnboardingReminder = Boolean(activeBrandId && needsOnboardingReminder(activeBrandState));

  const { brandId } = await ensureOnboardingState(activeBrandId ?? undefined);
  let insightsError: string | null = null;
  let insights = null;

  try {
    insights = await fetchBrandInsights(brandId, { revalidateSeconds: revalidate });
  } catch (error) {
    insightsError = error instanceof Error ? error.message : "Unable to load brand insights.";
  }

  const trendsAndEvents = insights?.data.trendsAndEvents ?? { trends: [], events: [], country: null };
  const trendsCount = trendsAndEvents.trends.length;
  const eventsCount = trendsAndEvents.events.length;
  const questionsCount = insights?.data.questionsByNiche.summary?.totalQuestions ?? 0;

  const paidSummary = {
    spend: "$0",
    conversions: "—",
    efficiency: "—",
    note: "Connect paid channels to see performance.",
  };

  const organicSummary = {
    posts: trendsCount,
    mentions: eventsCount,
    questions: questionsCount,
    note: trendsCount + eventsCount + questionsCount === 0 ? "No organic signals yet." : "Organic signals from latest sync.",
  };

  const aiActions: { title: string; meta: string; icon: React.ReactNode }[] = [
    { title: "No automated actions yet", meta: "Enable DCO to see actions here.", icon: <LightningBoltIcon /> },
  ];

  return (
    <Container
      size="4"
      className="space-y-6"
    >
      {showOnboardingReminder && (
        <SurfaceCard>
          <Flex
            align="center"
            justify="between"
            direction={{ initial: "column", sm: "row" }}
            gap="3"
          >
            <Flex direction="column" gap="2" className="text-center sm:text-left">
              <Heading size="4">Finish onboarding for {activeBrandName}</Heading>
              <Text color="gray" size="2">
                Complete onboarding to unlock brand-specific automations and analytics.
              </Text>
            </Flex>
            <Flex gap="3">
              <Button asChild variant="solid" size="3">
                <Link href={`/onboarding?brand=${activeBrandId}`}>Complete onboarding</Link>
              </Button>
              <Button asChild variant="soft" size="3">
                <Link href="/settings">Remind me later</Link>
              </Button>
            </Flex>
          </Flex>
        </SurfaceCard>
      )}

      <HeaderBlock brandName={activeBrandName} />

      <Grid columns={{ initial: "1", sm: "3" }} gap="4">
        <KpiCard label="Trends tracked" value={trendsCount.toString()} icon={<MagicWandIcon />} badge="Latest window" />
        <KpiCard label="Events watched" value={eventsCount.toString()} icon={<RocketIcon />} badge="Opportunities" />
        <KpiCard label="Audience questions" value={questionsCount.toString()} icon={<Link2Icon />} badge="Prompts" />
      </Grid>

      <SurfaceCard>
        <Flex direction="column" gap="3">
          <Tabs.Root defaultValue="paid">
            <Tabs.List>
              <Tabs.Trigger value="paid">Paid</Tabs.Trigger>
              <Tabs.Trigger value="organic">Organic</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="paid">
              <ReportingGrid
                title="Paid reporting"
                summary={[
                  { label: "Spend", value: paidSummary.spend },
                  { label: "Conversions", value: paidSummary.conversions },
                  { label: "Efficiency", value: paidSummary.efficiency },
                ]}
                note={paidSummary.note}
              />
            </Tabs.Content>
            <Tabs.Content value="organic">
              <ReportingGrid
                title="Organic signals"
                summary={[
                  { label: "Posts observed", value: organicSummary.posts.toString() },
                  { label: "Mentions", value: organicSummary.mentions.toString() },
                  { label: "Questions", value: organicSummary.questions.toString() },
                ]}
                note={organicSummary.note}
              />
            </Tabs.Content>
          </Tabs.Root>
        </Flex>
      </SurfaceCard>

      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        <SurfaceCard>
          <Flex align="center" justify="between">
            <Heading size="4">AI DCO actions</Heading>
            <Button variant="outline" size="2" asChild>
              <Link href="/paid-media">View automations</Link>
            </Button>
          </Flex>
          <Separator my="3" />
          <Flex direction="column" gap="3">
            {aiActions.map(action => (
              <Flex key={action.title} align="center" gap="3" className="rounded-lg px-2 py-2">
                <Badge color="gray" variant="soft" radius="full">
                  {action.icon}
                </Badge>
                <Flex direction="column" gap="1">
                  <Text weight="medium">{action.title}</Text>
                  <Text color="gray" size="2">{action.meta}</Text>
                </Flex>
              </Flex>
            ))}
          </Flex>
        </SurfaceCard>

        <SurfaceCard>
          <Flex align="center" justify="between">
            <Heading size="4">Quick actions</Heading>
            <Text color="gray" size="2">Move faster with shortcuts</Text>
          </Flex>
          <Separator my="3" />
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            <ActionTile
              title="Create campaign"
              description="Launch a new AI-driven flight."
              icon={<RocketIcon />}
              href="/paid-media"
            />
            <ActionTile
              title="Connect integrations"
              description="Share ad accounts and pages."
              icon={<Share2Icon />}
              href="/settings/integrations"
            />
            <ActionTile
              title="Run brand analysis"
              description="Generate fresh insights."
              icon={<LightningBoltIcon />}
              href="/ai-studio"
            />
            <ActionTile
              title="Review content"
              description="Check AI outputs before publish."
              icon={<StopwatchIcon />}
              href="/brand-profiles"
            />
          </Grid>
        </SurfaceCard>
      </Grid>

      <SurfaceCard>
        <Flex align="center" justify="between" mb="3">
          <Heading size="4">Brand insights</Heading>
          <BrandInsightsGenerateButton brandId={brandId} />
        </Flex>
        <Separator my="3" />
        {insightsError ? (
          <Callout.Root color="red" variant="surface">
            <Callout.Icon>
              <LightningBoltIcon />
            </Callout.Icon>
            <Callout.Text>{insightsError}</Callout.Text>
          </Callout.Root>
        ) : (
          <Flex direction="column" gap="4">
            <BrandTrendsPanel
              trends={trendsAndEvents.trends}
              country={trendsAndEvents.country ?? insights?.data.country}
              weekStartDate={insights?.data.weekStartDate}
              generatedAt={trendsAndEvents.generatedAt ?? insights?.generatedAt}
              status={trendsAndEvents.status}
              brandId={brandId}
            />
            <BrandEventsPanel
              events={trendsAndEvents.events}
              country={trendsAndEvents.country ?? insights?.data.country}
              weekStartDate={insights?.data.weekStartDate}
              generatedAt={trendsAndEvents.generatedAt ?? insights?.generatedAt}
              status={trendsAndEvents.status}
            />
          </Flex>
        )}
      </SurfaceCard>
    </Container>
  );
}

function SurfaceCard({ children }: { children: React.ReactNode }) {
  return (
    <Card
      variant="surface"
      className={glassPanelClassName}
      style={glassPanelStyle}
    >
      <Box p="4">{children}</Box>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  icon,
  badge,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <SurfaceCard>
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between">
          <Text color="gray" size="2">{label}</Text>
          <Badge color="gray" variant="soft" radius="full">
            {icon}
          </Badge>
        </Flex>
        <Heading size="7">{value}</Heading>
        {badge ? <Badge color="violet" variant="soft">{badge}</Badge> : null}
      </Flex>
    </SurfaceCard>
  );
}

function ReportingGrid({
  title,
  summary,
  note,
}: {
  title: string;
  summary: { label: string; value: string }[];
  note: string;
}) {
  return (
    <Flex direction="column" gap="3" pt="3">
      <Heading size="4">{title}</Heading>
      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        {summary.map(item => (
          <Card
            key={item.label}
            style={{
              backgroundColor: "var(--muted)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          >
            <Flex direction="column" gap="1" p="3">
              <Text color="gray" size="2">{item.label}</Text>
              <Heading size="5">{item.value}</Heading>
            </Flex>
          </Card>
        ))}
      </Grid>
      <Text color="gray" size="2">{note}</Text>
    </Flex>
  );
}

function ActionTile({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Card
      className="transition-colors"
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
      }}
    >
      <Link href={href} className="block h-full">
        <Flex direction="column" gap="2" p="3">
          <Flex align="center" gap="2">
            <Badge color="gray" variant="soft" radius="full">{icon}</Badge>
            <Text weight="medium">{title}</Text>
          </Flex>
          <Text color="gray" size="2">{description}</Text>
        </Flex>
      </Link>
    </Card>
  );
}

function HeaderBlock({ brandName }: { brandName: string }) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="7">Dashboard</Heading>
      <Flex align="center" gap="3">
        <Badge color="gray" variant="soft">Brand: {brandName}</Badge>
        <Text color="gray" size="2">Minimalist performance and automations.</Text>
      </Flex>
    </Flex>
  );
}
