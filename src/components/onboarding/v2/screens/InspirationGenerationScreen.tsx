'use client';

import type { OnboardingInspirationSelection } from '@continuum/contracts';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useUiErrorMessage } from '@/i18n/errors';
import { useOnboardingStarter } from '@/lib/onboarding/starterKit';
import { StarterKitResults } from '../StarterKitResults';

type Props = {
  brandId: string;
  onFinish: () => void;
  finishing: boolean;
  /** The finish button's label — "Choose your plan" when a plan step follows. */
  finishLabel?: string;
  onBack: () => void;
  emailReportOptIn: boolean;
  onEmailReportOptInChange: (value: boolean) => void;
  selectedInspiration: OnboardingInspirationSelection | null;
};

export function InspirationGenerationScreen({
  brandId,
  onFinish,
  finishing,
  finishLabel: providedFinishLabel,
  onBack,
  emailReportOptIn,
  onEmailReportOptInChange,
  selectedInspiration,
}: Props) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('onboarding');
  const finishLabel = providedFinishLabel ?? tUi('m_e5fa87580e');

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
          setStartError(error instanceof Error ? uiErrorMessage(error) : tUi('m_3e95fc5c4b'));
      },
    );
    // Only detach the view. The worker keeps saving results after navigation.
    return () => {
      mounted = false;
    };
  }, [start, competitorName, imageUrl, attempt, tUi, uiErrorMessage]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-32 md:px-8">
      <header className="py-6 text-center">
        <h1 className="text-2xl font-semibold">{tUi('m_95bd5ba453')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tUi('m_c140a90ee6')}</p>
      </header>
      {run ? (
        <StarterKitResults run={run} onRetry={retry} />
      ) : (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          {tUi('m_5efb44b2e5')}
        </p>
      )}
      {startError || error ? (
        <div role="alert" className="mt-4 text-sm">
          <p>{startError ?? tUi('m_e0613645eb')}</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            {tUi('m_042c862e44')}
          </Button>
        </div>
      ) : null}
      <footer className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 md:px-8">
        <Button variant="outline" size="sm" onClick={onBack} disabled={finishing}>
          {tUi('m_b52b36b726')}
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            id="onboarding-email-report"
            checked={emailReportOptIn}
            onCheckedChange={onEmailReportOptInChange}
            disabled={finishing}
          />
          <label htmlFor="onboarding-email-report" className="text-xs">
            {tUi('m_43ad41c1ac')}
          </label>
        </div>
        <Button variant="success" size="sm" onClick={onFinish} disabled={finishing}>
          {finishing ? tUi('m_90218af7b5') : finishLabel}
        </Button>
      </footer>
    </div>
  );
}
