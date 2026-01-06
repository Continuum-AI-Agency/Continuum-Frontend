import { Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { PrimitivesHub } from "@/components/paid-media/PrimitivesHub";
import OnboardingLoading from "@/components/loader-animations/OnboardingLoading";
import { ClientOnly } from "@/components/ui/ClientOnly";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { DASHBOARD_LOADER_TOTAL_DURATION_MS, getDashboardLoaderCycleDurationMs } from "@/lib/ui/dashboardLoaderTiming";
import { DEFAULT_LOADING_PHRASES } from "@/lib/ui/loadingPhrases";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function PrimitivesPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const showLoaderPreview = process.env.NODE_ENV !== "production";
  const loaderCycleDurationMs = getDashboardLoaderCycleDurationMs(
    DEFAULT_LOADING_PHRASES.length,
    DASHBOARD_LOADER_TOTAL_DURATION_MS
  );

  const { brandId } = await ensureOnboardingState(activeBrandId);
  let questionsByNiche: BrandInsightsQuestionsByNiche = {
    questionsByNiche: {},
    status: undefined,
    summary: undefined,
    generatedAt: undefined,
  };
  let questionsError: string | null = null;

  try {
    const insights = await fetchBrandInsights(brandId, { revalidateSeconds: revalidate });
    questionsByNiche = insights.data.questionsByNiche;
  } catch (error) {
    questionsError =
      error instanceof Error ? error.message : "Unable to load Brand Insights questions.";
  }

  return (
    <Box className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <Flex direction="column" gap="1" className="w-full">
        <Heading size="6" className="text-white">
          Primitives
        </Heading>
        <Text color="gray">
          Building blocks reused across the app (creative, onboarding, paid). Audience Builder is in progress; Brand
          Guidelines and Personas are coming soon.
        </Text>
      </Flex>

      <PrimitivesHub questionsByNiche={questionsByNiche} questionsError={questionsError} />

      {showLoaderPreview ? (
        <Card className="overflow-hidden">
          <Flex direction="column" gap="3" p="4">
            <Heading size="4">Loader preview</Heading>
            <Text color="gray" size="2">
              Saturn rings + message cycle. This mirrors the 3-second dashboard loader behavior.
            </Text>
            <Box className="relative h-96 w-full overflow-hidden rounded-lg border border-white/10">
              <ClientOnly
                fallback={
                  <Flex align="center" justify="center" className="h-full">
                    <Text color="gray" size="2">Loading preview...</Text>
                  </Flex>
                }
              >
                <OnboardingLoading
                  phrases={DEFAULT_LOADING_PHRASES}
                  cycleDuration={loaderCycleDurationMs}
                  overlay={false}
                  size="lg"
                />
              </ClientOnly>
            </Box>
          </Flex>
        </Card>
      ) : null}
    </Box>
  );
}
