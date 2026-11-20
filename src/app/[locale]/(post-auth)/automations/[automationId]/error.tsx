'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function AutomationWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const uiText = useTranslations('automations');
  useEffect(() => {
    console.error('[automations/workspace] route error:', error);
  }, [error]);

  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6 text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <h2 className="text-lg font-semibold text-foreground">
        {uiText('something_went_wrong_ab827e3')}
      </h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        {uiText('we_could_not_open_this_workflow_your_saved_gr_9fc191f')}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={reset}>
          {uiText('try_again_d8b8392')}
        </Button>
        <Link href="/automations" className={buttonVariants({ variant: 'outline' })}>
          {uiText('back_to_automations_f345ab6')}
        </Link>
      </div>
    </div>
  );
}
