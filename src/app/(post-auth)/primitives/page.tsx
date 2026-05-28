import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import { PrimitivesHub } from "@/components/paid-media/PrimitivesHub";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import { listBrandGuidelines } from "@/lib/api/brandGuidelines.server";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import type { BrandGuidelineSummary } from "@/lib/schemas/brandGuidelines";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { redirect } from "next/navigation";

export default async function PrimitivesPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Run all three in parallel — none depend on each other.
  const [onboardingResult, insightsResult, guidelinesResult] = await Promise.allSettled([
    ensureOnboardingState(activeBrandId),
    fetchBrandInsights(activeBrandId, { revalidateSeconds: 300 }),
    listBrandGuidelines(activeBrandId),
  ]);

  if (onboardingResult.status === "rejected") {
    throw onboardingResult.reason;
  }
  const { brandId } = onboardingResult.value;

  let questionsByNiche: BrandInsightsQuestionsByNiche = {
    questionsByNiche: {},
    status: undefined,
    summary: undefined,
    generatedAt: undefined,
  };
  let guidelineSummaries: BrandGuidelineSummary[] = [];
  let questionsError: string | null = null;

  if (insightsResult.status === "fulfilled") {
    questionsByNiche = insightsResult.value.data.questionsByNiche;
  } else {
    questionsError =
      insightsResult.reason instanceof Error
        ? insightsResult.reason.message
        : "Unable to load Brand Insights questions.";
  }

  if (guidelinesResult.status === "fulfilled") {
    guidelineSummaries = guidelinesResult.value;
  }

  return (
    <Box className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <Flex direction="column" gap="1" className="w-full">
        <Heading size="6" className="text-white">
          Primitives
        </Heading>
        <Text color="gray">
          Building blocks reused across the app (creative, onboarding, paid). Audience Builder, Brand Guidelines, and
          Product Catalog Manager are in progress; Personas are coming soon.
        </Text>
      </Flex>

      <PrimitivesHub
        brandId={brandId}
        initialGuidelines={guidelineSummaries}
        questionsByNiche={questionsByNiche}
        questionsError={questionsError}
      />

    </Box>
  );
}
