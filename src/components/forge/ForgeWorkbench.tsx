'use client';

import {
  type RenderWorkspace,
  renderWorkspaceLabel,
  type TemplateSource,
  templateNameProblem,
} from '@continuum/contracts';
import { FileUp, Hammer, Loader2, RefreshCw, Rocket, Send, TestTube2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ForgeRunProgress } from '@/components/forge/ForgeRunProgress';
import { LineagePanel } from '@/components/forge/LineagePanel';
import { PendingApprovals } from '@/components/forge/PendingApprovals';
import { useForgeRun } from '@/components/forge/useForgeRun';
import { VariableEditor } from '@/components/forge/VariableEditor';
import { WorkspaceTemplates } from '@/components/forge/WorkspaceTemplates';
import { UploadStrip } from '@/components/library/UploadStrip';
import { useMediaUpload } from '@/components/library/useMediaUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast-imperative';
import {
  advanceTemplateForgeRun,
  type ForgeLadderAction,
  fetchRenderWorkspaces,
  fetchTemplateSources,
  fetchTemplateVariables,
  saveTemplateVariables,
  sendTemplateToForge,
  type TemplateSlotEdit,
  type TemplateVariable,
} from '@/lib/library/templateSources';
import { cn } from '@/lib/utils';

// Forge — bring your own After Effects project.
//
// The Library still OWNS the file: an upload here goes through the same resumable path into the
// same `media-source` bucket and becomes the same `media.assets` row. This screen is where you
// work on it — watch it get read, and say what its variables mean.

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

function TemplateRow({
  source,
  active,
  onSelect,
}: {
  source: TemplateSource;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-md border px-3 py-2 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
      )}
      aria-current={active ? 'true' : undefined}
    >
      <p className="truncate text-sm font-medium">{source.assetId}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Badge variant="secondary" className="px-1 py-0 text-2xs">
          {source.parseState}
        </Badge>
        {source.slotCount ? <span>{source.slotCount} variables</span> : null}
        {source.ratios?.length ? <span>{source.ratios.join(' · ')}</span> : null}
      </p>
    </button>
  );
}

export function ForgeWorkbench({ brandId }: { brandId: string }) {
  const [sources, setSources] = useState<TemplateSource[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [parseState, setParseState] = useState('pending');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<ForgeLadderAction | 'submit' | null>(null);
  // THE TEMPLATE NAME IS ASKED FOR, never inferred.
  //
  // The forge derives this template's render table from it (`tpl_<slug(name)>_root`, 40
  // characters, never truncated — a shortened key is two templates sharing one root table). The
  // upload's own filename was the obvious default and it is the wrong one: a real AE file is
  // called `Vivo47_EasyFit_1x1_9x16_16x9_v11_FINAL_APPROVED.aep`, which is past the limit before
  // anyone has typed anything. So it is a field, and it is validated while you type.
  const [templateName, setTemplateName] = useState('');
  // WHICH WORKSPACE. A brand may hold several enabled bindings (vivo47 renders into Continuum_app
  // and Parsed_app), and a template belongs to exactly one: the render table is named after that
  // binding's client_key and the membership row points at its id. So when there is a choice a
  // person makes it, and when there is not there is nothing to ask.
  const [workspaces, setWorkspaces] = useState<RenderWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const { uploads, uploadFiles, pauseUpload, resumeUpload, cancelUpload } = useMediaUpload(brandId);
  const { run, pushed, refresh: refreshRun } = useForgeRun(brandId, selected);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSources = useCallback(async () => {
    try {
      setSources(await fetchTemplateSources(brandId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not list your templates');
    }
  }, [brandId]);

  const loadVariables = useCallback(async () => {
    if (!selected) return;
    try {
      const result = await fetchTemplateVariables(brandId, selected);
      setVariables(result.variables);
      setParseState(result.parseState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the variables');
    }
  }, [brandId, selected]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    let cancelled = false;
    fetchRenderWorkspaces(brandId)
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
  }, [brandId]);

  useEffect(() => {
    void loadVariables();
  }, [loadVariables]);

  // A name belongs to the project it names — carrying one across a selection change is how the
  // wrong template ends up owning a root table. The AEP's own filename is offered as a STARTING
  // POINT when it happens to be usable, and left blank when it is not: prefilling a name the
  // forge would refuse is worse than an empty field, because the refusal arrives at submit.
  useEffect(() => {
    const suggestion = (
      sources.find((source) => source.assetId === selected)?.parse?.filename ?? ''
    ).replace(/\.[^.]+$/, '');
    setTemplateName(templateNameProblem(suggestion) ? '' : suggestion);
  }, [selected, sources]);

  // A parse lands seconds after the upload registers, and the row that appears is `pending` until
  // it does. Re-reading when an upload finishes is what turns a just-dropped file into a card
  // with its ratios and slot count on it, without a manual refresh.
  const uploadsDone = uploads.length > 0 && uploads.every((upload) => upload.status === 'done');
  useEffect(() => {
    if (uploadsDone) void loadSources();
  }, [uploadsDone, loadSources]);

  const onSave = async (edits: TemplateSlotEdit[]) => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveTemplateVariables(brandId, selected, edits);
      await loadVariables();
      toast.success('Saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    if (!selected) return;
    const problem = templateNameProblem(templateName);
    if (problem) {
      toast.error(`Template name: ${problem}`);
      return;
    }
    setBusy('submit');
    try {
      await sendTemplateToForge(
        brandId,
        selected,
        templateName.trim(),
        workspaces.length > 1 ? workspaceId : undefined,
      );
      await Promise.all([loadSources(), refreshRun()]);
      toast.success('Sent to the forge');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start the run');
    } finally {
      setBusy(null);
    }
  };

  const onAdvance = async (action: ForgeLadderAction) => {
    if (!selected) return;
    setBusy(action);
    try {
      await advanceTemplateForgeRun(brandId, selected, action);
      await refreshRun();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not ${action}`);
    } finally {
      setBusy(null);
    }
  };

  const current = sources.find((source) => source.assetId === selected) ?? null;
  const nameProblem = templateNameProblem(templateName);

  return (
    <div className="space-y-6">
      {/* Above the workbench, not inside it: a batch waiting on a person is the
          most time-sensitive thing on this page, and it belongs to no one
          template. Renders nothing when there is nothing waiting. */}
      <PendingApprovals brandId={brandId} />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".aep,.aepx,.aet,.zip"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) void uploadFiles(files);
              event.target.value = '';
            }}
          />
          <Button type="button" className="w-full gap-2" onClick={() => fileInput.current?.click()}>
            <FileUp className="size-4" aria-hidden />
            Upload a project
          </Button>
          <p className="text-xs text-muted-foreground">
            .aep, .aepx, .aet or a .zip package, up to 5 GB. It lands in your Library like any other
            file.
          </p>

          {uploads.length ? (
            <UploadStrip
              uploads={uploads}
              onPause={pauseUpload}
              onResume={resumeUpload}
              onRetry={resumeUpload}
              onCancel={cancelUpload}
            />
          ) : null}

          <div className="space-y-1">
            {sources.length ? (
              sources.map((source) => (
                <TemplateRow
                  key={source.assetId}
                  source={source}
                  active={source.assetId === selected}
                  onSelect={() => setSelected(source.assetId)}
                />
              ))
            ) : (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No project files yet.
              </p>
            )}
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          {!current ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
              <Hammer className="size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                Pick a project to see what is inside it.
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{current.assetId}</h2>
                  <p className="text-xs text-muted-foreground">
                    {/*
                    A card never says "published" off a forge run alone: the fleet can finish a job
                    against an unpromoted package and hand back a blank frame, which reads as
                    success. Only a template key means renderable.
                  */}
                    {current.templateKey
                      ? `Renderable — template ${current.templateKey}`
                      : 'Not renderable yet'}
                    {pushed ? null : ' · live updates unavailable'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!run || run.state === 'failed' ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <Input
                          value={templateName}
                          onChange={(event) => setTemplateName(event.target.value)}
                          placeholder="Name this template"
                          aria-label="Template name"
                          aria-invalid={nameProblem !== null && templateName.length > 0}
                          className="h-8 w-56"
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
                            {workspaces.map((workspace) => (
                              <option key={workspace.id} value={workspace.id}>
                                {renderWorkspaceLabel(workspace)}
                                {workspace.isDefault ? ' (default)' : ''}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="gap-2"
                          disabled={
                            busy !== null || current.parseState !== 'parsed' || nameProblem !== null
                          }
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
                          'text-xs',
                          templateName.length > 0 && nameProblem
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {templateName.length > 0 && nameProblem
                          ? nameProblem
                          : workspaces.length > 1
                            ? 'Its render table is named after this, in the workspace you pick — neither can be changed later.'
                            : 'Its render table is named after this, and cannot be renamed later.'}
                      </p>
                    </div>
                  ) : null}
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
                </div>
              </header>

              {selected ? <LineagePanel brandId={brandId} assetId={selected} /> : null}

              {run ? (
                <div className="rounded-lg border p-4">
                  <ForgeRunProgress run={run} />
                  {run.needs?.length ? (
                    <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                      {/*
                      Two different stops wear `needs_input`, and they ask for opposite things.
                      An `asset` need is where EVERY from-scratch build lands — the table is
                      built, the graph is built, and nobody has chosen the pictures yet. Calling
                      that "nothing could bind" reads as a broken AEP when the answer is one
                      Library asset in the variable editor below.
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
                </div>
              ) : null}

              {/* What is already in the workspace — including templates that never came through
                the Library. Renders nothing when there is nothing to show. */}
              <WorkspaceTemplates
                brandId={brandId}
                {...(workspaces.length > 1 && workspaceId ? { workspaceId } : {})}
              />

              <div>
                <h3 className="mb-2 text-sm font-medium">Dynamic variables</h3>
                <VariableEditor
                  brandId={brandId}
                  variables={variables}
                  parseState={parseState}
                  saving={saving}
                  onSave={onSave}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
