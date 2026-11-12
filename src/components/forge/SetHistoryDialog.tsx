'use client';

import type { ForgeRenderSet, ForgeRenderSetRevision } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
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
  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

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
          <DialogTitle>
            {translateUi('version_history_bbf37f92')} {set?.name}
          </DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('kept_when_you_stop_editing_for_a_wh_f0d0658c')}{' '}
          </DialogDescription>
        </DialogHeader>
        {history.isLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />{' '}
            {translateUi('loading_versions_9780e2c9')}{' '}
          </p>
        ) : history.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {' '}
            {translateUi('could_not_load_this_set_s_versions__135f6155')}{' '}
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {' '}
            {translateUi('no_earlier_versions_yet_one_is_kept_2cd2430a')}{' '}
          </p>
        ) : (
          <ul
            aria-label={translateUi('versions_f89ea270')}
            className="-mx-1 max-h-80 divide-y divide-border overflow-y-auto"
          >
            {items.map((revision) => (
              <li key={revision.revision} className="flex items-center gap-2 px-1 py-1.5 text-xs">
                <span className="font-mono tabular-nums text-muted-foreground">
                  v{revision.revision}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatRelativeTime(revision.savedAt, undefined, currentUiLocale)} ·{' '}
                  {revision.rows.length}{' '}
                  {revision.rows.length === 1
                    ? translateUi('row_634768da')
                    : translateUi('rows_bc51e9e6')}
                </span>
                {revision.contractHash === contractHash ? null : (
                  <Pill variant="warning" className="shrink-0 text-3xs">
                    {' '}
                    {translateUi('older_template_631ab51f')}{' '}
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
                  ) : null}{' '}
                  {translateUi('restore_as_new_set_63d4d167')}{' '}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
