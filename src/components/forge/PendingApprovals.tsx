'use client';

import type { RenderApproval } from '@continuum/contracts';
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { decideRenderApproval, fetchRenderApprovals } from '@/lib/library/renderApprovals';
import { cn } from '@/lib/utils';

// Pending batches — the middle state between a finished render and a Meta ad.
//
// The same decision the Slack card offers, in the app. Both exist on purpose:
// the card is where the work already is, and this is the one that does not
// depend on Slack inbound traffic reaching us.
//
// Rejected batches STAY listed. A batch that vanished when someone said no would
// leave the person who made it with no way to see why.

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting on you',
  approved: 'Publishing…',
  published: 'Published, paused',
  // Approved, but the workspace has Meta writes switched off. Not a publish, and
  // saying so is the point.
  previewed: 'Approved — Meta writes are off',
  rejected: 'Rejected',
  failed: 'Publishing failed',
  expired: 'Expired',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  published: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  previewed: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  rejected: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
};

const isVideo = (url: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);

function ApprovalCard({
  approval,
  busy,
  onDecide,
}: {
  approval: RenderApproval;
  busy: boolean;
  onDecide: (id: string, decision: 'approve' | 'reject') => void;
}) {
  const first = approval.files[0];
  const pending = approval.status === 'pending';
  const destination =
    approval.action === 'replace' && approval.adId
      ? `ad ${approval.adId}`
      : approval.adsetId
        ? `ad set ${approval.adsetId}`
        : 'its ad set';

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
      <div className="w-full shrink-0 overflow-hidden rounded-md border bg-muted sm:w-40">
        {first && isVideo(first.url) ? (
          // biome-ignore lint/a11y/useMediaCaption: a rendered ad frame has no captions to show
          <video
            src={first.url}
            className="h-full w-full object-cover"
            muted
            playsInline
            controls
          />
        ) : first ? (
          <img src={first.url} alt="Rendered creative" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', STATUS_TONE[approval.status])}>
            {STATUS_LABEL[approval.status] ?? approval.status}
          </Badge>
          <span className="text-xs text-muted-foreground">Publishes to {destination}</span>
          <span className="text-xs text-muted-foreground">
            {approval.files.length} file{approval.files.length === 1 ? '' : 's'}
          </span>
          {approval.groupKey ? (
            <Badge variant="secondary" className="text-xs">
              {approval.groupKey}
            </Badge>
          ) : null}
        </div>

        {first?.adCopy ? (
          <p className="line-clamp-3 text-sm text-foreground/90">{first.adCopy}</p>
        ) : null}

        {approval.status !== 'pending' && approval.decisionReason ? (
          <p className="text-xs text-muted-foreground">{approval.decisionReason}</p>
        ) : null}
        {approval.decidedAt ? (
          <p className="text-xs text-muted-foreground">
            Decided {new Date(approval.decidedAt).toLocaleString()}
          </p>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={() => onDecide(approval.id, 'approve')}>
              {busy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}
              Approve and publish paused
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide(approval.id, 'reject')}
            >
              <XCircle className="mr-1 h-3 w-3" />
              Reject
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PendingApprovals({ brandId }: { brandId: string }) {
  const [approvals, setApprovals] = useState<RenderApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApprovals(await fetchRenderApprovals(brandId));
    } catch (error) {
      // A failed list is not worth a toast on every page load; the section just
      // stays empty, and the Slack card is the other way in.
      console.warn('[Forge] could not load pending approvals', error);
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDecide = useCallback(
    async (approvalId: string, decision: 'approve' | 'reject') => {
      setBusyId(approvalId);
      try {
        const result = await decideRenderApproval(approvalId, decision);
        // Report what actually happened. 'previewed' is approved-but-not-published,
        // and a toast saying "Published" over it would be a lie someone acts on.
        const status = result.approval.status;
        toast.success(
          status === 'published'
            ? 'Published as a paused ad.'
            : status === 'previewed'
              ? 'Approved — Meta writes are switched off for this workspace, so nothing was published.'
              : status === 'rejected'
                ? 'Rejected. Nothing was published.'
                : `Recorded, but publishing did not complete: ${result.deliveryReason ?? 'see the render log'}`,
        );
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'That decision did not go through.');
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (loading || approvals.length === 0) return null;

  const waiting = approvals.filter((a) => a.status === 'pending').length;

  return (
    <section id="approvals" className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-600" />
        <h2 className="font-medium text-sm">
          Pending approvals{waiting > 0 ? ` (${waiting})` : ''}
        </h2>
        <p className="text-xs text-muted-foreground">
          Rendered creatives waiting for a person before they become ads.
        </p>
      </div>
      <div className="space-y-2">
        {approvals.map((approval) => (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            busy={busyId === approval.id}
            onDecide={onDecide}
          />
        ))}
      </div>
    </section>
  );
}

export default PendingApprovals;
