'use client';

import {
  type ApiRenderBatchReadiness,
  type ApiRenderBatchRecord,
  type ApiRenderDeliveryDestination,
  type ApiRenderDeliveryDestinationsResponse,
  type ApiRenderDeliveryTarget,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  templateDisplayName,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  Loader2,
  Play,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  APPROVAL_COPY,
  DeliveryTargetPicker,
  type MetaPickerState,
  metaDeliveryProblems,
  replaceOutputId,
} from '@/components/forge/DeliveryTargetPicker';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { jobSteps } from '@/components/forge/RenderJobDetail';
import { renderedRatios, rowFileCount } from '@/components/forge/renderRequestRows';
import { RatioChips } from '@/components/forge/requestCells';
import {
  describeSlackFailure,
  isSlackDeliveryUnavailable,
  SlackDestinationPicker,
  type SlackPickerState,
} from '@/components/forge/SlackDestinationPicker';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';

// The last look before a batch is spent, docked under the grid instead of over it: the rows stay
// in view and editable while this reads them.
//
//   Review  — a batch preflight over the records as they are, for the readiness block and the
//             guardrails per row. Editing happens in the grid above; nothing here changes a value.
//   Deliver — the Library always; a Slack destination; a Meta ad per row, held for approval.
//   Confirm — a second batch preflight carrying `slack` and each row's delivery, so the signed
//             token covers exactly what was reviewed, then create batch.
//   Running — the fired jobs, polled until they settle.
//
// The caller saves the set before handing over `reviewKey`, so every record points at an
// immutable revision, and rebuilds `records` from the rows on every render. `stale` says the rows,
// the selection or the revision moved since that key: the tray goes back to Review and refuses
// to confirm until the caller re-checks. `records[i]` belongs to `rows[i]`. The ROW is the source
// of truth for delivery: it is applied to its record at confirm, and a replacing row's record is
// narrowed to the one format chosen here.

export type RenderPreflightRow = {
  rowId: string;
  label: string;
  labelPath: string[];
  outputIds: string[];
  delivery?: ApiRenderDeliveryTarget;
};

export type RenderReviewTrayProps = {
  brandId: string;
  bindingId: string | null;
  templateKey: string;
  contractHash: string;
  contract: ApiRenderTemplateContract;
  rows: RenderPreflightRow[];
  records: ApiRenderBatchRecord[];
  /** A new value is a new snapshot to review: the tray opening, or a re-check. */
  reviewKey: number;
  stale: boolean;
  /** Why a re-check cannot run yet — a row still checking, say. Null when it can. */
  recheckBlocked: string | null;
  rechecking: boolean;
  onRecheck: () => void;
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onClose: () => void;
  onFired: (jobIds: string[]) => void;
  onOpenLedger: (jobIds: string[]) => void;
  /** Brings a row into view in the grid. */
  onShowRow: (rowId: string) => void;
};

type Step = 'review' | 'deliver' | 'confirm' | 'running';
const STEPS: { id: Step; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'running', label: 'Running' },
];

type Review =
  | { state: 'loading' }
  | { state: 'ready'; readiness: ApiRenderBatchReadiness }
  | { state: 'refused'; message: string; details: string[] }
  | { state: 'failed'; message: string };

type Destinations =
  | ApiRenderDeliveryDestinationsResponse
  | 'loading'
  | 'unavailable'
  | { error: string };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function describeFailure(error: unknown): { message: string; details: string[] } {
  const message = describeRenderDiscoveryFailure(error);
  const guardrails = error instanceof ApiError ? error.payload?.guardrails : undefined;
  const details = Array.isArray(guardrails)
    ? guardrails.flatMap((item) =>
        item && typeof item === 'object' && 'message' in item && typeof item.message === 'string'
          ? [item.message]
          : [],
      )
    : [];
  return { message, details };
}

/**
 * The tray's one row rhythm: a name, then columns of facts, on a hairline. The name and formats
 * are capped so a wide screen widens the free-text column, not the gap between facts.
 */
const ROW = 'grid items-center gap-3 px-[var(--card-pad)] py-1.5';

export function RenderReviewTray({
  brandId,
  bindingId,
  templateKey,
  contractHash,
  contract,
  rows,
  records,
  reviewKey,
  stale,
  recheckBlocked,
  rechecking,
  onRecheck,
  onDeliveryChange,
  onClose,
  onFired,
  onOpenLedger,
  onShowRow,
}: RenderReviewTrayProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('review');
  const [review, setReview] = useState<Review>({ state: 'loading' });
  const [destinations, setDestinations] = useState<Destinations>('loading');
  const [slackDestination, setSlackDestination] = useState<ApiRenderDeliveryDestination | null>(
    null,
  );
  const [formatByRow, setFormatByRow] = useState<Record<string, string>>({});
  const [firing, setFiring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fired, setFired] = useState<ApiRenderJob[]>([]);

  const outputs = contract.outputs;
  const variableLabel = (key: string | undefined) =>
    contract.variables.find((variable) => variable.key === key)?.label ?? key;
  const templateName = contract.template.displayName ?? templateDisplayName(contract.template.name);

  const rowOutputIds = (row: RenderPreflightRow): string[] => {
    if (row.delivery?.action === 'replace') {
      const only = replaceOutputId(row, outputs, formatByRow);
      return only ? [only] : [];
    }
    return row.outputIds;
  };
  const fileCount = rows.reduce((total, row) => total + rowFileCount(contract, row), 0);

  // Review reads the records exactly as the grid built them — no delivery, every format.
  const runReview = useCallback(async () => {
    setReview({ state: 'loading' });
    try {
      const response = await apiRendersApi.batchPreflight({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey,
        contractHash,
        records: records.map(({ delivery: _delivery, ...record }) => record),
      });
      setReview({ state: 'ready', readiness: response.readiness });
    } catch (error) {
      const { message, details } = describeFailure(error);
      setReview(
        error instanceof ApiError && error.status === 422
          ? { state: 'refused', message, details }
          : { state: 'failed', message },
      );
    }
  }, [brandId, bindingId, templateKey, contractHash, records]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one review per snapshot; Retry and Re-check re-run it.
  useEffect(() => {
    setStep('review');
    setProblem(null);
    void runReview();
  }, [reviewKey]);

  useEffect(() => {
    if (stale) setStep((current) => (current === 'running' ? current : 'review'));
  }, [stale]);

  useEffect(() => {
    let cancelled = false;
    apiRendersApi
      .listDeliveryDestinations(brandId)
      .then((response) => {
        if (!cancelled) setDestinations(response);
      })
      .catch((error) => {
        if (cancelled) return;
        setDestinations(
          isSlackDeliveryUnavailable(error)
            ? 'unavailable'
            : { error: describeSlackFailure(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const slack: SlackPickerState =
    typeof destinations === 'object' && 'slack' in destinations ? destinations.slack : destinations;
  const meta: MetaPickerState =
    destinations === 'loading'
      ? 'loading'
      : typeof destinations === 'object' && 'meta' in destinations
        ? destinations.meta
        : 'unknown';
  const deliverProblems = metaDeliveryProblems(rows, outputs, formatByRow, meta);
  const replacements = rows.filter((row) => row.delivery?.action === 'replace');
  const newAds = rows.filter((row) => row.delivery?.action === 'create');

  const summary = [
    plural(fileCount, 'file'),
    'Library',
    ...(slackDestination ? [`#${slackDestination.channelName}`] : []),
    ...(replacements.length
      ? [`${plural(replacements.length, 'ad replacement')} held for approval`]
      : []),
    ...(newAds.length ? [`${plural(newAds.length, 'new paused ad')} held for approval`] : []),
  ].join(' · ');

  const confirm = async () => {
    // The records below are rebuilt from the rows on screen; a review of other rows signs nothing.
    if (stale) {
      setStep('review');
      return;
    }
    setFiring(true);
    setProblem(null);
    try {
      const preflight = await apiRendersApi.batchPreflight({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey,
        contractHash,
        records: records.map(({ delivery: _delivery, ...record }, index) => {
          const row = rows[index];
          if (!row?.delivery) return record;
          return row.delivery.action === 'replace'
            ? { ...record, delivery: row.delivery, outputIds: rowOutputIds(row) }
            : { ...record, delivery: row.delivery };
        }),
        ...(slackDestination ? { slack: { destinationId: slackDestination.id } } : {}),
      });
      const batch = await apiRendersApi.createBatch({
        confirmationToken: preflight.confirmationToken,
      });
      for (const job of batch.jobs)
        queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) }),
        queryClient.invalidateQueries({ queryKey: forgeQueryKeys.approvals(brandId) }),
      ]);
      toast.success(`${plural(batch.jobs.length, 'render')} queued`);
      setFired(batch.jobs);
      setStep('running');
      onFired(batch.jobs.map((job) => job.id));
    } catch (error) {
      const { message, details } = describeFailure(error);
      setProblem([message, ...details].join(' '));
    } finally {
      setFiring(false);
    }
  };

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const canAdvance =
    !stale &&
    (step === 'review'
      ? review.state === 'ready' && review.readiness.state !== 'BLOCKED'
      : step === 'deliver' && !deliverProblems.length);

  return (
    <section
      // Named, so it is a region landmark: the tray is part of the page, never a dialog over it.
      aria-label="Review and render"
      className="flex h-full min-h-0 flex-col bg-background text-xs"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented || firing) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-[var(--card-pad)]">
        <h2 className="shrink-0 font-mono text-2xs font-medium uppercase tracking-wide">
          {step === 'running'
            ? `${plural(fired.length, 'render')} queued`
            : `Render ${plural(rows.length, 'row')}`}
        </h2>
        <p className="min-w-0 truncate text-muted-foreground">
          {step === 'running' ? templateName : `${templateName} · ${plural(fileCount, 'file')}`}
        </p>
        <ol aria-label="Pre-flight steps" className="flex shrink-0 items-center gap-1.5">
          {STEPS.map((item, index) => (
            <li
              key={item.id}
              aria-current={item.id === step ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1',
                index > stepIndex ? 'text-muted-foreground' : 'text-foreground',
                item.id === step && 'font-medium',
              )}
            >
              {index > 0 ? <span aria-hidden className="mr-0.5 h-px w-3 bg-border" /> : null}
              {index < stepIndex ? (
                <Check className="size-3 text-success" aria-hidden />
              ) : item.id === step ? (
                <CircleDot className="size-3 text-primary" aria-hidden />
              ) : (
                <Circle className="size-3" aria-hidden />
              )}
              {item.label}
            </li>
          ))}
        </ol>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {step === 'deliver' || step === 'confirm' ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={firing}
              onClick={() => setStep(STEPS[stepIndex - 1]?.id ?? 'review')}
            >
              Back
            </Button>
          ) : null}
          {step === 'confirm' ? (
            <Button type="button" size="xs" disabled={firing || stale} onClick={confirm}>
              {firing ? (
                <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
              ) : (
                <Play data-icon="inline-start" aria-hidden />
              )}
              Confirm {plural(fileCount, 'file')}
            </Button>
          ) : step !== 'running' ? (
            <Button
              type="button"
              size="xs"
              disabled={!canAdvance}
              onClick={() => setStep(STEPS[stepIndex + 1]?.id ?? 'confirm')}
            >
              Next
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Close review"
            title="Close (Esc)"
            disabled={firing}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>
      </header>

      {step === 'running' ? (
        <RunningStep
          brandId={brandId}
          fired={fired}
          onShowRow={onShowRow}
          onOpenLedger={onOpenLedger}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {stale && step === 'review' ? (
              <div
                role="status"
                className="flex items-center gap-2 border-b border-dashed border-warning/60 bg-warning/10 px-[var(--card-pad)] py-1"
              >
                <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                <span className="font-medium">Rows changed since review</span>
                <span className="text-muted-foreground">— check them again before rendering.</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="ml-auto"
                  disabled={recheckBlocked !== null || rechecking}
                  title={recheckBlocked ?? undefined}
                  onClick={onRecheck}
                >
                  {rechecking ? (
                    <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                  ) : null}
                  Re-check
                </Button>
              </div>
            ) : null}

            {step === 'review' ? (
              <>
                {review.state === 'refused' ? (
                  <div
                    role="alert"
                    className="border-b border-border px-[var(--card-pad)] py-1.5 text-destructive"
                  >
                    <p className="font-medium">{review.message}</p>
                    {review.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                    <p className="text-muted-foreground">Fix the row in the grid, then re-check.</p>
                  </div>
                ) : review.state === 'failed' ? (
                  <div
                    role="alert"
                    className="flex items-center gap-2 border-b border-border px-[var(--card-pad)] py-1.5 text-destructive"
                  >
                    {review.message}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void runReview()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
                <ul aria-label="Rows to render" className="divide-y divide-border">
                  {rows.map((row, index) => {
                    const findings =
                      review.state === 'ready'
                        ? review.readiness.findings.filter((finding) =>
                            finding.rowIndexes.includes(index),
                          )
                        : [];
                    const replacing = row.delivery?.action === 'replace';
                    const ratios = replacing
                      ? rowOutputIds(row).length
                        ? renderedRatios(contract, rowOutputIds(row))
                        : []
                      : renderedRatios(contract, row.outputIds);
                    return (
                      <li
                        key={row.rowId}
                        className={cn(
                          ROW,
                          'grid-cols-[minmax(0,16rem)_minmax(0,11rem)_minmax(0,1fr)_4.5rem_1rem]',
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden"
                          title={`Show ${row.labelPath.join(' / ')} in the grid`}
                          onClick={() => onShowRow(row.rowId)}
                        >
                          {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
                        </button>
                        {ratios.length ? (
                          <RatioChips ratios={ratios} />
                        ) : (
                          <span className="text-muted-foreground">One format</span>
                        )}
                        <div className="flex min-w-0 flex-col">
                          {findings.map((finding) => (
                            <p
                              key={`${finding.code}:${finding.variableKey ?? ''}`}
                              className={cn(
                                'truncate',
                                finding.severity === 'unknown'
                                  ? 'text-muted-foreground'
                                  : 'text-warning',
                              )}
                            >
                              {finding.variableKey ? `${variableLabel(finding.variableKey)}: ` : ''}
                              {finding.message}
                            </p>
                          ))}
                        </div>
                        <span className="text-right font-mono tabular-nums text-muted-foreground">
                          {plural(rowFileCount(contract, row), 'file')}
                        </span>
                        {findings.some((finding) => finding.severity !== 'unknown') ? (
                          <AlertTriangle className="size-3.5 text-warning" aria-label="Warning" />
                        ) : review.state === 'ready' ? (
                          <CheckCircle2 className="size-3.5 text-success" aria-label="Ready" />
                        ) : (
                          <span />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : step === 'deliver' ? (
              // One section per destination; a new destination is one more section here.
              <div className="grid gap-x-6 gap-y-3 p-[var(--card-pad)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
                <DeliverSection title="Library">
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Check className="size-3.5 text-success" aria-hidden /> Every render is saved to
                    this brand’s Library.
                  </p>
                </DeliverSection>
                <DeliverSection title="Slack">
                  <SlackDestinationPicker
                    brandId={brandId}
                    slack={slack}
                    value={slackDestination}
                    onChange={setSlackDestination}
                  />
                </DeliverSection>
                <DeliverSection title="Meta ads">
                  <DeliveryTargetPicker
                    brandId={brandId}
                    meta={meta}
                    rows={rows}
                    outputs={outputs}
                    formatByRow={formatByRow}
                    onDeliveryChange={onDeliveryChange}
                    onFormatChange={(rowId, outputId) =>
                      setFormatByRow((current) => ({ ...current, [rowId]: outputId }))
                    }
                  />
                </DeliverSection>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-[var(--card-pad)]">
                <p className="text-sm font-medium">{summary}</p>
                {replacements.length || newAds.length ? (
                  <>
                    <ul className="divide-y divide-border border-y border-border">
                      {[...replacements, ...newAds].map((row) => (
                        <li key={row.rowId} className="flex flex-wrap gap-x-2 py-1.5">
                          <span className="font-medium">{row.label}</span>
                          <span className="text-muted-foreground">
                            {row.delivery?.action === 'replace'
                              ? `replaces ${row.delivery.adName ?? row.delivery.adId} · ${renderedRatios(contract, rowOutputIds(row)).join(', ')}`
                              : `new paused ad in ${row.delivery?.adsetName ?? row.delivery?.adsetId}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground">{APPROVAL_COPY}</p>
                  </>
                ) : null}
                {problem ? (
                  <p role="alert" className="text-destructive">
                    {problem}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-[var(--card-pad)] text-muted-foreground">
            {step === 'review' ? (
              review.state === 'loading' ? (
                <>
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Checking{' '}
                  {plural(rows.length, 'row')} against the workspace…
                </>
              ) : review.state === 'ready' ? (
                <span
                  className={cn(
                    'font-medium',
                    review.readiness.state === 'READY' ? 'text-foreground' : 'text-warning',
                  )}
                >
                  {readinessLine(review.readiness)}
                </span>
              ) : (
                <span className="text-destructive">Can’t render as they are</span>
              )
            ) : step === 'deliver' ? (
              deliverProblems.length ? (
                <p role="status" className="text-warning">
                  {deliverProblems.join(' ')}
                </p>
              ) : (
                <span>{summary}</span>
              )
            ) : (
              <span>Nothing renders until you confirm.</span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}

function DeliverSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

const TICK: Record<ReturnType<typeof jobSteps>[number]['state'], string> = {
  done: 'bg-success',
  active: 'bg-warning',
  error: 'bg-destructive',
  pending: 'bg-muted-foreground/30',
  skipped: 'bg-muted-foreground/30',
};

function elapsed(job: ApiRenderJob): string {
  const end =
    job.finishedAt ?? (job.status === 'finished' || job.status === 'failed' ? job.updatedAt : null);
  if (!end) return '—';
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(job.createdAt)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** The fired jobs as they settle: where each is now, its steps as ticks, how long it took. */
function RunningStep({
  brandId,
  fired,
  onShowRow,
  onOpenLedger,
}: {
  brandId: string;
  fired: ApiRenderJob[];
  onShowRow: (rowId: string) => void;
  onOpenLedger: (jobIds: string[]) => void;
}) {
  const jobIds = fired.map((job) => job.id);
  const { jobs, refreshJobs } = useApiRenderJobs({ brandId, trackedIds: jobIds });
  useEffect(() => {
    // A failed read keeps the jobs the batch handed back; the hook's poll retries.
    refreshJobs({ preferCache: true }).catch(() => undefined);
  }, [refreshJobs]);
  const latest = fired.map((job) => jobs.find((item) => item.id === job.id) ?? job);
  const count = (status: ApiRenderJob['status']) =>
    latest.filter((job) => job.status === status).length;
  const settling = latest.length - count('finished') - count('failed');

  return (
    <>
      <ul aria-label="Fired renders" className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {latest.map((job) => {
          const steps = jobSteps(job);
          const done = steps.filter((item) => item.state === 'done').length;
          const now =
            steps.find((item) => item.state === 'error') ??
            steps.find((item) => item.state === 'active') ??
            steps.findLast((item) => item.state === 'done');
          const name = job.labelPath.length ? job.labelPath.join(' / ') : (job.label ?? 'Untitled');
          return (
            <li
              key={job.id}
              className={cn(
                ROW,
                'grid-cols-[minmax(0,16rem)_auto_minmax(0,1fr)_3.5rem_1rem]',
              )}
            >
              <button
                type="button"
                className="min-w-0 truncate rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden disabled:no-underline"
                disabled={!job.renderSetRowId}
                onClick={() => job.renderSetRowId && onShowRow(job.renderSetRowId)}
              >
                {name}
              </button>
              <span
                role="img"
                aria-label={`${done} of ${steps.length} steps done`}
                className="flex h-3 items-stretch gap-px"
              >
                {steps.map((item) => (
                  <span key={item.label} className={cn('w-0.5 rounded-full', TICK[item.state])} />
                ))}
              </span>
              <span className="min-w-0 truncate text-muted-foreground">
                {now ? [now.label, now.detail].filter(Boolean).join(' · ') : 'Queued'}
              </span>
              <span className="text-right font-mono tabular-nums text-muted-foreground">
                {elapsed(job)}
              </span>
              {job.status === 'finished' ? (
                <CheckCircle2 className="size-3.5 text-success" aria-label="Finished" />
              ) : job.status === 'failed' ? (
                <AlertCircle className="size-3.5 text-destructive" aria-label="Failed" />
              ) : (
                <Loader2
                  className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-label="In progress"
                />
              )}
            </li>
          );
        })}
      </ul>
      <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-border px-[var(--card-pad)] font-mono text-2xs uppercase tracking-wide text-muted-foreground">
        {[
          settling ? `${settling} rendering` : null,
          count('finished') ? `${count('finished')} finished` : null,
          count('failed') ? `${count('failed')} failed` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        <Button
          type="button"
          size="xs"
          variant="link"
          className="ml-auto font-sans normal-case tracking-normal"
          onClick={() => onOpenLedger(jobIds)}
        >
          Open Render ledger
        </Button>
      </footer>
    </>
  );
}

function readinessLine(readiness: ApiRenderBatchReadiness): string {
  if (readiness.state === 'READY') {
    return `Ready · ${readiness.readyRows} of ${plural(readiness.totalRows, 'row')} checked`;
  }
  if (readiness.state === 'BLOCKED') {
    return `Blocked · ${plural(readiness.blockedRows, 'row')} can’t render as they are`;
  }
  return `Check incomplete · ${plural(readiness.unknownRows, 'row')} couldn’t be fully checked — they can still render`;
}
