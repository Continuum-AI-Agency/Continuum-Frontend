// Which button a decision card carries. The reading's mode decides the verbs; the card decides
// which of them it can honour. Every control maps to something the product already does: the
// platform card's approval dialog (dry run, then the write), the recommendation's status, the
// clipboard, the create flow, or a link to where the fix is made. A verb with no wiring comes
// back `unavailable`, with the reason its tooltip says, so the card never shows a success that
// did not happen.

import type { AdAccountMode } from '@continuum/contracts';
import { bareAccountId } from '@/lib/paid-media/accountId';
import {
  type CardWrite,
  cardActionAvailability,
  cardActionLabel,
  cardActionUnavailableNote,
  cardWriteOf,
  type PlatformCardAction,
} from '../../../platformCards/platformCardActionModel';
import {
  GOOGLE_ADS_CAMPAIGNS_HREF,
  googleAdsCampaignHref,
  googleDeliveryHref,
  isReadOnly,
} from '../../../platformCards/platformCardModel';
import type { BoardPlatform } from '../../types';
import type { DecisionCard } from './decisionsModel';

export type DecisionControl =
  /** The engine's write, approved through the platform card's own dialog. */
  | { kind: 'approve'; write: CardWrite; target: PlatformCardAction }
  /** The autopilot applies it within the portfolio's limits. */
  | { kind: 'queued' }
  /** Fixed in the platform: the card's steps, then the platform itself. */
  | { kind: 'fix'; label: string; href: string; primary: boolean }
  | { kind: 'copy'; text: string }
  | { kind: 'create' }
  /** A write that waits for the account's fix. */
  | { kind: 'locked'; label: string; reason: string }
  | { kind: 'unavailable'; label: string; reason: string };

export type DismissControl =
  | { kind: 'dismiss'; recommendationId: string }
  | { kind: 'unavailable'; reason: string };

export type ControlContext = {
  mode: AdAccountMode;
  platform: BoardPlatform;
  adAccountId: string | null;
  /** The first fix on the account: in fix mode every other write waits for it. */
  firstFix: string | null;
};

export const FIX_LABEL: Record<BoardPlatform, string> = {
  meta: 'Fix in Meta',
  google_ads: 'Fix in Google Ads',
};

export const OPEN_PLATFORM_LABEL: Record<BoardPlatform, string> = {
  meta: 'Open in Meta Ads Manager',
  google_ads: 'Open in Google Ads',
};

export const QUEUED_NOTE = 'Acts on its own, within your limits.';

export const CLIENT_CHECKLIST_REASON =
  "The client's checklist comes from the Optimizer's cycle. Adding a card to it from here is not wired yet.";

export const NOTHING_TO_APPLY_REASON =
  'This finding carries no change Continuum can apply from here.';

export const READ_FINDING_DISMISS_REASON =
  'The nightly account read writes this finding again every night, so it cannot be dismissed on its own yet.';

export const WAITS_FOR_FIX_REASON = 'Waits until the account is fixed.';

const META_ADS_MANAGER_HREF = 'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

export function metaAdsManagerHref(adAccountId: string | null): string {
  if (!adAccountId) return META_ADS_MANAGER_HREF;
  return `${META_ADS_MANAGER_HREF}?act=${encodeURIComponent(bareAccountId(adAccountId))}`;
}

/** Where the fix is made: the policy manager or the campaign a Google card names, the
 *  campaigns list otherwise; Meta's Ads Manager for the account. */
export function fixHrefOf(
  card: DecisionCard,
  platform: BoardPlatform,
  adAccountId: string | null,
): string {
  if (platform === 'meta') return metaAdsManagerHref(adAccountId);
  const platformCard = card.platformCard;
  if (platformCard?.variant === 'google_delivery_issue') {
    return googleDeliveryHref(platformCard.disapproved_ads);
  }
  if (platformCard?.variant === 'google_video_readonly') {
    return googleAdsCampaignHref(platformCard.campaign_id);
  }
  return GOOGLE_ADS_CAMPAIGNS_HREF;
}

/** The engine's write, when the card carries one the service would accept. */
export function readyWriteOf(
  card: DecisionCard,
): { write: CardWrite; target: PlatformCardAction } | null {
  if (card.platformCard == null || card.action == null) return null;
  const write = cardWriteOf(card.action);
  if (write == null) return null;
  return cardActionAvailability(card.platformCard, card.action) === 'ready'
    ? { write, target: card.action }
    : null;
}

/** Why a write the card carries cannot run: TikTok is not connected, or writes to the platform
 *  are switched off for the portfolio. Null when there is no such write. */
function blockedWriteReason(card: DecisionCard): string | null {
  if (card.platformCard == null || card.action == null) return null;
  const write = cardWriteOf(card.action);
  if (write == null) return null;
  const availability = cardActionAvailability(card.platformCard, card.action);
  if (availability !== 'tiktok_not_connected' && availability !== 'apply_disabled') return null;
  return cardActionUnavailableNote(availability, write);
}

function fixControl(card: DecisionCard, context: ControlContext): DecisionControl {
  return {
    kind: 'fix',
    label: FIX_LABEL[context.platform],
    href: fixHrefOf(card, context.platform, context.adAccountId),
    primary: card.group === 'fix',
  };
}

/** Approve and operate: the write when there is one, the autopilot's queue when it acts alone,
 *  the platform for a fix or a read-only card, and an honest "nothing to apply" otherwise. */
function writeControl(card: DecisionCard, context: ControlContext): DecisionControl {
  if (context.mode === 'operate' && card.autopilot) return { kind: 'queued' };
  const ready = readyWriteOf(card);
  if (ready) return { kind: 'approve', ...ready };
  const blocked = blockedWriteReason(card);
  if (blocked) return { kind: 'unavailable', label: 'Approve', reason: blocked };
  if (card.group === 'fix' || (card.platformCard != null && isReadOnly(card.platformCard))) {
    return fixControl(card, context);
  }
  return { kind: 'unavailable', label: 'Approve', reason: NOTHING_TO_APPLY_REASON };
}

export function controlOf(card: DecisionCard, context: ControlContext): DecisionControl {
  switch (context.mode) {
    case 'setup':
      return { kind: 'create' };
    case 'recommend':
      return card.copyText
        ? { kind: 'copy', text: card.copyText }
        : {
            kind: 'unavailable',
            label: 'Add to client checklist',
            reason: CLIENT_CHECKLIST_REASON,
          };
    case 'fix': {
      const ready = readyWriteOf(card);
      if (ready && card.group !== 'fix') {
        return {
          kind: 'locked',
          label: cardActionLabel(ready.write),
          reason: context.firstFix
            ? `Waits for the fix first: ${context.firstFix}`
            : WAITS_FOR_FIX_REASON,
        };
      }
      return fixControl(card, context);
    }
    case 'operate':
    case 'approve':
      return writeControl(card, context);
  }
}

/** Dismiss sits beside Approve. It records the recommendation as rejected, as the Actions queue
 *  does; a read finding has no row to record it on. A guard is read, never dismissed. */
export function dismissOf(card: DecisionCard, mode: AdAccountMode): DismissControl | null {
  if (mode !== 'approve' || card.guard) return null;
  return card.recommendationId
    ? { kind: 'dismiss', recommendationId: card.recommendationId }
    : { kind: 'unavailable', reason: READ_FINDING_DISMISS_REASON };
}
