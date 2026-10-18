// Which platforms the selector may tick for a post — a thin adapter over the contracts verdict
// (`publishTargetVerdicts`: connected, format supported, caption fits), plus the selector's own
// rule: a platform already selected stays available, so it can be unticked (`group/remove` takes
// any member out, the post's own row included).

import {
  type HashtagTiers,
  matchPublishFormat,
  type PublishAccountCandidate,
  type PublishFormat,
  type PublishPlatform,
  type PublishTargetVerdict,
  publishTargetVerdicts,
} from '@continuum/contracts';

export type PlatformVerdict = Pick<PublishTargetVerdict, 'available' | 'reason'>;

export function platformVerdicts(input: {
  /** A `PublishFormat` or any stored format string ('Reel', 'carousel post', …). */
  format: PublishFormat | string | null | undefined;
  caption: string | null | undefined;
  /** Counted with the caption (the limit is the caption as sent). */
  hashtags?: HashtagTiers | string[] | null;
  accounts: ReadonlyArray<Pick<PublishAccountCandidate, 'platform' | 'needsReauth'>>;
  selected: readonly PublishPlatform[];
}): Record<PublishPlatform, PlatformVerdict> {
  const verdicts = publishTargetVerdicts({
    format: matchPublishFormat(input.format) ?? 'POST',
    caption: input.caption ?? null,
    hashtags: input.hashtags ?? null,
    accounts: input.accounts,
  });
  return Object.fromEntries(
    verdicts.map(({ platform, available, reason }) => [
      platform,
      input.selected.includes(platform) ? { available: true, reason: null } : { available, reason },
    ]),
  ) as Record<PublishPlatform, PlatformVerdict>;
}
