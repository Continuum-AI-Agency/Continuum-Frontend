'use client';

import type {
  ApiRenderOutput,
  RenderApproval,
  RenderApprovalDecidedVia,
} from '@continuum/contracts';
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
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { OpenInLibrary } from '@/components/forge/libraryState';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { thumbnailSrc } from '@/components/forge/renderOutputMedia';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/toast-imperative';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { decideApprovals } from '@/lib/library/approvalDecisions';
import { decideRenderApproval, fetchRenderApprovals } from '@/lib/library/renderApprovals';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

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

const STATUS_KEYS = {
  pending: 'approvalStatusWaiting',
  approved: 'approvalStatusPublishing',
  published: 'approvalStatusPublished',
  previewed: 'approvalStatusPreviewed',
  rejected: 'rejected_aea4a04a',
  failed: 'approvalStatusFailed',
  expired: 'expired_424a2551',
} as const;

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
  library: 'Library',
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

/** The ledger's first page, whose key this shares so the ledger tab pays for one read, not two. */
const LEDGER_PAGE = 50;

/**
 * Each approval's renders, by the task they ran as, once one is in the Library — the card links
 * to that asset's thread, where the review and its comments live, and draws the file's 480p.
 */
// ponytail: an approval whose renders are older than the newest 50 gets no link; a taskUid filter
// on the jobs route lifts that.
function useApprovalRenders(brandId: string, enabled: boolean) {
  const { data } = useQuery({
    queryKey: forgeQueryKeys.renderJobList(brandId, LEDGER_PAGE),
    queryFn: () => apiRendersApi.listJobs(brandId, LEDGER_PAGE),
    enabled,
    staleTime: FORGE_STALE_MS.active,
    retry: false,
  });
  return useMemo(() => {
    const byTask = new Map<string, readonly ApiRenderOutput[]>();
    for (const job of data?.items ?? []) {
      if (!job.taskUid || byTask.has(job.taskUid)) continue;
      if (job.outputs.some((output) => output.assetId)) byTask.set(job.taskUid, job.outputs);
    }
    return byTask;
  }, [data]);
}

export const waitingCount = (approvals: RenderApproval[] | undefined) =>
  approvals?.filter((approval) => approval.status === 'pending').length;

const when = (iso: string, locale: UiLocale = 'en') =>
  new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

type ForgeText = ReturnType<typeof useUiTranslations<'forge'>>;
function decidedLine(approval: RenderApproval, locale: UiLocale, t: ForgeText): string | null {
  if (!approval.decidedAt) return null;
  const who = approval.decidedByDisplayName ?? approval.decidedByName;
  const via =
    approval.decidedVia === 'library'
      ? t('library_dc20b3d5')
      : approval.decidedVia
        ? VIA_LABEL[approval.decidedVia]
        : null;
  return t('approvalDecidedLine', {
    hasWho: who ? 'yes' : 'no',
    who: who ?? '',
    hasVia: via ? 'yes' : 'no',
    via: via ?? '',
    time: when(approval.decidedAt, locale),
  });
}

function reasonText(approval: RenderApproval, t: ForgeText): string | null {
  if (approval.status === 'pending') return null;
  const reason = approval.decisionReason ?? (approval.status === 'expired' ? 'expired' : null);
  // Free-form reasons written by a person remain authored content.
  return reason === 'expired'
    ? t('approvalReasonExpired')
    : reason === 'publish_interrupted_check_meta'
      ? t('approvalReasonInterrupted')
      : reason;
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
/** The same stored file, whatever its link's signature. */
const sameFile = (a: string, b: string) => a.split('?')[0] === b.split('?')[0];

function ApprovalCard({
  approval,
  outputs,
  busy,
  onDecide,
}: {
  approval: RenderApproval;
  /** The render's files, once the ledger's page has them in the Library. */
  outputs: readonly ApiRenderOutput[] | undefined;
  busy: boolean;
  onDecide: (id: string, decision: 'approve' | 'reject') => void;
}) {
  const calendarLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const first = approval.files[0];
  // The ledger's copy of the file this approval shows: its poster and 480p, not the fleet's original.
  const rendered = first ? outputs?.find((output) => sameFile(output.url, first.url)) : undefined;
  const assetId =
    rendered?.assetId ?? outputs?.find((output) => output.assetId)?.assetId ?? undefined;
  const pending = approval.status === 'pending';
  const destination =
    approval.action === 'replace' && approval.adId
      ? translateUi('approvalDestinationAd', { id: approval.adId })
      : approval.adsetId
        ? translateUi('approvalDestinationAdset', { id: approval.adsetId })
        : translateUi('approvalDestinationOwnAdset');

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
      <div className="w-full shrink-0 overflow-hidden rounded-md border bg-muted sm:w-40">
        {first && isVideo(first.url) ? (
          // biome-ignore lint/a11y/useMediaCaption: a rendered ad frame has no captions to show
          <video
            src={rendered ? thumbnailSrc(rendered) : first.url}
            poster={rendered?.posterUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            controls
            preload="metadata"
          />
        ) : first ? (
          <img
            src={rendered ? thumbnailSrc(rendered) : first.url}
            alt={translateUi('rendered_creative_ee63a43a')}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            {' '}
            {translateUi('no_preview_4b8bacd8')}{' '}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', STATUS_TONE[approval.status])}>
            {translateUi(STATUS_KEYS[approval.status])}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {translateUi('publishes_to_174bb972')} {destination}
          </span>
          <span className="text-xs text-muted-foreground">
            {translateUi('approvalFiles', { count: approval.files.length })}
          </span>
          {approval.groupKey ? (
            <Badge variant="secondary" className="text-xs">
              {approval.groupKey}
            </Badge>
          ) : null}
          {assetId ? (
            <span className="text-xs">
              <OpenInLibrary brandId={approval.brandId} assetId={assetId} />
            </span>
          ) : null}
        </div>

        {first?.adCopy ? (
          <p className="line-clamp-3 text-sm text-foreground/90">{first.adCopy}</p>
        ) : null}

        {reasonText(approval, translateUi) ? (
          <p className="text-xs text-muted-foreground">{reasonText(approval, translateUi)}</p>
        ) : null}
        {decidedLine(approval, calendarLocale, translateUi) ? (
          <p className="text-xs text-muted-foreground">
            {decidedLine(approval, calendarLocale, translateUi)}
          </p>
        ) : null}
        {pending && approval.expiresAt && !approval.packageId ? (
          <p className="text-xs text-muted-foreground">
            {translateUi('expires_f6725f3a')} {when(approval.expiresAt, calendarLocale)}
          </p>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy} onClick={() => onDecide(approval.id, 'approve')}>
              {busy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}{' '}
              {translateUi('approve_and_publish_paused_ad6bf111')}{' '}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onDecide(approval.id, 'reject')}
            >
              <XCircle className="mr-1 h-3 w-3" /> {translateUi('reject_ab604a36')}{' '}
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
  renders,
  busyId,
  onDecide,
  onDecideAll,
}: {
  packageId: string;
  approvals: RenderApproval[];
  renders: ReadonlyMap<string, readonly ApiRenderOutput[]>;
  busyId: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onDecideAll: (packageId: string, ids: string[], decision: Decision) => void;
}) {
  const calendarLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const pendingIds = approvals
    .filter((approval) => approval.status === 'pending')
    .map((approval) => approval.id);
  const waiting = pendingIds.length;
  const deciding = busyId === packageId;
  const expiresAt = approvals.find((approval) => approval.expiresAt)?.expiresAt ?? null;
  const expired = expiresAt !== null && Date.parse(expiresAt) <= Date.now();
  const variations = translateUi('approvalVariations', { count: approvals.length });
  return (
    <section
      aria-label={translateUi('approval_package_value0_96405376', { value0: String(variations) })}
      className="space-y-2 rounded-lg border border-dashed p-2"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Package className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{' '}
          {translateUi('package_e943f25d')} {variations}
        </span>
        <span className="text-muted-foreground">
          {waiting
            ? translateUi('value0_waiting_243a8a63', { count: Number(waiting) })
            : translateUi('all_decided_587977f1')}
        </span>
        {expiresAt ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            {expired ? translateUi('expired_424a2551') : translateUi('expires_f6725f3a')}{' '}
            {when(expiresAt, calendarLocale)}
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
              )}{' '}
              {translateUi('approve_all_ae067b68')} {waiting}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId !== null}
              onClick={() => onDecideAll(packageId, pendingIds, 'reject')}
            >
              <XCircle className="mr-1 h-3 w-3" /> {translateUi('reject_all_adba2523')}{' '}
            </Button>
          </span>
        ) : null}
      </header>
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          outputs={renders.get(approval.taskUid)}
          busy={busyId === approval.id}
          onDecide={onDecide}
        />
      ))}
    </section>
  );
}

export function PendingApprovals({ brandId }: { brandId: string }) {
  const uiErrorText = useUiErrorMessage();
  const translateUi = useUiTranslations('forge');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const approvalKey = forgeQueryKeys.approvals(brandId);
  const approvalQuery = useRenderApprovals(brandId);
  const approvals = approvalQuery.data ?? [];
  const renders = useApprovalRenders(brandId, approvals.length > 0);
  const loadAlert = approvalQuery.isError ? (
    <Alert variant="destructive" className="py-2">
      <AlertTitle>
        {approvalQuery.data
          ? translateUi('approvals_could_not_be_refreshed_8296eb17')
          : translateUi('approvals_could_not_be_loaded_5ea08751')}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {approvalQuery.data
            ? translateUi('showing_the_last_loaded_approvals_ec974281')
            : translateUi('pending_approval_status_is_unknown__798a2f00')}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={approvalQuery.isFetching}
          onClick={() => void approvalQuery.refetch()}
        >
          {approvalQuery.isFetching
            ? translateUi('retrying_a16c8b1c')
            : translateUi('retry_942087cc')}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

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
            ? translateUi('approved_publishing_now_the_outcome_c23bd0e7')
            : status === 'published'
              ? translateUi('published_as_a_paused_ad_62b6f835')
              : status === 'previewed'
                ? translateUi('approved_meta_writes_are_switched_o_420dffad')
                : status === 'rejected'
                  ? translateUi('rejected_nothing_was_published_1df64808')
                  : translateUi('recorded_but_publishing_did_not_com_9dbc262d', {
                      value0: String(translateUi('see_the_render_log_4229bc1a')),
                    }),
        );
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
      } catch (error) {
        console.error('[PendingApprovals] Decision failed', error);
        toast.error(uiErrorText(error));
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
      } finally {
        setBusyId(null);
      }
    },
    [approvalKey, brandId, queryClient, translateUi, uiErrorText],
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
            ? translateUi('approvalApprovedSummary', { count: decided })
            : translateUi('approvalRejectedSummary', { count: decided });
        if (missed.length === 0) toast.success(done);
        // Someone else deciding one first is a normal race; say how many, and the first reason.
        else {
          console.warn('[PendingApprovals] Some decisions were refused', missed);
          toast.warning(
            translateUi('approvalPartialSummary', {
              done,
              count: missed.length,
              outcome: missed[0]?.outcome ?? 'refused',
            }),
          );
        }
      } catch (error) {
        console.error('[PendingApprovals] Package decisions failed', error);
        toast.error(uiErrorText(error));
      } finally {
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
        void queryClient.invalidateQueries({ queryKey: approvalKey, exact: true });
        setBusyId(null);
      }
    },
    [approvalKey, brandId, queryClient, translateUi, uiErrorText],
  );

  if (approvalQuery.isPending && approvalQuery.data === undefined)
    return (
      <p className="py-1 text-xs text-muted-foreground">
        {translateUi('loading_approvals_5a7ee168')}
      </p>
    );
  if (approvalQuery.data === undefined) return loadAlert;
  if (approvals.length === 0)
    return loadAlert ? (
      <section aria-label={translateUi('pending_approvals_status_8c08b365')}>{loadAlert}</section>
    ) : null;

  const waiting = waitingCount(approvals) ?? 0;
  if (open === null && waiting > 0) setOpen(true);

  return (
    <Collapsible id="approvals" open={open ?? false} onOpenChange={setOpen} render={<section />}>
      {loadAlert}
      <h2>
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-1 text-left hover:bg-muted/30">
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90"
            aria-hidden
          />
          <ShieldCheck className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span className="font-medium text-sm">
            {' '}
            {translateUi('pending_approvals_0405f4b6')}
            {waiting > 0 ? ` (${waiting})` : ''}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {' '}
            {translateUi('rendered_creatives_waiting_for_a_pe_cf22b62e')}{' '}
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
              renders={renders}
              busyId={busyId}
              onDecide={onDecide}
              onDecideAll={onDecideAll}
            />
          ) : (
            <ApprovalCard
              key={entry.id}
              approval={entry}
              outputs={renders.get(entry.taskUid)}
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
