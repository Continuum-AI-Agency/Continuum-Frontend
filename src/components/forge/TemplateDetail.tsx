'use client';

import {
  type ApiRenderJob,
  type RenderWorkspace,
  renderWorkspaceLabel,
  type TemplateFontPushResponse,
  type TemplateFontReadiness,
  type TemplateSourceSummary,
  templateNameProblem,
  UNTITLED_TEMPLATE_NAME,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Boxes,
  CalendarClock,
  CircleDot,
  History,
  Layers,
  Loader2,
  Play,
  RectangleHorizontal,
  RefreshCw,
  Rocket,
  Send,
  TestTube2,
  Type,
  Variable,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AiVariationsDialog } from '@/components/forge/AiVariationsDialog';
import { type CheckRow, CheckTable, type CheckTick, TickBar } from '@/components/forge/CheckTable';
import { FactList } from '@/components/forge/FactList';
import { ForgeRunProgress } from '@/components/forge/ForgeRunProgress';
import { FormatPreview, previewFormats } from '@/components/forge/FormatPreview';
import { LineagePanel } from '@/components/forge/LineagePanel';
import { OutputSettingsPanel } from '@/components/forge/OutputSettingsPanel';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { SourceRebindPanel } from '@/components/forge/SourceRebindPanel';
import { TemplateRenders } from '@/components/forge/TemplateRenders';
import { useForgeRun } from '@/components/forge/useForgeRun';
import { VariableEditor } from '@/components/forge/VariableEditor';
import { Pill } from '@/components/kibo-ui/pill';
import { Panel } from '@/components/shared/Panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast-imperative';
import {
  advanceTemplateForgeRun,
  type ForgeLadderAction,
  fetchRenderWorkspaces,
  fetchTemplateFonts,
  fetchTemplateVariables,
  pushTemplateFonts,
  saveTemplateVariables,
  sendTemplateToForge,
  type TemplateSlotEdit,
  type TemplateVariable,
} from '@/lib/library/templateSources';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  InlineRename,
  sourceDisplayName,
  TemplateStatusPill,
  templateStatus,
} from './TemplateCard';
import {
  TemplateMorph,
  TemplateWireframe,
  useLatestRenderFrame,
  wireframeFrames,
} from './TemplateWireframe';
import { templateChecks } from './templateChecks';

// One template, opened, read like a deployment: its picture beside the facts, then the checks it
// has been through — each saying what it looks at and what it found, with the step to take on the
// row that needs it — then everything you edit, one tab each. Technical identifiers live only in
// the Details tab.

/**
 * Which rungs are reachable from where the run is standing.
 *
 * The forge advances itself to `draft_ready` and then stops, because everything past that point
 * writes into a live workspace or spends a render. Those are a person's to take, which is why
 * they are buttons and not a pipeline.
 */
function ladderFor(state: string | undefined): Array<{
  action: ForgeLadderAction;
  label: string;
  Icon: typeof Send;
  hint: string;
}> {
  switch (state) {
    case 'draft_ready':
      return [
        {
          action: 'smoke',
          label: 'Test render',
          Icon: TestTube2,
          hint: 'Renders one watermarked frame to prove the wiring binds.',
        },
      ];
    case 'review_ready':
      return [
        {
          action: 'promote',
          label: 'Publish',
          Icon: Rocket,
          hint: 'Publishes the template and grants this brand permission to render it.',
        },
      ];
    // The stop every from-scratch build reaches: the table and the graph are built and the media
    // variables have no picture yet. Nothing is broken, so the button says what to do next.
    case 'needs_input':
      return [
        {
          action: 'resume',
          label: 'Build again',
          Icon: RefreshCw,
          hint: 'Re-runs the checks with what the variables say now.',
        },
      ];
    case 'failed':
      return [
        {
          action: 'resume',
          label: 'Retry',
          Icon: RefreshCw,
          hint: 'Re-enters the run at the last state it can safely resume from.',
        },
      ];
    default:
      return [];
  }
}

/**
 * A starting point for the build name, or blank. The forge names a render table after it and
 * refuses a name that does not fit, so a prefilled name it would refuse is worse than an empty
 * field — the refusal would only arrive at submit.
 */
function buildNameSuggestion(source: TemplateSourceSummary): string {
  const suggestion = sourceDisplayName(source);
  return suggestion === UNTITLED_TEMPLATE_NAME || templateNameProblem(suggestion) ? '' : suggestion;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

const JOB_TICK: Record<ApiRenderJob['status'], CheckTick> = {
  finished: 'pass',
  failed: 'fail',
  submitting: 'todo',
  queued: 'todo',
  rendering: 'todo',
};

export function TemplateDetail({
  brandId,
  source,
  onBack,
  onRename,
  onOpenRender,
  onChanged,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onBack: () => void;
  onRename: (title: string) => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
  /** Re-read the template list after something here changed what a card shows. */
  onChanged: () => Promise<void>;
}) {
  const { assetId, templateKey } = source;
  const queryClient = useQueryClient();
  const variablesKey = useMemo(
    () => forgeQueryKeys.templateVariables(brandId, assetId, source.versionId),
    [assetId, brandId, source.versionId],
  );
  const fontsKey = useMemo(
    () => forgeQueryKeys.templateFonts(brandId, assetId, source.versionId),
    [assetId, brandId, source.versionId],
  );
  const name = sourceDisplayName(source);
  const { run, pushed, refresh: refreshRun } = useForgeRun(brandId, assetId);
  // The formats the file delivers — its parse's comps, else its ratio labels — and the one on screen.
  const formats = useMemo(
    () => previewFormats({ parse: source.parse, ratios: source.ratios }),
    [source.parse, source.ratios],
  );
  const [formatId, setFormatId] = useState<string | undefined>(undefined);
  const format = formats.find((entry) => entry.id === formatId) ?? formats[0];
  const rendered = useLatestRenderFrame(brandId, templateKey, formats, format?.id);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [savedDefaults, setSavedDefaults] = useState<Record<string, unknown>>({});
  const [parseState, setParseState] = useState<string>(source.parseState);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<ForgeLadderAction | 'submit' | null>(null);
  // THE BUILD NAME IS ASKED FOR, never inferred: the forge derives this template's render table
  // from it (`tpl_<slug(name)>_root`, 40 characters, never truncated). The display name above is
  // separate and can change any time; this one cannot.
  const [templateName, setTemplateName] = useState(() => buildNameSuggestion(source));
  // WHICH WORKSPACE. A brand may hold several enabled bindings and a template belongs to exactly
  // one, so when there is a choice a person makes it, and when there is not there is nothing to ask.
  const [workspaces, setWorkspaces] = useState<RenderWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [fontReadiness, setFontReadiness] = useState<TemplateFontReadiness | null>(null);
  const [fontCheckFailed, setFontCheckFailed] = useState(false);
  const [fontPlan, setFontPlan] = useState<Extract<
    TemplateFontPushResponse,
    { fired: false }
  > | null>(null);
  const [fontResult, setFontResult] = useState<Extract<
    TemplateFontPushResponse,
    { fired: true }
  > | null>(null);
  const [fontBusy, setFontBusy] = useState(false);

  const loadVariables = useCallback(async () => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: variablesKey,
        queryFn: () => fetchTemplateVariables(brandId, assetId),
        staleTime: FORGE_STALE_MS.lists,
      });
      setVariables(result.variables);
      setParseState(result.parseState);
      // Saved defaults live on the edits, not on the variables — without this they never reappear.
      setSavedDefaults(
        Object.fromEntries(result.edits.map((edit) => [edit.slotKey, edit.defaultValue ?? null])),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the variables');
    }
  }, [assetId, brandId, queryClient, variablesKey]);

  useEffect(() => {
    void loadVariables();
  }, [loadVariables]);

  const loadFonts = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setFontReadiness(null);
      setFontCheckFailed(false);
      try {
        const readiness = await queryClient.fetchQuery({
          queryKey: fontsKey,
          queryFn: () => fetchTemplateFonts(brandId, assetId),
          staleTime: FORGE_STALE_MS.lists,
        });
        if (isCurrent()) setFontReadiness(readiness);
      } catch {
        if (isCurrent()) setFontCheckFailed(true);
      }
    },
    [assetId, brandId, fontsKey, queryClient],
  );

  useEffect(() => {
    let current = true;
    void loadFonts(() => current);
    return () => {
      current = false;
    };
  }, [loadFonts, source.parseState, source.updatedAt, source.versionId]);

  useEffect(() => {
    let cancelled = false;
    queryClient
      .fetchQuery({
        queryKey: forgeQueryKeys.workspaces(brandId),
        queryFn: () => fetchRenderWorkspaces(brandId),
        staleTime: FORGE_STALE_MS.lists,
      })
      .then((items) => {
        if (cancelled) return;
        setWorkspaces(items);
        setWorkspaceId(items.find((w) => w.isDefault)?.id ?? items[0]?.id ?? '');
      })
      // Advisory: a brand with no binding yet gets one provisioned on submit, so failing to list
      // them must not block the page.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, queryClient]);

  const onSave = async (edits: TemplateSlotEdit[]) => {
    setSaving(true);
    try {
      await saveTemplateVariables(brandId, assetId, edits);
      await queryClient.invalidateQueries({ queryKey: variablesKey, exact: true });
      await loadVariables();
      toast.success('Saved');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    const problem = templateNameProblem(templateName);
    if (problem) {
      toast.error(`Template name: ${problem}`);
      return;
    }
    setBusy('submit');
    try {
      await sendTemplateToForge(
        brandId,
        assetId,
        templateName.trim(),
        workspaces.length > 1 ? workspaceId : undefined,
      );
      await Promise.all([onChanged(), refreshRun()]);
      toast.success('Sent to the forge');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the run');
    } finally {
      setBusy(null);
    }
  };

  const onAdvance = async (action: ForgeLadderAction) => {
    setBusy(action);
    try {
      await advanceTemplateForgeRun(brandId, assetId, action);
      await Promise.all([refreshRun(), onChanged()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const heldFamilies =
    fontReadiness?.fonts.filter((font) => font.held).map((font) => font.family) ?? [];

  const reviewFontInstall = async () => {
    setFontBusy(true);
    setFontResult(null);
    try {
      const plan = await pushTemplateFonts(brandId, assetId, false, heldFamilies);
      if (!plan.fired) setFontPlan(plan);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not review the font install');
    } finally {
      setFontBusy(false);
    }
  };

  const installFonts = async () => {
    setFontBusy(true);
    try {
      const result = await pushTemplateFonts(brandId, assetId, true, heldFamilies);
      if (result.fired) setFontResult(result);
      setFontPlan(null);
      await queryClient.invalidateQueries({ queryKey: fontsKey, exact: true });
      await loadFonts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not install the fonts');
    } finally {
      setFontBusy(false);
    }
  };

  // The template's recent renders, read through the SAME cached query the preview's
  // `useLatestRenderFrame` owns (key, fetcher and freshness identical, only the selection differs),
  // so the facts never cost a second jobs read. The list is one page, so no total is claimed.
  const { data: recentJobs } = useQuery({
    queryKey: ['forge-template-frame', brandId, templateKey],
    queryFn: () => apiRendersApi.listJobs(brandId, 10, { templateKey: templateKey ?? '' }),
    enabled: Boolean(templateKey),
    staleTime: 60_000,
    select: (response) => response.items.filter((job) => job.templateKey === templateKey),
  });
  const { data: setCount } = useQuery({
    queryKey: forgeQueryKeys.renderSetList(brandId, templateKey ?? undefined),
    queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey ?? undefined),
    enabled: Boolean(templateKey),
    staleTime: FORGE_STALE_MS.lists,
    select: (response) => response.items.length,
  });

  const nameProblem = templateNameProblem(templateName);
  const chosenWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const status = templateStatus({
    parseState: source.parseState,
    forgeState: run?.state ?? source.forgeState,
    templateKey,
  });
  const ratios = source.ratios;
  const variableCount = variables.length || source.slotCount || 0;
  const unassigned = variables.filter((variable) => variable.role === null).length;

  // Numbered, never named: the only names a binding has are its app and client keys.
  const workspaceIndex = run?.application
    ? workspaces.findIndex((workspace) => workspace.picinst === run.application)
    : workspaces.findIndex((workspace) => workspace.id === workspaceId);
  const workspaceFact =
    workspaceIndex < 0
      ? '—'
      : workspaces.length === 1
        ? 'Default'
        : `Workspace ${workspaceIndex + 1}${workspaces[workspaceIndex]?.isDefault ? ' (default)' : ''}`;

  const fontParseState = fontReadiness?.parseState ?? source.parseState;
  const missingFonts = fontReadiness?.fonts.filter((font) => !font.held).length ?? 0;
  const fontsFact =
    fontParseState === 'pending'
      ? 'Not known yet'
      : fontParseState !== 'parsed'
        ? 'Not known'
        : fontCheckFailed
          ? "Couldn't check"
          : fontReadiness
            ? `${fontReadiness.fonts.length}${missingFonts ? ` · ${missingFonts} missing` : ''}`
            : '…';

  const jobs = recentJobs ?? [];
  const lastFinished = jobs.find((job) => job.status === 'finished');
  const renderedJob = rendered
    ? jobs.find((job) => job.outputs.some((output) => output.url === rendered.url))
    : undefined;
  const drawnRatios = new Set(wireframeFrames(source.parse).map((frame) => frame.ratio));

  const ladder = ladderFor(run?.state);
  const ladderButton = (action: ForgeLadderAction | undefined) => {
    const step = ladder.find((entry) => entry.action === action);
    if (!step) return undefined;
    const { Icon } = step;
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="gap-1"
        title={step.hint}
        disabled={busy !== null}
        onClick={() => void onAdvance(step.action)}
      >
        {busy === step.action ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-3" aria-hidden />
        )}
        {step.label}
      </Button>
    );
  };

  const fontsDetail =
    (fontReadiness?.parseState === 'parsed' && fontReadiness.fonts.length > 0) || fontResult ? (
      <div className="flex flex-col gap-2">
        {fontReadiness?.fonts.length ? (
          <ul className="flex flex-wrap gap-1" aria-label="Typefaces">
            {fontReadiness.fonts.map((font) => (
              <li key={font.family}>
                <Pill variant={font.held ? 'success' : 'warning'}>
                  {font.family} · {font.held ? 'uploaded' : 'not uploaded'}
                </Pill>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground">
          Uploaded means the brand holds the file privately. Installed means Forge linked it to this
          promoted template after confirmation.
        </p>
        {templateKey && heldFamilies.length > 0 ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="w-fit"
            disabled={fontBusy}
            onClick={() => void reviewFontInstall()}
          >
            {fontBusy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            Review font install
          </Button>
        ) : null}
        {fontResult ? (
          <div role="status" className="flex flex-col gap-1">
            {fontResult.linked.length > 0 ? (
              <p className="text-success">
                Installed: {fontResult.linked.map((font) => font.postScriptName).join(', ')}
              </p>
            ) : null}
            {fontResult.alreadyLinked.length > 0 ? (
              <p className="text-muted-foreground">
                Already installed:{' '}
                {fontResult.alreadyLinked.map((font) => font.postScriptName).join(', ')}
              </p>
            ) : null}
            {fontResult.refused.map((font) => (
              <p key={font.filename} className="text-destructive">
                Refused {font.filename}: {font.reason}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    ) : undefined;

  const buildDetail = (
    <div className="flex flex-col gap-3">
      {!run || run.state === 'failed' ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Name this build"
              aria-label="Template name"
              aria-invalid={nameProblem !== null && templateName.length > 0}
              inputSize="sm"
              className="w-64"
              disabled={busy !== null}
            />
            {/* Only when there is a choice: one workspace is not a decision. */}
            {workspaces.length > 1 ? (
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                aria-label="Render workspace"
                disabled={busy !== null}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              >
                {/* The server lists the default first and the rest in a stable order. */}
                {workspaces.map((workspace, index) => (
                  <option key={workspace.id} value={workspace.id}>
                    {`Workspace ${index + 1}${workspace.isDefault ? ' (default)' : ''}`}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy !== null || source.parseState !== 'parsed' || nameProblem !== null}
              onClick={onSubmit}
            >
              {busy === 'submit' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}
              Build the template
            </Button>
          </div>
          <p
            className={
              templateName.length > 0 && nameProblem ? 'text-destructive' : 'text-muted-foreground'
            }
          >
            {templateName.length > 0 && nameProblem
              ? nameProblem
              : 'The build name is fixed once built. The name everyone sees can be changed anytime.'}
          </p>
        </div>
      ) : null}
      {run ? <ForgeRunProgress run={run} /> : null}
      {run?.needs?.length ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          {/*
            Two different stops wear `needs_input`, and they ask for opposite things. An `asset`
            need is where EVERY from-scratch build lands — the table is built, the graph is built,
            and nobody has chosen the pictures yet. It is answered in the Variables tab.
          */}
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {run.needs.map((need) => (
              <li key={need.id}>
                {need.slot?.label ?? need.id}
                {need.reason ? ` — ${need.reason}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const detailOf: Record<string, CheckRow['detail']> = {
    fonts: fontsDetail,
    build: buildDetail,
  };
  const checks: CheckRow[] = templateChecks({
    parseState,
    parseError: source.parseError ?? null,
    variableCount,
    formatCount: ratios.length,
    fontReadiness,
    fontCheckFailed,
    run,
    forgeState: source.forgeState,
    templateKey,
  }).map((check) => ({
    name: check.name,
    what: check.what,
    state: check.state,
    result: check.result,
    ticks: check.ticks,
    chips: check.chips?.map((chip) => (
      <Pill key={chip.label} variant={chip.tone}>
        {chip.label}
      </Pill>
    )),
    detail: detailOf[check.id],
    action: ladderButton(check.action),
  }));

  return (
    <div className="flex flex-col divide-y divide-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden />
            Templates
          </Button>
          <h2 className="min-w-0 text-base font-semibold">
            <InlineRename value={name} onRename={onRename} />
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {/*
              A card never says "published" off a forge run alone: the fleet can finish a job
              against an unpromoted package and hand back a blank frame, which reads as success.
              Only a template key means renderable.
            */}
            {templateKey ? 'Ready to render' : 'Not renderable yet'}
            {run && !run.done && !pushed ? ' · live updates unavailable' : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AiVariationsDialog
            brandId={brandId}
            templateKey={templateKey}
            onOpenRender={onOpenRender}
          />
          {templateKey ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={() => onOpenRender?.({ templateKey })}
            >
              <Play className="size-3.5" aria-hidden />
              Render with this
            </Button>
          ) : null}
        </div>
      </header>

      {/* The picture on the left; the facts and then the checks on the right, the way a deployment
          reads. Stacked below lg. */}
      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:divide-x lg:divide-y-0">
        {/* The preview: one format at a time at its true shape, the newest render's file for it
            when there is one, else the drawing of its measured boxes — and the badge says which. */}
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          <TemplateMorph id={assetId}>
            {format ? (
              <FormatPreview
                label="Template preview"
                formats={formats}
                value={format.id}
                onValueChange={setFormatId}
                wellClassName="h-[min(60vh,40rem)]"
                frame={(picked) => {
                  const estimate =
                    picked.ratio && drawnRatios.has(picked.ratio) ? (
                      <TemplateWireframe
                        brandId={brandId}
                        templateKey={templateKey}
                        parse={source.parse}
                        ratio={picked.ratio}
                        className="size-full bg-background"
                      />
                    ) : undefined;
                  if (rendered && renderedJob) {
                    return {
                      mode: 'rendered',
                      at: renderedJob.finishedAt ?? renderedJob.updatedAt,
                      node:
                        rendered.kind === 'video' ? (
                          // biome-ignore lint/a11y/useMediaCaption: a silent preview frame has no captions to show
                          <video
                            src={`${rendered.url}#t=0.1`}
                            className="size-full object-contain"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
                          <img
                            src={rendered.url}
                            alt={`${name} · ${picked.ratio ?? picked.label}`}
                            className="size-full object-contain"
                          />
                        ),
                      estimate,
                      caption: rendered.fileName,
                    };
                  }
                  return estimate ? { mode: 'estimate', node: estimate } : { mode: 'none' };
                }}
              />
            ) : (
              <div className="flex h-[min(60vh,40rem)] items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                No formats read from this file yet
              </div>
            )}
          </TemplateMorph>
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <FactList
            className="p-[var(--card-pad)]"
            facts={[
              { icon: CircleDot, label: 'Status', value: <TemplateStatusPill status={status} /> },
              {
                icon: RectangleHorizontal,
                label: 'Formats',
                value: ratios.length ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {ratios.map((ratio) => (
                      <span
                        key={ratio}
                        className="inline-flex items-center gap-1 font-mono tabular-nums"
                      >
                        <RatioGlyph ratio={ratio} className="text-muted-foreground" />
                        {ratio}
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                ),
              },
              { icon: Boxes, label: 'Workspace', value: workspaceFact },
              {
                icon: Variable,
                label: 'Variables',
                numeric: true,
                value: unassigned ? `${variableCount} · ${unassigned} unassigned` : variableCount,
              },
              { icon: Type, label: 'Fonts', numeric: true, value: fontsFact, ruleBefore: true },
              {
                icon: History,
                label: 'Last render',
                value: jobs.length ? (
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">
                      {lastFinished
                        ? formatRelativeTime(lastFinished.finishedAt ?? lastFinished.updatedAt)
                        : 'None finished'}
                    </span>
                    <TickBar ticks={jobs.map((job) => JOB_TICK[job.status]).reverse()} />
                  </span>
                ) : (
                  'Never'
                ),
              },
              { icon: Layers, label: 'Sets', numeric: true, value: setCount ?? '—' },
              {
                icon: CalendarClock,
                label: 'Updated',
                value: formatDate(source.updatedAt ?? source.createdAt),
              },
            ]}
          />

          <Panel title="Checks" bodyClassName="p-0">
            <CheckTable rows={checks} />
          </Panel>
        </div>
      </div>

      {templateKey ? (
        <TemplateRenders brandId={brandId} templateKey={templateKey} formats={formats} />
      ) : null}

      {/* Every panel stays mounted while hidden: switching tabs must never drop an unsaved edit. */}
      <Tabs defaultValue="variables" className="gap-0">
        <TabsList
          variant="line"
          className="h-9 w-full justify-start gap-3 rounded-none border-b border-border px-[var(--card-pad)]"
        >
          <TabsTrigger value="variables" className="flex-none px-0 text-xs">
            Variables
          </TabsTrigger>
          {templateKey ? (
            <TabsTrigger value="output" className="flex-none px-0 text-xs">
              Output
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="source" className="flex-none px-0 text-xs">
            Source revision
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-none px-0 text-xs">
            History
          </TabsTrigger>
          <TabsTrigger value="details" className="flex-none px-0 text-xs">
            Details
          </TabsTrigger>
        </TabsList>
        <TabsContent value="variables" keepMounted>
          <VariableEditor
            brandId={brandId}
            variables={variables}
            savedDefaults={savedDefaults}
            parseState={parseState}
            saving={saving}
            onSave={onSave}
          />
        </TabsContent>
        {templateKey ? (
          <TabsContent value="output" keepMounted className="p-[var(--card-pad)]">
            {/* Renders nothing until the template's contract carries output settings. */}
            <OutputSettingsPanel brandId={brandId} templateKey={templateKey} />
          </TabsContent>
        ) : null}
        <TabsContent value="source" keepMounted className="p-[var(--card-pad)]">
          <SourceRebindPanel
            brandId={brandId}
            assetId={assetId}
            expectedVersionId={source.versionId}
            onConfirmed={async () => {
              await Promise.all([onChanged(), loadVariables()]);
            }}
          />
        </TabsContent>
        <TabsContent value="history" keepMounted className="p-[var(--card-pad)]">
          <LineagePanel brandId={brandId} assetId={assetId} />
        </TabsContent>
        <TabsContent value="details" keepMounted className="p-[var(--card-pad)]">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Template key</dt>
            <dd className="break-all font-mono">{templateKey ?? '—'}</dd>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="break-all font-mono">
              {run?.application ?? (chosenWorkspace ? renderWorkspaceLabel(chosenWorkspace) : '—')}
            </dd>
            <dt className="text-muted-foreground">Root table</dt>
            <dd className="break-all font-mono">{run?.root_table ?? '—'}</dd>
            <dt className="text-muted-foreground">Asset id</dt>
            <dd className="break-all font-mono">{assetId}</dd>
            <dt className="text-muted-foreground">Source file</dt>
            <dd className="break-all font-mono">{source.parse?.filename ?? '—'}</dd>
          </dl>
        </TabsContent>
      </Tabs>

      <AlertDialog open={fontPlan !== null} onOpenChange={(open) => !open && setFontPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install fonts on this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Forge will privately upload, inspect, and link these files to the promoted template.
              This changes the typefaces used by future renders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-1 text-xs">
            {fontPlan?.files.map((file) => (
              <li key={file.filename} className="break-all">
                {file.filename} · {file.bytes.toLocaleString()} bytes
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fontBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={fontBusy} onClick={() => void installFonts()}>
              Install fonts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
