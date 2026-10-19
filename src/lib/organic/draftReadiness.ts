// Readiness for an organic calendar draft: the shared publish gate (`checkPublishability`)
// over the shared publish plan, so the card, the preview, publish-now and the backend's
// approve gate give one answer. Cards hold no account list, so the account is left to the
// preview, which loads one (`usePublishPlan`) and to the server's own gate.

import {
  checkPublishability,
  type PublishPlanIssue,
  resolvePublishPlan,
} from '@continuum/contracts';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { resolveFrameDraft } from './groupDraft';
import { isPostPlatform } from './postPlatforms';
import { inferPublishPlatform } from './publish-utils';
import { publishPlanDraftFromCalendarDraft } from './publishPlan';

export type DraftReadiness = {
  ready: boolean;
  blockers: PublishPlanIssue[];
  reason: string | null;
};

// A multi-platform post is one row per platform, and each row meets its own platform's gate
// with its own caption and media — so the card is ready only when every member is.
export function evaluateDraftReadiness(draft: OrganicCalendarDraft): DraftReadiness {
  const tagged = draft.platforms.filter(isPostPlatform);
  // ponytail: a draft on no publishable platform (Threads) is judged as Instagram; its
  // publish buttons are hidden anyway.
  const platforms = tagged.length > 0 ? tagged : [inferPublishPlatform(draft) ?? 'instagram'];
  const seen = new Set<string>();
  const blockers = platforms.flatMap((platform) =>
    checkPublishability(
      resolvePublishPlan({
        draft: publishPlanDraftFromCalendarDraft(resolveFrameDraft(draft, platform)),
        platform,
        account: { boundAccountId: null, accounts: null },
        publishOptions: null,
        mediaGenerated: null,
      }),
    ).blockers.filter((issue) => {
      const key = `${issue.reason}:${issue.fix}`;
      if (issue.reason === 'account_missing' || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return {
    ready: blockers.length === 0,
    blockers,
    reason: blockers.length === 0 ? null : blockers.map((issue) => issue.message).join('; '),
  };
}
