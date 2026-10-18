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
 *
 * A draft under review (`editable`) shows only what is sent: the account, the media, the
 * caption exactly as the platform receives it. The decoration a platform draws around a post
 * but nothing sends (action rails, a ⋯, "Send message", "Subscribe") is left out there, so the
 * only controls in the panel are real ones. A published post keeps the familiar look.
 */
import type { PublishPlatform } from '@continuum/contracts';
import {
  Bookmark,
  Forward,
  Heart,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Play,
  Repeat2,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import * as React from 'react';
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
  /** The caption as typed — what the editor edits. */
  caption: string;
  /**
   * The caption exactly as the platform receives it (hashtags run on, cut at the limit), or
   * null when none is sent (a story). Omitted: the caption with `hashtags` run on, which is
   * how a published post's own caption reads.
   */
  sentCaption?: string | null;
  /**
   * The video's own title (a published YouTube video's snippet.title, a draft's planned
   * title). Without it YouTube frames take the caption's first line, the publisher's rule.
   */
  title?: string;
  hashtags?: OrganicCalendarDraft['hashtags'];
  /** The account the post goes out as: its handle for a draft, the brand for a post. */
  brandName?: string;
  avatarUrl?: string | null;
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
  /** A draft under review: the caption edits in place on click, decoration is left out. */
  editable: boolean;
  onCaptionChange?: (value: string) => void;
  /** Controlled caption editor, for a caller that opens it from elsewhere. */
  captionEditing?: boolean;
  onCaptionEditingChange?: (next: boolean) => void;
};

// Rem height of everything in a frame that is not the media box, at its view-mode maximum
// (caption at its clamp). Each figure is the sum of the Tailwind heights in that frame
// below — change them together. Rem, because the type scale rides the root font ladder.
const CHROME_REM = {
  instagram: 3 + 0.75 + 2 * 1.25, // h-12 header, pb-3 + 2 lines
  facebook: 3.5 + 0.75 + 5 * 1.25, // h-14 header, pb-3 + 5 lines
  linkedin: 3.5 + 0.75 + 3 * 1.25, // h-14 header, pb-3 + 3 lines
  landscape: 0.5 + 2 * 1.25 + 0.5 + 2.25 + 0.5 + 1 + 2 * 1.25, // title, channel row, description
  storyNote: 0.5 + 1.25,
  belowCaption: 0.5 + 2 * 1.25 + 0.5, // py-2 + 2 lines, under a vertical draft's media
} as const;
// The h-10 action row a feed frame draws under a published post and never under a draft.
const ACTION_ROW_REM = 2.5;
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

// Scrims sit under the overlay chrome only over real media; the no-media placeholder is dark,
// and a scrim over it would wash out its "Add media" button.
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

function Avatar({
  name,
  src,
  className,
}: {
  name?: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />;
  }
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
        Add media
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

/** What the frame shows as the caption: the sent string for a draft, caption + tags for a post. */
function shownCaption(props: SocialPreviewProps): string {
  if (props.sentCaption !== undefined) return props.sentCaption ?? '';
  const tags = flattenHashtags(props.hashtags);
  return tags.length > 0 ? `${props.caption} ${tags.join(' ')}`.trim() : props.caption;
}

/**
 * The caption as each platform shows it, clamped to the platform's own truncation. On a draft
 * under review it is also the editor: a click opens the typed caption in place, and leaving
 * it shows the sent string again.
 */
function PostCaption({
  noun,
  lines,
  lead,
  className,
  ...props
}: SocialPreviewProps & {
  noun: 'caption' | 'post copy';
  lines: keyof typeof CLAMP;
  lead?: string;
  className?: string;
}) {
  const [localEditing, setLocalEditing] = React.useState(false);
  const editing = props.captionEditing ?? localEditing;
  const setEditing = (next: boolean) => {
    setLocalEditing(next);
    props.onCaptionEditingChange?.(next);
  };
  const shown = shownCaption(props);
  const ariaLabel = `${POST_PLATFORMS[props.platform].label} ${noun}`;

  if (props.editable) {
    const leadText = lead ? <span className="font-semibold">{lead} </span> : null;
    return (
      <div className={className}>
        <div className="leading-5">
          {editing && leadText}
          <EditableCaption
            value={props.caption}
            displayValue={shown}
            onChange={props.onCaptionChange ?? noop}
            platform={props.platform}
            hashtags={props.hashtags}
            ariaLabel={ariaLabel}
            placeholder={noun === 'caption' ? 'Write your caption…' : 'Write your post copy…'}
            editing={editing}
            onEditingChange={setEditing}
            lead={editing ? undefined : leadText}
            readoutClassName={CLAMP[lines]}
            className="p-0 text-inherit"
            editClassName="text-sm"
          />
        </div>
      </div>
    );
  }

  // A published post's caption: an empty one shows nothing, never the editor's prompt.
  if (!shown.trim()) return null;
  // Padding lives outside the clamped box: a line-clamped box clips at its padding edge,
  // so padding on it would show the first hidden line.
  return (
    <div className={className}>
      <div className={cn('leading-5 [&>div]:inline', CLAMP[lines])}>
        {lead && <span className="font-semibold">{lead} </span>}
        <EditableCaption
          value={shown}
          onChange={noop}
          platform={props.platform}
          editable={false}
          ariaLabel={ariaLabel}
          className="p-0 text-inherit"
        />
      </div>
    </div>
  );
}

function FeedFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, editable } = props;
  const displayName = brandName ?? 'Your Brand';
  const hasMediaBox = mediaNode != null || onAddMedia != null;
  const chrome =
    (platform === 'instagram'
      ? CHROME_REM.instagram
      : CHROME_REM[platform === 'linkedin' ? 'linkedin' : 'facebook']) +
    (editable ? 0 : ACTION_ROW_REM);
  const width = hasMediaBox ? frameWidth(frame.mediaAspect, chrome) : '100cqw';
  const media = <MediaBox frame={frame} mediaNode={mediaNode} onAddMedia={onAddMedia} />;
  const decoration = !editable;

  if (platform === 'instagram') {
    return (
      <FrameRoot
        platform={platform}
        kind="feed"
        width={width}
        className="overflow-hidden rounded-xl border border-border/70 bg-card"
      >
        <div className="flex h-12 items-center gap-2 px-3">
          <span className="flex size-8 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
            <Avatar
              name={brandName}
              src={props.avatarUrl}
              className="size-full border-2 border-card"
            />
          </span>
          <span className="min-w-0 truncate font-semibold">{displayName}</span>
          {decoration && (
            <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </div>
        {media}
        {decoration && (
          <div className="flex h-10 items-center gap-4 px-3" aria-hidden="true">
            <Heart className="size-5" />
            <MessageCircle className="size-5" />
            <Send className="size-5" />
            <Bookmark className="ml-auto size-5" />
          </div>
        )}
        <PostCaption
          {...props}
          noun="caption"
          lines={2}
          lead={displayName}
          className={cn('px-3 pb-3', editable && 'pt-2')}
        />
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
      <div className="flex h-14 items-center gap-2 px-3">
        <Avatar
          name={brandName}
          src={props.avatarUrl}
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
        {decoration && (
          <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>
      <PostCaption {...props} noun="post copy" lines={isLinkedIn ? 3 : 5} className="px-3 pb-3" />
      {media}
      {decoration && (
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
      )}
    </FrameRoot>
  );
}

function VerticalFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, editable } = props;
  const label = platform === 'youtube' ? 'Shorts' : platform === 'tiktok' ? null : 'Reels';
  // A Short overlays its title where a reel overlays its caption.
  const title = platform === 'youtube' ? videoTitle(props.caption, props.title) : null;
  const account = (
    <div className="mb-1 flex items-center gap-2">
      <Avatar
        name={brandName}
        src={props.avatarUrl}
        className="size-7 bg-neutral-50 text-neutral-950"
      />
      <span className="min-w-0 truncate font-semibold">{brandName ?? 'Your Brand'}</span>
    </div>
  );

  // A draft looks like the post: full-bleed, letterboxed, the caption over the media where a
  // click edits it. Only while typing does the caption drop under the media, onto the card,
  // and it is the same element both ways so the open field is never remounted.
  const typing = editable && props.captionEditing === true;
  const caption =
    title === null || editable ? (
      <div className="pointer-events-auto">
        <PostCaption
          {...props}
          noun="caption"
          lines={2}
          className={typing ? undefined : 'text-neutral-50'}
        />
      </div>
    ) : null;

  return (
    <FrameRoot
      platform={platform}
      kind="vertical"
      width={frameWidth(frame.mediaAspect, 0)}
      className="overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      <div className="relative">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={LETTERBOX}
        />
        <div className="pointer-events-none absolute inset-0 text-neutral-50">
          {mediaNode != null && <TopScrim />}
          {label && !editable && (
            <span
              aria-hidden="true"
              className="absolute left-3 top-3 text-base font-semibold drop-shadow"
            >
              {label}
            </span>
          )}
          {mediaNode != null && (
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-neutral-950/80 via-neutral-950/40 to-transparent" />
          )}
          {!editable && (
            <div
              className="absolute bottom-24 right-2 flex flex-col items-center gap-4 drop-shadow"
              aria-hidden="true"
            >
              {VERTICAL_RAIL[platform].map((Icon, index) => (
                <Icon key={index} className="size-6" />
              ))}
            </div>
          )}
        </div>
      </div>
      <div
        className={cn(
          typing
            ? 'border-t border-border/70 px-3 py-2'
            : 'pointer-events-none absolute inset-x-0 bottom-0 pb-3 pl-3 text-neutral-50',
          !typing && (editable ? 'pr-3' : 'pr-14'),
        )}
      >
        {!typing && account}
        {title !== null && (title || editable) && (
          <p className="line-clamp-2 font-semibold leading-5">{title || 'Untitled Short'}</p>
        )}
        {caption}
      </div>
    </FrameRoot>
  );
}

function StoryFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, editable, caption } = props;
  // A draft's plan says so in its own notice; a published story never had a caption.
  const captionNote = !editable && caption.trim().length > 0;

  return (
    <FrameRoot
      platform={platform}
      kind="story"
      width={frameWidth(frame.mediaAspect, captionNote ? CHROME_REM.storyNote : 0)}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/70">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={cn(!editable && LETTERBOX)}
        />
        <div className="pointer-events-none absolute inset-0 text-neutral-50">
          {mediaNode != null && <TopScrim />}
          {/* The progress bar is what makes this read as a story, so it stays while editing;
              the reply bar, heart and close are viewer affordances nobody can use here. */}
          <div
            data-story-progress
            className="absolute inset-x-2 top-2 flex gap-1"
            aria-hidden="true"
          >
            <span className="h-0.5 flex-1 rounded-full bg-neutral-50" />
          </div>
          <div className="absolute inset-x-3 top-5 flex items-center gap-2 drop-shadow">
            <Avatar
              name={brandName}
              src={props.avatarUrl}
              className="size-7 bg-neutral-50 text-neutral-950"
            />
            <span className="min-w-0 truncate font-semibold">{brandName ?? 'Your Brand'}</span>
            {props.timeLabel && <span className="shrink-0 opacity-80">{props.timeLabel}</span>}
            {!editable && <X className="ml-auto size-5 shrink-0" aria-hidden />}
          </div>
          {!editable && (
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
      {captionNote && (
        <p className="mt-2 text-center text-muted-foreground">Stories post without a caption</p>
      )}
    </FrameRoot>
  );
}

function LandscapeFrame(props: SocialPreviewProps) {
  const { platform, frame, brandName, mediaNode, onAddMedia, editable } = props;
  // The publisher sends the whole caption as the description (youtubePublisher), so the
  // description repeats the first line the title was derived from — as it does once posted.
  const title = videoTitle(props.caption, props.title);

  return (
    <FrameRoot
      platform={platform}
      kind="landscape"
      width={frameWidth(frame.mediaAspect, CHROME_REM.landscape)}
    >
      <div className="relative overflow-hidden rounded-xl">
        <MediaBox
          frame={frame}
          mediaNode={mediaNode}
          onAddMedia={onAddMedia}
          className={cn(
            '[&_img]:object-contain [&_video]:object-contain',
            !editable && 'bg-neutral-950',
          )}
        />
        {mediaNode != null && !editable && (
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
        <Avatar name={brandName} src={props.avatarUrl} className="size-8" />
        <span className="min-w-0 truncate font-semibold">{brandName ?? 'Your Brand'}</span>
        {!editable && (
          <span
            aria-hidden="true"
            className="ml-auto shrink-0 rounded-full bg-foreground px-3 py-1 font-medium text-background"
          >
            Subscribe
          </span>
        )}
      </div>
      {(editable || shownCaption(props).trim()) && (
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
