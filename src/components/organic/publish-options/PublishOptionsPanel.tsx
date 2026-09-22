'use client';

// The planner's Publish tab: what one destination platform does with this post beyond the
// caption — the account's first comment, the video cover, and TikTok's AI-generated label.
// Every control is gated by PLATFORM_CAPABILITIES, the same table the publisher refuses on,
// so the UI never offers an option the publish would reject.

import {
  PLATFORM_CAPABILITIES,
  type PublishFormat,
  type PublishOptions,
  type PublishOptionsByPlatform,
  type PublishPlatform,
} from '@continuum/contracts';
import { ImageUp, Loader2 } from 'lucide-react';
import * as React from 'react';
import { resolveDraftMedia } from '@/components/organic/primitives/DraftCardMedia';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { Switch } from '@/components/ui/switch';
import { uploadDraftCreative } from '@/lib/creative-assets/uploadDraftCreative';
import { POST_PLATFORMS } from '@/lib/organic/postPlatforms';
import { cn } from '@/lib/utils';
import { formatOffset, publishesGeneratedVideo, withPlatformOptions } from './publishOptionsMap';

export type PublishOptionsChange = (
  next: PublishOptionsByPlatform,
  mode: 'typing' | 'discrete',
) => void;

type Props = {
  draft: OrganicCalendarDraft;
  /** The saved per-platform map — owned by the caller, which may know newer than `draft`. */
  publishOptions: PublishOptionsByPlatform | undefined;
  platform: PublishPlatform;
  format: PublishFormat;
  brandId?: string;
  disabled?: boolean;
  onChange: PublishOptionsChange;
};

const FIRST_COMMENT_MAX = 2200;

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium text-foreground">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Unsupported({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function PublishOptionsPanel({
  draft,
  publishOptions,
  platform,
  format,
  brandId,
  disabled,
  onChange,
}: Props) {
  const can = PLATFORM_CAPABILITIES[platform].publishOptions;
  const label = POST_PLATFORMS[platform].label;
  const saved = publishOptions?.[platform] ?? {};
  const isVideo = format === 'REEL';

  const save = (block: PublishOptions, mode: 'typing' | 'discrete') =>
    onChange(withPlatformOptions(publishOptions, platform, block), mode);

  // Local text so trimming for the wire never eats the space the user just typed.
  const [comment, setComment] = React.useState(saved.firstComment ?? '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only when the target changes, not on every save echo
  React.useEffect(() => {
    setComment(saved.firstComment ?? '');
  }, [draft.id, platform]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-background/90 p-3">
      <Section
        title="First comment"
        aside={
          can.firstComment ? (
            <span className="text-2xs tabular-nums text-muted-foreground">
              {comment.length}/{FIRST_COMMENT_MAX}
            </span>
          ) : undefined
        }
      >
        {can.firstComment ? (
          <>
            <textarea
              aria-label="First comment"
              value={comment}
              maxLength={FIRST_COMMENT_MAX}
              disabled={disabled}
              rows={3}
              placeholder="Hashtags, a link, a call to action…"
              onChange={(event) => {
                setComment(event.target.value);
                save({ ...saved, firstComment: event.target.value.trim() || undefined }, 'typing');
              }}
              className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            />
            <p className="text-2xs text-muted-foreground">
              Posted from your account right after the post goes live.
            </p>
          </>
        ) : (
          <Unsupported>
            {label} does not accept a first comment through its API, so none is posted.
          </Unsupported>
        )}
      </Section>

      <Section title="Cover">
        {!isVideo ? (
          <Unsupported>A cover applies to video posts only.</Unsupported>
        ) : can.thumbnailOffset || can.thumbnailUrl ? (
          <CoverPicker
            key={platform}
            draft={draft}
            saved={saved}
            canPickFrame={can.thumbnailOffset}
            canUpload={can.thumbnailUrl}
            brandId={brandId}
            disabled={disabled}
            onPick={(thumbnail) => save({ ...saved, thumbnail }, 'discrete')}
          />
        ) : (
          <Unsupported>
            {label} picks the cover itself. Its API has no cover control, so none is sent.
          </Unsupported>
        )}
      </Section>

      {can.aiGeneratedLabel && isVideo ? (
        <AiLabelToggle
          generated={publishesGeneratedVideo(draft)}
          checked={saved.aiGenerated === true}
          disabled={disabled}
          onCheckedChange={(checked) =>
            save({ ...saved, aiGenerated: checked ? true : undefined }, 'discrete')
          }
        />
      ) : null}
    </div>
  );
}

function AiLabelToggle({
  generated,
  checked,
  disabled,
  onCheckedChange,
}: {
  generated: boolean;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  // The switch is NAMED by its section title and DESCRIBED by the sentence. A <label> on
  // the sentence would make the whole sentence its accessible name.
  const descriptionId = React.useId();
  return (
    <Section title="AI-generated content">
      <div className="flex items-start justify-between gap-3">
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {generated
            ? 'This video came out of a generation pipeline, so it is always labelled.'
            : 'Turn on if this video was made with AI. Continuum also labels it automatically when its library record says it was generated.'}
        </p>
        <Switch
          aria-label="AI-generated content"
          aria-describedby={descriptionId}
          checked={generated || checked}
          disabled={disabled || generated}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </Section>
  );
}

function CoverPicker({
  draft,
  saved,
  canPickFrame,
  canUpload,
  brandId,
  disabled,
  onPick,
}: {
  draft: OrganicCalendarDraft;
  saved: PublishOptions;
  canPickFrame: boolean;
  canUpload: boolean;
  brandId?: string;
  disabled?: boolean;
  onPick: (thumbnail: PublishOptions['thumbnail']) => void;
}) {
  const media = resolveDraftMedia(draft);
  const videoUrl = media?.kind === 'video' ? media.url : null;
  // A re-signed URL is the same video with a new token. Keying on the object (URL minus its
  // query) keeps a token refresh from reloading the element under a user mid-scrub.
  const videoKey = videoUrl ? videoUrl.split('?')[0] : null;
  const srcRef = React.useRef<{ key: string | null; url: string | null }>({ key: null, url: null });
  if (srcRef.current.key !== videoKey) srcRef.current = { key: videoKey, url: videoUrl };
  const videoSrc = srcRef.current.url;
  const videoRef = React.useRef<HTMLVideoElement>(null);
  // Frames can be picked only once THIS video has a finite duration: until then a native
  // range has no real max, and a scrub lands nowhere.
  const [frames, setFrames] = React.useState<
    | { key: string | null; state: 'loading' }
    | { key: string | null; state: 'error' }
    | {
        key: string | null;
        state: 'ready';
        durationMs: number;
      }
  >({ key: videoKey, state: 'loading' });
  const current = frames.key === videoKey ? frames : { key: videoKey, state: 'loading' as const };
  const durationMs = current.state === 'ready' ? current.durationMs : 0;
  const chosen = saved.thumbnail;
  const [offsetMs, setOffsetMs] = React.useState(
    chosen && 'offsetMs' in chosen ? chosen.offsetMs : 0,
  );
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const readDuration = React.useCallback(
    (video: HTMLVideoElement) => {
      const seconds = video.duration;
      if (Number.isFinite(seconds) && seconds > 0) {
        setFrames({ key: videoKey, state: 'ready', durationMs: Math.floor(seconds * 1000) });
      }
    },
    [videoKey],
  );

  // Metadata can arrive before React attaches the listener (a cached video); read it too.
  React.useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 1) readDuration(video);
  }, [readDuration]);

  const seek = (next: number) => {
    setOffsetMs(next);
    if (videoRef.current) videoRef.current.currentTime = next / 1000;
  };

  const upload = async (file: File | undefined) => {
    if (!file || !brandId) return;
    setUploading(true);
    setUploadError(null);
    const asset = await uploadDraftCreative({ file, brandId });
    setUploading(false);
    if (!asset?.signedUrl) {
      setUploadError('The image did not upload. Try again.');
      return;
    }
    onPick({ url: asset.signedUrl });
  };

  const status = !chosen
    ? "Using the platform's default cover"
    : 'offsetMs' in chosen
      ? `Frame at ${formatOffset(chosen.offsetMs)}`
      : 'Uploaded image';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs text-muted-foreground" data-cover-status>
        {status}
      </p>

      {canPickFrame ? (
        videoSrc ? (
          <div className="flex flex-col gap-2" data-cover-frames={current.state}>
            {/* biome-ignore lint/a11y/useMediaCaption: a silent scrub preview for choosing a frame, never played with sound */}
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                readDuration(event.currentTarget);
                event.currentTarget.currentTime = offsetMs / 1000;
              }}
              onDurationChange={(event) => readDuration(event.currentTarget)}
              onError={() => setFrames({ key: videoKey, state: 'error' })}
              className="aspect-[9/16] max-h-56 w-auto self-center rounded-md bg-black object-contain"
            />
            {current.state === 'ready' ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Cover frame"
                    min={0}
                    max={durationMs}
                    step={100}
                    value={Math.min(offsetMs, durationMs)}
                    disabled={disabled}
                    onChange={(event) => seek(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-[var(--primary)]"
                  />
                  <span className="w-12 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
                    {formatOffset(offsetMs)}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick({ offsetMs: Math.min(offsetMs, durationMs) })}
                  className="self-start rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use this frame
                </button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground" role="status">
                {current.state === 'error'
                  ? 'The video could not be loaded, so no frame can be picked. Upload an image instead.'
                  : 'Loading the video to pick a frame…'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Attach or render the video to pick a frame from it.
          </p>
        )
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <label
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted/60',
              (disabled || uploading || !brandId) && 'pointer-events-none opacity-50',
            )}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ImageUp className="size-3.5" aria-hidden />
            )}
            {uploading ? 'Uploading…' : 'Upload an image'}
            <input
              type="file"
              accept="image/*"
              aria-label="Upload cover image"
              className="sr-only"
              disabled={disabled || uploading || !brandId}
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </label>
        ) : null}
        {chosen ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(undefined)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Use the default cover
          </button>
        ) : null}
      </div>

      {chosen && 'url' in chosen ? (
        // biome-ignore lint/performance/noImgElement: a signed storage URL, not an optimisable static asset
        <img
          src={chosen.url}
          alt="Chosen cover"
          className="h-24 w-auto self-start rounded-md border border-border object-cover"
          onError={(event) => {
            // The saved link is a 1h upload URL; publish re-signs it, the preview cannot.
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      {uploadError ? (
        <p role="alert" className="text-xs text-destructive">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
