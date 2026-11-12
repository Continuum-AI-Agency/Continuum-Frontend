'use client';

import {
  type ApiRenderBatch,
  type ApiRenderBatchPreflightRequest,
  type ApiRenderBatchPreflightResponse,
  type ApiRenderBatchRecord,
  type ApiRenderDeliveryTarget,
  type ApiRenderEncodeOverride,
  type ApiRenderJob,
  type ApiRenderTemplateContract,
  describeEncodeSettings,
  encodeContainerOf,
  type ForgeRenderSetSettings,
  isWebTemplateKey,
  mergeEncodeSettings,
  type Renderer,
  templateDisplayName,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Play } from 'lucide-react';
import {
  type useTranslations,
  useLocale as useUiLocale,
  useTranslations as useUiTranslations,
} from 'next-intl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  adSetName,
  type MetaPickerState,
  metaDeliveryProblems,
  type RenderPreflightRow,
  type ReplaceFormats,
  replaceOutputId,
  useResolveAdTargets,
} from '@/components/forge/DeliveryTargetPicker';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { useSetApprovalRooms } from '@/components/forge/RenderSetSettingsDialog';
import { explainFinding, readinessLine } from '@/components/forge/readinessCopy';
import {
  canRetry,
  clearHold,
  confirmUnderHold,
  type HeldBatch,
  type HoldScope,
  heldCopy,
  isHeld,
  isPermissionRefusal,
  isSessionRefusal,
  isSetChanged,
  madeNothing,
  NOT_SAVED,
  permissionCopy,
  retryHeld,
  SESSION_EXPIRED,
  SET_CHANGED,
  SIGNED_OUT,
  STALE_MS,
  sendingElsewhere,
} from '@/components/forge/renderHold';
import {
  overridableFinding,
  overrideFor,
  type RenderOverride,
  renderedRatios,
  renderOverrideCopy,
  rowFileCount,
} from '@/components/forge/renderRequestRows';
import { RatioChips } from '@/components/forge/requestCells';
import type { SlackPickerState } from '@/components/forge/SlackDestinationPicker';
import { useForgePresentationText } from '@/components/forge/useForgePresentationText';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/toast-imperative';
import type { UiLocale } from '@/i18n/config';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';
import { describeEncodeSettingsUi } from './encodePresentation';

// The one look before a batch is spent. Where it goes was decided earlier — on the set (its
// default ad set, rooms, Proof or Final) and on each row (its own ad) — so this only reads it back:
// every file, every room, every Meta ad the render creates or replaces, and every refusal a
// person may render through ("Needs your call"), each an explicit tick.
//
// ONE batch preflight, run on open and again when a tick or a choice here changes it. It carries
// each row's own delivery, the set's default ad set as the batch-level `delivery` (a row's own
// target wins; the two are never merged), the rooms, Final, the renderer and the ticked overrides
// — so the token it signs is exactly what Render spends.

export type FiredRow = { rowId: string; job: ApiRenderJob };

type Verdict =
  | { state: 'loading' }
  | { state: 'ready'; preflight: ApiRenderBatchPreflightResponse }
  | {
      state: 'refused';
      message: string;
      details: string[];
      override: RenderOverride | null;
      /** Each row's own preflight was asked and none refused: the refusal is the batch's. */
      wholeBatch?: boolean;
    }
  | { state: 'failed'; message: string };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
/** A token this close to expiry is re-signed rather than spent. */
const TOKEN_MARGIN_MS = 10_000;

function describeFailure(
  error: unknown,
  translate?: ReturnType<typeof useTranslations<'forge'>>,
  present?: (source: string) => string,
): {
  message: string;
  details: string[];
  override: RenderOverride | null;
} {
  const message = describeRenderDiscoveryFailure(error, present);
  const raw = error instanceof ApiError ? error.payload?.guardrails : undefined;
  const findings = Array.isArray(raw)
    ? raw.flatMap((item) =>
        item && typeof item === 'object' && 'code' in item && typeof item.code === 'string'
          ? [
              {
                code: item.code,
                severity: 'severity' in item ? String(item.severity) : undefined,
                message: 'message' in item && typeof item.message === 'string' ? item.message : '',
              },
            ]
          : [],
      )
    : [];
  return {
    message,
    details: findings
      .map((finding) => {
        if (!translate) return finding.message;
        const override = overridableFinding(finding);
        return override
          ? renderOverrideCopy(override, translate).consequence
          : explainFinding(finding, () => undefined, translate);
      })
      .filter(Boolean),
    override: error instanceof ApiError ? overrideFor(error.code ?? error.message, findings) : null,
  };
}

/**
 * A row's own preflight refusing it, in its words: a 422 about the row's values that no tick
 * overrides. Anything else (an outage, a throttle, a set or revision that moved, a refusal a tick
 * lets through) says nothing about the row, and the row stays in the batch.
 */
function rowRefusalOf(
  error: unknown,
  translate?: ReturnType<typeof useTranslations<'forge'>>,
  present?: (source: string) => string,
): string | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  if (/render_set|revision/.test(error.code ?? error.message)) return null;
  const { message, details, override } = describeFailure(error, translate, present);
  if (override) return null;
  return details.length ? details.join(' ') : message;
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
  t?: ReturnType<typeof useUiTranslations<'forge'>>,
  locale: UiLocale = 'en',
): Array<{ summary: string; ratios: string[] }> {
  const video = contract.template.outputKinds.includes('video');
  // A template that publishes no outputs renders its source's ratios together, as they are.
  if (contract.outputs.length === 0) {
    return [
      {
        summary: video
          ? t
            ? t('encodeTemplateDefault')
            : 'Template default'
          : t
            ? t('encodeStillImage')
            : 'Still image',
        ratios,
      },
    ];
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
      ? t
        ? t('encodeStillImage')
        : 'Still image'
      : ((t
          ? describeEncodeSettingsUi(
              mergeEncodeSettings(encode?.default, encode?.outputs?.[output.id]),
              container,
              t,
              locale,
            )
          : describeEncodeSettings(
              mergeEncodeSettings(encode?.default, encode?.outputs?.[output.id]),
              container,
            )) ?? (t ? t('encodeTemplateDefault') : 'Template default'));
    groups.set(summary, [...(groups.get(summary) ?? []), output.ratio ?? output.label]);
  }
  return [...groups].map(([summary, ratios]) => ({ summary, ratios }));
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        {action}
      </h3>
      {children}
    </section>
  );
}

/** A light, see-through blur that leaves the app sidebar uncovered: the grid stays in sight. */
const CONFIRM_OVERLAY =
  'bg-background/20 backdrop-blur-[2px] md:left-[var(--app-sidebar-width,3.5rem)]';

export function RenderConfirmDialog({
  open,
  onOpenChange,
  brandId,
  bindingId,
  templateRef,
  contract,
  rows,
  skippedRows = [],
  records,
  settings,
  calls,
  meta,
  slack,
  outputs,
  finalBlocked,
  metaWritesAllowed,
  onDeliveryChange,
  onChangeSettings,
  onFired,
  onOpenLedger,
  onRowsRefused,
  holdScope,
  held,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  bindingId: string | null;
  templateRef?: string | null;
  contract: ApiRenderTemplateContract;
  /** The rows to render, in grid order; `records[i]` belongs to `rows[i]`. */
  rows: RenderPreflightRow[];
  /** Selected rows left out of this batch ("Review N ready rows"), each with why. */
  skippedRows?: ReadonlyArray<{ label: string; message: string }>;
  records: ApiRenderBatchRecord[];
  /** The open set's delivery defaults. */
  settings: ForgeRenderSetSettings;
  /** What the grid already knows needs a person's call, by override. */
  calls: ReadonlyArray<{ override: RenderOverride; message: string }>;
  meta: MetaPickerState;
  slack: SlackPickerState;
  outputs: ReplaceFormats;
  /** Why this person cannot ask for a Final render. Null when they can. */
  finalBlocked: string | null;
  metaWritesAllowed?: boolean;
  onDeliveryChange: (rowId: string, delivery: ApiRenderDeliveryTarget | null) => void;
  onChangeSettings: () => void;
  onFired: (fired: FiredRow[]) => void;
  /** Opens the Render ledger on these jobs — the tab shell switches to it. */
  onOpenLedger?: (jobIds: string[]) => void;
  /** Rows this batch's refusal turned out to be about: the grid marks them and skips them. */
  onRowsRefused?: (found: ReadonlyArray<{ rowId: string; message: string }>) => void;
  /** The set's hold key (renderHold.ts); null with no user id, which renders nothing. */
  holdScope: HoldScope | null;
  /** The set's unconfirmed batch: while it is held, this dialog is its view, never a new one. */
  held: HeldBatch | null;
}) {
  const presentForge = useForgePresentationText();

  const translateUi = useUiTranslations('forge');
  const displayLocale = useUiLocale();

  const queryClient = useQueryClient();
  const templateKey = contract.template.key;
  const web = isWebTemplateKey(templateKey);
  const templateName = contract.template.displayName ?? templateDisplayName(contract.template.name);
  const [check, setCheck] = useState<Verdict>({ state: 'loading' });
  const [accepted, setAccepted] = useState<ReadonlySet<RenderOverride>>(new Set());
  const [final, setFinal] = useState(settings.final && finalBlocked === null);
  const [renderer, setRenderer] = useState<Renderer>('after_effects');
  const [firing, setFiring] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const connected = meta !== 'loading' && (meta === 'unknown' || meta.connected);
  // The set's default ad set reaches only rows with no target of their own, and only a brand that
  // still has an ad account: a disconnected brand renders to the Library, as the settings say.
  const setDefault = web || !connected ? null : settings.metaTarget;
  const slackName =
    typeof slack === 'object' && 'destinations' in slack
      ? (slack.destinations.find((room) => room.id === settings.slackDestinationId)?.channelName ??
        null)
      : null;
  const rooms = useSetApprovalRooms(brandId, web ? null : settings.approvalDestinationIds);
  const approvalIds = rooms.ids;
  const roomNames = rooms.names;

  const { resolving, resolveErrors } = useResolveAdTargets({
    brandId,
    rows,
    enabled: open && connected,
    adAccountId: undefined,
    onDeliveryChange,
  });
  const blockers = [
    ...metaDeliveryProblems(rows, outputs, {}, meta),
    ...Object.values(resolveErrors),
  ];

  /** The one format a replacing row renders; every other row renders what it says. */
  const rowOutputIds = useCallback(
    (row: RenderPreflightRow): string[] => {
      if (row.delivery?.action !== 'replace') return row.outputIds;
      const only = replaceOutputId(row, outputs, {});
      return only ? [only] : [];
    },
    [outputs],
  );
  const fileCount = rows.reduce(
    (total, row) => total + rowFileCount(contract, { ...row, outputIds: rowOutputIds(row) }),
    0,
  );

  // Only the newest check lands: a slow answer about an older choice must not replace a newer one.
  const latest = useRef(0);
  const request = useCallback(
    () => ({
      brandId,
      ...(bindingId ? { bindingId } : {}),
      templateKey,
      contractHash: contract.template.contractHash,
      ...(templateRef ? { templateRef } : {}),
      records: records.flatMap((record, index) => {
        const row = rows[index];
        if (!row) return [];
        const { delivery: _delivery, ...rest } = record;
        if (!row.delivery) return [rest];
        return [{ ...rest, delivery: row.delivery, outputIds: rowOutputIds(row) }];
      }),
      ...(setDefault ? { delivery: setDefault } : {}),
      ...(!web && settings.slackDestinationId
        ? { slack: { destinationId: settings.slackDestinationId } }
        : {}),
      ...(approvalIds.length ? { approvalDestinationIds: approvalIds } : {}),
      // Signed into the token: a batch checked as a proof cannot be created as a final.
      ...(final ? { final: true } : {}),
      ...(renderer === 'experimental' ? { renderer } : {}),
      ...Object.fromEntries([...accepted].map((flag) => [flag, true])),
    }),
    [
      brandId,
      bindingId,
      templateKey,
      contract.template.contractHash,
      templateRef,
      records,
      rows,
      rowOutputIds,
      setDefault,
      web,
      settings.slackDestinationId,
      approvalIds,
      final,
      renderer,
      accepted,
    ],
  );

  // What would be signed, as text: a re-check follows a change to it, never a new object for
  // the same thing (rows re-render on every keystroke and every dry-run that lands).
  const signed = JSON.stringify(request());

  // ponytail: legacy-batch bridge; delete when the batch preflight names the rows it refuses (E2).
  // Today's batch preflight refuses all-or-nothing and names no row. A refusal no tick overrides
  // is asked again of each row's own preflight: once per signed batch, three at a time, with no
  // retries (fifty rows times three retries is a fan-out, not a check). A grid edit never does this.
  const passedFor = useRef<string | null>(null);
  const reportRefused = useRef(onRowsRefused);
  reportRefused.current = onRowsRefused;
  const rowIds = useRef<string[]>([]);
  rowIds.current = rows.map((row) => row.rowId);
  const findRefusedRows = useCallback(async (): Promise<number> => {
    if (!reportRefused.current || passedFor.current === signed) return 0;
    passedFor.current = signed;
    const {
      records: asked,
      delivery,
      slack: _slack,
      ...batch
    } = JSON.parse(signed) as ApiRenderBatchPreflightRequest;
    const queue = asked.map((record, index) => ({
      record,
      rowId: rowIds.current[index],
    }));
    const found: Array<{ rowId: string; message: string }> = [];
    const ask = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { record, rowId } = item;
        if (!rowId) continue;
        // The row's own target wins, as at confirm; else the set's default.
        const target = record.delivery ?? delivery;
        try {
          await apiRendersApi.preflight(
            { ...batch, ...record, ...(target ? { delivery: target } : {}) },
            { retry: false },
          );
        } catch (error) {
          const message = rowRefusalOf(error, translateUi, presentForge);
          if (message) found.push({ rowId, message });
        }
      }
    };
    await Promise.all([ask(), ask(), ask()]);
    if (found.length) reportRefused.current?.(found);
    return found.length;
  }, [signed, presentForge, translateUi]);
  const runCheck = useCallback(async (): Promise<ApiRenderBatchPreflightResponse | null> => {
    const mine = ++latest.current;
    setCheck({ state: 'loading' });
    try {
      const preflight = await apiRendersApi.batchPreflight(JSON.parse(signed));
      if (mine === latest.current) setCheck({ state: 'ready', preflight });
      return preflight;
    } catch (error) {
      if (mine !== latest.current) return null;
      const failure = describeFailure(error, translateUi, presentForge);
      // A 429 is a wait, not a refusal: it is retried, never something to fix in the grid.
      if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) {
        setCheck({ state: 'failed', message: failure.message });
        return null;
      }
      // Rows found refused leave the batch, and the batch that is left is checked again.
      const found = failure.override ? 0 : await findRefusedRows();
      if (found || mine !== latest.current) return null;
      setCheck({
        state: 'refused',
        ...failure,
        wholeBatch: !failure.override && Boolean(reportRefused.current),
      });
      return null;
    }
  }, [signed, findRefusedRows, presentForge, translateUi]);

  // A fresh look every time it opens: nothing ticked, the set's own Final, the newest rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening resets; the next effect checks.
  useEffect(() => {
    if (!open) return;
    setAccepted(new Set());
    setFinal(settings.final && finalBlocked === null);
    setRenderer('after_effects');
    setProblem(null);
  }, [open]);

  // Every change to what would be signed re-checks it, once the rows' ad ids have resolved.
  useEffect(() => {
    if (!open || held || resolving || !rooms.ready) return;
    void runCheck();
  }, [open, resolving, rooms.ready, runCheck]);

  const toggle = (flag: RenderOverride, on: boolean) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (on) next.add(flag);
      else next.delete(flag);
      return next;
    });

  // Everything that needs a call, once per kind: what the grid knows, the refusal in front of us,
  // and whatever has already been ticked — so unticking puts the question back, never hides it.
  const callKinds = new Map<RenderOverride, string[]>();
  for (const call of calls)
    callKinds.set(call.override, [...(callKinds.get(call.override) ?? []), call.message]);
  // A guardrail refusal's findings say it once each; its message repeats them with the field.
  if (check.state === 'refused' && check.override)
    callKinds.set(check.override, [
      ...(callKinds.get(check.override) ?? []),
      ...(check.details.length ? check.details : [check.message]),
    ]);
  for (const flag of accepted) if (!callKinds.has(flag)) callKinds.set(flag, []);

  const targeted = rows.flatMap((row) => {
    const delivery = row.delivery ?? setDefault ?? null;
    return delivery ? [{ row, delivery, own: Boolean(row.delivery) }] : [];
  });
  const goesToMeta = targeted.length > 0;
  const approvesInForge = goesToMeta && approvalIds.length === 0;
  const canRender =
    check.state === 'ready' && blockers.length === 0 && !firing && !resolving && rooms.ready;

  const fire = async () => {
    if (check.state !== 'ready') return;
    if (!holdScope) return setProblem(presentForge(SIGNED_OUT));
    setFiring(true);
    setProblem(null);
    let batch: ApiRenderBatch;
    let preflight: ApiRenderBatchPreflightResponse | null;
    try {
      // The token is spent as it was signed, unless it is about to lapse.
      preflight =
        Date.parse(check.preflight.expiresAt) - Date.now() > TOKEN_MARGIN_MS
          ? check.preflight
          : await runCheck();
      if (!preflight) return;
      const token = preflight.confirmationToken;
      // Under the set's hold (renderHold.ts): written ahead, and held on any failure that may
      // have made rows, so a second batch is never sent for the same rows.
      batch = await confirmUnderHold(
        holdScope,
        {
          token,
          request: JSON.parse(signed),
          expiresAt: preflight.expiresAt,
          batchId: preflight.batchId,
        },
        () => apiRendersApi.createBatch({ confirmationToken: token }),
        { onNotSaved: () => toast.warning(presentForge(NOT_SAVED)) },
      );
    } catch (error) {
      setFiring(false);
      // Refused before anything was made: said, not held.
      if (madeNothing(error))
        return setProblem(
          isSessionRefusal(error)
            ? presentForge(SESSION_EXPIRED)
            : isPermissionRefusal(error)
              ? permissionCopy(error, presentForge)
              : isSetChanged(error)
                ? presentForge(SET_CHANGED)
                : describeRenderDiscoveryFailure(error, presentForge),
        );
      // Held (by this failure, or by another tab since the check): the dialog becomes its view.
      if (holdScope && isHeld(holdScope)) {
        void queryClient.invalidateQueries({
          queryKey: forgeQueryKeys.renderJobs(brandId),
        });
        return;
      }
      const { message, details } = describeFailure(error, translateUi, presentForge);
      return setProblem([message, ...details].join(' '));
    }
    // Answered: the dialog closes first, and nothing after it is a failed render.
    setFiring(false);
    onOpenChange(false);
    try {
      onFired(
        batch.jobs.flatMap((job, index) => {
          const row = rows[index];
          return row ? [{ rowId: row.rowId, job }] : [];
        }),
      );
      for (const job of batch.jobs)
        queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
      // Not awaited: the jobs are already cached above, and the lists can follow.
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.renderJobs(brandId),
      });
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.approvals(brandId),
      });
      const refused = batch.jobs.filter((job) => job.status === 'failed' && !job.taskUid).length;
      if (refused > 0)
        toast.warning(
          translateUi('value0_queued_value1_not_sent_896c6e9a', {
            value0: String(batch.jobs.length - refused),
            value1: String(refused),
          }),
        );
      else
        toast.success(
          translateUi('value0_queued_3dddf693', {
            value0: String(plural(batch.jobs.length, 'render')),
          }),
          {
            ...(onOpenLedger
              ? {
                  action: {
                    label: translateUi('open_ledger_f4e1cb36'),
                    onClick: () => onOpenLedger(batch.jobs.map((job) => job.id)),
                  },
                }
              : {}),
          },
        );
      if (preflight.approval?.warning) toast.warning(preflight.approval.warning);
    } catch (error) {
      console.error('[forge] after a confirmed render', error);
    }
  };

  if (held && holdScope)
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl"
          overlayClassName={CONFIRM_OVERLAY}
        >
          <DialogHeader>
            <DialogTitle>{translateUi('unconfirmed_render_c4a6f394')}</DialogTitle>
            <DialogDescription>
              {templateName} {translateUi('this_set_s_last_render_didn_t_confi_86a28e3c')}{' '}
            </DialogDescription>
          </DialogHeader>
          <HeldBatchView
            brandId={brandId}
            scope={holdScope}
            held={held}
            current={records}
            templateNow={{
              contractHash: contract.template.contractHash,
              templateRef: templateRef ?? null,
            }}
            onOpenLedger={() => {
              onOpenChange(false);
              onOpenLedger?.([]);
            }}
            onLanded={(jobs) => {
              onOpenChange(false);
              onFired(
                jobs.flatMap((job) =>
                  job.renderSetRowId ? [{ rowId: job.renderSetRowId, job }] : [],
                ),
              );
            }}
          />
        </DialogContent>
      </Dialog>
    );

  return (
    <Dialog open={open} onOpenChange={(next) => (firing ? undefined : onOpenChange(next))}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl"
        overlayClassName={CONFIRM_OVERLAY}
      >
        <DialogHeader>
          <DialogTitle>
            {' '}
            {translateUi('render_6d89eb7d')} {plural(rows.length, 'row')} ·{' '}
            {plural(fileCount, 'file')}
          </DialogTitle>
          <DialogDescription>{templateName}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-xs">
          {skippedRows.length ? (
            <Section
              title={translateUi('not_in_this_batch_value0_6ab417e1', {
                value0: String(plural(skippedRows.length, 'row')),
              })}
            >
              <ul
                aria-label={translateUi('rows_skipped_from_this_batch_4f51b061')}
                className="flex flex-col gap-0.5"
              >
                {skippedRows.map((row, index) => (
                  <li key={`${index}:${row.label}`} className="text-warning">
                    {row.label}: {row.message}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section
            title={translateUi('goes_to_c485e60e')}
            action={
              <Button
                type="button"
                size="xs"
                variant="link"
                className="h-auto px-0 normal-case tracking-normal"
                onClick={onChangeSettings}
              >
                {' '}
                {translateUi('change_c0bf75bd')}{' '}
              </Button>
            }
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1">
                <Check className="size-3.5 text-success" aria-hidden />{' '}
                {translateUi('library_dc20b3d5')}{' '}
              </span>
              {slackName ? <span>· #{slackName}</span> : null}
              {roomNames.map((name) => (
                <span key={name}>
                  · {name} {translateUi('approval_9deb65b8')}
                </span>
              ))}
              {approvesInForge ? <span>{translateUi('approval_in_forge_9ac99878')}</span> : null}
            </p>
          </Section>

          {goesToMeta ? (
            <Section
              title={translateUi('meta_ads_value0_1bef03d6', {
                value0: String(plural(targeted.length, 'row')),
              })}
            >
              <ul
                aria-label={translateUi('meta_ads_7899eeae')}
                className="divide-y divide-border rounded-md border"
              >
                {targeted.map(({ row, delivery, own }) => (
                  <li key={row.rowId} className="flex flex-wrap gap-x-2 px-2 py-1.5">
                    <span className="font-medium">
                      {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
                    </span>
                    <span className="text-muted-foreground">
                      {delivery.action === 'replace'
                        ? translateUi('replaces_value0_46faa69b', {
                            value0: String(delivery.adName ?? delivery.adId),
                          })
                        : translateUi('new_paused_ad_value0_in_value1_valu_b3d9452d', {
                            value0: String(
                              rowFileCount(contract, {
                                ...row,
                                outputIds: rowOutputIds(row),
                              }) === 1
                                ? ''
                                : 's',
                            ),
                            value1: String(adSetName(delivery)),
                            value2: String(own ? '' : translateUi('set_default_a1296964')),
                          })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">{translateUi('adApprovalExplanation')}</p>
              {approvesInForge ? (
                <p className="text-muted-foreground">{translateUi('approvalRoomFallback')}</p>
              ) : null}
              {metaWritesAllowed === false ? (
                <p role="status" className="text-warning">
                  {' '}
                  {translateUi('meta_writes_are_off_for_this_brand__791f2ff2')}{' '}
                </p>
              ) : null}
            </Section>
          ) : null}

          {callKinds.size ? (
            <Section title={translateUi('needs_your_call_a33293c8')}>
              <ul className="flex flex-col gap-2">
                {[...callKinds].map(([flag, messages]) => (
                  <li
                    key={flag}
                    className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2"
                  >
                    <Checkbox
                      id={`override-${flag}`}
                      checked={accepted.has(flag)}
                      onCheckedChange={(on) => toggle(flag, on === true)}
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label htmlFor={`override-${flag}`} className="text-xs font-medium">
                        {' '}
                        {translateUi('render_anyway_34a5c500')}{' '}
                        {renderOverrideCopy(flag, translateUi).title.toLowerCase()}
                      </Label>
                      {[...new Set(messages)].slice(0, 3).map((message) => (
                        <p key={message} className="text-muted-foreground">
                          {message}
                        </p>
                      ))}
                      <p className="text-muted-foreground">
                        {renderOverrideCopy(flag, translateUi).consequence}{' '}
                        {translateUi('applies_to_this_batch_only_and_is_r_ca6e3af8')}{' '}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={translateUi('render_as_b696ffa7')}>
            <RadioGroup
              aria-label={translateUi('render_as_b696ffa7')}
              value={final ? 'final' : 'proof'}
              onValueChange={(value) => setFinal(value === 'final')}
              className="flex flex-wrap gap-x-6 gap-y-1.5"
            >
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs">
                  <RadioGroupItem value="proof" /> {translateUi('proof_7fbb3ccf')}{' '}
                </Label>
                <span className="pl-6 text-muted-foreground">
                  {translateUi('for_review_recorded_as_a_proof_be78783b')}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs">
                  <RadioGroupItem value="final" disabled={finalBlocked !== null} />{' '}
                  {translateUi('final_f4ed8fa6')}{' '}
                </Label>
                <span className="pl-6 text-muted-foreground">
                  {finalBlocked ?? translateUi('ready_to_go_recorded_as_final_b4448611')}
                </span>
              </div>
            </RadioGroup>
          </Section>

          {web ? null : (
            <Section title={translateUi('renderer_9deb780b')}>
              <RadioGroup
                aria-label={translateUi('renderer_9deb780b')}
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
                  <span className="pl-6 text-muted-foreground">
                    {translateUi('the_render_farm_0ccdc2c1')}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <Label className="text-xs">
                    <RadioGroupItem value="experimental" />{' '}
                    {translateUi('continuum_s_new_renderer_2f2c51f3')}{' '}
                  </Label>
                  <span className="pl-6 text-muted-foreground">
                    {' '}
                    {translateUi('anything_it_can_t_render_goes_to_af_d9b6b46b')}{' '}
                  </span>
                </div>
              </RadioGroup>
            </Section>
          )}

          <Section title={translateUi('files_per_row_5036e2ab')}>
            <ul
              aria-label={translateUi('output_per_row_e528d7d0')}
              // Its own scroll: a long batch keeps Goes to, Render as and the footer in view.
              className="max-h-[min(16rem,35vh)] divide-y divide-border overflow-y-auto border-y border-border"
            >
              {rows.map((row, index) => (
                <li
                  key={row.rowId}
                  className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-center gap-3 py-1.5"
                >
                  <span className="min-w-0 truncate font-medium">
                    {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5">
                    {outputGroups(
                      contract,
                      rowOutputIds(row),
                      records[index]?.encode,
                      renderedRatios(contract, rowOutputIds(row)),
                      translateUi,
                      displayLocale,
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
          </Section>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div role="status" className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
            {resolving || check.state === 'loading' ? (
              <>
                <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">
                  {resolving
                    ? translateUi('looking_up_ad_ids_7a0e5ca6')
                    : translateUi('checking_value0_60666583', {
                        value0: String(plural(rows.length, 'row')),
                      })}
                </span>
              </>
            ) : blockers.length ? (
              <span className="text-warning">{blockers.join(' ')}</span>
            ) : problem ? (
              <span className="text-destructive">{problem}</span>
            ) : check.state === 'refused' ? (
              <span className={cn(check.override ? 'text-warning' : 'text-destructive')}>
                <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />
                {check.override
                  ? translateUi('tick_render_anyway_above_or_fix_the_bf6ed098')
                  : `${check.message}${check.details.length ? ` ${check.details.join(' ')}` : ''}${
                      check.wholeBatch
                        ? translateUi('no_row_is_refused_on_its_own_so_non_8dfdcc25')
                        : translateUi('fix_the_row_in_the_grid_then_render_07f4780d')
                    }`}
              </span>
            ) : check.state === 'failed' ? (
              <span className="flex items-center gap-2 text-destructive">
                {check.message}
                <Button type="button" size="xs" variant="outline" onClick={() => void runCheck()}>
                  {' '}
                  {translateUi('retry_942087cc')}{' '}
                </Button>
              </span>
            ) : (
              <span className="truncate text-muted-foreground">
                {readinessLine(
                  check.preflight.readiness,
                  (key) => {
                    const label = contract.variables.find((item) => item.key === key)?.label;
                    return label ?? key;
                  },
                  translateUi,
                )}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={firing}
            onClick={() => onOpenChange(false)}
          >
            {' '}
            {translateUi('cancel_19766ed6')}{' '}
          </Button>
          <Button type="button" disabled={!canRender} onClick={() => void fire()}>
            {firing ? (
              <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
            ) : (
              <Play data-icon="inline-start" aria-hidden />
            )}{' '}
            {translateUi('render_6d89eb7d')} {plural(fileCount, 'file')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A held batch, read-only: what was sent, why it is held, and the only two ways on. Retry this
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
  templateNow,
}: {
  brandId: string;
  scope: HoldScope;
  held: HeldBatch;
  /** The template as the set renders it now; a held request signed for another says so. */
  templateNow?: { contractHash: string; templateRef: string | null };
  /** The records Render would sign now: said apart when their rows or values differ. */
  current: readonly ApiRenderBatchRecord[];
  onOpenLedger: (batchId: string | null) => void;
  /** Retry landed: the jobs, for the same result a normal confirm shows. */
  onLanded: (jobs: ApiRenderJob[]) => void;
}) {
  const presentForge = useForgePresentationText();

  const displayLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [, setNow] = useState(0);
  const expiresAt = held.signed?.expiresAt;
  const sending = sendingElsewhere(held);
  // Retry goes the moment the token's own expiry passes, and a send elsewhere stops counting as
  // live once its time is up, not on whatever render happens by next.
  useEffect(() => {
    const waits = [
      expiresAt ? Date.parse(expiresAt) - Date.now() : 0,
      sending ? held.heldAt + STALE_MS - Date.now() : 0,
    ].filter((wait) => wait > 0);
    if (!waits.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.min(...waits) + 50, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, sending, held.heldAt]);
  const request = held.signed?.request;
  const metaRows = request?.records.filter((record) => record.delivery).length ?? 0;
  const labels = request?.records.map((record) => record.label ?? 'Untitled') ?? [];
  // The rows, names and values sent, against what Render would take now.
  const rowsOf = (records: readonly ApiRenderBatchRecord[]) =>
    JSON.stringify(
      records.map((record) => [record.renderSetRowId, record.label, record.variables]),
    );
  const differs = request !== undefined && rowsOf(request.records) !== rowsOf(current);
  const heldTime = new Date(held.heldAt).toLocaleTimeString(displayLocale, {
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
      // Read fresh: nothing is sent once another tab has let it go. Still held on any failure.
      const batch = await retryHeld(scope, (token) =>
        apiRendersApi.createBatch({ confirmationToken: token }),
      );
      try {
        // Landed first, so the batch reads done whatever throws in what follows.
        onLanded(batch.jobs);
        for (const job of batch.jobs)
          queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
        toast.success(
          translateUi('value0_queued_3dddf693', {
            value0: String(plural(batch.jobs.length, 'render')),
          }),
        );
      } catch (error) {
        // Landed: showing it may fail, the render did not.
        console.error('[forge] after a retried render', error);
      }
    } catch {
      // The hold already says why.
    } finally {
      void queryClient.invalidateQueries({
        queryKey: forgeQueryKeys.renderJobs(brandId),
      });
      setRetrying(false);
    }
  };
  return (
    <section
      aria-label={translateUi('held_batch_100e694a')}
      className="flex h-full min-h-0 flex-col gap-1.5 px-[var(--card-pad)] py-2 text-xs"
    >
      <p role="alert" className="font-medium text-destructive">
        {heldCopy(held, Date.now(), translateUi)}
      </p>
      <p className="text-muted-foreground">
        {facts
          ? translateUi('what_was_sent_value0_ef7e224f', {
              value0: String(facts.join(' · ')),
            })
          : translateUi('what_was_sent_isn_t_known_on_this_p_290acef2')}
      </p>
      {differs ? (
        <p className="text-muted-foreground">
          {translateUi('your_edits_and_selection_aren_t_par_6a94a2ab')}
        </p>
      ) : null}
      {request &&
      templateNow &&
      (request.contractHash !== templateNow.contractHash ||
        (request.templateRef ?? null) !== templateNow.templateRef) ? (
        <p className="text-muted-foreground">
          {' '}
          {translateUi('this_set_s_template_changed_since_t_79321060')}{' '}
        </p>
      ) : null}
      {held.saved ? null : <p className="text-muted-foreground">{presentForge(NOT_SAVED)}</p>}
      <p className="text-muted-foreground">
        {' '}
        {translateUi('in_the_render_ledger_look_for_the_b_eacdf676')} {heldTime}.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {canRetry(held) || held.sending ? (
          <Button
            type="button"
            size="xs"
            disabled={retrying || held.sending}
            onClick={() => void retry()}
          >
            {retrying || held.sending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : null}{' '}
            {translateUi('retry_this_batch_17603985')}{' '}
          </Button>
        ) : null}
        <Button
          type="button"
          size="xs"
          variant="outline"
          // Opening the ledger lets the hold go: not while a send is still out, here or elsewhere.
          disabled={sending || held.sending}
          onClick={() => {
            clearHold(scope, held.batchId);
            onOpenLedger(held.batchId);
          }}
        >
          {' '}
          {translateUi('open_render_ledger_ff0b52b9')}{' '}
        </Button>
      </div>
    </section>
  );
}
