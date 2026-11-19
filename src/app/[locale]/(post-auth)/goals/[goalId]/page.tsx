import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { GoalWorkspaceClient } from '@/components/goals/GoalWorkspaceClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { parseGoalFocus } from '@/lib/goals/focus';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return {
    title: t('goal_case_file_continuum_ai_378e595'),
    description: t('review_the_evidence_people_decisions_and_deli_3b2549e'),
  };
}

type GoalDetailPageProps = {
  params: Promise<{ goalId: string }>;
  searchParams?: Promise<{ focus?: string | string[] }>;
};

async function GoalDetail({ params, searchParams }: GoalDetailPageProps) {
  const [{ goalId }, query, { activeBrandId, user }] = await Promise.all([
    params,
    searchParams,
    getActiveBrandContext(),
  ]);
  if (!activeBrandId || !user) redirect('/onboarding');

  const focusValue = Array.isArray(query?.focus) ? query.focus[0] : query?.focus;
  return (
    <GoalWorkspaceClient
      goalId={goalId}
      brandId={activeBrandId}
      userId={user.id}
      focus={parseGoalFocus(focusValue)}
    />
  );
}

// The page awaits nothing: params, searchParams, and the brand context are all
// resolved inside the boundary, so everything above it prerenders as the shell.
export default function GoalDetailPage(props: GoalDetailPageProps) {
  return (
    <Suspense fallback={null}>
      <GoalDetail {...props} />
    </Suspense>
  );
}
