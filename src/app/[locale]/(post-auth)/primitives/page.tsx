import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PrimitivesHub } from '@/components/paid-media/PrimitivesHub';
import { uiErrorMessage } from '@/i18n/errorMessages';
import { listBrandGuidelines } from '@/lib/api/brandGuidelines.server.ts';
import { fetchBrandInsights } from '@/lib/api/brandInsights.server.ts';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { ensureOnboardingState } from '@/lib/onboarding/storage';
import type { BrandGuidelineSummary } from '@/lib/schemas/brandGuidelines';
import type { BrandInsightsQuestionsByNiche } from '@/lib/schemas/brandInsights';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function PrimitivesPage() {
  const uiText = await getTranslations('common');
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
    questionsError = uiErrorMessage(insightsResult.reason, uiText);
  }

  if (guidelinesResult.status === 'fulfilled') {
    guidelineSummaries = guidelinesResult.value;
  }

  return (
    <div className="space-y-6 w-full max-w-none px-2 sm:px-3 lg:px-4">
      <div className="flex flex-col gap-1 w-full">
        <h1 className="text-2xl font-semibold text-white">{uiText('primitives_7092937')}</h1>
        <p className="text-muted-foreground">
          {uiText('building_blocks_reused_across_the_app_creativ_03ad73a')}
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
