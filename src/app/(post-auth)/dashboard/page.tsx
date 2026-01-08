import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
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
  OpenInNewWindowIcon,
  RocketIcon,
  Share2Icon,
  StopwatchIcon,
} from "@radix-ui/react-icons";
import React from "react";
import { redirect } from "next/navigation";
import DashboardLoader from "@/components/dashboard/DashboardLoader";

import { BrandInsightsGenerateButton } from "@/components/brand-insights/BrandInsightsGenerateButton";
import { BrandInsightsSignalsPanel } from "@/components/brand-insights/BrandInsightsSignalsPanel";
import { BrandInsightsAutoGenerate } from "@/components/brand-insights/BrandInsightsAutoGenerate";
import { AgenticActivityLog } from "@/components/dashboard/AgenticActivityLog";
import { InstagramOrganicReportingWidget } from "@/components/dashboard/InstagramOrganicReportingWidget";
import { DashboardErrorHandler } from "@/components/dashboard/DashboardErrorHandler";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import type { BrandInsightsQuestionsByNiche, BrandInsightsTrendsAndEvents } from "@/lib/schemas/brandInsights";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { needsOnboardingReminder } from "@/lib/onboarding/reminders";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { shouldAutoGenerateBrandInsights } from "@/lib/brand-insights/auto-generate";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const glassPanelStyle: React.CSSProperties = {
  backgroundColor: "var(--glass-bg)",
  borderColor: "var(--glass-border)",
  boxShadow: "var(--glass-shadow)",
};

const glassPanelClassName = "backdrop-blur-xl border";

type DashboardPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const errorMessage = params.error;
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const activeBrandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  const [integrationSummary, insightsResult] = await Promise.all([
    fetchBrandIntegrationSummary(activeBrandId),
    fetchBrandInsights(activeBrandId, { revalidateSeconds: revalidate })
      .then((data) => ({ data }))
      .catch((error: unknown) => ({ error })),
  ]);

  const instagramAccounts = integrationSummary.instagram.accounts.map((account) => ({
    integrationAccountId: account.integrationAccountId,
    name: account.name,
    externalAccountId: account.externalAccountId,
  }));
  let insightsError: string | null = null;
  let insights = null;

  if ("error" in insightsResult) {
    insightsError =
      insightsResult.error instanceof Error
        ? insightsResult.error.message
        : "Unable to load brand insights.";
  } else {
    insights = insightsResult.data;
  }

  const shouldAutoGenerateInsights = shouldAutoGenerateBrandInsights({
    insights,
    errorMessage: insightsError,
  });

  const trendsAndEvents: BrandInsightsTrendsAndEvents =
    insights?.data.trendsAndEvents ?? {
      trends: [],
      events: [],
      country: undefined,
      status: undefined,
      generatedAt: undefined,
      weekAnalyzed: undefined,
    };
  const questionsByNiche: BrandInsightsQuestionsByNiche =
    insights?.data.questionsByNiche ?? {
      questionsByNiche: {},
      status: undefined,
      summary: undefined,
      generatedAt: undefined,
    };
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

  const agenticActivity = [
    {
      id: "dco-1",
      actorName: "Continuum DCO",
      summary: "Approved a new creative variant for the holiday launch set.",
      timestamp: "Today, 9:18 AM",
      highlight: "Approved",
    },
    {
      id: "dco-2",
      actorName: "Continuum DCO",
      summary: "Paused low-performing ad group in Meta based on CTR drop.",
      timestamp: "Yesterday, 6:42 PM",
      highlight: "Paused",
    },
    {
      id: "dco-3",
      actorName: "Continuum DCO",
      summary: "Queued 3 new video cuts for creative testing.",
      timestamp: "Dec 29, 4:05 PM",
      highlight: "Queued",
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4 relative">
      <DashboardErrorHandler error={errorMessage} />
      <DashboardLoader />
      <BrandInsightsAutoGenerate
        brandId={activeBrandId}
        shouldGenerate={shouldAutoGenerateInsights}
      />
      <React.Suspense fallback={null}>
        <OnboardingReminder brandId={activeBrandId} brandName={activeBrandName} />
      </React.Suspense>

      <HeaderBlock brandName={activeBrandName} />

      <SurfaceCard>
        <Flex direction="column" gap="3">
          <ClientOnly
            fallback={
              <>
                <ReportingGrid
                  title="Organic signals"
                  summary={[
                    { label: "Posts observed", value: organicSummary.posts.toString() },
                    { label: "Mentions", value: organicSummary.mentions.toString() },
                    { label: "Questions", value: organicSummary.questions.toString() },
                  ]}
                  note={organicSummary.note}
                />
                <Box pt="4">
                  <Text color="gray" size="2">
                    Loading reporting widgets…
                  </Text>
                </Box>
              </>
            }
          >
            <Tabs.Root defaultValue="organic">
              <Tabs.List>
                <Tabs.Trigger value="organic">Organic</Tabs.Trigger>
                <Tabs.Trigger value="paid">Paid</Tabs.Trigger>
              </Tabs.List>
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
                <Box pt="4">
                  <InstagramOrganicReportingWidget brandId={activeBrandId} accounts={instagramAccounts} />
                </Box>
              </Tabs.Content>
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
            </Tabs.Root>
          </ClientOnly>
        </Flex>
      </SurfaceCard>

      <Grid columns={{ initial: "1", lg: "2" }} gap="4">
        <SurfaceCard>
          <AgenticActivityLog items={agenticActivity} />
          <Box pt="4">
            <Button variant="outline" size="2" asChild>
              <Link href="/paid-media" className="flex items-center gap-2">
                View automations
                <OpenInNewWindowIcon />
              </Link>
            </Button>
          </Box>
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
              href={`/brand-profiles/${activeBrandId}/assets`}
            />
          </Grid>
        </SurfaceCard>
      </Grid>

      {insightsError ? (
        <SurfaceCard>
          <Flex align="center" justify="between" mb="3">
            <Heading size="4">Brand insights</Heading>
            <BrandInsightsGenerateButton brandId={activeBrandId} />
          </Flex>
          <Separator my="3" />
          <Callout.Root color="red" variant="surface">
            <Callout.Icon>
              <LightningBoltIcon />
            </Callout.Icon>
            <Callout.Text>{insightsError}</Callout.Text>
          </Callout.Root>
        </SurfaceCard>
      ) : (
        <BrandInsightsSignalsPanel
          trends={trendsAndEvents.trends}
          events={trendsAndEvents.events}
          questionsByNiche={questionsByNiche}
          country={trendsAndEvents.country ?? insights?.data.country}
          weekStartDate={insights?.data.weekStartDate}
          generatedAt={trendsAndEvents.generatedAt ?? insights?.generatedAt}
          status={trendsAndEvents.status}
          brandId={activeBrandId}
          actionSlot={<BrandInsightsGenerateButton brandId={activeBrandId} />}
        />
      )}
    </div>
  );
}

async function OnboardingReminder({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const { state } = await ensureOnboardingState(brandId);
  if (!needsOnboardingReminder(state)) {
    return null;
  }

  return (
    <SurfaceCard>
      <Flex
        align="center"
        justify="between"
        direction={{ initial: "column", sm: "row" }}
        gap="3"
      >
        <Flex direction="column" gap="2" className="text-center sm:text-left">
          <Heading size="4">Finish onboarding for {brandName}</Heading>
          <Text color="gray" size="2">
            Complete onboarding to unlock brand-specific automations and analytics.
          </Text>
        </Flex>
        <Flex gap="3">
          <Button asChild variant="solid" size="3">
            <Link href={`/onboarding?brand=${brandId}`}>Complete onboarding</Link>
          </Button>
          <Button asChild variant="soft" size="3">
            <Link href="/settings">Remind me later</Link>
          </Button>
        </Flex>
      </Flex>
    </SurfaceCard>
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
