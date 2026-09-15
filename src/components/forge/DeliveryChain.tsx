'use client';

import type { ApiRenderJob } from '@continuum/contracts';
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
export function deliveryReasonText(reason: string | null | undefined): string | null {
  if (!reason || reason === 'delivery_requested') return null;
  return DELIVERY_REASON_COPY[reason] ?? reason;
}

/** `render_approvals.status` in words, with the tone its badge carries. */
export function approvalState(job: ApiRenderJob): { text: string; tone: Tone } | null {
  if (!job.deliveryTarget) return null;
  const receipt = job.delivery[0];
  if (receipt?.status === 'published') return { text: 'published', tone: 'success' };
  if (receipt?.status === 'error') return { text: 'delivery failed', tone: 'destructive' };
  // A claim the bridge never picked up is not waiting on a person: say so, never "held".
  if (receipt?.status === 'pending' && receipt.reason === 'delivery_bridge_unconfigured') {
    return { text: 'delivery not set up', tone: 'warning' };
  }
  const status = job.approval?.status;
  switch (status) {
    case 'pending':
      return { text: 'awaiting approval', tone: 'warning' };
    case 'previewed':
      return { text: 'previewed', tone: 'warning' };
    // Decided; the plugin's outcome has not landed on the row yet.
    case 'approved':
      return { text: 'approved · publishing…', tone: 'success' };
    case 'published':
      return { text: 'published', tone: 'success' };
    case 'rejected':
      return { text: 'rejected', tone: 'destructive' };
    case 'failed':
    case 'expired':
      return { text: status, tone: 'destructive' };
    case undefined:
      return { text: 'held for approval', tone: 'muted' };
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
  const saved = job.outputs.some((output) => output.assetId);
  const slack = job.slackDelivery;
  const target = job.deliveryTarget;
  const approval = approvalState(job);
  const path = target
    ? `Meta › ${target.adAccountName ?? target.adAccountId} › ${target.campaignName ?? target.campaignId} › ${target.adsetName ?? target.adsetId}`
    : '';
  const ad = target?.action === 'replace' ? (target.adName ?? target.adId) : 'new paused ad';
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5',
        !wrap && 'max-w-[28rem]',
      )}
    >
      <span
        className={saved ? 'inline-flex items-center gap-0.5' : 'text-muted-foreground'}
        title={saved ? 'Saved to the Library' : 'Not in the Library yet'}
      >
        Library
        {saved ? <Check className="size-3 text-emerald-600" aria-label="saved" /> : null}
      </span>
      {slack ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1">
            #{slack.channelName}
            <Badge variant={SLACK_TONE[slack.status]} title={slack.reason ?? undefined}>
              {slack.status}
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
                ? `Meta ad account ${target.adAccountId}`
                : `${path} › ${ad} (ad account ${target.adAccountId})`
            }
          >
            <span className={cn('text-muted-foreground', !wrap && 'truncate')}>
              {path}
              {target.action === 'replace' ? ' ›' : ''}
            </span>
            <span className={cn(!wrap && 'truncate')}>{ad}</span>
            <Badge variant={approval.tone} title={job.delivery[0]?.reason ?? undefined}>
              {approval.text}
            </Badge>
          </span>
        </>
      ) : null}
    </span>
  );
}
