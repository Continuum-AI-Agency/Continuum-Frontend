import { redirect } from 'next/navigation';
import { PrimitivesHub } from '@/components/paid-media/PrimitivesHub';
import { listBrandGuidelines } from '@/lib/api/brandGuidelines.server';
import { fetchBrandInsights } from '@/lib/api/brandInsights.server';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { ensureOnboardingState } from '@/lib/onboarding/storage';
import type { BrandGuidelineSummary } from '@/lib/schemas/brandGuidelines';
import type { BrandInsightsQuestionsByNiche } from '@/lib/schemas/brandInsights';

export default async function PrimitivesPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect('/onboarding');
  }

  // Run all three in parallel — none depend on each other.
  const [onboardingResult, insightsResult, guidelinesResult] = await Promise.allSettled([
    ensureOnboardingState(activeBrandId),
    fetchBrandInsights(activeBrandId, { revalidateSeconds: 300 }),
    listBrandGuidelines(activeBrandId),
  ]);

  if (onboardingResult.status === 'rejected') {
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

  if (insightsResult.status === 'fulfilled') {
    questionsByNiche = insightsResult.value.data.questionsByNiche;
  } else {
    questionsError =
      insightsResult.reason instanceof Error
        ? insightsResult.reason.message
        : 'Unable to load Brand Insights questions.';
  }

  if (guidelinesResult.status === 'fulfilled') {
    guidelineSummaries = guidelinesResult.value;
  }

  return (
    <div className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <div className="flex flex-col gap-1 w-full">
        <h1 className="text-2xl font-semibold text-white">Primitives</h1>
        <p className="text-muted-foreground">
          Building blocks reused across the app (creative, onboarding, paid). Audience Builder,
          Brand Guidelines, and Product Catalog Manager are in progress; Personas are coming soon.
        </p>
      </div>

      <PrimitivesHub
        brandId={brandId}
        initialGuidelines={guidelineSummaries}
        questionsByNiche={questionsByNiche}
        questionsError={questionsError}
      />
    </div>
  );
}
