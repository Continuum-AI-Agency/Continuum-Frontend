'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AutomationWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[automations/workspace] route error:', error);
  }, [error]);

  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6 text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        We could not open this workflow. Your saved graph is untouched.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/automations">Back to automations</Link>
        </Button>
      </div>
    </div>
  );
}
