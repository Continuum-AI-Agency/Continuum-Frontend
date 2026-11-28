'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
/**
 * What the preview shows when a selection names a draft the Calendar does not have: a chat
 * card's "Open in Calendar" or a `?draftId=` link to a post that failed to save or was
 * deleted. The planner used to clear such a selection silently, so the click did nothing.
 * Recreate re-queues the job that made the post onto a fresh draft row; when no job made it,
 * the only way forward is a new post, so that is what the panel offers instead.
 */
import { Plus, RefreshCw, Spinner, TriangleAlert, X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { requestDraftRecreate } from '@/lib/organic/agent-retry';

type RecreateState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'no_job' }
  | { kind: 'still_generating' }
  | { kind: 'error' };

const NOTICE_KEYS = {
  no_job: 'nothing_generated_this_post_so_there_is_nothi_dc3756f',
  still_generating: 'it_is_still_being_generated_it_will_appear_in_a0467de',
  error: 'couldn_t_recreate_this_post_try_again_236db18',
} as const satisfies Record<Exclude<RecreateState['kind'], 'idle' | 'busy'>, string>;

export function MissingDraftPanel({
  draftId,
  brandId,
  onRecreated,
  onDraftExists,
  onCreatePost,
  onClose,
  recreate = requestDraftRecreate,
}: {
  draftId: string;
  brandId: string | null;
  /** The new draft's id: refetch the Calendar and select it. */
  onRecreated: (draftId: string) => void;
  /** The row is there after all: the Calendar's copy was stale. */
  onDraftExists: () => void;
  onCreatePost: () => void;
  onClose: () => void;
  recreate?: typeof requestDraftRecreate;
}) {
  const uiText = useTranslations('organic');
  const [state, setState] = React.useState<RecreateState>({ kind: 'idle' });

  const handleRecreate = React.useCallback(async () => {
    if (!brandId) return;
    setState({ kind: 'busy' });
    try {
      const response = await recreate({ draftId, brandId });
      const recreatedId = response.job.draftId;
      if (recreatedId) onRecreated(recreatedId);
      else setState({ kind: 'still_generating' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'draft_exists') onDraftExists();
      else if (code === 'no_generation_job' || code === 'invalid_draft_id')
        setState({ kind: 'no_job' });
      else if (code === 'not_retryable') setState({ kind: 'still_generating' });
      else setState({ kind: 'error' });
    }
  }, [brandId, draftId, onDraftExists, onRecreated, recreate]);

  const notice =
    state.kind === 'idle' || state.kind === 'busy' ? null : uiText(NOTICE_KEYS[state.kind]);

  return (
    <div className="flex h-full flex-col gap-3 p-4" role="alert" data-testid="missing-draft-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-foreground">
              {uiText('this_post_failed_to_save_de27f50')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {uiText('it_isn_t_in_your_calendar_anymore_it_never_sa_90a1d93')}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={uiText('close_preview_7d8ab36')}
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      {notice ? <p className="text-xs text-foreground">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        {state.kind === 'no_job' ? (
          <Button type="button" size="sm" onClick={onCreatePost}>
            <Plus className="size-3.5" />
            {uiText('create_a_post_2530702')}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleRecreate}
            disabled={!brandId || state.kind === 'busy' || state.kind === 'still_generating'}
          >
            {state.kind === 'busy' ? (
              <Spinner className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {uiText('recreate_draft_96eb4ef')}
          </Button>
        )}
      </div>
      <p className="text-3xs text-muted-foreground" title={draftId}>
        {uiText('draft_id_b52d61c', { id: draftId.slice(0, 8) })}
      </p>
    </div>
  );
}
