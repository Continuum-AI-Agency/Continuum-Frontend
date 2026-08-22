'use client';

// Stage for kind === 'file' assets (source files, no renderable preview):
// file identity + metadata and a signed-URL download, minted on demand
// through the same /api/library/sign route the grid uses.

import type { MediaAsset } from '@continuum/contracts';
import { Download, FileIcon, ImagePlus, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { uploadCompanionPreview } from '@/lib/library/assetPreview';
import { ensureAssetHeadVersion } from '@/lib/library/creativeOperations';
import { withForcedDownload } from '@/lib/media/downloadUrl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { fileExtension, formatBytes } from './assetFileMeta';

type Props = {
  brandId: string;
  asset: MediaAsset;
  onPreviewChanged?: () => void;
};

export function FilePreviewStage({ brandId, asset, onPreviewChanged }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const ext = fileExtension(asset.fileName);
  const isAfterEffects = ext === 'AEP';

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
      anchor.href = withForcedDownload(signedUrl, asset.fileName);
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

  const uploadPreview = async (file: File | null) => {
    if (!file) return;
    setUploadingPreview(true);
    setError(null);
    try {
      const client = createSupabaseBrowserClient();
      const versionId =
        asset.headVersionId ??
        (await ensureAssetHeadVersion(client, { brandId, assetId: asset.id })).headVersionId;
      await uploadCompanionPreview({
        file,
        brandId,
        assetId: asset.id,
        assetVersionId: versionId,
        client,
      });
      onPreviewChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload the companion preview.');
    } finally {
      setUploadingPreview(false);
      if (previewInputRef.current) previewInputRef.current.value = '';
    }
  };

  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-8">
      <div className="relative">
        {isAfterEffects ? (
          <span className="flex size-20 items-center justify-center rounded-2xl bg-[#00005b] text-2xl font-semibold tracking-tight text-[#9999ff] shadow-sm">
            Ae
          </span>
        ) : (
          <FileIcon className="size-16 text-muted-foreground/40" strokeWidth={1.25} />
        )}
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
        {isAfterEffects ? (
          <p className="text-xs font-medium text-foreground/80">Adobe After Effects project</p>
        ) : null}
        <p className="text-xs text-muted-foreground/70">
          Modified{' '}
          {new Date(asset.updatedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {asset.createdBy ? ` · Uploader ${asset.createdBy.slice(0, 8)}` : ''}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {asset.preview?.state === 'awaiting_companion'
            ? 'Add a PNG, JPEG, WebP, or MP4 companion to review this source in Continuum.'
            : 'No preview is available yet. The original remains downloadable.'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => previewInputRef.current?.click()}
          disabled={uploadingPreview}
        >
          {uploadingPreview ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
          Add preview
        </Button>
        <Button type="button" size="sm" onClick={() => void download()} disabled={downloading}>
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Download
        </Button>
      </div>
      <input
        ref={previewInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4"
        className="hidden"
        onChange={(event) => void uploadPreview(event.target.files?.[0] ?? null)}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
