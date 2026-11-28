'use client';

import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('public');
  const [state, action, pending] = useActionState(
    establishReviewerSession.bind(null, token),
    INITIAL_STATE,
  );
  return (
    <form
      action={action}
      data-share-challenge
      className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border bg-card px-7 py-8 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <div>
          <h1 className="text-base font-semibold text-foreground">
            {uiText('open_shared_review_aebe2d2')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsPasscode
              ? uiText('enter_the_passcode_supplied_by_the_sender_63b64c0')
              : uiText('tell_the_team_who_is_reviewing_this_work_c67fbcc')}
          </p>
        </div>
      </div>

      {needsPasscode ? (
        <div className="grid gap-1.5">
          <Label htmlFor="share-passcode">{uiText('passcode_56c3712')}</Label>
          <Input
            id="share-passcode"
            name="passcode"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      ) : null}

      {requireIdentity ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="reviewer-name">{uiText('name_dcd1d52')}</Label>
            <Input id="reviewer-name" name="displayName" autoComplete="name" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reviewer-email">{uiText('email_969ccbd')}</Label>
            <Input id="reviewer-email" name="email" type="email" autoComplete="email" required />
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? uiText('checking_ec963ff') : uiText('continue_31fbef1')}
      </Button>
    </form>
  );
}
