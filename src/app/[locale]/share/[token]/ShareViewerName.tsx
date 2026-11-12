'use client';

import { useTranslations } from 'next-intl';

// "Viewing as …" on an open link: a viewer may leave just a name, which tags
// their activity for the owner. Optional — the page works without it.

import { UserRound } from 'lucide-react';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setViewerName, type ViewerNameActionState } from './actions';

const INITIAL_STATE: ViewerNameActionState = { error: null, saved: false };

export function ShareViewerName({
  token,
  viewerName,
  hasPasscode,
}: {
  token: string;
  viewerName: string | null;
  hasPasscode: boolean;
}) {
  const uiText = useTranslations('public');
  const [state, action, pending] = useActionState(setViewerName.bind(null, token), INITIAL_STATE);
  if (viewerName) {
    return (
      <p
        data-share-viewer-name={viewerName}
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <UserRound className="size-3.5" aria-hidden />
        {uiText.rich('viewingAs', {
          name: () => <span className="font-medium text-foreground">{viewerName}</span>,
        })}
      </p>
    );
  }
  return (
    <form
      action={action}
      data-share-viewer-name-form
      className="flex flex-wrap items-center gap-2 text-xs"
    >
      <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
      <Input
        name="viewerName"
        placeholder={uiText('your_name_optional_bd01226')}
        autoComplete="name"
        maxLength={120}
        className="h-8 w-48"
        aria-label={uiText('your_name_2c6b2e2')}
      />
      {hasPasscode ? (
        <Input
          name="passcode"
          type="password"
          placeholder={uiText('passcode_56c3712')}
          autoComplete="current-password"
          className="h-8 w-32"
          aria-label={uiText('passcode_56c3712')}
        />
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? uiText('saving_23e3929') : uiText('save_1509f56')}
      </Button>
      {state.error ? (
        <span role="status" className="text-destructive">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
