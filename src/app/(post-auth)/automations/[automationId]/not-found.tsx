import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AutomationWorkspaceNotFound() {
  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-background p-6 text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <h2 className="text-lg font-semibold text-foreground">Workflow not found</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        This workflow no longer exists, or it belongs to a different brand. Switch brands or pick
        another workflow to continue.
      </p>
      <Button asChild>
        <Link href="/automations">Back to automations</Link>
      </Button>
    </div>
  );
}
