'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOnboardingStarter } from '@/lib/onboarding/starterKit';
import { StarterKitResults } from './StarterKitResults';

export function StarterKitPageClient({ brandId }: { brandId: string }) {
  const { run, retry, start, isLoading, error } = useOnboardingStarter(brandId);
  const [startError, setStartError] = useState(false);
  return (
    <div className="h-full overflow-y-auto p-[var(--page-pad-inline)]">
      <h1 className="mb-4 text-base font-semibold">Your brand starter kit</h1>
      {run?.status === 'prepared' ? (
        <Button
          className="mb-4"
          onClick={() => {
            setStartError(false);
            void start(null).catch(() => setStartError(true));
          }}
        >
          Create my first creatives — on us
        </Button>
      ) : null}
      {startError ? <p role="alert">Could not start your creatives. Please try again.</p> : null}
      {run ? (
        <StarterKitResults run={run} onRetry={retry} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {isLoading
            ? 'Loading your starter kit…'
            : error
              ? 'We could not load your starter kit. Please refresh to try again.'
              : 'Your saved Elements are available in the studio library.'}
        </p>
      )}
    </div>
  );
}
