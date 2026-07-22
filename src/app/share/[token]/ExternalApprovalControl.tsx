'use client';

import { Check, RotateCcw } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { decideExternalReview, type ExternalReviewActionState } from './actions';

const INITIAL_STATE: ExternalReviewActionState = { error: null, decision: null };

export function ExternalApprovalControl({
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
    decideExternalReview.bind(null, token, assetId, versionId),
    INITIAL_STATE,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold text-foreground">Version decision</p>
      {!hasIdentity ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="displayName" placeholder="Your name" autoComplete="name" required />
          <Input name="email" type="email" placeholder="Email" autoComplete="email" required />
          {hasPasscode ? (
            <Input
              name="passcode"
              type="password"
              placeholder="Passcode"
              required
              className="sm:col-span-2"
            />
          ) : null}
        </div>
      ) : null}
      <Textarea name="note" placeholder="Optional note for the team…" maxLength={2000} />
      {state.error ? (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.decision ? (
        <p className="text-xs text-muted-foreground" role="status">
          Decision saved: {state.decision === 'approved' ? 'Approved' : 'Needs changes'}.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          name="decision"
          value="needs_changes"
          variant="outline"
          size="sm"
          disabled={pending}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Needs changes
        </Button>
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
          <Check className="size-3.5" aria-hidden />
          Approve version
        </Button>
      </div>
    </form>
  );
}
