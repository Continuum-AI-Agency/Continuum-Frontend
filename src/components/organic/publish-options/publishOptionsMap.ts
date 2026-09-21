import type {
  PublishOptions,
  PublishOptionsByPlatform,
  PublishPlatform,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

/**
 * The saved map with `platform`'s block replaced. Undefined fields are dropped and an
 * emptied block removes the platform key, so "no choice" is stored as nothing at all
 * rather than as a `{}` the next reader has to interpret.
 */
export function withPlatformOptions(
  saved: PublishOptionsByPlatform | undefined,
  platform: PublishPlatform,
  block: PublishOptions,
): PublishOptionsByPlatform {
  const cleaned = Object.fromEntries(
    Object.entries(block).filter(([, value]) => value !== undefined),
  ) as PublishOptions;
  const next: PublishOptionsByPlatform = { ...saved };
  if (Object.keys(cleaned).length === 0) delete next[platform];
  else next[platform] = cleaned;
  return next;
}

/**
 * True when this draft will publish its GENERATED video — the headless reel or HyperFrame
 * record, not media a person attached. The Backend makes the final call from the library
 * row's `source` (mediaProvenance.ts); this is the part the browser can know without that
 * read, so the Publish tab can show the AI label as locked on where it certainly applies.
 */
export function publishesGeneratedVideo(draft: OrganicCalendarDraft): boolean {
  if ((draft.publishingAssets ?? []).some((asset) => asset.kind === 'video')) return false;
  const suggestion = draft.mediaSuggestion;
  if (!suggestion || suggestion.mediaStatus === 'user_supplied') return false;
  return Boolean(suggestion.reel?.generated || suggestion.hyperframe);
}

export function formatOffset(offsetMs: number): string {
  const totalSeconds = offsetMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${seconds}`;
}
