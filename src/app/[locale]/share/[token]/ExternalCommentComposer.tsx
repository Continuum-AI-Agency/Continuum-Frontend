'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useState } from 'react';
import { formatTimecodeRange } from '@/components/library/detail/annotationGeometry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type ExternalCommentActionState, postExternalComment } from './actions';
import { clearShareDraft, pinnedMoment, useShareDraft, useSharePlayhead } from './sharePlayhead';

const INITIAL_STATE: ExternalCommentActionState = {
  error: null,
  posted: false,
};

export function ExternalCommentComposer({
  token,
  assetId,
  versionId,
  hasIdentity,
  hasPasscode,
  pinMode = null,
}: {
  token: string;
  assetId: string;
  versionId: string;
  hasIdentity: boolean;
  hasPasscode: boolean;
  /** 'time': pinned to the player's moment or I/O range (video, audio).
   *  'spatial': carries the pin or marks drafted on the still. */
  pinMode?: 'time' | 'spatial' | null;
}) {
  const uiText = useTranslations('public');
  const [state, action, pending] = useActionState(
    postExternalComment.bind(null, token, assetId, versionId),
    INITIAL_STATE,
  );
  const playhead = useSharePlayhead(pinMode === 'time' ? assetId : null);
  const draft = useShareDraft(pinMode === 'spatial' ? assetId : null);
  const [pin, setPin] = useState(true);
  const moment = playhead ? pinnedMoment(playhead) : null;
  const marks = draft?.annotation ?? null;
  const markCount = marks?.kind === 'point' ? (marks.shapes?.length ?? 0) : 0;

  // A posted comment took the drawing with it: the still starts clean again.
  useEffect(() => {
    if (state.posted && pinMode === 'spatial') clearShareDraft(assetId);
  }, [state, pinMode, assetId]);
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <MessageSquarePlus className="size-3.5 text-muted-foreground" aria-hidden />
        {uiText('addFeedback')}
      </div>
      {!hasIdentity ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            name="displayName"
            placeholder={uiText('your_name_2c6b2e2')}
            autoComplete="name"
            required
          />
          <Input
            name="email"
            type="email"
            placeholder={uiText('email_969ccbd')}
            autoComplete="email"
            required
          />
          {hasPasscode ? (
            <Input
              name="passcode"
              type="password"
              placeholder={uiText('passcode_56c3712')}
              autoComplete="current-password"
              required
              className="sm:col-span-2"
            />
          ) : null}
        </div>
      ) : null}
      <Textarea
        name="body"
        placeholder={uiText('leave_a_comment_on_this_version_7263b1d')}
        required
        maxLength={5000}
      />
      {moment ? (
        <label
          className="flex items-center gap-2 text-xs text-muted-foreground"
          data-share-pin={pin ? formatTimecodeRange(moment.timeMs, moment.endMs) : ''}
        >
          <input
            type="checkbox"
            checked={pin}
            onChange={(event) => setPin(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          {uiText.rich('pinTo', {
            time: () => (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium tabular-nums text-primary">
                {formatTimecodeRange(moment.timeMs, moment.endMs)}
              </span>
            ),
          })}
        </label>
      ) : null}
      {marks ? (
        <label
          className="flex items-center gap-2 text-xs text-muted-foreground"
          data-share-marks={pin ? (markCount > 0 ? `${markCount} marks` : 'pin') : ''}
        >
          <input
            type="checkbox"
            checked={pin}
            onChange={(event) => setPin(event.target.checked)}
            className="size-3.5 accent-primary"
          />
          {uiText.rich('attachMarks', {
            count: markCount,
            value: (chunks) => (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                {chunks}
              </span>
            ),
          })}
        </label>
      ) : null}
      {marks && pin ? (
        <input type="hidden" name="annotation" value={JSON.stringify(marks)} />
      ) : null}
      {moment && pin ? (
        <>
          <input type="hidden" name="timeMs" value={moment.timeMs} />
          {moment.endMs !== null ? <input type="hidden" name="endMs" value={moment.endMs} /> : null}
        </>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs" role="status">
          {state.error ? <span className="text-destructive">{state.error}</span> : null}
          {state.posted ? (
            <span className="text-muted-foreground">{uiText('comment_posted_9f47dda')}</span>
          ) : null}
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? uiText('posting_648a2ef') : uiText('post_comment_153dc13')}
        </Button>
      </div>
    </form>
  );
}
