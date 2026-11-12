'use client';

import { type useTranslations, useTranslations as useUiTranslations } from 'next-intl';

type ForgeText = ReturnType<typeof useTranslations<'forge'>>;

import { type ApiRenderJob, isBucketOnlyRenderFile } from '@continuum/contracts';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Where one render went: Library · Slack #channel · Meta account › campaign › ad set › ad, each with its own
// state. The Library is always first because every render lands there; Slack and Meta appear only
// when the job asked for them. Meta never reads as "published" until a receipt says so — before
// that it is held for approval, because nothing writes to Meta until a person approves.

type Tone = 'muted' | 'warning' | 'success' | 'destructive';

const SLACK_TONE: Record<NonNullable<ApiRenderJob['slackDelivery']>['status'], Tone> = {
  posted: 'success',
  pending: 'muted',
  error: 'destructive',
  skipped: 'warning',
};

// A Meta receipt's `reason` codes in words. `delivery_requested` is the normal pending claim and
// has no sentence of its own; an unmapped code is shown as written rather than hidden.
const DELIVERY_REASON_COPY: Record<string, string> = {
  delivery_bridge_unconfigured: 'Ad delivery isn’t set up for this workspace yet.',
  binding_unresolved: 'The workspace this render was made in no longer exists.',
};

/** A delivery receipt's reason in words, or null when it needs none. */
export function deliveryReasonText(
  reason: string | null | undefined,
  translate?: ForgeText,
): string | null {
  if (!reason || reason === 'delivery_requested') return null;
  if (translate)
    return translate(
      reason === 'delivery_bridge_unconfigured'
        ? 'deliveryBridgeUnconfigured'
        : reason === 'binding_unresolved'
          ? 'deliveryBindingUnresolved'
          : 'deliveryUnknownReason',
    );
  return DELIVERY_REASON_COPY[reason] ?? reason;
}

/** `render_approvals.status` in words, with the tone its badge carries. */
export function approvalState(
  job: ApiRenderJob,
  translate?: ForgeText,
): { text: string; tone: Tone } | null {
  if (!job.deliveryTarget) return null;
  const receipt = job.delivery[0];
  if (receipt?.status === 'published')
    return { text: translate?.('deliveryPublished') ?? 'published', tone: 'success' };
  if (receipt?.status === 'error')
    return { text: translate?.('deliveryFailed') ?? 'delivery failed', tone: 'destructive' };
  // A claim the bridge never picked up is not waiting on a person: say so, never "held".
  if (receipt?.status === 'pending' && receipt.reason === 'delivery_bridge_unconfigured') {
    return { text: translate?.('deliveryNotSetUp') ?? 'delivery not set up', tone: 'warning' };
  }
  const status = job.approval?.status;
  switch (status) {
    case 'pending':
      return {
        text: translate?.('deliveryAwaitingApproval') ?? 'awaiting approval',
        tone: 'warning',
      };
    case 'previewed':
      return { text: translate?.('deliveryPreviewed') ?? 'previewed', tone: 'warning' };
    // Decided; the plugin's outcome has not landed on the row yet.
    case 'approved':
      return {
        text: translate?.('deliveryApprovedPublishing') ?? 'approved · publishing…',
        tone: 'success',
      };
    case 'published':
      return { text: translate?.('deliveryPublished') ?? 'published', tone: 'success' };
    case 'rejected':
      return { text: translate?.('deliveryRejected') ?? 'rejected', tone: 'destructive' };
    case 'failed':
    case 'expired':
      return {
        text:
          translate?.(status === 'failed' ? 'deliveryApprovalFailed' : 'deliveryExpired') ?? status,
        tone: 'destructive',
      };
    case undefined:
      return { text: translate?.('deliveryHeld') ?? 'held for approval', tone: 'muted' };
    default:
      return { text: status, tone: 'muted' };
  }
}

/** The delivery words a search should find: channel, ad account, campaign, ad set, ad. */
export function deliverySearchText(job: ApiRenderJob): string {
  const target = job.deliveryTarget;
  return [
    job.slackDelivery?.channelName,
    target?.adAccountName ?? target?.adAccountId,
    target?.campaignName,
    target?.adsetName,
    target?.action === 'replace' ? (target.adName ?? target.adId) : null,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * `wrap` is for a view with room: every name in full, across as many lines as it takes. Without it
 * the chain fits a dense grid row, and a truncated name is in the tooltip.
 */
export function DeliveryChain({ job, wrap = false }: { job: ApiRenderJob; wrap?: boolean }) {
  const translateUi = useUiTranslations('forge');

  // Masters stay in the render bucket, so only the other files are ever saved to the Library.
  const libraryBound = job.outputs.filter((output) => !isBucketOnlyRenderFile(output.fileName));
  const bucketOnly = job.outputs.length > 0 && libraryBound.length === 0;
  const saved = libraryBound.some((output) => output.assetId);
  const slack = job.slackDelivery;
  const target = job.deliveryTarget;
  const approval = approvalState(job, translateUi);
  const path = target
    ? `Meta › ${target.adAccountName ?? target.adAccountId} › ${target.campaignName ?? target.campaignId} › ${target.adsetName ?? target.adsetId}`
    : '';
  const ad =
    target?.action === 'replace'
      ? (target.adName ?? target.adId)
      : translateUi('deliveryNewPausedAd');
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5',
        !wrap && 'max-w-[28rem]',
      )}
    >
      {bucketOnly ? (
        <span title={translateUi('masters_stay_in_the_render_bucket_a_8016fd98')}>
          {' '}
          {translateUi('render_bucket_bf540934')}{' '}
        </span>
      ) : (
        <span
          className={saved ? 'inline-flex items-center gap-0.5' : 'text-muted-foreground'}
          title={
            saved
              ? translateUi('saved_to_the_library_d3e7863d')
              : translateUi('not_in_the_library_yet_7e14e54c')
          }
        >
          {' '}
          {translateUi('library_dc20b3d5')}{' '}
          {saved ? (
            <Check className="size-3 text-emerald-600" aria-label={translateUi('saved_d81c55f4')} />
          ) : null}
        </span>
      )}
      {slack ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1">
            #{slack.channelName}
            <Badge
              variant={SLACK_TONE[slack.status]}
              title={deliveryReasonText(slack.reason, translateUi) ?? undefined}
            >
              {translateUi(SLACK_STATUS_KEYS[slack.status])}
            </Badge>
          </span>
        </>
      ) : null}
      {target && approval ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span
            className={cn(
              'inline-flex min-w-0 items-center gap-1',
              wrap && 'flex-wrap whitespace-normal break-words',
            )}
            title={
              wrap
                ? translateUi('meta_ad_account_value0_b3e8b0b1', {
                    value0: String(target.adAccountId),
                  })
                : translateUi('value0_value1_ad_account_value2_a0628d94', {
                    value0: String(path),
                    value1: String(ad),
                    value2: String(target.adAccountId),
                  })
            }
          >
            <span className={cn('text-muted-foreground', !wrap && 'truncate')}>
              {path}
              {target.action === 'replace' ? ' ›' : ''}
            </span>
            <span className={cn(!wrap && 'truncate')}>{ad}</span>
            <Badge
              variant={approval.tone}
              title={deliveryReasonText(job.delivery[0]?.reason, translateUi) ?? undefined}
            >
              {approval.text}
            </Badge>
          </span>
        </>
      ) : null}
    </span>
  );
}

const SLACK_STATUS_KEYS = {
  posted: 'slackPosted',
  pending: 'slackPending',
  error: 'slackError',
  skipped: 'slackSkipped',
} as const;
