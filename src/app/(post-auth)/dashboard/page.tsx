import Link from "next/link";
import {
  Card,
  Grid,
  Heading,
  Text,
  Flex,
  Badge,
  Button,
  Box,
} from "@radix-ui/themes";
import {
  BarChartIcon,
  Link2Icon,
  MagicWandIcon,
  PlusIcon,
  ArrowUpIcon,
} from "@radix-ui/react-icons";
import { fetchOnboardingMetadata } from "@/lib/onboarding/storage";
import { needsOnboardingReminder } from "@/lib/onboarding/reminders";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const metadata = await fetchOnboardingMetadata();
  const activeBrandId = metadata.activeBrandId ?? null;
  const activeBrandState = activeBrandId ? metadata.brands[activeBrandId] : null;
  const activeBrandName =
    activeBrandState?.brand.name && activeBrandState.brand.name.trim().length > 0
      ? activeBrandState.brand.name
      : "Untitled brand";
  const showOnboardingReminder = Boolean(activeBrandId && needsOnboardingReminder(activeBrandState));

  return (
    <div className="space-y-6">
      {showOnboardingReminder && (
        <Card className="bg-violet-950/60 backdrop-blur-xl border border-violet-500/40">
          <Flex align="center" justify="between" direction={{ initial: "column", sm: "row" }} gap="3" p="4">
            <Flex direction="column" gap="2" className="text-center sm:text-left">
              <Heading size="4" className="text-white">
                Finish onboarding for {activeBrandName}
              </Heading>
              <Text color="gray" size="2">
                Complete onboarding to unlock brand-specific automations and analytics.
              </Text>
            </Flex>
            <Button asChild size="3" variant="solid">
              <Link href={`/onboarding?brand=${activeBrandId}`}>Complete onboarding</Link>
            </Button>
          </Flex>
        </Card>
      )}
      {/* Welcome Section */}
      <div>
        <Heading size="6" className="mb-2 text-white">
          Dashboard Overview
        </Heading>
        <Text color="gray">
          Monitor your campaigns, content performance, and platform connections.
        </Text>
      </div>

      {/* Quick Stats */}
      <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="4">
        <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="2" p="4">
            <Flex align="center" justify="between">
              <Text size="2" color="gray">
                Active Campaigns
              </Text>
              <BarChartIcon className="w-5 h-5 text-violet-600" />
            </Flex>
            <Text size="6" weight="bold">
              12
            </Text>
            <Badge color="green" size="1">
              +2 this week
            </Badge>
          </Flex>
        </Card>

        <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="2" p="4">
            <Flex align="center" justify="between">
              <Text size="2" color="gray">
                Content Pieces
              </Text>
              <MagicWandIcon className="w-5 h-5 text-blue-600" />
            </Flex>
            <Text size="6" weight="bold">
              48
            </Text>
            <Badge color="green" size="1">
              +8 this month
            </Badge>
          </Flex>
        </Card>

        <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="2" p="4">
            <Flex align="center" justify="between">
              <Text size="2" color="gray">
                Connected Platforms
              </Text>
              <Link2Icon className="w-5 h-5 text-green-600" />
            </Flex>
            <Text size="6" weight="bold">
              6
            </Text>
            <Badge color="blue" size="1">
              All active
            </Badge>
          </Flex>
        </Card>

        <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
          <Flex direction="column" gap="2" p="4">
            <Flex align="center" justify="between">
              <Text size="2" color="gray">
                Performance Score
              </Text>
              <ArrowUpIcon className="w-5 h-5 text-orange-600" />
            </Flex>
            <Text size="6" weight="bold">
              94%
            </Text>
            <Badge color="green" size="1">
              +5% from last month
            </Badge>
          </Flex>
        </Card>
      </Grid>

      {/* Quick Actions */}
      <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
        <Flex direction="column" gap="4" p="4">
          <Flex align="center" justify="between">
            <Heading size="4">Quick Actions</Heading>
            <Button size="2" variant="soft">
              <PlusIcon />
              Create Campaign
            </Button>
          </Flex>

          <Grid columns={{ initial: "1", md: "3" }} gap="4">
            <Button size="3" variant="outline" className="h-20 flex-col gap-2">
              <MagicWandIcon className="w-6 h-6" />
              Generate Content
            </Button>

            <Button size="3" variant="outline" className="h-20 flex-col gap-2">
              <BarChartIcon className="w-6 h-6" />
              View Analytics
            </Button>

            <Button size="3" variant="outline" className="h-20 flex-col gap-2">
              <Link2Icon className="w-6 h-6" />
              Connect Platform
            </Button>
          </Grid>
        </Flex>
      </Card>

      {/* Recent Activity */}
      <Card className="bg-slate-950/60 backdrop-blur-xl border border-white/10">
        <Flex direction="column" gap="4" p="4">
          <Heading size="4">Recent Activity</Heading>

          <Box className="space-y-3">
            <Flex align="center" gap="3" className="py-2 border-b border-gray-100 dark:border-gray-700">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <div className="flex-1">
                <Text size="2" weight="medium">
                  Campaign &ldquo;Summer Sale 2024&rdquo; launched successfully
                </Text>
                <Text size="1" color="gray">
                  2 hours ago
                </Text>
              </div>
            </Flex>

            <Flex align="center" gap="3" className="py-2 border-b border-gray-100 dark:border-gray-700">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
              <div className="flex-1">
                <Text size="2" weight="medium">
                  New content generated for Instagram
                </Text>
                <Text size="1" color="gray">
                  4 hours ago
                </Text>
              </div>
            </Flex>

            <Flex align="center" gap="3" className="py-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full" />
              <div className="flex-1">
                <Text size="2" weight="medium">
                  LinkedIn platform reconnected
                </Text>
                <Text size="1" color="gray">
                  1 day ago
                </Text>
              </div>
            </Flex>
          </Box>
        </Flex>
      </Card>
    </div>
  );
}
