'use client';

import {
  type ApiRenderBatchReadiness,
  type ApiRenderBatchRecord,
  type ApiRenderDeliveryDestination,
  type ApiRenderDeliveryDestinationsResponse,
  type ApiRenderDeliveryTarget,
  type ApiRenderTemplateContract,
  templateDisplayName,
} from '@continuum/contracts';
import { Check, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  APPROVAL_COPY,
  DeliveryTargetPicker,
  type MetaPickerState,
  metaDeliveryProblems,
  replaceOutputId,
} from '@/components/forge/DeliveryTargetPicker';
import {
  describeSlackFailure,
  isSlackDeliveryUnavailable,
  SlackDestinationPicker,
  type SlackPickerState,
} from '@/components/forge/SlackDestinationPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast-imperative';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// The last look before a batch is spent: exactly the rows × formats about to render.
//
//   Review  — a batch preflight over the records as they are, for the readiness block and the
//             guardrails per row. Editing happens back in the grid; nothing here changes a value.
//   Deliver — the Library always; a Slack destination; a Meta ad per row, held for approval.
//   Confirm — a second batch preflight carrying `slack` and each row's delivery, so the signed
//             token covers exactly what was reviewed, then create batch.
//
// The render set is already saved by the caller, so every record points at an immutable revision.
// `records[i]` belongs to `rows[i]`. The ROW is the source of truth for delivery: it is applied to
// its record at confirm, and a replacing row's record is narrowed to the one format chosen here.

export type RenderPreflightRow = {
  rowId: string;
  label: string;
  labelPath: string[];
  outputIds: string[];
  delivery?: ApiRenderDeliveryTarget;
};

export type RenderPreflightDialogProps = {
  open: boolean;
  brandId: string;
  bindingId: string | null;
  templateKey: string;
  contractHash: string;
  contract: ApiRenderTemplateContract;
  rows: RenderPreflightRow[];
  records: ApiRenderBatchRecord[];
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onClose: () => void;
  onFired: (jobIds: string[]) => void;
};

type Step = 'review' | 'deliver' | 'confirm';
const STEPS: { id: Step; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'deliver', label: 'Deliver' },
  { id: 'confirm', label: 'Confirm' },
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

export function RenderPreflightDialog({
  open,
  brandId,
  bindingId,
  templateKey,
  contractHash,
  contract,
  rows,
  records,
  onDeliveryChange,
  onClose,
  onFired,
}: RenderPreflightDialogProps) {
  const [step, setStep] = useState<Step>('review');
  const [review, setReview] = useState<Review>({ state: 'loading' });
  const [destinations, setDestinations] = useState<Destinations>('loading');
  const [slackDestination, setSlackDestination] = useState<ApiRenderDeliveryDestination | null>(
    null,
  );
  const [formatByRow, setFormatByRow] = useState<Record<string, string>>({});
  const [firing, setFiring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const outputs = contract.outputs;
  const formatLabel = (id: string) => outputs.find((output) => output.id === id)?.label ?? id;
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
  // A replace swaps one creative, so it renders one format whatever the row picked.
  const rowRenderCount = (row: RenderPreflightRow) =>
    row.delivery?.action === 'replace' ? 1 : row.outputIds.length || outputs.length || 1;
  const renderCount = rows.reduce((total, row) => total + rowRenderCount(row), 0);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: one review per opening; Retry re-runs it.
  useEffect(() => {
    if (open) void runReview();
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, brandId]);

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
    plural(renderCount, 'render'),
    'Library',
    ...(slackDestination ? [`#${slackDestination.channelName}`] : []),
    ...(replacements.length
      ? [`${plural(replacements.length, 'ad replacement')} held for approval`]
      : []),
    ...(newAds.length ? [`${plural(newAds.length, 'new paused ad')} held for approval`] : []),
  ].join(' · ');

  const confirm = async () => {
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
      toast.success(`${plural(batch.jobs.length, 'render')} queued`);
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
    step === 'review'
      ? review.state === 'ready' && review.readiness.state !== 'BLOCKED'
      : step === 'deliver' && !deliverProblems.length;

  return (
    <Dialog open={open} onOpenChange={(next) => (next || firing ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Render {rows.length} row{rows.length === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            {templateName} · {plural(renderCount, 'render')}
          </DialogDescription>
        </DialogHeader>

        <ol aria-label="Pre-flight steps" className="flex items-center gap-1.5 text-2xs">
          {STEPS.map((item, index) => (
            <li
              key={item.id}
              aria-current={item.id === step ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5',
                item.id === step
                  ? 'border-primary/40 text-foreground'
                  : index < stepIndex
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {index < stepIndex ? <Check className="size-3" aria-hidden /> : null}
              {item.label}
            </li>
          ))}
        </ol>

        {step === 'review' ? (
          <div className="space-y-2 text-xs">
            {review.state === 'loading' ? (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Checking{' '}
                {plural(rows.length, 'row')} against the workspace…
              </p>
            ) : review.state === 'ready' ? (
              <p className="font-medium">{readinessLine(review.readiness)}</p>
            ) : review.state === 'refused' ? (
              <div role="alert" className="text-destructive">
                <p className="font-medium">{review.message}</p>
                {review.details.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
                <p className="text-muted-foreground">Fix the row in the grid, then render again.</p>
              </div>
            ) : (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
                {review.message}
                <Button type="button" size="xs" variant="outline" onClick={() => void runReview()}>
                  Retry
                </Button>
              </div>
            )}
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {rows.map((row, index) => {
                const findings =
                  review.state === 'ready'
                    ? review.readiness.findings.filter((finding) =>
                        finding.rowIndexes.includes(index),
                      )
                    : [];
                return (
                  <li key={row.rowId} className="space-y-0.5 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        title={row.labelPath.join(' / ')}
                      >
                        {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
                      </span>
                      <span className="text-muted-foreground">
                        {row.delivery?.action === 'replace'
                          ? rowOutputIds(row).map(formatLabel).join(', ') || 'One format'
                          : row.outputIds.length
                            ? row.outputIds.map(formatLabel).join(', ')
                            : 'All formats'}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {plural(rowRenderCount(row), 'render')}
                      </span>
                    </div>
                    {findings.map((finding) => (
                      <p
                        key={`${finding.code}:${finding.variableKey ?? ''}`}
                        className={
                          finding.severity === 'unknown'
                            ? 'text-muted-foreground'
                            : 'text-amber-700 dark:text-amber-300'
                        }
                      >
                        {finding.variableKey ? `${variableLabel(finding.variableKey)}: ` : ''}
                        {finding.message}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
            <p className="text-2xs text-muted-foreground">
              To change a value, close this and edit the row in the grid.
            </p>
          </div>
        ) : step === 'deliver' ? (
          <div className="space-y-4 text-xs">
            <section className="space-y-1">
              <h3 className="text-xs font-medium">Library</h3>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="size-3.5 text-emerald-600" aria-hidden /> Every render is saved to
                this brand’s Library.
              </p>
            </section>
            <section className="space-y-1">
              <h3 className="text-xs font-medium">Slack</h3>
              <SlackDestinationPicker
                brandId={brandId}
                slack={slack}
                value={slackDestination}
                onChange={setSlackDestination}
              />
            </section>
            <section className="space-y-1">
              <h3 className="text-xs font-medium">Meta ads</h3>
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
            </section>
            {deliverProblems.length ? (
              <p role="status" className="text-amber-700 dark:text-amber-300">
                {deliverProblems.join(' ')}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <p className="text-sm font-medium">{summary}</p>
            {replacements.length || newAds.length ? (
              <>
                <ul className="divide-y rounded-md border">
                  {[...replacements, ...newAds].map((row) => (
                    <li key={row.rowId} className="flex flex-wrap gap-x-2 px-3 py-1.5">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted-foreground">
                        {row.delivery?.action === 'replace'
                          ? `replaces ${row.delivery.adName ?? row.delivery.adId} · ${rowOutputIds(row).map(formatLabel).join(', ')}`
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

        <DialogFooter>
          {step === 'review' ? (
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={firing}
              onClick={() => setStep(STEPS[stepIndex - 1]?.id ?? 'review')}
            >
              Back
            </Button>
          )}
          {step === 'confirm' ? (
            <Button type="button" className="gap-1.5" disabled={firing} onClick={confirm}>
              {firing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Play className="size-3.5" aria-hidden />
              )}
              Confirm {plural(renderCount, 'render')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canAdvance}
              onClick={() => setStep(STEPS[stepIndex + 1]?.id ?? 'confirm')}
            >
              Next
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
