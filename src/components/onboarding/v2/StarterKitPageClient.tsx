'use client';
import { useTranslations } from 'next-intl';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOnboardingStarter } from '@/lib/onboarding/starterKit';
import { StarterKitResults } from './StarterKitResults';

export function StarterKitPageClient({ brandId }: { brandId: string }) {
  const tUi = useTranslations('onboarding');

  const { run, retry, start, isLoading, error } = useOnboardingStarter(brandId);
  const [startError, setStartError] = useState(false);
  return (
    <div className="h-full overflow-y-auto p-[var(--page-pad-inline)]">
      <h1 className="mb-4 text-base font-semibold">{tUi('m_2cf331edc1')}</h1>
      {run?.status === 'prepared' ? (
        <Button
          className="mb-4"
          onClick={() => {
            setStartError(false);
            void start(null).catch(() => setStartError(true));
          }}
        >
          {tUi('m_116d854ecb')}
        </Button>
      ) : null}
      {startError ? <p role="alert">{tUi('m_8d61ae21c9')}</p> : null}
      {run ? (
        <StarterKitResults run={run} onRetry={retry} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {isLoading ? tUi('m_9de4e5f16a') : error ? tUi('m_281089c576') : tUi('m_082f173396')}
        </p>
      )}
    </div>
  );
}
