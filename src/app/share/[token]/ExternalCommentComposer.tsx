'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { postExternalComment, type ExternalCommentActionState } from './actions';

const INITIAL_STATE: ExternalCommentActionState = { error: null, posted: false };

export function ExternalCommentComposer({
  token,
  assetId,
  versionId,
  hasIdentity,
  hasPasscode,
}: {
  token: string;
  assetId: string;
  versionId: string;
  hasIdentity: boolean;
  hasPasscode: boolean;
}) {
  const [state, action, pending] = useActionState(
    postExternalComment.bind(null, token, assetId, versionId),
    INITIAL_STATE,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <MessageSquarePlus className="size-3.5 text-muted-foreground" aria-hidden />
        Add feedback
      </div>
      {!hasIdentity ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="displayName" placeholder="Your name" autoComplete="name" required />
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
          {hasPasscode ? (
            <Input
              name="passcode"
              type="password"
              placeholder="Passcode"
              autoComplete="current-password"
              required
              className="sm:col-span-2"
            />
          ) : null}
        </div>
      ) : null}
      <Textarea name="body" placeholder="Leave a comment on this version…" required maxLength={5000} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs" role="status">
          {state.error ? <span className="text-destructive">{state.error}</span> : null}
          {state.posted ? <span className="text-muted-foreground">Comment posted.</span> : null}
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
