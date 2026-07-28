import { PLATFORM_CAPABILITIES, type PublishPlatform } from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

// The body builder and the format→postType mapping live in @continuum/contracts: the
// backend parses the body it produces, and the publish bench drives it directly. Keeping
// a second copy here is what let the planner's case-sensitive "Carousel" check diverge
// from the backend's case-insensitive one and publish carousels as single images.
export {
  buildFullCaption,
  buildPublishBody,
  inferPostType,
  type PublishRequestBody,
  resolvePublishFormat,
} from '@continuum/contracts';

const PUBLISHABLE_PLATFORMS = Object.keys(PLATFORM_CAPABILITIES) as PublishPlatform[];

/** The platform a draft publishes to: its first tagged platform we can actually publish to. */
export function inferPublishPlatform(draft: OrganicCalendarDraft): PublishPlatform | null {
  return PUBLISHABLE_PLATFORMS.find((platform) => draft.platforms.includes(platform)) ?? null;
}

/**
 * One publishable row of a draft group: the backend draft id the publish routes key on,
 * plus the platform that row goes out on.
 *
 * A group is N sibling rows minted by fan-out, each publishing through the UNCHANGED
 * single-platform path — so a "group publish" is N single publishes keyed by row id, not
 * one multi-platform publish.
 */
export type GroupPublishTarget = {
  draftId: string;
  platform: PublishPlatform;
};

/**
 * The rows a "publish this group" action should send, in canonical platform order.
 *
 * Rules, each of which has a failure mode behind it:
 * - Members with no `backendDraftId` are dropped — an unpersisted row has no id for the
 *   publish route to claim.
 * - Members on a platform we cannot publish to are dropped rather than sent and rejected.
 * - Already-published members are dropped: a group publish must never re-post a live post.
 * - Duplicate platforms collapse to the first member, so a malformed group cannot double-post.
 *
 * An ungrouped draft (no `groupMembers`) resolves to its own single target, which is what
 * lets one code path serve both cases.
 */
export function resolveGroupPublishTargets(draft: OrganicCalendarDraft): GroupPublishTarget[] {
  const members = draft.groupMembers ?? [];

  if (members.length === 0) {
    const platform = inferPublishPlatform(draft);
    if (!platform || !draft.backendDraftId) return [];
    if (draft.status === 'published') return [];
    return [{ draftId: draft.backendDraftId, platform }];
  }

  const byPlatform = new Map<PublishPlatform, GroupPublishTarget>();
  for (const member of members) {
    if (!member.backendDraftId) continue;
    if (member.status === 'published') continue;
    const platform = PUBLISHABLE_PLATFORMS.find((candidate) => candidate === member.platform);
    if (!platform) continue;
    if (byPlatform.has(platform)) continue;
    byPlatform.set(platform, { draftId: member.backendDraftId, platform });
  }

  return PUBLISHABLE_PLATFORMS.flatMap((platform) => {
    const target = byPlatform.get(platform);
    return target ? [target] : [];
  });
}

// ── Shared publish-stream plumbing ──────────────────────────────────────────
// Single-draft publish (usePublishDraft) and group publish (usePublishGroup) consume the
// SAME backend SSE stream and the same failure codes. These live here so the two hooks
// cannot drift into two parsers and two copies of the user-facing error copy.

const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export function publishPlatformLabel(platform: PublishPlatform | undefined | null): string {
  return platform ? PLATFORM_LABELS[platform] : 'the platform';
}

/**
 * User-facing copy for the precise publish failure codes the backend maps from the
 * provider's error code + the staging gate.
 */
export const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  token_expired:
    'PLEASE RECONNECT: The connection for the selected Instagram account expired or was revoked. Reconnect that account in Integrations, then try again. We always post to the account you selected — never a different one on the brand.',
  rate_limited:
    'The platform is temporarily rate-limiting requests. Wait a few minutes and try again.',
  media_processing_error: "The platform couldn't process this media. Check the file and try again.",
  media_staging_failed:
    "We couldn't prepare your media for publishing. Re-attach the creative and try again.",
  media_upload_failed: "We couldn't upload your media to the platform. Try again in a moment.",
  unsupported_format: "This post format isn't supported on that platform.",
};

export function describePublishError(code: string, fallback: string): string {
  return PUBLISH_ERROR_MESSAGES[code] ?? fallback;
}

/** Yields one `{ event, data }` per SSE block off a publish/bulk-publish response body. */
export async function* parseSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      let eventName = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        else if (line.startsWith('data: ')) data = line.slice(6).trim();
      }
      if (data) yield { event: eventName, data };
    }
  }
}
