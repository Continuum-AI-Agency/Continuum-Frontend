'use client';

/**
 * The native platform frame every organic post previews in — drafts and published posts alike.
 *
 * `frame.kind` (from `resolvePreviewFrame`) picks the chrome: a feed card (Instagram, Facebook,
 * LinkedIn), a vertical screen (Reels, Shorts, TikTok), an Instagram story, or a YouTube watch
 * page. The frame sizes itself against the nearest `container-type: size` ancestor so the WHOLE
 * frame — chrome, media and clamped caption — fits the slot without scrolling and without zoom.
 *
 * Over media, colours are neutral-50 / neutral-950 only: globals.css remaps text-white,
 * bg-black and border-white in the light theme, which turned overlay text navy on black.
 * Full-screen frames letterbox off-shape media (object-contain) and lay scrims under their
 * chrome, so the chrome survives white media and the no-media placeholder alike.
 */
import type { PublishPlatform } from '@continuum/contracts';
import {
  Bookmark,
  Forward,
  Hash,
  Heart,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Play,
  Repeat2,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { flattenHashtags } from '@/lib/organic/hashtags';
import { POST_PLATFORMS } from '@/lib/organic/postPlatforms';
import { cn } from '@/lib/utils';
import { EditableCaption } from './EditableCaption';
import type { PreviewFrame } from './social-preview-utils';
import type { OrganicCalendarDraft } from './types';

export type SocialPreviewProps = {
  platform: PublishPlatform;
  frame: PreviewFrame;
  caption: string;
  /**
   * The video's own title (a published YouTube video's snippet.title). Without it YouTube
   * frames take the caption's first line, the rule the publisher derives the title by.
   */
  title?: string;
  hashtags?: OrganicCalendarDraft['hashtags'];
  brandName?: string;
  /** When the post goes (or went) out — the draft's scheduled slot, the post's own time. */
  dayLabel?: string;
  timeLabel?: string;
  /** The media zone, pre-wired by the caller and sized to `frame.mediaAspect`. */
  mediaNode: React.ReactNode;
  /**
   * With no `mediaNode`: present → a "Needs media" placeholder at the media aspect whose
   * action calls this; absent → a text-only feed post with no media box at all, or a dark
   * "Preview unavailable" box on a full-screen frame (which has nothing else to size it).
   */
  onAddMedia?: () => void;
  // View↔edit mode. When false the frame reads as a locked "final look": caption is a
  // clamped readout and the hover edit affordances are suppressed.
  isEditing: boolean;
  onCaptionChange?: (value: string) => void;
  // Hover-revealed edit affordances — open the existing inline editors.
  onEditCreativeDirection?: () => void;
  onEditHashtags?: () => void;
};

// Rem height of everything in a frame that is not the media box, at its view-mode maximum
// (caption at its clamp). Each figure is the sum of the Tailwind heights in that frame
// below — change them together. Rem, because the type scale rides the root font ladder.
const CHROME_REM = {
  instagram: 3 + 2.5 + 0.75 + 2 * 1.25, // h-12 header, h-10 actions, pb-3 + 2 lines
  facebook: 3.5 + 0.75 + 5 * 1.25 + 2.5, // h-14 header, pb-3 + 5 lines, h-10 actions
  linkedin: 3.5 + 0.75 + 3 * 1.25 + 2.5, // h-14 header, pb-3 + 3 lines, h-10 actions
  landscape: 0.5 + 2 * 1.25 + 0.5 + 2.25 + 0.5 + 1 + 2 * 1.25, // title, channel row, description
  storyNote: 0.5 + 1.25,
} as const;
// Borders and sub-pixel rounding.
const SLACK_REM = 0.25;

const CLAMP = { 2: 'line-clamp-2', 3: 'line-clamp-3', 5: 'line-clamp-5' } as const;

const noop = () => undefined;

type RailIcon = typeof Heart;
// The right-hand action rail of each vertical surface, top to bottom. Decorative.
const VERTICAL_RAIL: Record<PublishPlatform, readonly RailIcon[]> = {
  instagram: [Heart, MessageCircle, Send],
  facebook: [ThumbsUp, MessageCircle, Forward],
  youtube: [ThumbsUp, ThumbsDown, MessageSquare, Forward],
  tiktok: [Heart, MessageCircle, Bookmark, Forward],
  linkedin: [ThumbsUp, MessageSquare, Repeat2, Send],
  x: [MessageCircle, Repeat2, Heart, Bookmark],
};

// Full-screen frames: off-shape media letterboxes on black instead of being cropped.
const LETTERBOX = 'bg-neutral-950 [&_img]:object-contain [&_video]:object-contain';

function frameWidth(aspect: number, chromeRem: number): string {
  return `min(100cqw, calc((100cqh - ${chromeRem + SLACK_REM}rem) * ${aspect}))`;
}

function brandInitials(name: string | undefined): string {
  if (!name) return 'BR';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Hover-revealed toolbar on the post preview. Each button opens the existing
 * inline editor panel (creative direction / hashtags) — so the editors are
 * reachable on mouseover instead of only through the ⋯ command menu.
 */
function PreviewHoverActions({
  onEditCreativeDirection,
  onEditHashtags,
}: {
  onEditCreativeDirection?: () => void;
  onEditHashtags?: () => void;
}) {
  if (!onEditCreativeDirection && !onEditHashtags) return null;
  const buttonClass =
    'flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-30 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/preview:pointer-events-auto group-hover/preview:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
      {onEditCreativeDirection && (
        <button
          type="button"
          onClick={onEditCreativeDirection}
          aria-label="Edit creative direction"
          className={buttonClass}
        >
          <Sparkles className="h-3 w-3" />
          Direction
        </button>
      )}
      {onEditHashtags && (
        <button
          type="button"
          onClick={onEditHashtags}
          aria-label="Edit hashtags"
          className={buttonClass}
        >
          <Hash className="h-3 w-3" />
          Hashtags
        </button>
      )}
    </div>
  );
}

// Scrims sit under the view-mode chrome only over real media; the no-media placeholder is dark,
// and a scrim over it would wash out its "Edit post to add media" button.
function TopScrim() {
  return (
    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-neutral-950/70 via-neutral-950/35 to-transparent" />
  );
}

function FrameRoot({
  platform,
  kind,
  width,
  className,
  children,
}: {
  platform: PublishPlatform;
  kind: PreviewFrame['kind'];
  width: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-preview-frame={platform}
      data-frame-kind={kind}
      className={cn(
        'group/preview @container relative mx-auto shrink-0 text-sm text-foreground',
        className,
      )}
      style={{ width }}
    >
      {children}
    </div>
  );
}

function Avatar({ name, className }: { name?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground',
        className,
      )}
    >
      {brandInitials(name)}
    </span>
  );
}

function NeedsMedia({
  aspect,
  onAddMedia,
  onDark,
}: {
  aspect: number;
  onAddMedia: () => void;
  // Under a full-screen frame's neutral-50 chrome the placeholder is dark in both themes.
  onDark: boolean;
}) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-3 px-4 text-center',
        onDark ? 'bg-neutral-900' : 'bg-muted',
      )}
      style={{ aspectRatio: `${aspect}` }}
    >
      <p className={cn('font-medium', onDark ? 'text-neutral-300' : 'text-muted-foreground')}>
        Needs media
      </p>
      <Button type="button" variant="outline" onClick={onAddMedia}>
        Edit post to add media
      </Button>
    </div>
  );
}

function MediaBox({
  frame,
  mediaNode,
  onAddMedia,
  className,
}: Pick<SocialPreviewProps, 'frame' | 'mediaNode' | 'onAddMedia'> & { className?: string }) {
  if (mediaNode == null && !onAddMedia && frame.kind === 'feed') return null;
  return (
    <div data-frame-media className={cn('relative w-full overflow-hidden', className)}>
      {mediaNode ??
        (onAddMedia ? (
          <NeedsMedia
            aspect={frame.mediaAspect}
            onAddMedia={onAddMedia}
            onDark={frame.kind === 'vertical' || frame.kind === 'story'}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center bg-neutral-900 px-4 text-center font-medium text-neutral-300"
            style={{ aspectRatio: `${frame.mediaAspect}` }}
          >
            Preview unavailable
          </div>
        ))}
    </div>
  );
}

/** What YouTube shows as the title: the video's own, else the caption's first line. */
function videoTitle(caption: string, title: string | undefined): string {
  const own = title?.trim();
  if (own) return own;
  const firstLine = caption
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? '').replace(/[<>]/g, '').slice(0, 100);
}

/**
 * The caption as each platform shows it: clamped to the platform's own truncation, with the
 * hashtag block run on at the end, in view mode; the editable caption in edit mode.
 */
function PostCaption({
  caption,
  hashtags,
  platform,
  isEditing,
  onCaptionChange,
  noun,
  lines,
  lead,
  className,
}: Pick<
  SocialPreviewProps,
  'caption' | 'hashtags' | 'platform' | 'isEditing' | 'onCaptionChange'
> & {
  noun: 'caption' | 'post copy';
  lines: keyof typeof CLAMP;
  lead?: string;
  className?: string;
}) {
  const tags = flattenHashtags(hashtags);
  const ariaLabel = `${POST_PLATFORMS[platform].label} ${noun}`;
  const placeholder = noun === 'caption' ? 'Write your caption…' : 'Write your post copy…';

  if (isEditing) {
    return (
      <div className={className}>
        {lead && <p className="font-semibold">{lead}</p>}
        <EditableCaption
          value={caption}
          onChange={onCaptionChange ?? noop}
          platform={platform}
          ariaLabel={ariaLabel}
          placeholder={placeholder}
          className="text-sm leading-5"
          editClassName="text-sm"
        />
        {tags.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-sky-800 dark:text-sky-300">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </p>
        )}
      </div>
    );
  }

  // View mode is the final look: an empty caption shows nothing, never the editor's prompt.
  const hasCaption = caption.trim().length > 0;
  if (!hasCaption && tags.length === 0) return null;

  // Padding lives outside the clamped box: a line-clamped box clips at its padding edge,
  // so padding on it would show the first hidden line.
  return (
    <div className={className}>
      <div className={cn('leading-5 [&>div]:inline', CLAMP[lines])}>
        {lead && <span className="font-semibold">{lead} </span>}
        {hasCaption && (
          <EditableCaption
            value={caption}
            onChange={noop}
            platform={platform}
            editable={false}
            ariaLabel={ariaLabel}
            className="p-0 text-inherit"
          />
        )}
        {tags.length > 0 && <span className="opacity-80"> {tags.join(' ')}</span>}
      </div>
    </div>
  );
}

function FeedFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, isEditing } = props;
  const displayName = brandName ?? 'Your Brand';
  const hasMediaBox = mediaNode != null || onAddMedia != null;
  const chrome =
    platform === 'instagram'
      ? CHROME_REM.instagram
      : CHROME_REM[platform === 'linkedin' ? 'linkedin' : 'facebook'];
  const width = hasMediaBox ? frameWidth(frame.mediaAspect, chrome) : '100cqw';
  const media = <MediaBox frame={frame} mediaNode={mediaNode} onAddMedia={onAddMedia} />;
  const hoverActions = isEditing && (
    <PreviewHoverActions
      onEditCreativeDirection={props.onEditCreativeDirection}
      onEditHashtags={props.onEditHashtags}
    />
  );

  if (platform === 'instagram') {
    return (
      <FrameRoot
        platform={platform}
        kind="feed"
        width={width}
        className="overflow-hidden rounded-xl border border-border/70 bg-card"
      >
        {hoverActions}
        <div className="flex h-12 items-center gap-2 px-3">
          <span className="flex size-8 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
            <Avatar name={brandName} className="size-full border-2 border-card" />
          </span>
          <span className="min-w-0 truncate font-semibold">{displayName}</span>
          <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        {media}
        <div className="flex h-10 items-center gap-4 px-3" aria-hidden="true">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
          <Bookmark className="ml-auto size-5" />
        </div>
        <PostCaption {...props} noun="caption" lines={2} lead={displayName} className="px-3 pb-3" />
      </FrameRoot>
    );
  }

  const isLinkedIn = platform === 'linkedin';
  const actions = isLinkedIn
    ? ([
        [ThumbsUp, 'Like'],
        [MessageSquare, 'Comment'],
        [Repeat2, 'Repost'],
        [Send, 'Send'],
      ] as const)
    : ([
        [ThumbsUp, 'Like'],
        [MessageCircle, 'Comment'],
        [Forward, 'Share'],
      ] as const);

  return (
    <FrameRoot
      platform={platform}
      kind="feed"
      width={width}
      className="overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {hoverActions}
      <div className="flex h-14 items-center gap-2 px-3">
        <Avatar
          name={brandName}
          className={
            isLinkedIn
              ? 'size-10 rounded-md bg-primary/15 text-primary'
              : 'size-9 bg-primary/15 text-primary'
          }
        />
        <div className="min-w-0 leading-5">
          <p className="truncate font-semibold">{displayName}</p>
          {props.timeLabel && (
            <p className="truncate text-muted-foreground">
              {[props.dayLabel, props.timeLabel].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <PostCaption {...props} noun="post copy" lines={isLinkedIn ? 3 : 5} className="px-3 pb-3" />
      {media}
      <div
        className="flex h-10 items-center justify-around border-t border-border/60 px-2 text-muted-foreground"
        aria-hidden="true"
      >
        {actions.map(([Icon, label]) => (
          <span key={label} className="flex items-center gap-1.5 font-medium">
            <Icon className="size-4" />
            <span className={cn(isLinkedIn && 'hidden @[20rem]:inline')}>{label}</span>
          </span>
        ))}
      </div>
    </FrameRoot>
  );
}

function VerticalFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, isEditing } = props;
  const label = platform === 'youtube' ? 'Shorts' : platform === 'tiktok' ? null : 'Reels';
  // A Short overlays its title where a reel overlays its caption.
  const title = platform === 'youtube' ? videoTitle(props.caption, props.title) : null;

  return (
    <FrameRoot
      platform={platform}
      kind="vertical"
      width={frameWidth(frame.mediaAspect, 0)}
      className="overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={props.onEditCreativeDirection}
          onEditHashtags={props.onEditHashtags}
        />
      )}
      <div className="relative">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={cn(!isEditing && LETTERBOX)}
        />
        <div className="pointer-events-none absolute inset-0 text-neutral-50">
          {!isEditing && mediaNode != null && <TopScrim />}
          {label && (
            <span
              aria-hidden="true"
              className="absolute left-3 top-3 text-base font-semibold drop-shadow"
            >
              {label}
            </span>
          )}
          {!isEditing && (
            <>
              {mediaNode != null && (
                <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-neutral-950/80 via-neutral-950/40 to-transparent" />
              )}
              <div
                className="absolute bottom-24 right-2 flex flex-col items-center gap-4 drop-shadow"
                aria-hidden="true"
              >
                {VERTICAL_RAIL[platform].map((Icon, index) => (
                  <Icon key={index} className="size-6" />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 pb-3 pl-3 pr-14">
                <div className="mb-1 flex items-center gap-2">
                  <Avatar name={brandName} className="size-7 bg-neutral-50 text-neutral-950" />
                  <span className="min-w-0 truncate font-semibold">
                    {brandName ?? 'Your Brand'}
                  </span>
                </div>
                {title === null ? (
                  <PostCaption {...props} noun="caption" lines={2} className="text-neutral-50" />
                ) : (
                  title && <p className="line-clamp-2 font-semibold leading-5">{title}</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {isEditing && (
        <div className="border-t border-border/70 px-3 py-2">
          <p className="mb-1 font-semibold">Caption</p>
          <PostCaption {...props} noun="caption" lines={2} />
        </div>
      )}
    </FrameRoot>
  );
}

function StoryFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, isEditing, caption } = props;
  const hasCaption = caption.trim().length > 0;

  return (
    <FrameRoot
      platform={platform}
      kind="story"
      width={frameWidth(frame.mediaAspect, hasCaption ? CHROME_REM.storyNote : 0)}
    >
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={props.onEditCreativeDirection}
          onEditHashtags={props.onEditHashtags}
        />
      )}
      <div className="relative overflow-hidden rounded-xl border border-border/70">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={cn(!isEditing && LETTERBOX)}
        />
        <div className="pointer-events-none absolute inset-0 text-neutral-50">
          {!isEditing && mediaNode != null && <TopScrim />}
          <div
            data-story-progress
            className="absolute inset-x-2 top-2 flex gap-1"
            aria-hidden="true"
          >
            <span className="h-0.5 flex-1 rounded-full bg-neutral-50" />
          </div>
          <div className="absolute inset-x-3 top-5 flex items-center gap-2 drop-shadow">
            <Avatar name={brandName} className="size-7 bg-neutral-50 text-neutral-950" />
            <span className="min-w-0 truncate font-semibold">{brandName ?? 'Your Brand'}</span>
            {props.timeLabel && <span className="shrink-0 opacity-80">{props.timeLabel}</span>}
            <X className="ml-auto size-5 shrink-0" aria-hidden />
          </div>
          {!isEditing && (
            <>
              {mediaNode != null && (
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-neutral-950/70 via-neutral-950/45 to-transparent" />
              )}
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 drop-shadow">
                <span
                  aria-hidden="true"
                  className="flex h-10 min-w-0 flex-1 items-center rounded-full border border-neutral-50/70 px-4"
                >
                  Send message
                </span>
                <Heart className="size-6 shrink-0" aria-hidden />
                <Send className="size-6 shrink-0" aria-hidden />
              </div>
            </>
          )}
        </div>
      </div>
      {hasCaption && (
        <p className="mt-2 text-center text-muted-foreground">Stories post without a caption</p>
      )}
    </FrameRoot>
  );
}

function LandscapeFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, isEditing, caption } = props;
  // The publisher sends the whole caption as the description (youtubePublisher), so the
  // description repeats the first line the title was derived from — as it does once posted.
  const title = videoTitle(caption, props.title);
  const hasTags = flattenHashtags(props.hashtags).length > 0;

  return (
    <FrameRoot
      platform={platform}
      kind="landscape"
      width={frameWidth(frame.mediaAspect, CHROME_REM.landscape)}
    >
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={props.onEditCreativeDirection}
          onEditHashtags={props.onEditHashtags}
        />
      )}
      <div className="relative overflow-hidden rounded-xl">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={cn(
            '[&_img]:object-contain [&_video]:object-contain',
            !isEditing && 'bg-neutral-950',
          )}
        />
        {mediaNode != null && !isEditing && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-neutral-950/70 text-neutral-50">
              <Play className="size-6 fill-current" aria-hidden />
            </span>
          </span>
        )}
      </div>
      <p
        className={cn(
          'mt-2 line-clamp-2 font-semibold leading-5',
          !title && 'text-muted-foreground',
        )}
      >
        {title || 'Untitled video'}
      </p>
      <div className="mt-2 flex h-9 items-center gap-2">
        <Avatar name={brandName} className="size-8" />
        <span className="min-w-0 truncate font-semibold">{brandName ?? 'Your Brand'}</span>
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 rounded-full bg-foreground px-3 py-1 font-medium text-background"
        >
          Subscribe
        </span>
      </div>
      {(isEditing || caption.trim() || hasTags) && (
        <PostCaption
          {...props}
          noun="caption"
          lines={2}
          className="mt-2 rounded-lg bg-muted px-3 py-2 text-muted-foreground"
        />
      )}
    </FrameRoot>
  );
}

const FRAMES: Record<PreviewFrame['kind'], (props: SocialPreviewProps) => React.ReactNode> = {
  feed: FeedFrame,
  vertical: VerticalFrame,
  story: StoryFrame,
  landscape: LandscapeFrame,
};

export function SocialPostFrame(props: SocialPreviewProps) {
  const Frame = FRAMES[props.frame.kind];
  return <Frame {...props} />;
}
