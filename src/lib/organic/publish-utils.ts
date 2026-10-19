import {
  PLATFORM_CAPABILITIES,
  PUBLISH_PLATFORM_LABELS,
  type PublishAccountCandidate,
  type PublishPlatform,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
// draftReadiness reads inferPublishPlatform from here: a cycle that only resolves at call time.
import { evaluateDraftReadiness } from './draftReadiness';
import { groupMemberDrafts } from './groupDraft';
import { POST_PLATFORMS } from './postPlatforms';

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
  const row = draft.groupMembers?.find((member) => member.backendDraftId === draft.backendDraftId);
  if (row) return PUBLISHABLE_PLATFORMS.find((platform) => platform === row.platform) ?? null;
  return PUBLISHABLE_PLATFORMS.find((platform) => draft.platforms.includes(platform)) ?? null;
}

/**
 * The account a new post on `platform` goes to before anyone picks one: the brand's default,
 * else its only usable account. Null when there is a choice to make, or nothing connected.
 */
export function defaultPublishAccount<T extends PublishAccountCandidate>(
  accounts: readonly T[],
  platform: PublishPlatform,
): T | null {
  const usable = accounts.filter(
    (account) => account.platform === platform && !account.needsReauth,
  );
  return (
    usable.find((account) => account.isDefault) ?? (usable.length === 1 ? usable[0] : null) ?? null
  );
}

/** The members a publish of `card` sends: every row of its group not already live. */
export function unpublishedMembers(card: OrganicCalendarDraft): OrganicCalendarDraft[] {
  return groupMemberDrafts(card).filter((draft) => draft.status !== 'published');
}

/**
 * Why `card` cannot be published, or null. Every member is judged on its OWN platform with its
 * own content — the card's row carries the group's platform union, and judging TikTok against
 * the Instagram row's image refused a group whose TikTok row had its video.
 */
export function groupPublishBlocker(card: OrganicCalendarDraft): string | null {
  const drafts = unpublishedMembers(card);
  if (drafts.length === 0) return 'Every platform of this post is already live.';
  for (const draft of drafts) {
    const platform = inferPublishPlatform(draft);
    if (!platform) return 'This draft has no platform we can publish to.';
    const readiness = evaluateDraftReadiness({ ...draft, platforms: [platform] });
    if (readiness.ready) continue;
    const reason = readiness.reason ?? 'This post is not ready to publish yet.';
    return drafts.length > 1 ? `${PUBLISH_PLATFORM_LABELS[platform]}: ${reason}` : reason;
  }
  return null;
}

// ── Shared publish-stream plumbing ──────────────────────────────────────────
// The publish SSE frames and their failure codes are parsed here rather than in the hook, so the
// stream parser and the user-facing error copy exist once.

export function publishPlatformLabel(platform: PublishPlatform | undefined | null): string {
  return platform ? POST_PLATFORMS[platform].label : 'the platform';
}

/**
 * User-facing copy for the precise publish failure codes the backend maps from the
 * provider's error code + the staging gate.
 */
export const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  // Platform-neutral: this copy is shared by Instagram, Facebook and LinkedIn publishes, and
  // naming Instagram sent Facebook users to reconnect the wrong integration.
  token_expired:
    'PLEASE RECONNECT: The connection for the selected account expired or was revoked. Reconnect that account in Integrations, then try again. We always post to the account you selected — never a different one on the brand.',
  rate_limited:
    'The platform is temporarily rate-limiting requests. Wait a few minutes and try again.',
  media_processing_error: "The platform couldn't process this media. Check the file and try again.",
  media_staging_failed:
    "We couldn't prepare your media for publishing. Re-attach the creative and try again.",
  media_upload_failed: "We couldn't upload your media to the platform. Try again in a moment.",
  unsupported_format: "This post format isn't supported on that platform.",
  // X is pay-per-use: every post is paid from the brand's prepaid X API credits.
  credits_exhausted:
    'This brand is out of X API credits. Buy X credits in Billing (or turn on X auto-billing), then publish again.',
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
