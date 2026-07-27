'use client';

import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { useGoals } from '@/hooks/useGoals';
import { GoalsIndex } from './GoalsIndex';
import { GoalsIndexSkeleton } from './GoalsIndexSkeleton';

type GoalsPageClientProps = {
  brandId: string;
  brandName: string;
};

export function GoalsPageClient({ brandId, brandName }: GoalsPageClientProps) {
  const query = useGoals(brandId);

  if (query.isLoading) return <GoalsIndexSkeleton />;

  if (query.isError) {
    return (
      <div className="flex h-[var(--app-content-h)] items-center justify-center">
        <ErrorRetryState
          title="Goals could not be loaded"
          message={
            query.error instanceof Error
              ? query.error.message
              : 'The Goal service did not return a readable response.'
          }
          retryLabel="Reload goals"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return <GoalsIndex brandId={brandId} brandName={brandName} goals={query.data ?? []} />;
}
