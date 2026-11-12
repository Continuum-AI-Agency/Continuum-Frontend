'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

import type { SessionSearchFailure } from './useSessionSearch';

/**
 * A failed conversation filter, said as a failure — never as "No conversations match", which a
 * person reads as lost history (PP-DT-C-jaina-401-reads-as-no-conversations). An ended session
 * leads to sign-in and back here; anything else can be retried.
 */
export function SessionSearchFailureNotice({
  failure,
  onRetry,
}: {
  failure: SessionSearchFailure;
  onRetry: () => void;
}) {
  const betaUiText = useBetaTranslations('common');

  const here =
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
  return (
    <span className="px-2 py-3 text-destructive-ink text-xs" role="alert">
      {failure.message}{' '}
      {failure.sessionEnded ? (
        <a
          className="hit-area font-medium underline underline-offset-4"
          href={`/login?redirectTo=${encodeURIComponent(here)}`}
        >
          {betaUiText('beta_51fbe1dc8a73')}
        </a>
      ) : (
        <button
          className="hit-area font-medium underline underline-offset-4"
          onClick={onRetry}
          type="button"
        >
          {betaUiText('beta_942087cc2d41')}
        </button>
      )}
    </span>
  );
}
