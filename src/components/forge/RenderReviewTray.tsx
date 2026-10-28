'use client';

import {
  type ApiRenderBatchPreflightRequest,
  type ApiRenderBatchReadiness,
  type ApiRenderBatchRecord,
  type ApiRenderDeliveryDestination,
  type ApiRenderDeliveryDestinationsResponse,
  type ApiRenderDeliveryTarget,
  type ApiRenderEncodeOverride,
  type ApiRenderJob,
  type ApiRenderReadinessFinding,
  type ApiRenderTemplateContract,
  describeEncodeSettings,
  encodeContainerOf,
  isWebTemplateKey,
  leavesCheckIncomplete,
  mergeEncodeSettings,
  outputFormatsOfParse,
  type Renderer,
  readinessOf,
  templateDisplayName,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ApprovalDestinationsField,
  approvalRoomName,
  FORGE_APPROVAL_COPY,
} from '@/components/forge/ApprovalDestinationsField';
import {
  APPROVAL_COPY,
  DeliveryTargetPicker,
  type MetaPickerState,
  metaDeliveryProblems,
  replaceOutputId,
} from '@/components/forge/DeliveryTargetPicker';
import { approvalDestinationsKey } from '@/components/forge/DestinationApproversPanel';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { explainFinding, readinessLine, readinessReasons } from '@/components/forge/readinessCopy';
import { jobSteps } from '@/components/forge/renderJobChecks';
import {
  isFontPreflightRefusal,
  renderedRatios,
  rowFileCount,
} from '@/components/forge/renderRequestRows';
import { RatioChips } from '@/components/forge/requestCells';
import {
  describeSlackFailure,
  isSlackDeliveryUnavailable,
  SlackDestinationPicker,
  type SlackPickerState,
} from '@/components/forge/SlackDestinationPicker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/toast-imperative';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  canRetry,
  clearHold,
  confirmUnderHold,
  type HeldBatch,
  type HoldScope,
  heldCopy,
  isHeld,
  RenderHeldError,
  resendHeld,
  retryHeld,
  SIGNED_OUT,
  type SignedBatch,
} from '@/components/forge/renderHold';
import { ApiError } from '@/lib/api/errors';
import { fetchApprovalDestinations } from '@/lib/library/renderApprovals';
import { fetchTemplateSources } from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';
import { useApiRenderJobs } from '@/StudioCanvas/nodes/api-render/useApiRenderJobs';

// The last look before a batch is spent, docked under the grid instead of over it: the rows stay
// in view and editable while this reads them.
//
//   Review  — a batch preflight over the records as they are, for the readiness block and the
//             guardrails per row. Editing happens in the grid above; nothing here changes a value.
//   Deliver — the Library always; a Slack destination; approval rooms; a Meta ad per row, held
//             for approval. The defaults read as one line until someone asks to change them.
//   Confirm — only when a row goes to Meta, so the ads it touches are read once more. Without
//             one, what Confirm says (Proof or Final, each row's output) sits at the foot of
//             Deliver. Either way Render runs a second batch preflight carrying `slack`, each
//             row's delivery, `final` and `renderer`, so the signed token covers exactly what was
//             reviewed, then create batch.
//   Running — the fired jobs, polled until they settle.
//
// One button moves the tray on, always at the bottom right, named for what it does next.
//
// The caller saves the set before handing over `reviewKey`, so every record points at an
// immutable revision, and rebuilds `records` from the rows on every render. `stale` says the rows,
// the selection or the revision moved since that key: the tray goes back to Review, says so, and
// asks the server nothing until the person presses Check again. `records[i]`
// belongs to `rows[i]`. The ROW is the source of truth for delivery: it is applied to its record
// at confirm, and a replacing row's record is narrowed to the one format chosen here.

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
  templateRef?: string | null;
  /** The set's pinned template revision: a re-pin changes every row's check, nothing else here does. */
  templateRevisionId?: string | null;
  contract: ApiRenderTemplateContract;
  rows: RenderPreflightRow[];
  skippedRows?: { label: string; message: string }[];
  records: ApiRenderBatchRecord[];
  /** A new value is a new snapshot to review: the tray opening, or a re-check. */
  reviewKey: number;
  stale: boolean;
  /** Why Check again cannot run — no rows selected, say. Null when it can. */
  recheckBlocked: string | null;
  /** A re-check is under way, or waiting on rows still being checked. */
  rechecking: boolean;
  /** Why this person cannot ask for a Final render. Null when they can. */
  finalBlocked: string | null;
  /** createBatch failed, whatever the status: the caller holds this batch (renderHold.ts). */
  /** The hold this template renders under (renderHold.ts); null when no user is signed in. */
  holdScope: HoldScope | null;
  /** A batch is held, by this confirm or by another surface or tab: open it instead. */
  onHeld: () => void;
  onRecheck: () => void;
  /**
   * Review was refused for something other than fonts; these rows' own checks can say which.
   * Resolves to how many of them refuse alone, and how many could not be checked at all.
   * `again` asks even when these rows were just asked.
   */
  onRefused?: (rowIds: string[], options?: { again?: boolean }) => Promise<RowsAsked>;
  /** Review passed for these rows: whatever an earlier refusal said about them is out of date. */
  onPassed?: (rowIds: string[]) => void;
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
  | { state: 'loading'; checking: number }
  | { state: 'ready'; readiness: ApiRenderBatchReadiness }
  | {
      state: 'refused';
      message: string;
      details: string[];
      canOverrideFonts: boolean;
      /** What each row said when asked alone, once the caller has asked. */
      asked?: RowsAsked;
    }
  | { state: 'failed'; message: string };

type Destinations =
  | ApiRenderDeliveryDestinationsResponse
  | 'loading'
  | 'unavailable'
  | { error: string };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What a refused batch's rows said when each was asked alone. */
export type RowsAsked = { refused: number; unchecked: number };

function describeFailure(error: unknown): {
  message: string;
  details: string[];
  canOverrideFonts: boolean;
} {
  const message = describeRenderDiscoveryFailure(error);
  const guardrails = error instanceof ApiError ? error.payload?.guardrails : undefined;
  const details = Array.isArray(guardrails)
    ? guardrails.flatMap((item) =>
        item && typeof item === 'object' && 'message' in item && typeof item.message === 'string'
          ? [item.message]
          : [],
      )
    : [];
  const codes = Array.isArray(guardrails)
    ? guardrails.flatMap((item) =>
        item && typeof item === 'object' && 'code' in item && typeof item.code === 'string'
          ? [
              {
                code: item.code,
                ...('severity' in item && typeof item.severity === 'string'
                  ? { severity: item.severity }
                  : {}),
              },
            ]
          : [],
      )
    : [];
  const canOverrideFonts =
    error instanceof ApiError && isFontPreflightRefusal(error.code ?? error.message, codes);
  return { message, details, canOverrideFonts };
}

/**
 * What a row's files come out as, grouped: each distinct setting and the ratios that get it.
 * Only the row's own override is described — "Template default" means it asks for nothing more.
 * `ratios` is what the row renders when the template publishes no outputs.
 */
export function outputGroups(
  contract: ApiRenderTemplateContract,
  outputIds: string[],
  encode: ApiRenderEncodeOverride | undefined,
  ratios: string[],
): Array<{ summary: string; ratios: string[] }> {
  const video = contract.template.outputKinds.includes('video');
  // A template that publishes no outputs renders its source's ratios together, as they are.
  if (contract.outputs.length === 0) {
    return [{ summary: video ? 'Template default' : 'Still image', ratios }];
  }
  const picked = outputIds.length
    ? contract.outputs.filter((output) => outputIds.includes(output.id))
    : contract.outputs;
  const groups = new Map<string, string[]>();
  for (const output of picked) {
    const container = encodeContainerOf(output.mediaType);
    // An older forge names no container; a template that renders no video is stills either way.
    const still =
      container === null && (Boolean(output.mediaType) || output.encode === null || !video);
    const summary = still
      ? 'Still image'
      : (describeEncodeSettings(
          mergeEncodeSettings(encode?.default, encode?.outputs?.[output.id]),
          container,
        ) ?? 'Template default');
    groups.set(summary, [...(groups.get(summary) ?? []), output.ratio ?? output.label]);
  }
  return [...groups].map(([summary, ratios]) => ({ summary, ratios }));
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
  templateRef,
  templateRevisionId,
  contract,
  rows,
  skippedRows = [],
  records,
  reviewKey,
  stale,
  recheckBlocked,
  rechecking,
  finalBlocked,
  holdScope,
  onHeld,
  onRecheck,
  onRefused,
  onPassed,
  onDeliveryChange,
  onClose,
  onFired,
  onOpenLedger,
  onShowRow,
}: RenderReviewTrayProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('review');
  const [review, setReview] = useState<Review>({ state: 'loading', checking: rows.length });
  const [destinations, setDestinations] = useState<Destinations>('loading');
  const [slackDestination, setSlackDestination] = useState<ApiRenderDeliveryDestination | null>(
    null,
  );
  const [approvalDestinationIds, setApprovalDestinationIds] = useState<string[]>([]);
  const [approvalWarning, setApprovalWarning] = useState<string | null>(null);
  const [formatByRow, setFormatByRow] = useState<Record<string, string>>({});
  const [editingDelivery, setEditingDelivery] = useState(false);
  // "Change" unmounts the button that had focus; focus the options it opened so Escape still
  // reaches the tray instead of falling to <body>.
  const deliveryEditorRef = useRef<HTMLElement>(null);
  const [final, setFinal] = useState(false);
  const [renderer, setRenderer] = useState<Renderer>('after_effects');
  // Sticky for the rest of this tray: a person who accepted the missing faces to review must
  // not have the render refused again when they fire it.
  const [acceptMissingFonts, setAcceptMissingFonts] = useState(false);
  const [firing, setFiring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Each fired job beside the row it rendered, so a row the render API refused can be sent again.
  const [firedRows, setFiredRows] = useState<Array<{ job: ApiRenderJob; row: number }>>([]);
  const fired = firedRows.map((item) => item.job);
  // Failed with no task: the render API never took it (UTEC 09-29: a 503 on row 18 of 24).
  const unsent = firedRows.filter((item) => item.job.status === 'failed' && !item.job.taskUid);
  // The same read ApprovalDestinationsField makes, so the one-line summary can name the rooms.
  const rooms =
    useQuery({
      queryKey: approvalDestinationsKey(brandId),
      queryFn: () => fetchApprovalDestinations(brandId),
      staleTime: FORGE_STALE_MS.active,
      retry: false,
    }).data?.destinations ?? [];

  const outputs = contract.outputs;
  // A template that authors no outputs (133) still delivers named comps, and preflight takes one
  // as a replace's one `outputId` — so those are what a replacing row picks from.
  const parse = useQuery({
    queryKey: forgeQueryKeys.templateSources(brandId),
    queryFn: () => fetchTemplateSources(brandId),
    staleTime: FORGE_STALE_MS.lists,
    enabled: outputs.length === 0,
  }).data?.find((source) => source.templateKey === templateKey)?.parse;
  const replaceFormats: Array<{ id: string; label: string; ratio: string | null }> = outputs.length
    ? outputs
    : outputFormatsOfParse(parse).map((format) => ({
        id: format.id,
        label: format.ratio ? `${format.ratio} · ${format.id}` : format.id,
        ratio: format.ratio,
      }));
  const variableLabel = (key: string | undefined) =>
    contract.variables.find((variable) => variable.key === key)?.label ?? key;
  const templateName = contract.template.displayName ?? templateDisplayName(contract.template.name);

  const rowOutputIds = (row: RenderPreflightRow): string[] => {
    if (row.delivery?.action === 'replace') {
      const only = replaceOutputId(row, replaceFormats, formatByRow);
      return only ? [only] : [];
    }
    return row.outputIds;
  };
  /** The ratio of each file a row renders: a replace renders only its one chosen format. */
  const rowRatios = (row: RenderPreflightRow): string[] => {
    if (row.delivery?.action !== 'replace') return renderedRatios(contract, row.outputIds);
    const [only] = rowOutputIds(row);
    const format = replaceFormats.find((item) => item.id === only);
    return format ? [format.ratio ?? format.label] : [];
  };
  const fileCount = rows.reduce((total, row) => total + rowFileCount(contract, row), 0);
  // A web component renders in Continuum's render browser and lands in the Library only: no
  // renderer to pick, and Slack, Meta and approval rooms are refused for it.
  const web = isWebTemplateKey(templateKey);

  // Each record's findings, by everything its check reads. The set's revision is left out: every
  // save bumps it, and it changes no row's verdict — so Check again after an edit asks only about
  // the rows it changed.
  const verdicts = useRef(new Map<string, ApiRenderReadinessFinding[]>());
  // Only the newest review lands: a slow answer about older rows must not replace a newer one.
  const latestReview = useRef(0);
  const refused = useRef(onRefused);
  refused.current = onRefused;
  const passed = useRef(onPassed);
  passed.current = onPassed;

  /** Asks the caller which of a refused batch's rows refuse alone, and says what came back. */
  const askRows = useCallback((mine: number, rowIds: string[], again = false) => {
    setReview((current) =>
      current.state === 'refused' ? { ...current, asked: undefined } : current,
    );
    void refused.current?.(rowIds, { again }).then((asked) => {
      if (mine !== latestReview.current) return;
      setReview((current) => (current.state === 'refused' ? { ...current, asked } : current));
    });
  }, []);
  const askedRows = records.flatMap((record) => record.renderSetRowId ?? []);

  // Review reads the records exactly as the grid built them — no delivery, every format.
  const runReview = useCallback(
    async (acceptFonts = acceptMissingFonts, { fresh = false, again = false } = {}) => {
      const mine = ++latestReview.current;
      if (fresh) verdicts.current.clear();
      const keys = records.map((record) =>
        JSON.stringify([
          brandId,
          bindingId,
          templateKey,
          contractHash,
          templateRef ?? null,
          templateRevisionId ?? null,
          acceptFonts,
          approvalDestinationIds,
          renderer,
          record.renderSetRowId ?? null,
          record.variables ?? null,
          record.outputIds ?? null,
          record.encode ?? null,
        ]),
      );
      const settle = () => {
        setReview({
          state: 'ready',
          readiness: readinessOf(keys.map((key) => verdicts.current.get(key) ?? [])),
        });
        passed.current?.(records.flatMap((record) => record.renderSetRowId ?? []));
      };
      const todo = records.flatMap((record, index) =>
        verdicts.current.has(keys[index]!) ? [] : [{ record, key: keys[index]! }],
      );
      if (!todo.length) return settle();
      setReview({ state: 'loading', checking: todo.length });
      try {
        const response = await apiRendersApi.batchPreflight({
          brandId,
          ...(bindingId ? { bindingId } : {}),
          templateKey,
          contractHash,
          ...(templateRef ? { templateRef } : {}),
          records: todo.map(({ record: { delivery: _delivery, ...record } }) => record),
          ...(acceptFonts ? { acceptMissingFonts: true } : {}),
          ...(approvalDestinationIds.length ? { approvalDestinationIds } : {}),
          ...(renderer === 'experimental' ? { renderer } : {}),
        });
        if (mine !== latestReview.current) return;
        // A row that passed has no findings, and is as settled as one that has some.
        const checked = todo.map((): ApiRenderReadinessFinding[] => []);
        for (const { rowIndexes, ...finding } of response.readiness.findings)
          for (const at of rowIndexes) checked[at]?.push(finding);
        todo.forEach(({ key }, at) => verdicts.current.set(key, checked[at] ?? []));
        settle();
      } catch (error) {
        if (mine !== latestReview.current) return;
        const { message, details, canOverrideFonts } = describeFailure(error);
        const refusal = error instanceof ApiError && error.status === 422;
        setReview(
          refusal
            ? { state: 'refused', message, details, canOverrideFonts }
            : { state: 'failed', message },
        );
        if (refusal && !canOverrideFonts)
          // An explicit Retry asks the rows again, even when they were just asked.
          askRows(
            mine,
            todo.flatMap(({ record }) => record.renderSetRowId ?? []),
            again,
          );
      }
    },
    [
      askRows,
      acceptMissingFonts,
      brandId,
      bindingId,
      templateKey,
      contractHash,
      templateRef,
      templateRevisionId,
      records,
      approvalDestinationIds,
      renderer,
    ],
  );

  // Only a font refusal offers a way past itself. Every other 422 — a stale revision, a
  // delivery target that no longer exists — is a thing to fix, not a thing to override.
  const refusedOnFonts = review.state === 'refused' && review.canOverrideFonts;
  // Every row asked alone passed: what is left to refuse is the batch's delivery choice.
  const refusedOnDelivery =
    review.state === 'refused' &&
    !review.canOverrideFonts &&
    review.asked?.refused === 0 &&
    review.asked.unchecked === 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: one review per snapshot; Retry and Re-check re-run it.
  useEffect(() => {
    setStep('review');
    setProblem(null);
    setAcceptMissingFonts(false);
    void runReview(false);
  }, [reviewKey]);

  useEffect(() => {
    if (stale) setStep((current) => (current === 'running' ? current : 'review'));
  }, [stale]);

  // An edit with the review open asks the server nothing: the review is marked stale, and Check
  // again (one save and one batch preflight) is the person's to press.

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
  const deliverProblems = metaDeliveryProblems(rows, replaceFormats, formatByRow, meta);
  const replacements = rows.filter((row) => row.delivery?.action === 'replace');
  const newAds = rows.filter((row) => row.delivery?.action === 'create');
  // A Meta target is the one thing worth a separate look before rendering.
  const goesToMeta = replacements.length + newAds.length > 0;
  // No room picked is a choice, not a gap: the ads wait in Forge's approvals for a brand member.
  const approvesInForge = goesToMeta && !approvalDestinationIds.length;
  const deliverBlockers = deliverProblems;
  // Something to fix opens the full delivery form, and it stays open while it is being fixed.
  if (step === 'deliver' && deliverBlockers.length && !editingDelivery) setEditingDelivery(true);

  const deliveryLine = [
    'Library',
    ...(slackDestination ? [`#${slackDestination.channelName}`] : []),
    ...rooms
      .filter((room) => approvalDestinationIds.includes(room.id))
      .map(
        (room) =>
          `${approvalRoomName(room)} approval · ${
            room.activeApprovers ? plural(room.activeApprovers, 'approver') : 'no approvers yet'
          }`,
      ),
    ...(approvesInForge ? ['Approval in Forge'] : []),
    ...(replacements.length
      ? [`${plural(replacements.length, 'ad replacement')} held for approval`]
      : []),
    ...(newAds.length ? [`${plural(newAds.length, 'new paused ad')} held for approval`] : []),
  ].join(' · ');
  const summary = `${plural(fileCount, 'file')} · ${deliveryLine}`;

  /** Fires every row, or — to resend what the render API refused — only the rows named. */
  const confirm = async (only?: number[]) => {
    // The records below are rebuilt from the rows on screen; a review of other rows signs nothing.
    if (stale) {
      setStep('review');
      return;
    }
    if (!holdScope) {
      setProblem(SIGNED_OUT);
      return;
    }
    // Read fresh, not from state: another tab or the canvas may have held this template since.
    if (isHeld(holdScope)) {
      onHeld();
      return;
    }
    const indexes = only ?? rows.map((_, index) => index);
    setFiring(true);
    setProblem(null);
    setApprovalWarning(null);
    let signed: SignedBatch | null = null;
    try {
      signed = await signBatch(indexes);
      const token = signed.token;
      const batch = await confirmUnderHold(holdScope, signed, () =>
        apiRendersApi.createBatch({ confirmationToken: token }),
      );
      for (const job of batch.jobs)
        queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
      // Not awaited: the jobs are already cached above, and the lists can follow.
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.approvals(brandId) });
      const refused = batch.jobs.filter((job) => job.status === 'failed' && !job.taskUid).length;
      if (refused > 0) toast.warning(`${batch.jobs.length - refused} queued · ${refused} not sent`);
      else toast.success(`${plural(batch.jobs.length, 'render')} queued`);
      // By the row each job names, so a re-sent token's jobs land beside their own rows.
      const submitted = batch.jobs.map((job, k) => {
        const at = rows.findIndex((row) => row.rowId === job.renderSetRowId);
        return { job, row: at >= 0 ? at : (indexes[k] ?? k) };
      });
      setFiredRows((previous) =>
        only ? [...previous.filter((item) => !only.includes(item.row)), ...submitted] : submitted,
      );
      setStep('running');
      onFired(batch.jobs.map((job) => job.id));
    } catch (error) {
      // Held: by another surface since the sign, or by this createBatch failing, whatever the
      // status (some rows may exist). Either way the hold opens, and the ledger is re-read.
      if (signed || error instanceof RenderHeldError) {
        void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
        onHeld();
        return;
      }
      const { message, details } = describeFailure(error);
      setProblem([message, ...details].join(' '));
    } finally {
      setFiring(false);
    }
  };

  /** The fire's own preflight: delivery, Slack, consent, Final and renderer signed into a token. */
  const signBatch = async (indexes: number[]): Promise<SignedBatch> => {
    const request: ApiRenderBatchPreflightRequest = {
      brandId,
      ...(bindingId ? { bindingId } : {}),
      templateKey,
      contractHash,
      ...(templateRef ? { templateRef } : {}),
      records: indexes.flatMap((index) => {
        if (!records[index]) return [];
        const { delivery: _delivery, ...record } = records[index];
        const row = rows[index];
        if (!row?.delivery) return record;
        return row.delivery.action === 'replace'
          ? { ...record, delivery: row.delivery, outputIds: rowOutputIds(row) }
          : { ...record, delivery: row.delivery };
      }),
      ...(slackDestination ? { slack: { destinationId: slackDestination.id } } : {}),
      // Carried from the review: without it the fire is refused again on the same fonts the
      // person already accepted, and the tray looks broken rather than protective.
      ...(acceptMissingFonts ? { acceptMissingFonts: true } : {}),
      ...(approvalDestinationIds.length ? { approvalDestinationIds } : {}),
      // Signed into the token: a batch reviewed as a proof cannot be created as a final.
      ...(final ? { final: true } : {}),
      // Signed into the token too: the Backend decides per job whether it is eligible, and a
      // job it is not, or one the renderer refuses, goes to After Effects with the reason kept.
      ...(renderer === 'experimental' ? { renderer } : {}),
    };
    const preflight = await apiRendersApi.batchPreflight(request);
    setApprovalWarning(preflight.approval?.warning ?? null);
    return {
      token: preflight.confirmationToken,
      request,
      expiresAt: preflight.expiresAt,
      batchId: preflight.batchId,
    };
  };

  const steps = goesToMeta ? STEPS : STEPS.filter((item) => item.id !== 'confirm');
  const stepIndex = steps.findIndex((item) => item.id === step);
  const reviewed = review.state === 'ready' && review.readiness.state !== 'BLOCKED';
  // The step's one way forward: to the next step, or — on the last one — Render.
  const primary: { label: string; disabled: boolean; run: () => void; fires?: true } =
    step === 'review'
      ? { label: 'Next: delivery', disabled: stale || !reviewed, run: () => setStep('deliver') }
      : step === 'deliver' && goesToMeta
        ? {
            label: 'Next: confirm',
            disabled: stale || deliverBlockers.length > 0,
            run: () => setStep('confirm'),
          }
        : {
            label: `Render ${plural(fileCount, 'file')}`,
            disabled: firing || stale || deliverBlockers.length > 0,
            run: () => void confirm(),
            fires: true,
          };

  // What Confirm says, wherever Confirm is: Proof or Final, and what each row's files come out as.
  const confirmation = (
    <>
      <Label className="px-[var(--card-pad)] py-2 text-xs">
        <Checkbox
          checked={acceptMissingFonts}
          onCheckedChange={(checked) => setAcceptMissingFonts(checked === true)}
        />
        Allow font substitution for this batch
      </Label>
      {acceptMissingFonts ? (
        <p role="status" className="px-[var(--card-pad)] py-2 text-xs text-warning">
          Missing-font check bypassed for this batch. The worker may substitute fonts.
        </p>
      ) : null}
      <section aria-label="Render as" className="flex flex-col gap-1.5 px-[var(--card-pad)] py-2">
        <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          Render as
        </h3>
        <RadioGroup
          aria-label="Render as"
          value={final ? 'final' : 'proof'}
          onValueChange={(value) => setFinal(value === 'final')}
          className="flex flex-wrap gap-x-6 gap-y-1.5"
        >
          {/* The label holds only the word, so the radio is named Proof or Final, not its hint. */}
          <div className="flex flex-col gap-0.5">
            <Label className="text-xs">
              <RadioGroupItem value="proof" />
              Proof
            </Label>
            <span className="pl-6 text-muted-foreground">For review. Recorded as a proof.</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Label className="text-xs">
              <RadioGroupItem value="final" disabled={finalBlocked !== null} />
              Final
            </Label>
            <span className="pl-6 text-muted-foreground">
              {finalBlocked ?? 'Ready to go. Recorded as final.'}
            </span>
          </div>
        </RadioGroup>
      </section>
      {web ? null : (
        <section aria-label="Renderer" className="flex flex-col gap-1.5 px-[var(--card-pad)] py-2">
          <h3 className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Renderer
          </h3>
          <RadioGroup
            aria-label="Renderer"
            value={renderer}
            onValueChange={(value) =>
              setRenderer(value === 'experimental' ? 'experimental' : 'after_effects')
            }
            className="flex flex-wrap gap-x-6 gap-y-1.5"
          >
            <div className="flex flex-col gap-0.5">
              <Label className="text-xs">
                <RadioGroupItem value="after_effects" />
                After Effects
              </Label>
              <span className="pl-6 text-muted-foreground">The render farm.</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <Label className="text-xs">
                <RadioGroupItem value="experimental" />
                Continuum&apos;s New Renderer
              </Label>
              <span className="pl-6 text-muted-foreground">
                Anything it can&apos;t render goes to After Effects automatically.
              </span>
            </div>
          </RadioGroup>
        </section>
      )}
      <ul aria-label="Output per row" className="divide-y divide-border border-y border-border">
        {rows.map((row, index) => (
          <li key={row.rowId} className={cn(ROW, 'grid-cols-[minmax(0,16rem)_minmax(0,1fr)]')}>
            <span className="min-w-0 truncate font-medium">
              {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5">
              {outputGroups(
                contract,
                rowOutputIds(row),
                records[index]?.encode,
                rowRatios(row),
              ).map((group) => (
                <span key={group.summary} className="flex items-center gap-1.5">
                  <RatioChips ratios={group.ratios} />
                  <span className="text-muted-foreground">{group.summary}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {problem ? (
        <p role="alert" className="px-[var(--card-pad)] py-1.5 text-destructive">
          {problem}
        </p>
      ) : null}
    </>
  );

  // The rows the batch leaves out, and why: one line each, at Review and again at Deliver.
  const skippedList = skippedRows.length ? (
    <div role="status" className="px-[var(--card-pad)] py-2 text-xs text-warning">
      <p>
        {skippedRows.length} selected row{skippedRows.length === 1 ? '' : 's'} will not render in
        this batch:
      </p>
      <ul aria-label="Rows skipped from this batch">
        {skippedRows.map((row, index) => (
          <li key={`${index}:${row.label}`}>
            {row.label}: {row.message}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

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
          {steps.map((item, index) => (
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
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Close review"
          title="Close (Esc)"
          disabled={firing}
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </header>

      {step === 'running' ? (
        <>
          {approvalWarning ? (
            <p
              role="status"
              className="flex items-center gap-2 border-b border-dashed border-warning/60 bg-warning/10 px-[var(--card-pad)] py-1"
            >
              <AlertTriangle className="size-3.5 shrink-0 text-warning" aria-hidden />
              {approvalWarning}
            </p>
          ) : null}
          {unsent.length > 0 ? (
            <p
              role="status"
              className="flex items-center gap-2 border-b border-dashed border-destructive/60 bg-destructive/10 px-[var(--card-pad)] py-1"
            >
              <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden />
              {plural(unsent.length, 'row')} not sent — the render service refused{' '}
              {unsent.length === 1 ? 'it' : 'them'}.
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="ml-auto"
                disabled={firing}
                onClick={() => void confirm(unsent.map((item) => item.row))}
              >
                Retry {unsent.length}
              </Button>
            </p>
          ) : null}
          <RunningStep
            brandId={brandId}
            fired={fired}
            onShowRow={onShowRow}
            onOpenLedger={onOpenLedger}
          />
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {stale && step === 'review' ? (
              <div
                role="status"
                className="flex items-center gap-2 border-b border-dashed border-warning/60 bg-warning/10 px-[var(--card-pad)] py-1"
              >
                <AlertTriangle className="size-3.5 text-warning" aria-hidden />
                <span className="font-medium">Rows changed since this check.</span>
                {recheckBlocked ? (
                  <span className="text-muted-foreground">{recheckBlocked}.</span>
                ) : null}
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
                    <Loader2
                      className="size-3 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : null}
                  Check again
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
                    <p className="font-medium">
                      {refusedOnFonts
                        ? review.message
                        : refusedOnDelivery
                          ? `The render service refused this batch’s delivery: ${review.message}`
                          : `The render service refused this batch: ${review.message}`}
                    </p>
                    {review.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                    {refusedOnFonts ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            setAcceptMissingFonts(true);
                            void runReview(true);
                          }}
                        >
                          Render anyway
                        </Button>
                        {/* Said plainly, because the file that comes back looks finished either
                            way. A render in a face nobody chose is what this whole gate exists
                            to stop, so taking the file is a choice, never a default. */}
                        <span className="text-muted-foreground">
                          The worker may substitute missing fonts. This choice applies only to this
                          batch and is recorded in the render ledger. To choose the fonts, use the
                          template&rsquo;s Fonts check.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {refusedOnDelivery ? (
                          // Every row passes alone, and alone means with no delivery: the batch
                          // refusals today's batch preflight has left are the delivery's.
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => {
                              setSlackDestination(null);
                              setApprovalDestinationIds([]);
                              setEditingDelivery(true);
                              setStep('deliver');
                            }}
                          >
                            Change delivery
                          </Button>
                        ) : null}
                        {review.asked && review.asked.unchecked > 0 ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => askRows(latestReview.current, askedRows, true)}
                          >
                            Check again
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            void runReview(acceptMissingFonts, { fresh: true, again: true })
                          }
                        >
                          Retry
                        </Button>
                        <span className="text-muted-foreground">
                          {!review.asked
                            ? 'Checking each row…'
                            : review.asked.unchecked > 0
                              ? `Couldn’t check ${plural(review.asked.unchecked, 'row')}.`
                              : review.asked.refused > 0
                                ? `${plural(review.asked.refused, 'row')} won’t render; the grid marks ${review.asked.refused === 1 ? 'it' : 'them'} and Render skips ${review.asked.refused === 1 ? 'it' : 'them'}.`
                                : null}
                        </span>
                      </div>
                    )}
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
                      onClick={() => void runReview(acceptMissingFonts, { fresh: true })}
                    >
                      Check again
                    </Button>
                  </div>
                ) : null}
                {skippedList}
                <ul aria-label="Rows to render" className="divide-y divide-border">
                  {rows.map((row, index) => {
                    const findings =
                      review.state === 'ready'
                        ? review.readiness.findings.filter((finding) =>
                            finding.rowIndexes.includes(index),
                          )
                        : [];
                    const ratios = rowRatios(row);
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
                                'text-pretty',
                                finding.severity === 'unknown' && !leavesCheckIncomplete(finding)
                                  ? 'text-muted-foreground'
                                  : 'text-warning',
                              )}
                            >
                              {explainFinding(finding, variableLabel)}
                            </p>
                          ))}
                        </div>
                        <span className="text-right font-mono tabular-nums text-muted-foreground">
                          {plural(rowFileCount(contract, row), 'file')}
                        </span>
                        {findings.some(
                          (finding) =>
                            finding.severity !== 'unknown' || leavesCheckIncomplete(finding),
                        ) ? (
                          <AlertTriangle
                            className="size-3.5 text-warning"
                            aria-label="Not fully checked"
                          />
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
              <>
                {skippedList}
                {editingDelivery ? null : (
                  <p className="flex flex-wrap items-center gap-x-2 border-b border-border px-[var(--card-pad)] py-2">
                    <span className="font-medium">{deliveryLine}</span>
                    <span aria-hidden className="text-muted-foreground">
                      —
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="link"
                      className="px-0"
                      aria-label="Change delivery"
                      onClick={() => {
                        setEditingDelivery(true);
                        requestAnimationFrame(() => deliveryEditorRef.current?.focus());
                      }}
                    >
                      Change
                    </Button>
                  </p>
                )}
                {/* Mounted while folded too: the approval field seeds the brand's usual rooms. */}
                <section
                  ref={deliveryEditorRef}
                  tabIndex={-1}
                  aria-label="Delivery options"
                  hidden={!editingDelivery}
                  className="grid gap-x-6 outline-none gap-y-3 border-b border-border p-[var(--card-pad)] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.2fr)]"
                >
                  {/* One section per destination; a new destination is one more section here. */}
                  <DeliverSection title="Library">
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <Check className="size-3.5 text-success" aria-hidden /> Every render is saved
                      to this brand’s Library.
                    </p>
                  </DeliverSection>
                  {web ? null : (
                    <>
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
                          outputs={replaceFormats}
                          formatByRow={formatByRow}
                          onDeliveryChange={onDeliveryChange}
                          onFormatChange={(rowId, outputId) =>
                            setFormatByRow((current) => ({ ...current, [rowId]: outputId }))
                          }
                        />
                      </DeliverSection>
                      <DeliverSection title="Approval">
                        <ApprovalDestinationsField
                          brandId={brandId}
                          value={approvalDestinationIds}
                          onChange={setApprovalDestinationIds}
                        />
                      </DeliverSection>
                    </>
                  )}
                </section>
                {goesToMeta ? null : confirmation}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2 p-[var(--card-pad)]">
                  <p className="text-sm font-medium">{summary}</p>
                  <ul className="divide-y divide-border border-y border-border">
                    {[...replacements, ...newAds].map((row) => (
                      <li key={row.rowId} className="flex flex-wrap gap-x-2 py-1.5">
                        <span className="font-medium">{row.label}</span>
                        <span className="text-muted-foreground">
                          {row.delivery?.action === 'replace'
                            ? `replaces ${row.delivery.adName ?? row.delivery.adId} · ${rowRatios(row).join(', ')}`
                            : `new paused ad in ${row.delivery?.adsetName ?? row.delivery?.adsetId}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">{APPROVAL_COPY}</p>
                  {approvesInForge ? (
                    <p className="text-muted-foreground">{FORGE_APPROVAL_COPY}</p>
                  ) : null}
                </div>
                {confirmation}
              </>
            )}
          </div>

          <footer className="flex min-h-11 shrink-0 items-center gap-2 border-t border-border px-[var(--card-pad)] py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-muted-foreground">
              {step === 'review' ? (
                review.state === 'loading' ? (
                  <>
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Checking{' '}
                    {review.checking < rows.length
                      ? `${plural(review.checking, 'changed row')}…`
                      : `${plural(rows.length, 'row')} against the workspace…`}
                  </>
                ) : review.state === 'ready' ? (
                  <ReadinessLine readiness={review.readiness} labelOf={variableLabel} />
                ) : review.state === 'refused' ? (
                  <span className="text-destructive">Can’t render as they are</span>
                ) : (
                  <span className="text-destructive">Couldn’t check the rows</span>
                )
              ) : deliverBlockers.length ? (
                <p role="status" className="flex flex-wrap gap-x-1 text-warning">
                  {deliverBlockers.map((blocker) => (
                    <span key={blocker}>{blocker}</span>
                  ))}
                </p>
              ) : (
                <span className="truncate">
                  {primary.fires ? `${final ? 'Final' : 'Proof'} · ${summary}` : summary}
                </span>
              )}
            </div>
            {stepIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={firing}
                onClick={() => setStep(steps[stepIndex - 1]?.id ?? 'review')}
              >
                Back
              </Button>
            ) : null}
            <Button type="button" disabled={primary.disabled} onClick={primary.run}>
              {primary.fires ? (
                firing ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                ) : (
                  <Play data-icon="inline-start" aria-hidden />
                )
              ) : null}
              {primary.label}
            </Button>
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
      <ul
        aria-label="Fired renders"
        className="min-h-0 flex-1 divide-y divide-border overflow-y-auto"
      >
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
              className={cn(ROW, 'grid-cols-[minmax(0,16rem)_auto_minmax(0,1fr)_3.5rem_1rem]')}
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

/** The verdict, and on hover every reason a row was not fully checked or is checked after render. */
function ReadinessLine({
  readiness,
  labelOf,
}: {
  readiness: ApiRenderBatchReadiness;
  labelOf: (key: string | undefined) => string | undefined;
}) {
  const line = (
    <span
      className={cn(
        'truncate font-medium',
        readiness.state === 'READY' ? 'text-foreground' : 'text-warning',
      )}
    >
      {readinessLine(readiness, labelOf)}
    </span>
  );
  const reasons = readinessReasons(readiness, labelOf);
  if (!reasons.length) return line;
  return (
    <Tooltip>
      <TooltipTrigger className="min-w-0 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-hidden">
        {line}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md flex-col items-start">
        {reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A held batch, read-only: what it signed, why it is held, and the only two ways on. Retry this
 * batch re-sends its token (each row dedupes, so it never makes a row twice) while the token is
 * in memory and unexpired; Open Render ledger lets the hold go.
 */
export function HeldBatchView({
  brandId,
  scope,
  held,
  onOpenLedger,
  onLanded,
  current,
}: {
  brandId: string;
  scope: HoldScope;
  held: HeldBatch;
  /** The rows Render would take now: said apart when they are not the held batch's. */
  current: Array<{ id: string; label: string }>;
  onOpenLedger: (batchId: string | null) => void;
  /** Retry landed: the jobs, for the same result a normal confirm shows. */
  onLanded: (jobs: ApiRenderJob[]) => void;
}) {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [, setNow] = useState(0);
  const expiresAt = held.signed?.expiresAt;
  // Retry goes the moment the token's own expiry passes, not on the next render that happens by.
  useEffect(() => {
    const wait = expiresAt ? Date.parse(expiresAt) - Date.now() : 0;
    if (!(wait > 0)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(wait + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const request = held.signed?.request;
  const metaRows = request?.records.filter((record) => record.delivery).length ?? 0;
  const labels = request?.records.map((record) => record.label ?? 'Untitled') ?? [];
  const heldRows = new Set(
    request?.records.map((record) => `${record.renderSetRowId ?? ''}|${record.label ?? ''}`),
  );
  const differs =
    request !== undefined &&
    (current.length !== heldRows.size ||
      current.some((row) => !heldRows.has(`${row.id}|${row.label}`)));
  const heldTime = new Date(held.heldAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const facts = request
    ? [
        `${plural(request.records.length, 'row')} (${labels.slice(0, 5).join(', ')}${
          labels.length > 5 ? `, +${labels.length - 5} more` : ''
        })`,
        request.final ? 'Final' : 'Proof',
        [
          'Library',
          ...(request.slack ? ['a Slack room'] : []),
          ...(request.approvalDestinationIds?.length
            ? [plural(request.approvalDestinationIds.length, 'approval room')]
            : []),
          ...(metaRows ? [`Meta ads for ${plural(metaRows, 'row')}`] : []),
        ].join(', '),
        ...(request.acceptMissingFonts ? ['missing fonts accepted'] : []),
        ...(request.renderer === 'experimental' ? ['experimental renderer'] : []),
      ]
    : null;
  const retry = async () => {
    setRetrying(true);
    try {
      // Still held on any failure; a token the server no longer takes cannot be retried.
      const batch = await retryHeld(scope, held, (token) => resendHeld(held, token, apiRendersApi));
      for (const job of batch.jobs)
        queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
      toast.success(`${plural(batch.jobs.length, 'render')} queued`);
      onLanded(batch.jobs);
    } catch {
      // The hold already says why.
    } finally {
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
      setRetrying(false);
    }
  };
  return (
    <section
      aria-label="Held batch"
      className="flex h-full min-h-0 flex-col gap-1.5 px-[var(--card-pad)] py-2 text-xs"
    >
      <p role="alert" className="font-medium text-destructive">
        {heldCopy(held)}
      </p>
      <p className="text-muted-foreground">
        {facts
          ? `What it signed: ${facts.join(' · ')}`
          : 'What it signed isn’t known after a reload.'}
      </p>
      {differs ? (
        <p className="text-muted-foreground">Your edits and selection aren’t part of this batch.</p>
      ) : null}
      <p className="text-muted-foreground">
        In the Render ledger, look for the batch from {heldTime}.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {canRetry(held) ? (
          <Button type="button" size="xs" disabled={retrying} onClick={() => void retry()}>
            {retrying ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            Retry this batch
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => {
            clearHold(scope);
            onOpenLedger(held.batchId);
          }}
        >
          Open Render ledger
        </Button>
      </div>
    </section>
  );
}

/** A held batch that landed on Retry: its jobs, as a confirm's Running step shows them. */
export function LandedBatchView({
  brandId,
  jobs,
  onShowRow,
  onOpenLedger,
  onClose,
}: {
  brandId: string;
  jobs: ApiRenderJob[];
  onShowRow: (rowId: string) => void;
  onOpenLedger: (jobIds: string[]) => void;
  onClose: () => void;
}) {
  return (
    <section aria-label="Retried batch" className="flex h-full min-h-0 flex-col text-xs">
      <header className="flex items-center gap-2 border-b border-border px-[var(--card-pad)] py-1.5">
        <span className="font-medium">{plural(jobs.length, 'render')} queued</span>
        <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </header>
      <RunningStep
        brandId={brandId}
        fired={jobs}
        onShowRow={onShowRow}
        onOpenLedger={onOpenLedger}
      />
    </section>
  );
}
