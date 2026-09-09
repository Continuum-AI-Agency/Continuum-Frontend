'use client';

import type { OnboardingInspirationSelection } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useOnboardingStarter } from '@/lib/onboarding/starterKit';
import { StarterKitResults } from '../StarterKitResults';

type Props = {
  brandId: string;
  onFinish: () => void;
  finishing: boolean;
  onBack: () => void;
  emailReportOptIn: boolean;
  onEmailReportOptInChange: (value: boolean) => void;
  selectedInspiration: OnboardingInspirationSelection | null;
};

export function InspirationGenerationScreen({
  brandId,
  onFinish,
  finishing,
  onBack,
  emailReportOptIn,
  onEmailReportOptInChange,
  selectedInspiration,
}: Props) {
  const { run, start, retry, error } = useOnboardingStarter(brandId);
  const [startError, setStartError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const competitorName = selectedInspiration?.competitorName;
  const imageUrl = selectedInspiration?.imageUrl;
  useEffect(() => {
    let mounted = true;
    setStartError(null);
    void start(competitorName && imageUrl ? { competitorName, imageUrl } : null).catch(
      (error: unknown) => {
        if (mounted)
          setStartError(error instanceof Error ? error.message : 'Could not start your kit.');
      },
    );
    // Only detach the view. The worker keeps saving results after navigation.
    return () => {
      mounted = false;
    };
  }, [start, competitorName, imageUrl, attempt]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-32 md:px-8">
      <header className="py-6 text-center">
        <h1 className="text-2xl font-semibold">Your brand, ready to create</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Four reusable Elements and your first three creatives, made from your brand. This starter
          kit is on us.
        </p>
      </header>
      {run ? (
        <StarterKitResults run={run} onRetry={retry} />
      ) : (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Preparing your product, character, style and setting…
        </p>
      )}
      {startError || error ? (
        <div role="alert" className="mt-4 text-sm">
          <p>{startError ?? 'We could not refresh your progress. Your saved results are safe.'}</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        </div>
      ) : null}
      <footer className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 md:px-8">
        <Button variant="outline" size="sm" onClick={onBack} disabled={finishing}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            id="onboarding-email-report"
            checked={emailReportOptIn}
            onCheckedChange={onEmailReportOptInChange}
            disabled={finishing}
          />
          <label htmlFor="onboarding-email-report" className="text-xs">
            Email me my brand readiness report
          </label>
        </div>
        <Button variant="success" size="sm" onClick={onFinish} disabled={finishing}>
          {finishing ? 'Finishing…' : 'Go to dashboard'}
        </Button>
      </footer>
    </div>
  );
}
