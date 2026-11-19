'use client';

import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('common');
  const here =
    typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;
  return (
    <span className="px-2 py-3 text-destructive-ink text-xs" role="alert">
      {failure.sessionEnded
        ? uiText('your_session_ended_sign_in_again_to_see_your__7aa0c61')
        : uiText('couldn_t_search_conversations_cause_select_ti_ac37525', {
            cause: failure.cause,
          })}{' '}
      {failure.sessionEnded ? (
        <a
          className="hit-area font-medium underline underline-offset-4"
          href={`/login?redirectTo=${encodeURIComponent(here)}`}
        >
          {uiText('sign_in_again_51fbe1d')}
        </a>
      ) : (
        <button
          className="hit-area font-medium underline underline-offset-4"
          onClick={onRetry}
          type="button"
        >
          {uiText('retry_942087c')}
        </button>
      )}
    </span>
  );
}
