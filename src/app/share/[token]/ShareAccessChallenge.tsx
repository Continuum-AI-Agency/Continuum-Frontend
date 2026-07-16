'use client';

import { KeyRound } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { establishReviewerSession, type ShareAccessActionState } from './actions';

const INITIAL_STATE: ShareAccessActionState = { error: null };

export function ShareAccessChallenge({
  token,
  needsPasscode,
  requireIdentity,
}: {
  token: string;
  needsPasscode: boolean;
  requireIdentity: boolean;
}) {
  const [state, action, pending] = useActionState(
    establishReviewerSession.bind(null, token),
    INITIAL_STATE,
  );
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        action={action}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-card px-7 py-8 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <div>
            <h1 className="text-base font-semibold text-foreground">Open shared review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {needsPasscode
                ? 'Enter the passcode supplied by the sender.'
                : 'Tell the team who is reviewing this work.'}
            </p>
          </div>
        </div>

        {needsPasscode ? (
          <div className="grid gap-1.5">
            <Label htmlFor="share-passcode">Passcode</Label>
            <Input id="share-passcode" name="passcode" type="password" autoComplete="current-password" required />
          </div>
        ) : null}

        {requireIdentity ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="reviewer-name">Name</Label>
              <Input id="reviewer-name" name="displayName" autoComplete="name" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reviewer-email">Email</Label>
              <Input id="reviewer-email" name="email" type="email" autoComplete="email" required />
            </div>
          </div>
        ) : null}

        {state.error ? <p className="text-sm text-destructive" role="alert">{state.error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Continue'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Shared via Continuum</p>
      </form>
    </main>
  );
}
