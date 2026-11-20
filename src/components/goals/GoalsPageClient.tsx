'use client';
import { useTranslations } from 'next-intl';
import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { useGoals } from '@/hooks/useGoals';
import { useUiErrorMessage } from '@/i18n/errors';
import { GoalsIndex } from './GoalsIndex';
import { GoalsIndexSkeleton } from './GoalsIndexSkeleton';

type GoalsPageClientProps = {
  brandId: string;
  brandName: string;
};

export function GoalsPageClient({ brandId, brandName }: GoalsPageClientProps) {
  const uiText = useTranslations('dashboard');
  const getUiErrorMessage = useUiErrorMessage();
  const query = useGoals(brandId);

  if (query.isLoading) return <GoalsIndexSkeleton />;

  if (query.isError) {
    return (
      <div className="flex h-[var(--app-content-h)] items-center justify-center">
        <ErrorRetryState
          title={uiText('goals_could_not_be_loaded_161196a')}
          message={getUiErrorMessage(query.error)}
          retryLabel={uiText('m_8d5732624b')}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return <GoalsIndex brandId={brandId} brandName={brandName} goals={query.data ?? []} />;
}
