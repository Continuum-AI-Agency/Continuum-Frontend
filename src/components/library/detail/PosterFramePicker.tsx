'use client';

// Lets a reviewer pick which frame of a video becomes its poster. A popover with
// a scrubbing preview; on confirm the chosen moment is decoded through the same
// WebCodecs path as upload-time posters (`generateVideoPoster`) and persisted as
// a 'user' poster rendition. Replacing an existing poster is not a special case:
// the sign step reuses the (asset_version_id, 'poster') row's id + storage path,
// so the confirm overwrites the bytes in place and read URLs are signed per-mint.

import type { MediaAsset } from '@continuum/contracts';
import { Aperture, Check, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { persistAssetRendition } from '@/lib/library/assetPreview';
import { ensureAssetHeadVersion } from '@/lib/library/creativeOperations';
import { generateVideoPoster } from '@/lib/library/videoPoster';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Props = {
  brandId: string;
  asset: MediaAsset;
  src: string;
  onPosterChanged?: () => void;
};

export function PosterFramePicker({ brandId, asset, src, onPosterChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [durationMs, setDurationMs] = useState(asset.durationMs ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (asset.kind !== 'video') return null;

  const seek = (values: number[]) => {
    const next = values[0] ?? 0;
    setScrubMs(next);
    if (videoRef.current) videoRef.current.currentTime = next / 1000;
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const timestampSec = scrubMs / 1000;
      const blob = await (await fetch(src)).blob();
      const poster = await generateVideoPoster(blob, { timestampSec });
      if (!poster) throw new Error('This frame could not be decoded.');
      const client = createSupabaseBrowserClient();
      const versionId =
        asset.headVersionId ??
        (await ensureAssetHeadVersion(client, { brandId, assetId: asset.id })).headVersionId;
      await persistAssetRendition({
        client,
        brandId,
        assetId: asset.id,
        assetVersionId: versionId,
        role: 'poster',
        blob: poster.blob,
        mimeType: poster.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
        width: poster.width,
        height: poster.height,
        renderer: 'mediabunny-frame-picker',
        posterSource: 'user',
        sourceTimestampMs: Math.round(timestampSec * 1000),
      });
      onPosterChanged?.();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not set the poster frame.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Aperture className="size-3.5" aria-hidden />
            Poster
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">Choose poster frame</p>
          <p className="text-xs text-muted-foreground">Scrub to the frame you want on the card.</p>
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-muted">
          {/* biome-ignore lint/a11y/useMediaCaption: silent frame-scrubbing preview of the user's own video */}
          <video
            ref={videoRef}
            src={src}
            className="aspect-video w-full object-contain"
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              const seconds = event.currentTarget.duration;
              if (Number.isFinite(seconds) && seconds > 0) {
                setDurationMs(Math.round(seconds * 1000));
              }
            }}
          />
        </div>
        <Slider
          value={[Math.min(scrubMs, Math.max(durationMs, 1))]}
          min={0}
          max={Math.max(durationMs, 1)}
          step={100}
          onValueChange={seek}
          aria-label="Poster frame time"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs tabular-nums text-muted-foreground">
            {(scrubMs / 1000).toFixed(1)}s
          </span>
          <Button type="button" size="sm" onClick={() => void confirm()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Set poster
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
