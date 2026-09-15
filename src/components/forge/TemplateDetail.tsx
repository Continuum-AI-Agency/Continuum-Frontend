'use client';

import {
  type RenderWorkspace,
  renderWorkspaceLabel,
  type TemplateFontPushResponse,
  type TemplateFontReadiness,
  type TemplateSource,
  templateNameProblem,
  UNTITLED_TEMPLATE_NAME,
} from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Play, RefreshCw, Rocket, Send, TestTube2 } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AiVariationsDialog } from '@/components/forge/AiVariationsDialog';
import { ForgeRunProgress } from '@/components/forge/ForgeRunProgress';
import { LineagePanel } from '@/components/forge/LineagePanel';
import { OutputSettingsPanel } from '@/components/forge/OutputSettingsPanel';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { SourceRebindPanel } from '@/components/forge/SourceRebindPanel';
import { useForgeRun } from '@/components/forge/useForgeRun';
import { VariableEditor } from '@/components/forge/VariableEditor';
import { Pill } from '@/components/kibo-ui/pill';
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
import { cn } from '@/lib/utils';
import {
  InlineRename,
  sourceDisplayName,
  TemplateStatusPill,
  templateStatus,
} from './TemplateCard';
import { TemplateMorph, TemplateWireframe, useLatestRenderFrame } from './TemplateWireframe';

// One template, opened: its picture and facts on top, then everything you do to it in the order
// you do it — build, watch the run, say what the variables mean, tune the outputs, swap the source,
// read the history, draft variations. Technical identifiers live in the closed "Details" at the end.

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
function buildNameSuggestion(source: TemplateSource): string {
  const suggestion = sourceDisplayName(source);
  return suggestion === UNTITLED_TEMPLATE_NAME || templateNameProblem(suggestion) ? '' : suggestion;
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border p-4', className)}>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

export function TemplateDetail({
  brandId,
  source,
  onBack,
  onRename,
  onOpenRender,
  onChanged,
}: {
  brandId: string;
  source: TemplateSource;
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
  const rendered = useLatestRenderFrame(brandId, templateKey);
  // Which picture the preview draws: a ratio's wireframe, or `undefined` for the latest render.
  const [view, setView] = useState<string | undefined>(undefined);
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

  const nameProblem = templateNameProblem(templateName);
  const chosenWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const status = templateStatus({
    parseState: source.parseState,
    forgeState: run?.state ?? source.forgeState,
    templateKey,
  });
  const ratios = source.ratios;
  const views = [...(rendered ? [undefined] : []), ...ratios];
  const activeView = view ?? (rendered ? undefined : ratios[0]);
  const fontParseState = fontReadiness?.parseState ?? source.parseState;
  const detectedFamilies = fontReadiness?.fonts.map((font) => font.family) ?? source.fonts;
  const fontSummary =
    fontParseState === 'pending'
      ? 'Fonts are not known until this project is opened.'
      : fontParseState === 'failed'
        ? 'Fonts are not known because this project could not be read.'
        : fontParseState === 'unsupported'
          ? 'This file type is not read for font requirements.'
          : detectedFamilies.length
            ? detectedFamilies.join(', ')
            : 'None detected';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            Templates
          </Button>
          <div className="min-w-0">
            <h2 className="min-w-0 text-lg font-semibold">
              <InlineRename value={name} onRename={onRename} />
            </h2>
            <p className="text-xs text-muted-foreground">
              {/*
                A card never says "published" off a forge run alone: the fleet can finish a job
                against an unpromoted package and hand back a blank frame, which reads as success.
                Only a template key means renderable.
              */}
              {templateKey ? 'Ready to render' : 'Not renderable yet'}
              {run && !run.done && !pushed ? ' · live updates unavailable' : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ladderFor(run?.state).map(({ action, label, Icon, hint }) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              title={hint}
              disabled={busy !== null}
              onClick={() => onAdvance(action)}
            >
              {busy === action ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Icon className="size-4" aria-hidden />
              )}
              {label}
            </Button>
          ))}
          {templateKey ? (
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => onOpenRender?.({ templateKey })}
            >
              <Play className="size-4" aria-hidden />
              Render with this
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]">
        <div className="min-w-0 space-y-2">
          <TemplateMorph id={assetId}>
            <div className="aspect-video overflow-hidden rounded-xl border">
              <TemplateWireframe
                brandId={brandId}
                templateKey={templateKey}
                parse={source.parse}
                ratio={activeView}
                className="h-full w-full p-6"
              />
            </div>
          </TemplateMorph>
          {views.length > 1 ? (
            <fieldset className="flex flex-wrap gap-1" aria-label="Preview">
              {views.map((entry) => (
                <button
                  key={entry ?? 'render'}
                  type="button"
                  aria-pressed={activeView === entry}
                  onClick={() => setView(entry)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    activeView === entry
                      ? 'border-primary bg-primary/10'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {entry ?? 'Last render'}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-6 gap-y-3 rounded-xl border p-4 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <TemplateStatusPill status={status} />
          </dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>{formatDate(source.updatedAt ?? source.createdAt)}</dd>
          <dt className="text-muted-foreground">Formats</dt>
          <dd className="flex flex-wrap gap-1">
            {ratios.length
              ? ratios.map((ratio) => (
                  <Pill key={ratio} variant="muted">
                    {ratio}
                  </Pill>
                ))
              : '—'}
          </dd>
          <dt className="text-muted-foreground">Variables</dt>
          <dd>{variables.length || source.slotCount || 0}</dd>
          <dt className="text-muted-foreground">Fonts</dt>
          <dd className="min-w-0 break-words">{fontSummary}</dd>
        </dl>
      </div>

      {fontReadiness?.parseState === 'parsed' && fontReadiness.fonts.length > 0 ? (
        <Section title="Typefaces">
          <div className="flex flex-wrap gap-1">
            {fontReadiness.fonts.map((font) => (
              <Pill key={font.family} variant={font.held ? 'success' : 'warning'}>
                {font.family} · {font.held ? 'uploaded' : 'not uploaded'}
              </Pill>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Uploaded means the brand holds the file privately. Installed means Forge linked it to
            this promoted template after confirmation.
          </p>
          {templateKey && heldFamilies.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={fontBusy}
              onClick={() => void reviewFontInstall()}
            >
              {fontBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Review font install
            </Button>
          ) : null}
          {fontResult ? (
            <div role="status" className="mt-3 space-y-1 text-xs">
              {fontResult.linked.length > 0 ? (
                <p className="text-emerald-700 dark:text-emerald-300">
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
        </Section>
      ) : fontCheckFailed && source.parseState === 'parsed' ? (
        <p className="text-xs text-muted-foreground">Could not check the brand’s uploaded fonts.</p>
      ) : null}

      {!run || run.state === 'failed' ? (
        <Section title="Build">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Name this build"
              aria-label="Template name"
              aria-invalid={nameProblem !== null && templateName.length > 0}
              className="h-8 w-64"
              disabled={busy !== null}
            />
            {/* Only when there is a choice: one workspace is not a decision. */}
            {workspaces.length > 1 ? (
              <select
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                aria-label="Render workspace"
                disabled={busy !== null}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {/* Numbered, not named: the only names a binding has are its app and client
                    keys. The server lists the default first and the rest in a stable order. */}
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
              className="gap-2"
              disabled={busy !== null || source.parseState !== 'parsed' || nameProblem !== null}
              onClick={onSubmit}
            >
              {busy === 'submit' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Build the template
            </Button>
          </div>
          <p
            className={cn(
              'mt-2 text-xs',
              templateName.length > 0 && nameProblem ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {templateName.length > 0 && nameProblem
              ? nameProblem
              : 'The build name is fixed once built. The name everyone sees can be changed anytime.'}
          </p>
        </Section>
      ) : null}

      {run ? (
        <Section title="Run progress">
          <ForgeRunProgress run={run} />
          {run.needs?.length ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              {/*
                Two different stops wear `needs_input`, and they ask for opposite things. An
                `asset` need is where EVERY from-scratch build lands — the table is built, the
                graph is built, and nobody has chosen the pictures yet. Calling that "nothing
                could bind" reads as a broken AEP when the answer is one Library asset in the
                variable editor below.
              */}
              <p className="font-medium">
                {run.needs.every((need) => need.kind === 'asset')
                  ? `Pick a picture for ${run.needs.length} media variable${run.needs.length === 1 ? '' : 's'} below, then build again`
                  : `${run.needs.length} slot${run.needs.length === 1 ? '' : 's'} nothing could bind`}
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {run.needs.map((need) => (
                  <li key={need.id}>
                    {need.slot?.label ?? need.id}
                    {need.reason ? ` — ${need.reason}` : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Variables">
        <VariableEditor
          brandId={brandId}
          variables={variables}
          savedDefaults={savedDefaults}
          parseState={parseState}
          saving={saving}
          onSave={onSave}
        />
      </Section>

      {/* Renders nothing until the template's contract carries output settings. */}
      {templateKey ? <OutputSettingsPanel brandId={brandId} templateKey={templateKey} /> : null}

      <SourceRebindPanel
        brandId={brandId}
        assetId={assetId}
        expectedVersionId={source.versionId}
        onConfirmed={async () => {
          await Promise.all([onChanged(), loadVariables()]);
        }}
      />

      <LineagePanel brandId={brandId} assetId={assetId} />

      <Section title="Draft variations with AI">
        <p className="mb-3 text-xs text-muted-foreground">
          Describe the versions you want. They are saved as a new render set and open in Render.
        </p>
        <AiVariationsDialog
          brandId={brandId}
          templateKey={templateKey}
          onOpenRender={onOpenRender}
        />
      </Section>

      <details className="rounded-lg border px-4 py-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">Details</summary>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5">
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
      </details>

      <AlertDialog open={fontPlan !== null} onOpenChange={(open) => !open && setFontPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install fonts on this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Forge will privately upload, inspect, and link these files to the promoted template.
              This changes the typefaces used by future renders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-xs">
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
