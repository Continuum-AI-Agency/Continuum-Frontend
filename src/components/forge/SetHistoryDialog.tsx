'use client';

import type { ForgeRenderSet, ForgeRenderSetRevision } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Version history for one render set: the states the database kept — the end of each editing
// burst, the state before a template change, every revision something was rendered from. Restoring
// one makes a new set; the set itself is never written back over, so a restore cannot lose anything.

export function SetHistoryDialog({
  brandId,
  set,
  contractHash,
  onRestore,
  onOpenChange,
}: {
  brandId: string;
  set: ForgeRenderSet | null;
  /** The template as it is now, so a version saved for an earlier one says so. */
  contractHash: string;
  onRestore: (revision: ForgeRenderSetRevision) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const [restoring, setRestoring] = useState<number | null>(null);
  const history = useQuery({
    queryKey: ['forge-render-set-revisions', brandId, set?.id],
    queryFn: () => apiRendersApi.listRenderSetRevisions(brandId, set!.id),
    enabled: set !== null,
    staleTime: 0,
  });
  const items = history.data?.items ?? [];

  return (
    <Dialog open={set !== null} onOpenChange={(open) => restoring === null && onOpenChange(open)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history · {set?.name}</DialogTitle>
          <DialogDescription>
            Kept when you stop editing for a while, before a template update, and whenever a version
            is rendered. Restoring one opens it as a new set.
          </DialogDescription>
        </DialogHeader>
        {history.isLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading versions…
          </p>
        ) : history.isError ? (
          <p role="alert" className="text-xs text-destructive">
            Could not load this set’s versions. Try again in a moment.
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No earlier versions yet. One is kept once you stop editing for two minutes.
          </p>
        ) : (
          <ul
            aria-label="Versions"
            className="-mx-1 max-h-80 divide-y divide-border overflow-y-auto"
          >
            {items.map((revision) => (
              <li key={revision.revision} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                <span className="font-mono tabular-nums text-muted-foreground">
                  v{revision.revision}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatRelativeTime(revision.savedAt)} · {revision.rows.length}{' '}
                  {revision.rows.length === 1 ? 'row' : 'rows'}
                </span>
                {revision.contractHash === contractHash ? null : (
                  <Pill variant="warning" className="shrink-0 text-3xs">
                    Older template
                  </Pill>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={restoring !== null}
                  onClick={async () => {
                    setRestoring(revision.revision);
                    try {
                      await onRestore(revision);
                    } finally {
                      setRestoring(null);
                    }
                  }}
                >
                  {restoring === revision.revision ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                  ) : null}
                  Restore as new set
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
