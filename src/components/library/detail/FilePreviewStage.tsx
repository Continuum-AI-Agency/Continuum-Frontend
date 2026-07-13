'use client';

// Stage for kind === 'file' assets (source files, no renderable preview):
// file identity + metadata and a signed-URL download, minted on demand
// through the same /api/library/sign route the grid uses.

import type { MediaAsset } from '@continuum/contracts';
import { Download, FileIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fileExtension, formatBytes } from './assetFileMeta';

type Props = {
  brandId: string;
  asset: MediaAsset;
};

export function FilePreviewStage({ brandId, asset }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ext = fileExtension(asset.fileName);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch('/api/library/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, assetId: asset.id }),
      });
      if (!response.ok) throw new Error(`Sign failed (${response.status})`);
      const { signedUrl } = (await response.json()) as { signedUrl?: string };
      if (!signedUrl) throw new Error('Sign failed');
      const anchor = document.createElement('a');
      anchor.href = signedUrl;
      anchor.download = asset.fileName;
      anchor.rel = 'noopener';
      anchor.click();
    } catch (err: unknown) {
      console.error('[FilePreviewStage] download failed', err);
      setError('Could not mint a download link.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-8">
      <div className="relative">
        <FileIcon className="size-16 text-muted-foreground/40" strokeWidth={1.25} />
        {ext && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-muted-foreground">
            {ext}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="max-w-md truncate text-sm font-medium">{asset.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {asset.mimeType} · {formatBytes(asset.sizeBytes ?? 0)}
        </p>
        <p className="text-xs text-muted-foreground/60">
          Source file — no preview. Download to open it in its native app.
        </p>
      </div>

      <Button type="button" size="sm" onClick={() => void download()} disabled={downloading}>
        {downloading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        Download
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
