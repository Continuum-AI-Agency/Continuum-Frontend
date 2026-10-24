'use client';

import {
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { FORGE_APPROVAL_COPY } from '@/components/forge/ApprovalDestinationsField';
import {
  APPROVAL_COPY,
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
import { readinessLine } from '@/components/forge/readinessCopy';
import {
  overrideFor,
  RENDER_OVERRIDES,
  type RenderOverride,
  renderedRatios,
  rowFileCount,
} from '@/components/forge/renderRequestRows';
import { RatioChips } from '@/components/forge/requestCells';
import type { SlackPickerState } from '@/components/forge/SlackDestinationPicker';
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
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

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
  | { state: 'refused'; message: string; details: string[]; override: RenderOverride | null }
  | { state: 'failed'; message: string };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
/** A token this close to expiry is re-signed rather than spent. */
const TOKEN_MARGIN_MS = 10_000;

function describeFailure(error: unknown): {
  message: string;
  details: string[];
  override: RenderOverride | null;
} {
  const message = describeRenderDiscoveryFailure(error);
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
    details: findings.map((finding) => finding.message).filter(Boolean),
    override: error instanceof ApiError ? overrideFor(error.code ?? error.message, findings) : null,
  };
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

export function RenderConfirmDialog({
  open,
  onOpenChange,
  brandId,
  bindingId,
  templateRef,
  contract,
  rows,
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  bindingId: string | null;
  templateRef?: string | null;
  contract: ApiRenderTemplateContract;
  /** The rows to render, in grid order; `records[i]` belongs to `rows[i]`. */
  rows: RenderPreflightRow[];
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
}) {
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
  const runCheck = useCallback(async (): Promise<ApiRenderBatchPreflightResponse | null> => {
    const mine = ++latest.current;
    setCheck({ state: 'loading' });
    try {
      const preflight = await apiRendersApi.batchPreflight(JSON.parse(signed));
      if (mine === latest.current) setCheck({ state: 'ready', preflight });
      return preflight;
    } catch (error) {
      if (mine !== latest.current) return null;
      const failure = describeFailure(error);
      setCheck(
        error instanceof ApiError && error.status < 500
          ? { state: 'refused', ...failure }
          : { state: 'failed', message: failure.message },
      );
      return null;
    }
  }, [signed]);

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
    if (!open || resolving || !rooms.ready) return;
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
    setFiring(true);
    setProblem(null);
    try {
      // The token is spent as it was signed, unless it is about to lapse.
      const preflight =
        Date.parse(check.preflight.expiresAt) - Date.now() > TOKEN_MARGIN_MS
          ? check.preflight
          : await runCheck();
      if (!preflight) return;
      const batch = await apiRendersApi.createBatch({
        confirmationToken: preflight.confirmationToken,
      });
      for (const job of batch.jobs)
        queryClient.setQueryData(forgeQueryKeys.renderJob(brandId, job.id), job);
      // Not awaited: the jobs are already cached above, and the lists can follow.
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.renderJobs(brandId) });
      void queryClient.invalidateQueries({ queryKey: forgeQueryKeys.approvals(brandId) });
      const refused = batch.jobs.filter((job) => job.status === 'failed' && !job.taskUid).length;
      if (refused > 0) toast.warning(`${batch.jobs.length - refused} queued · ${refused} not sent`);
      else
        toast.success(`${plural(batch.jobs.length, 'render')} queued`, {
          ...(onOpenLedger
            ? {
                action: {
                  label: 'Open ledger',
                  onClick: () => onOpenLedger(batch.jobs.map((job) => job.id)),
                },
              }
            : {}),
        });
      if (preflight.approval?.warning) toast.warning(preflight.approval.warning);
      onFired(
        batch.jobs.flatMap((job, index) => {
          const row = rows[index];
          return row ? [{ rowId: row.rowId, job }] : [];
        }),
      );
      onOpenChange(false);
    } catch (error) {
      const { message, details } = describeFailure(error);
      setProblem([message, ...details].join(' '));
    } finally {
      setFiring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (firing ? undefined : onOpenChange(next))}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Render {plural(rows.length, 'row')} · {plural(fileCount, 'file')}
          </DialogTitle>
          <DialogDescription>{templateName}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-xs">
          <Section
            title="Goes to"
            action={
              <Button
                type="button"
                size="xs"
                variant="link"
                className="h-auto px-0 normal-case tracking-normal"
                onClick={onChangeSettings}
              >
                Change
              </Button>
            }
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="flex items-center gap-1">
                <Check className="size-3.5 text-success" aria-hidden /> Library
              </span>
              {slackName ? <span>· #{slackName}</span> : null}
              {roomNames.map((name) => (
                <span key={name}>· {name} approval</span>
              ))}
              {approvesInForge ? <span>· Approval in Forge</span> : null}
            </p>
          </Section>

          {goesToMeta ? (
            <Section title={`Meta ads · ${plural(targeted.length, 'row')}`}>
              <ul aria-label="Meta ads" className="divide-y divide-border rounded-md border">
                {targeted.map(({ row, delivery, own }) => (
                  <li key={row.rowId} className="flex flex-wrap gap-x-2 px-2 py-1.5">
                    <span className="font-medium">
                      {row.labelPath.length > 1 ? row.labelPath.join(' / ') : row.label}
                    </span>
                    <span className="text-muted-foreground">
                      {delivery.action === 'replace'
                        ? `replaces ${delivery.adName ?? delivery.adId}`
                        : `new paused ad${
                            rowFileCount(contract, { ...row, outputIds: rowOutputIds(row) }) === 1
                              ? ''
                              : 's'
                          } in ${adSetName(delivery)}${own ? '' : ' (set default)'}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">{APPROVAL_COPY}</p>
              {approvesInForge ? (
                <p className="text-muted-foreground">{FORGE_APPROVAL_COPY}</p>
              ) : null}
              {metaWritesAllowed === false ? (
                <p role="status" className="text-warning">
                  Meta writes are off for this brand: approved ads are previewed and recorded, not
                  published.
                </p>
              ) : null}
            </Section>
          ) : null}

          {callKinds.size ? (
            <Section title="Needs your call">
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
                        Render anyway — {RENDER_OVERRIDES[flag].title.toLowerCase()}
                      </Label>
                      {[...new Set(messages)].slice(0, 3).map((message) => (
                        <p key={message} className="text-muted-foreground">
                          {message}
                        </p>
                      ))}
                      <p className="text-muted-foreground">
                        {RENDER_OVERRIDES[flag].consequence} Applies to this batch only and is
                        recorded in the render ledger.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Render as">
            <RadioGroup
              aria-label="Render as"
              value={final ? 'final' : 'proof'}
              onValueChange={(value) => setFinal(value === 'final')}
              className="flex flex-wrap gap-x-6 gap-y-1.5"
            >
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
          </Section>

          {web ? null : (
            <Section title="Renderer">
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
            </Section>
          )}

          <Section title="Files per row">
            <ul
              aria-label="Output per row"
              className="divide-y divide-border border-y border-border"
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
                  {resolving ? 'Looking up ad IDs…' : `Checking ${plural(rows.length, 'row')}…`}
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
                  ? 'Tick “Render anyway” above, or fix the row in the grid.'
                  : `${check.message}${check.details.length ? ` ${check.details.join(' ')}` : ''} Fix the row in the grid, then render again.`}
              </span>
            ) : check.state === 'failed' ? (
              <span className="flex items-center gap-2 text-destructive">
                {check.message}
                <Button type="button" size="xs" variant="outline" onClick={() => void runCheck()}>
                  Retry
                </Button>
              </span>
            ) : (
              <span className="truncate text-muted-foreground">
                {readinessLine(check.preflight.readiness, (key) => {
                  const label = contract.variables.find((item) => item.key === key)?.label;
                  return label ?? key;
                })}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={firing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canRender} onClick={() => void fire()}>
            {firing ? (
              <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
            ) : (
              <Play data-icon="inline-start" aria-hidden />
            )}
            Render {plural(fileCount, 'file')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
