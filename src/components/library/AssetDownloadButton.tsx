'use client';

// The Library's download affordance, once. Airtable #299 (and #253, #288 before it)
// is the same missing control filed against a different screen each time, so this is
// deliberately a shared component and not a per-screen handler: a new asset surface
// renders THIS and cannot ship without the control.
//
// It downloads the STORED ORIGINAL through `downloadLibraryAsset` — a signed read of
// bytes that already exist. Nothing here re-renders, re-encodes or re-generates.

import type { MediaAsset } from '@continuum/contracts';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToastContext } from '@/components/ui/ToastProvider';
import { downloadLibraryAsset } from '@/lib/library/assetDownload';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  asset: MediaAsset;
  /**
   * Pin an exact version. Omitted downloads the head — the grid card's only option,
   * and the right default in the detail view until a reviewer picks an older cut.
   */
  versionId?: string;
  /** `icon` for the grid card's hover chrome, `labelled` for a toolbar. */
  variant?: 'icon' | 'labelled';
  className?: string;
};

export function AssetDownloadButton({
  brandId,
  asset,
  versionId,
  variant = 'labelled',
  className,
}: Props) {
  // Nullable on purpose: a card rendered outside the app shell (tests, a future
  // embed) must still offer the control rather than throw on a missing provider.
  const toast = useToastContext();
  const [busy, setBusy] = useState(false);

  const fileName = asset.fileName || asset.title || `asset-${asset.id}`;
  const label = versionId ? 'Download this version' : 'Download';

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadLibraryAsset({ brandId, assetId: asset.id, fileName, versionId });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : 'Could not mint a download link.';
      console.error('[AssetDownloadButton] download failed', error);
      toast?.show({ title: 'Download failed', description, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [asset.id, brandId, busy, fileName, toast, versionId]);

  const Icon = busy ? Loader2 : Download;

  return (
    <Button
      type="button"
      variant={variant === 'icon' ? 'secondary' : 'outline'}
      size={variant === 'icon' ? 'icon' : 'sm'}
      // The grid card opens the asset on click; a download must not also open it.
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void run();
      }}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(variant === 'labelled' && 'gap-1.5', className)}
    >
      <Icon className={cn('size-3.5', busy && 'animate-spin')} />
      {variant === 'labelled' ? 'Download' : null}
    </Button>
  );
}
