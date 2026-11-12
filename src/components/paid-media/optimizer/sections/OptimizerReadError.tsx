'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

// The one thing every optimizer read owed the user and never paid: saying it failed.
//
// Each surface used to render a failed read as its EMPTY state — "No optimizer activity
// yet", a zero-row queue, a first-cycle spinner — so an outage was indistinguishable from
// a brand with nothing to do, and the only signal was that it took ~16s to say nothing
// (8s READ_TIMEOUT_MS x retry: 1). This names the failure, shows what actually went wrong,
// and gives the user the one action that can help.

import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';

import { EmptyState } from '@/components/shared/state/EmptyState';
import { Button } from '@/components/ui/button';

type OptimizerReadErrorProps = {
  /** What could not be read, in the user's words — "the activity log", "this portfolio's
   *  cycle". Completes the sentence "Couldn't load …". */
  subject: string;
  /** The query's error. Surfaced verbatim: an unattributed failure is not debuggable from
   *  a screenshot, and these reads cross an edge function we cannot see from here. */
  error?: unknown;
  onRetry: () => void;
  className?: string;
};

export function OptimizerReadError({
  subject,
  error,
  onRetry,
  className,
}: OptimizerReadErrorProps) {
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
  const detail = error == null ? undefined : formatUiError(error);

  return (
    <EmptyState
      className={className}
      action={
        <Button onClick={onRetry} size="sm" type="button" variant="secondary">
          <RefreshCwIcon aria-hidden="true" className="size-3.5" />
          {uiText('retry_942087c')}
        </Button>
      }
      description={
        detail
          ? uiText('template_13dac35bc7a7', { v0: detail })
          : uiText('nothing_was_changed_this_is_a_read_abf2f16')
      }
      headline={uiText('optimizerLoadFailure', { subject })}
      media={<TriangleAlertIcon aria-hidden="true" />}
    />
  );
}
