import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GoalWorkspaceClient } from '@/components/goals/GoalWorkspaceClient';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { parseGoalFocus } from '@/lib/goals/focus';

export const metadata: Metadata = {
  title: 'Goal Case File | Continuum AI',
  description: 'Review the evidence, people, decisions, and deliverables behind a shared Goal.',
};

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ goalId: string }>;
  searchParams?: Promise<{ focus?: string | string[] }>;
}) {
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
