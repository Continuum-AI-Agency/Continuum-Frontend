'use client';

import { Check, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('public');
  const [state, action, pending] = useActionState(
    decideExternalReview.bind(null, token, assetId, versionId),
    INITIAL_STATE,
  );
  return (
    <form action={action} className="grid gap-2 rounded-lg border border-border bg-card/40 p-3">
      <p className="text-xs font-semibold text-foreground">{uiText('version_decision_8cadc7a')}</p>
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
              required
              className="sm:col-span-2"
            />
          ) : null}
        </div>
      ) : null}
      <Textarea
        name="note"
        placeholder={uiText('optional_note_for_the_team_7f2e0f1')}
        maxLength={2000}
      />
      {state.error ? (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.decision ? (
        <p className="text-xs text-muted-foreground" role="status">
          {uiText.rich('sentence_e4b654df635e', {
            v0: () =>
              state.decision === 'approved'
                ? uiText('approved_87b42e4')
                : uiText('needs_changes_17fa92a'),
          })}
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
          {uiText('needs_changes_17fa92a')}
        </Button>
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>
          <Check className="size-3.5" aria-hidden />
          {uiText('approveVersion')}
        </Button>
      </div>
    </form>
  );
}
