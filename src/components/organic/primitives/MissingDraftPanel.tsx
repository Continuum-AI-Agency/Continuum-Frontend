'use client';

/**
 * What the preview shows when a selection names a draft the Calendar does not have: a chat
 * card's "Open in Calendar" or a `?draftId=` link to a post that failed to save or was
 * deleted. The planner used to clear such a selection silently, so the click did nothing.
 * Recreate re-queues the job that made the post onto a fresh draft row; when no job made it,
 * the only way forward is a new post, so that is what the panel offers instead.
 */
import { AlertTriangle, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { requestDraftRecreate } from '@/lib/organic/agent-retry';
import { ORGANIC_ACTION_LABELS } from '@/lib/organic/organicActionCopy';

type RecreateState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'no_job' }
  | { kind: 'still_generating' }
  | { kind: 'error'; message: string };

const NOTICES: Record<Exclude<RecreateState['kind'], 'idle' | 'busy' | 'error'>, string> = {
  no_job:
    'Nothing generated this post, so there is nothing to recreate it from. Create a new post in its place.',
  still_generating: "It is still being generated. It will appear in the Calendar when it's done.",
};

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
      else setState({ kind: 'error', message: "Couldn't recreate this post. Try again." });
    }
  }, [brandId, draftId, onDraftExists, onRecreated, recreate]);

  const notice =
    state.kind === 'no_job' || state.kind === 'still_generating'
      ? NOTICES[state.kind]
      : state.kind === 'error'
        ? state.message
        : null;

  return (
    <div className="flex h-full flex-col gap-3 p-4" role="alert" data-testid="missing-draft-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-foreground">This post failed to save</h2>
            <p className="text-xs text-muted-foreground">
              It isn't in your Calendar anymore: it never saved, or it was deleted. Recreate it to
              get a real draft in the same slot.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close preview"
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
            Create a post
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleRecreate}
            disabled={!brandId || state.kind === 'busy' || state.kind === 'still_generating'}
          >
            {state.kind === 'busy' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {ORGANIC_ACTION_LABELS.recreateDraft}
          </Button>
        )}
      </div>
      <p className="text-3xs text-muted-foreground" title={draftId}>
        Draft {draftId.slice(0, 8)}
      </p>
    </div>
  );
}
