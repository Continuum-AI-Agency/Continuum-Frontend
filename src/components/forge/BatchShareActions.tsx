'use client';

import { Download, Link2, Loader2 } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// A batch's zip, for you or for anyone you send the link to. Both buttons mint the same 30-day
// link: downloading is opening it here, sharing is copying it. The zip is built by the Backend
// from the render bucket on every open, so a link works for as long as it has not expired.

type Action = 'download' | 'copy';

const expiryDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function BatchShareActions({
  brandId,
  batchId,
  ready,
}: {
  brandId: string;
  batchId: string;
  /** False until at least one render in the batch has files. */
  ready: boolean;
}) {
  const [pending, setPending] = useState<Action | null>(null);

  const run = async (action: Action, event: MouseEvent) => {
    // Inside a clickable batch row: the row opens the batch, these must not.
    event.stopPropagation();
    setPending(action);
    try {
      const share = await apiRendersApi.shareBatch(brandId, batchId);
      if (action === 'download') {
        window.location.assign(share.url);
        return;
      }
      const expires = expiryDay(share.expiresAt);
      try {
        await navigator.clipboard.writeText(share.url);
        toast.success(`Link copied · expires ${expires}`);
      } catch {
        // Safari refuses a clipboard write that follows a network round trip.
        window.prompt(`Copy this link. It expires ${expires}.`, share.url);
      }
    } catch (error) {
      const detail = error instanceof ApiError ? error.payload?.detail : undefined;
      toast.error(typeof detail === 'string' ? detail : 'Could not make the link. Try again.');
    } finally {
      setPending(null);
    }
  };

  const disabled = !ready || pending !== null;
  const title = ready ? undefined : 'Available once a render in this batch has finished';
  return (
    <span className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={disabled}
        title={title ?? 'Download every finished file as one zip'}
        onClick={(event) => void run('download', event)}
      >
        {pending === 'download' ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="size-3.5" aria-hidden />
        )}
        Zip
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={disabled}
        title={title ?? 'Copy a link anyone can open to download the zip for 30 days'}
        onClick={(event) => void run('copy', event)}
      >
        {pending === 'copy' ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Link2 className="size-3.5" aria-hidden />
        )}
        Copy link
      </Button>
    </span>
  );
}
