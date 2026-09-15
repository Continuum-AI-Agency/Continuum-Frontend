'use client';

import type { ApiRenderJob } from '@continuum/contracts';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

/** `render_approvals.status` in words, with the tone its badge carries. */
export function approvalState(job: ApiRenderJob): { text: string; tone: Tone } | null {
  if (!job.deliveryTarget) return null;
  const receipt = job.delivery[0];
  if (receipt?.status === 'published') return { text: 'published', tone: 'success' };
  if (receipt?.status === 'error') return { text: 'delivery failed', tone: 'destructive' };
  const status = job.approval?.status;
  switch (status) {
    case 'pending':
      return { text: 'awaiting approval', tone: 'warning' };
    case 'previewed':
      return { text: 'previewed', tone: 'warning' };
    case 'approved':
      return { text: 'approved', tone: 'success' };
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

export function DeliveryChain({ job }: { job: ApiRenderJob }) {
  const saved = job.outputs.some((output) => output.assetId);
  const slack = job.slackDelivery;
  const target = job.deliveryTarget;
  const approval = approvalState(job);
  return (
    <span className="inline-flex max-w-[28rem] flex-wrap items-center gap-x-1.5 gap-y-0.5">
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
            className="inline-flex min-w-0 items-center gap-1"
            title={`Meta ad account ${target.adAccountId}`}
          >
            <span className="truncate text-muted-foreground">
              Meta › {target.adAccountName ?? target.adAccountId} ›{' '}
              {target.campaignName ?? target.campaignId} ›{' '}
              {target.adsetName ?? target.adsetId}
              {target.action === 'replace' ? ' ›' : ''}
            </span>
            <span className="truncate">
              {target.action === 'replace' ? (target.adName ?? target.adId) : 'new paused ad'}
            </span>
            <Badge variant={approval.tone} title={job.delivery[0]?.reason ?? undefined}>
              {approval.text}
            </Badge>
          </span>
        </>
      ) : null}
    </span>
  );
}
