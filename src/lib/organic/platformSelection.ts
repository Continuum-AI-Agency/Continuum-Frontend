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

type PlatformUiReason =
  | { code: 'connect' | 'reconnect' }
  | { code: 'format'; format: PublishFormat }
  | { code: 'caption'; length: number; max: number };

export type PlatformVerdict = Pick<PublishTargetVerdict, 'available' | 'reason'> & {
  /** Presentation metadata derived from the canonical verdict, without parsing English prose. */
  uiReason?: PlatformUiReason;
};

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
    verdicts.map(
      ({ platform, available, reason, connected, needsReauth, formatSupported, caption }) => [
        platform,
        input.selected.includes(platform)
          ? { available: true, reason: null }
          : {
              available,
              reason,
              ...(!available
                ? {
                    uiReason: !connected
                      ? { code: needsReauth ? 'reconnect' : 'connect' }
                      : !formatSupported
                        ? { code: 'format', format: matchPublishFormat(input.format) ?? 'POST' }
                        : { code: 'caption', length: caption.length, max: caption.maxLength },
                  }
                : {}),
            },
      ],
    ),
  ) as Record<PublishPlatform, PlatformVerdict>;
}
