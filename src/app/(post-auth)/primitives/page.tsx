import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import { PrimitivesHub } from "@/components/paid-media/PrimitivesHub";
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { fetchBrandInsights } from "@/lib/api/brandInsights.server";
import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function PrimitivesPage() {
  const { brandId } = await ensureOnboardingState();
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
    </Box>
  );
}
