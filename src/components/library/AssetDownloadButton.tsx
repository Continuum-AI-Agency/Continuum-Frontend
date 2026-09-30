'use client';

// The Library's download affordance, once. Airtable #299 (and #253, #288 before it)
// is the same missing control filed against a different screen each time, so this is
// deliberately a shared component and not a per-screen handler: a new asset surface
// renders THIS and cannot ship without the control.
//
// It downloads STORED bytes through signed reads — the original via
// `downloadLibraryAsset`, a playback proxy by its own signed URL. Nothing here
// re-renders or re-generates. Video stills encode the frame on stage; PSD PNG/JPEG
// exports save the exact source version's composite as a new Library image.

import {
  type MediaAsset,
  PSD_STATIC_EXPORT_ROUTE,
  type PsdStaticExportResponse,
  type PsdStaticFormat,
  psdStaticExportRequestSchema,
  psdStaticExportResponseSchema,
} from '@continuum/contracts';
import { Download, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToastContext } from '@/components/ui/ToastProvider';
import { http } from '@/lib/api/http';
import { downloadLibraryAsset } from '@/lib/library/assetDownload';
import { useLibraryPlayback } from '@/lib/library/libraryPlayback';
import { activeStageVideo, downloadVideoStill } from '@/lib/library/videoPoster';
import { withForcedDownload } from '@/lib/media/downloadUrl';
import { cn } from '@/lib/utils';

type Props = {
  brandId: string;
  asset: MediaAsset;
  /**
   * Pin an exact version. Omitted downloads the head — the grid card's only option,
   * and the right default in the detail view until a reviewer picks an older cut.
   */
  versionId?: string;
  /** `icon` for the grid card's hover chrome (the original, one click), `labelled` for a
   *  toolbar (a menu: original, playback proxies, a still of the frame on stage). */
  variant?: 'icon' | 'labelled';
  className?: string;
};

// A signed Storage URL is cross-origin, so the save is requested on the URL itself.
function saveSignedUrl(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = withForcedDownload(url, fileName);
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();
}

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
  const [menuOpened, setMenuOpened] = useState(false);
  const [stillReady, setStillReady] = useState(false);
  const timed = asset.kind === 'video' || asset.kind === 'audio';
  // Looked up the first time the menu opens, never for a card that is only rendered.
  const playback = useLibraryPlayback({
    brandId,
    assetId: asset.id,
    versionId,
    enabled: menuOpened && timed,
  });

  const fileName = asset.fileName || asset.title || `asset-${asset.id}`;
  const stem = fileName.replace(/\.[^.]+$/, '') || fileName;
  const label = versionId ? 'Download this version' : 'Download';

  const run = useCallback(
    async (save: () => Promise<void> | void) => {
      if (busy) return;
      setBusy(true);
      try {
        await save();
      } catch (error) {
        const description =
          error instanceof Error ? error.message : 'Could not mint a download link.';
        console.error('[AssetDownloadButton] download failed', error);
        toast?.show({ title: 'Download failed', description, variant: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [busy, toast],
  );

  const downloadOriginal = () =>
    run(() => downloadLibraryAsset({ brandId, assetId: asset.id, fileName, versionId }));

  const downloadPsd = (format: PsdStaticFormat) =>
    run(async () => {
      const exported = await http.request<PsdStaticExportResponse>({
        path: PSD_STATIC_EXPORT_ROUTE,
        method: 'POST',
        schema: psdStaticExportResponseSchema,
        body: psdStaticExportRequestSchema.parse({ brandId, assetId: asset.id, versionId, format }),
      });
      saveSignedUrl(exported.signedUrl, exported.fileName);
      toast?.show({
        title: 'Saved to Library',
        description: exported.fileName,
        variant: 'success',
      });
    });
  const icon = busy ? (
    <Loader2 className="size-3.5 animate-spin" />
  ) : (
    <Download className="size-3.5" />
  );

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        // The grid card opens the asset on click; a download must not also open it.
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          void downloadOriginal();
        }}
        disabled={busy}
        title={label}
        aria-label={label}
        className={className}
      >
        {icon}
      </Button>
    );
  }

  const stageVideo = stillReady ? activeStageVideo() : null;
  const rungs = playback?.rungs ?? [];
  const audioProxy = playback?.audioProxy ?? null;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        setMenuOpened(true);
        setStillReady(Boolean(activeStageVideo()));
      }}
    >
      <DropdownMenuTrigger
        data-testid="download-menu"
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            title={label}
            aria-label={label}
            className={cn('gap-1.5', className)}
          >
            {icon}
            Download
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem data-testid="download-original" onClick={() => void downloadOriginal()}>
          Original
        </DropdownMenuItem>
        {/\.psd$/i.test(fileName) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="download-psd-png"
              disabled={busy}
              onClick={() => void downloadPsd('png')}
            >
              PNG · preserves transparency
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="download-psd-jpeg"
              disabled={busy}
              onClick={() => void downloadPsd('jpeg')}
            >
              JPEG · white background
            </DropdownMenuItem>
          </>
        ) : null}
        {rungs.length > 0 || audioProxy ? (
          <>
            <DropdownMenuSeparator />
            {rungs.map((rung) => (
              <DropdownMenuItem
                key={rung.role}
                data-testid={`download-proxy-${rung.role}`}
                onClick={() =>
                  saveSignedUrl(rung.signedUrl, `${stem}-${rung.label.toLowerCase()}.mp4`)
                }
              >
                {rung.label} proxy
              </DropdownMenuItem>
            ))}
            {audioProxy ? (
              <DropdownMenuItem
                data-testid="download-proxy-audio_proxy"
                onClick={() => saveSignedUrl(audioProxy.signedUrl, `${stem}-proxy.m4a`)}
              >
                Audio proxy (AAC)
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {asset.kind === 'video' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="download-still"
              disabled={!stageVideo}
              onClick={() => {
                if (stageVideo) void run(() => downloadVideoStill(stageVideo, stem));
              }}
            >
              Download still
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
