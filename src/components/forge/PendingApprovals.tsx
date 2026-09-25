'use client';

import type { RenderApproval, RenderApprovalDecidedVia } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Package,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/toast-imperative';
import { decideApprovals } from '@/lib/library/approvalDecisions';
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
//
// A Forge confirm opens one package, and its variations are listed under it with the package's
// expiry. Approve all / Reject all decide exactly the variations shown waiting — never one that
// arrived after this list was read. A decision answers at once with `approved` — "publishing" — and the plugin's outcome
// lands on the row later, so the list re-reads every few seconds while any row is still there.
//
// It sits at the top of the Render ledger and folds. It opens itself when something waits on you
// and never folds itself, so deciding the last batch leaves its outcome in view. Past decisions
// alone start folded; once the person toggles it, it stays where they put it.

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

// Theme tokens (hex, so the Tailwind token classes — never `hsl(var(--x))`).
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/20',
  approved: 'bg-primary/10 text-foreground border-primary/20',
  published: 'bg-success/10 text-success border-success/20',
  previewed: 'bg-primary/10 text-foreground border-primary/20',
  rejected: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
  expired: 'bg-muted text-muted-foreground',
};

const VIA_LABEL: Record<RenderApprovalDecidedVia, string> = {
  forge: 'Forge',
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  system: 'Continuum',
};

// The reconciler's reason codes in words; an unmapped reason is shown as written.
const REASON_COPY: Record<string, string> = {
  expired: 'Nobody decided before the package expired.',
  publish_interrupted_check_meta:
    'Publishing was interrupted. Check Ads Manager before sending it again.',
};

/** Re-read quickly while a decision is still being relayed; otherwise the usual slow poll. */
export const APPROVAL_RELAY_POLL_MS = 3_000;
export const approvalPollInterval = (approvals: RenderApproval[] | undefined) =>
  approvals?.some((approval) => approval.status === 'approved') ? APPROVAL_RELAY_POLL_MS : 30_000;

/** The brand's approval list — one query, shared by the ledger's section and the tab's count. */
export function useRenderApprovals(brandId: string) {
  return useQuery({
    queryKey: forgeQueryKeys.approvals(brandId),
    queryFn: () => fetchRenderApprovals(brandId),
    staleTime: FORGE_STALE_MS.active,
    refetchInterval: (query) => approvalPollInterval(query.state.data),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

export const waitingCount = (approvals: RenderApproval[] | undefined) =>
  approvals?.filter((approval) => approval.status === 'pending').length ?? 0;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function decidedLine(approval: RenderApproval): string | null {
  if (!approval.decidedAt) return null;
  const who = approval.decidedByDisplayName ?? approval.decidedByName;
  const via = approval.decidedVia ? VIA_LABEL[approval.decidedVia] : null;
  return [
    'Decided',
    who ? `by ${who}` : null,
    via ? `via ${via}` : null,
    `· ${when(approval.decidedAt)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function reasonText(approval: RenderApproval): string | null {
  if (approval.status === 'pending') return null;
  const reason = approval.decisionReason ?? (approval.status === 'expired' ? 'expired' : null);
  return reason ? (REASON_COPY[reason] ?? reason) : null;
}

type Entry = RenderApproval | { packageId: string; approvals: RenderApproval[] };

/** Packaged batches under one entry in first-seen order; a batch with no package stands alone. */
export function groupByPackage(approvals: RenderApproval[]): Entry[] {
  const entries: Entry[] = [];
  const packages = new Map<string, RenderApproval[]>();
  for (const approval of approvals) {
    if (!approval.packageId) {
      entries.push(approval);
      continue;
    }
    const group = packages.get(approval.packageId);
    if (group) {
      group.push(approval);
      continue;
    }
    const created = [approval];
    packages.set(approval.packageId, created);
    entries.push({ packageId: approval.packageId, approvals: created });
  }
  return entries;
}

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

        {reasonText(approval) ? (
          <p className="text-xs text-muted-foreground">{reasonText(approval)}</p>
        ) : null}
        {decidedLine(approval) ? (
          <p className="text-xs text-muted-foreground">{decidedLine(approval)}</p>
        ) : null}
        {pending && approval.expiresAt && !approval.packageId ? (
          <p className="text-xs text-muted-foreground">Expires {when(approval.expiresAt)}</p>
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

type Decision = 'approve' | 'reject';

function ApprovalPackage({
  packageId,
  approvals,
  busyId,
  onDecide,
  onDecideAll,
}: {
  packageId: string;
  approvals: RenderApproval[];
  busyId: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onDecideAll: (packageId: string, ids: string[], decision: Decision) => void;
}) {
  const pendingIds = approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => approval.id);
  const waiting = pendingIds.length;
  const deciding = busyId === packageId;
  const expiresAt = approvals.find((approval) => approval.expiresAt)?.expiresAt ?? null;
  const expired = expiresAt !== null && Date.parse(expiresAt) <= Date.now();
  const variations = `${approvals.length} variation${approvals.length === 1 ? '' : 's'}`;
  return (
    <section
      aria-label={`Approval package, ${variations}`}
      className="space-y-2 rounded-lg border border-dashed p-2"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          Package · {variations}
        </span>
        <span className="text-muted-foreground">
          {waiting ? `${waiting} waiting` : 'All decided'}
        </span>
        {expiresAt ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            {expired ? 'Expired' : 'Expires'} {when(expiresAt)}
          </span>
        ) : null}
        {waiting > 1 ? (
          <span className="ml-auto flex gap-2">
            <Button
              size="sm"
              disabled={busyId !== null}
              onClick={() => onDecideAll(packageId, pendingIds, 'approve')}
            >
              {deciding ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}
              Approve all {waiting}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId !== null}
              onClick={() => onDecideAll(packageId, pendingIds, 'reject')}
            >
              <XCircle className="mr-1 h-3 w-3" />
              Reject all
            </Button>
          </span>
        ) : null}
      </header>
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          busy={busyId === approval.id}
          onDecide={onDecide}
        />
      ))}
    </section>
  );
}

export function PendingApprovals({ brandId }: { brandId: string }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const approvalKey = forgeQueryKeys.approvals(brandId);
  const approvalQuery = useRenderApprovals(brandId);
  const approvals = approvalQuery.data ?? [];

  const onDecide = useCallback(
    async (approvalId: string, decision: Decision) => {
      setBusyId(approvalId);
      try {
        const result = await decideRenderApproval(approvalId, decision);
        queryClient.setQueryData<RenderApproval[]>(approvalKey, (current = []) =>
          current.map((approval) =>
            approval.id === result.approval.id ? result.approval : approval,
          ),
        );
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
        // Report what actually happened. 'previewed' is approved-but-not-published,
        // and a toast saying "Published" over it would be a lie someone acts on.
        const status = result.approval.status;
        toast.success(
          status === 'approved'
            ? 'Approved. Publishing now — the outcome appears here in a moment.'
            : status === 'published'
              ? 'Published as a paused ad.'
              : status === 'previewed'
                ? 'Approved — Meta writes are switched off for this workspace, so nothing was published.'
                : status === 'rejected'
                  ? 'Rejected. Nothing was published.'
                  : `Recorded, but publishing did not complete: ${result.deliveryReason ?? 'see the render log'}`,
        );
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
      } catch (error) {
        // The server's refusal, as written: it says why this person cannot decide this batch.
        toast.error(error instanceof Error ? error.message : 'That decision did not go through.');
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
      } finally {
        setBusyId(null);
      }
    },
    [approvalKey, brandId, queryClient],
  );

  const onDecideAll = useCallback(
    async (packageId: string, ids: string[], decision: Decision) => {
      setBusyId(packageId);
      try {
        const { results } = await decideApprovals({ brandId, ids, decision });
        const decided = results.filter((result) => result.outcome === 'decided').length;
        const missed = results.filter((result) => result.outcome !== 'decided');
        const done =
          decision === 'approve'
            ? `Approved ${decided}. Publishing now — the outcomes appear here in a moment.`
            : `Rejected ${decided}. Nothing was published.`;
        if (missed.length === 0) toast.success(done);
        // Someone else deciding one first is a normal race; say how many, and the first reason.
        else
          toast.warning(`${done} ${missed.length} not decided: ${missed[0]?.error ?? ''}`.trim());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Those decisions did not go through.');
      } finally {
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
        setBusyId(null);
      }
    },
    [approvalKey, brandId, queryClient],
  );

  if (approvalQuery.isPending || approvals.length === 0) return null;

  const waiting = waitingCount(approvals);
  if (open === null && waiting > 0) setOpen(true);

  return (
    <Collapsible id="approvals" open={open ?? false} onOpenChange={setOpen} render={<section />}>
      <h2>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-1 text-left hover:bg-muted/30">
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90"
            aria-hidden
          />
          <ShieldCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="font-medium text-sm">
            Pending approvals{waiting > 0 ? ` (${waiting})` : ''}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            Rendered creatives waiting for a person before they become ads.
          </span>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="space-y-2 pt-2">
        {groupByPackage(approvals).map((entry) =>
          'approvals' in entry ? (
            <ApprovalPackage
              key={entry.packageId}
              packageId={entry.packageId}
              approvals={entry.approvals}
              busyId={busyId}
              onDecide={onDecide}
              onDecideAll={onDecideAll}
            />
          ) : (
            <ApprovalCard
              key={entry.id}
              approval={entry}
              busy={busyId === entry.id}
              onDecide={onDecide}
            />
          ),
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default PendingApprovals;
