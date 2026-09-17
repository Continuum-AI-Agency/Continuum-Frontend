'use client';

/**
 * The shared post preview every organic platform renders through.
 *
 * `POST_PLATFORMS[platform].frame` picks the chrome: the phone frame is the Instagram preview
 * that already shipped, and TikTok and YouTube reuse it; Facebook renders the feed card and
 * LinkedIn the desktop card. The frame record is total over `PostPreviewFrame`, so there is no
 * "coming soon" fallthrough left for a publishable platform to land in — that fallthrough is
 * what dropped a TikTok draft's media, upload zone and library picker on the floor.
 */
import type { PublishPlatform } from '@continuum/contracts';
import { Hash, Sparkles } from 'lucide-react';
import type * as React from 'react';
import { Iphone } from '@/components/ui/iphone';
import { flattenHashtags } from '@/lib/organic/hashtags';
import { POST_PLATFORMS, type PostPreviewFrame } from '@/lib/organic/postPlatforms';
import { EditableCaption } from './EditableCaption';
import type { OrganicCalendarDraft } from './types';

// Scale the phone mockup as a readable post preview rather than a thumbnail. CSS zoom
// keeps the bezel, media, and type in proportion while preserving the preview's
// existing scroll behavior in the panel.
const PHONE_PREVIEW_SCALE = 0.72;

export type SocialPreviewProps = {
  draft: OrganicCalendarDraft;
  onCaptionChange: (value: string) => void;
  brandName?: string;
  platform: PublishPlatform;
  // The media zone, pre-wired with its MediaSelectPopover by the parent.
  mediaNode: React.ReactNode;
  // View↔edit mode. When false the platform frame reads as a locked "final look":
  // caption is a static readout and the hover edit affordances are suppressed.
  isEditing: boolean;
  // Hover-revealed edit affordances — open the existing inline editors.
  onEditCreativeDirection?: () => void;
  onEditHashtags?: () => void;
};

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
    'flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1 text-2xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
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

/** Flattened, #-prefixed hashtag list shown under the caption — as on a real post. */
function HashtagDisplayBlock({ hashtags }: { hashtags: OrganicCalendarDraft['hashtags'] }) {
  const tags = flattenHashtags(hashtags);
  if (tags.length === 0) return null;
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs leading-relaxed text-primary/80">
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </p>
  );
}

function PhonePostPreview({
  draft,
  onCaptionChange,
  brandName,
  platform,
  mediaNode,
  isEditing,
  onEditCreativeDirection,
  onEditHashtags,
}: SocialPreviewProps) {
  const displayName = brandName ?? 'Your Brand';
  const initials = brandInitials(brandName);

  return (
    <div className="group/preview relative w-full overflow-hidden bg-card text-foreground">
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={onEditCreativeDirection}
          onEditHashtags={onEditHashtags}
        />
      )}
      <div className="flex items-center p-3 border-b border-border/70">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary/70 via-accent/70 to-secondary/70 p-[2px] flex items-center justify-center text-2xs font-bold text-foreground">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-3xs text-muted-foreground">
                {initials}
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">{displayName}</span>
            <span className="mt-1 text-2xs text-muted-foreground">Sponsored</span>
          </div>
        </div>
      </div>

      {mediaNode}

      {/* Engagement bar */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-4 text-muted-foreground/40">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 cursor-default"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 cursor-default"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 cursor-default"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </div>
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 cursor-default text-muted-foreground/40"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <div className="px-3 pb-3 pt-2">
        <p className="mb-1 text-xs font-bold">{displayName}</p>
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          editable={isEditing}
          ariaLabel={`${POST_PLATFORMS[platform].label} caption`}
          placeholder="Write your caption…"
          className="text-xs leading-relaxed"
          editClassName="text-xs"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>
    </div>
  );
}

function FeedPostPreview({
  draft,
  onCaptionChange,
  brandName,
  platform,
  mediaNode,
  isEditing,
  onEditCreativeDirection,
  onEditHashtags,
}: SocialPreviewProps) {
  const displayName = brandName ?? 'Your Brand';

  return (
    <div className="group/preview relative w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={onEditCreativeDirection}
          onEditHashtags={onEditHashtags}
        />
      )}
      <div className="p-3 flex items-center border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
            <p className="text-xs text-muted-foreground">Sponsored · 1h</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          editable={isEditing}
          ariaLabel={`${POST_PLATFORMS[platform].label} post copy`}
          placeholder="Write your post copy…"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>

      {mediaNode}

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-sm font-medium text-muted-foreground/40 cursor-default">
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
          </svg>
          Like
        </span>
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comment
        </span>
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </span>
      </div>
    </div>
  );
}

function DesktopPostPreview({
  draft,
  onCaptionChange,
  brandName,
  platform,
  mediaNode,
  isEditing,
  onEditCreativeDirection,
  onEditHashtags,
}: SocialPreviewProps) {
  const displayName = brandName ?? 'Your Brand';

  return (
    <div className="group/preview relative w-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg text-foreground">
      {isEditing && (
        <PreviewHoverActions
          onEditCreativeDirection={onEditCreativeDirection}
          onEditHashtags={onEditHashtags}
        />
      )}
      <div className="p-3 flex items-center justify-between border-b border-border/70">
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded border border-primary/30 bg-primary/15 text-lg font-bold text-primary">
            {brandInitials(brandName)}
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight">{displayName}</p>
            <p className="text-xs text-muted-foreground">12,450 followers</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <EditableCaption
          value={draft.captionPreview}
          onChange={onCaptionChange}
          platform={platform}
          editable={isEditing}
          ariaLabel={`${POST_PLATFORMS[platform].label} post copy`}
          placeholder="Write your post copy…"
        />
        <HashtagDisplayBlock hashtags={draft.hashtags} />
      </div>

      {mediaNode}

      {/* Engagement bar */}
      <div className="flex items-center gap-4 border-t border-border/40 px-4 py-2 text-sm font-medium text-muted-foreground/40 cursor-default">
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
          </svg>
          Like
        </span>
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comment
        </span>
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          Repost
        </span>
        <span className="flex items-center gap-1">
          {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative social-preview chrome */}
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Send
        </span>
      </div>
    </div>
  );
}

const FRAMES: Record<PostPreviewFrame, (props: SocialPreviewProps) => React.ReactNode> = {
  phone: (props) => (
    <div className="flex justify-center">
      <div className="w-[433px] max-w-full" style={{ zoom: PHONE_PREVIEW_SCALE }}>
        <Iphone>
          <PhonePostPreview {...props} />
        </Iphone>
      </div>
    </div>
  ),
  feed: FeedPostPreview,
  desktop: DesktopPostPreview,
};

export function SocialPostFrame(props: SocialPreviewProps) {
  const Frame = FRAMES[POST_PLATFORMS[props.platform].frame];
  return <Frame {...props} />;
}
