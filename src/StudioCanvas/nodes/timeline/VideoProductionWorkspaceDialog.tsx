'use client';

import {
  type EditorCommand,
  type EditorGenerationKind,
  type EditorProjectV2,
  type EditorTake,
  editorCommandBatchSchema,
} from '@continuum/contracts';
import { Check, ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import {
  applyVideoProjectCommands,
  enqueueVideoProjectRender,
  generateVideoCandidates,
  getVideoProject,
  getVideoProjectSummary,
  restoreVideoProjectTimeline,
} from '@/lib/api/videoProjects.client';
import { listAssetVersions } from '@/lib/library/versions';
import type { TimelineInputSource } from '../../types';
import { EditorProjectV2Assembly } from './EditorProjectV2Assembly';
import {
  type EditorAssemblyOperation,
  exactVersionPreviewUrl,
} from './editorProjectV2AssemblyModel';

const STAGES = [
  { id: 'style', label: 'Style' },
  { id: 'frames', label: 'Frames' },
  { id: 'motion', label: 'Motion' },
  { id: 'masters', label: 'Masters' },
  { id: 'assembly', label: 'Assembly' },
] as const;
type WorkspaceStage = (typeof STAGES)[number]['id'];
type WithoutCommandMetadata<T> = T extends unknown
  ? Omit<T, 'commandId' | 'idempotencyKey' | 'expectedRevision' | 'issuedAt' | 'actor'>
  : never;
type EditorCommandDraft = WithoutCommandMetadata<EditorCommand>;
interface AssemblyHistoryEntry {
  label: string;
  beforeRevision: number;
  afterRevision: number;
}
type UndoEntry = AssemblyHistoryEntry & { appliedFingerprint: string };
type RedoEntry = AssemblyHistoryEntry & { redoFingerprint: string };

const stageFor = (project: EditorProjectV2): WorkspaceStage => {
  const stage = project.production.workflowStage;
  if (stage.startsWith('style')) return 'style';
  if (stage.startsWith('frame')) return 'frames';
  if (stage.startsWith('motion')) return 'motion';
  if (stage.startsWith('master')) return 'masters';
  return 'assembly';
};

function TakePreview({ take, brandId }: { take: EditorTake; brandId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!take.asset) return;
    let cancelled = false;
    void listAssetVersions({ brandId, assetId: take.asset.assetId })
      .then((versions) => exactVersionPreviewUrl(versions, take.asset?.versionId ?? ''))
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [brandId, take.asset]);
  if (!url) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground">
        Preview loading…
      </div>
    );
  }
  if (take.kind === 'frame') {
    // biome-ignore lint/performance/noImgElement: signed Library candidates are dynamic media.
    return (
      <img src={url} alt="Generated frame candidate" className="aspect-video w-full object-cover" />
    );
  }
  return (
    // biome-ignore lint/a11y/useMediaCaption: generated silent review candidate.
    <video src={url} controls className="aspect-video w-full bg-black object-contain" />
  );
}

export function VideoProductionWorkspaceDialog({
  projectId,
  brandId,
  pool,
  open,
  onOpenChange,
}: {
  projectId: string;
  brandId: string;
  pool: TimelineInputSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { show } = useToast();
  const [project, setProject] = useState<EditorProjectV2 | null>(null);
  const [activeStage, setActiveStage] = useState<WorkspaceStage>('style');
  const [busy, setBusy] = useState<string | null>(null);
  const [styleText, setStyleText] = useState('');
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<RedoEntry[]>([]);

  const refresh = useCallback(async () => {
    const next = await getVideoProject(projectId);
    setProject(next);
    setStyleText(next.production.styleContract?.lockedText ?? '');
    setActiveStage((current) =>
      current === 'style' && next.revision === 0 ? stageFor(next) : current,
    );
    return next;
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void refresh().catch((error) =>
      show({
        title: 'Could not open video production',
        description: error instanceof Error ? error.message : 'Project loading failed.',
        variant: 'error',
      }),
    );
    const interval = window.setInterval(() => void refresh().catch(() => undefined), 3_000);
    return () => window.clearInterval(interval);
  }, [open, refresh, show]);

  const commitCommands = useCallback(
    async (commands: EditorCommandDraft[], label: string) => {
      if (!project) return;
      const issuedAt = new Date().toISOString();
      const batchId = crypto.randomUUID();
      const actor = { actorId: 'current-user', actorType: 'user' as const };
      const batch = editorCommandBatchSchema.parse({
        batchId,
        projectId: project.projectId,
        sequenceId: project.sequenceId,
        idempotencyKey: `ui:${batchId}`,
        expectedRevision: project.revision,
        expectedFingerprint: project.fingerprint,
        atomic: true,
        issuedAt,
        actor,
        commands: commands.map((command, index) => {
          const commandId = crypto.randomUUID();
          return {
            ...command,
            commandId,
            idempotencyKey: `ui-command:${batchId}:${index}:${commandId}`,
            expectedRevision: project.revision,
            issuedAt,
            actor,
          };
        }),
      });
      setBusy(label);
      try {
        const next = await applyVideoProjectCommands(batch);
        setProject(next);
        setStyleText(next.production.styleContract?.lockedText ?? '');
        return next;
      } finally {
        setBusy(null);
      }
    },
    [project],
  );

  const commit = useCallback(
    (command: EditorCommandDraft) => commitCommands([command], command.commandType),
    [commitCommands],
  );

  const applyAssemblyOperation = useCallback(
    async (operation: EditorAssemblyOperation) => {
      if (busy || !project) return;
      const beforeRevision = project.revision;
      try {
        const next = await commitCommands(operation.forward, operation.label);
        if (!next) return;
        setUndoStack((current) => [
          ...current,
          {
            label: operation.label,
            beforeRevision,
            afterRevision: next.revision,
            appliedFingerprint: next.fingerprint,
          },
        ]);
        setRedoStack([]);
      } catch (error) {
        show({
          title: 'Assembly edit failed',
          description: error instanceof Error ? error.message : 'The project could not be updated.',
          variant: 'error',
        });
      }
    },
    [busy, commitCommands, project, show],
  );

  const restoreTimelineRevision = useCallback(
    async (restoreRevision: number, label: string) => {
      if (!project) return;
      setBusy(label);
      try {
        const next = await restoreVideoProjectTimeline(project.projectId, {
          expectedRevision: project.revision,
          expectedFingerprint: project.fingerprint,
          restoreRevision,
          idempotencyKey: `ui-restore:${project.projectId}:${project.revision}:${restoreRevision}:${crypto.randomUUID()}`,
        });
        setProject(next);
        setStyleText(next.production.styleContract?.lockedText ?? '');
        return next;
      } finally {
        setBusy(null);
      }
    },
    [project],
  );

  const undoAssembly = useCallback(async () => {
    const entry = undoStack.at(-1);
    if (!entry || !project || busy) return;
    if (entry.appliedFingerprint !== project.fingerprint) {
      show({
        title: 'Undo needs the latest revision',
        description: 'The project changed after this edit. Refresh before making another change.',
        variant: 'warning',
      });
      return;
    }
    try {
      const next = await restoreTimelineRevision(entry.beforeRevision, `Undo ${entry.label}`);
      if (!next) return;
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, { ...entry, redoFingerprint: next.fingerprint }]);
    } catch (error) {
      show({
        title: 'Undo failed',
        description: error instanceof Error ? error.message : 'The edit could not be reversed.',
        variant: 'error',
      });
    }
  }, [busy, project, restoreTimelineRevision, show, undoStack]);

  const redoAssembly = useCallback(async () => {
    const entry = redoStack.at(-1);
    if (!entry || !project || busy) return;
    if (entry.redoFingerprint !== project.fingerprint) {
      show({
        title: 'Redo needs the latest revision',
        description: 'The project changed after undo. Redo was left unapplied.',
        variant: 'warning',
      });
      return;
    }
    try {
      const next = await restoreTimelineRevision(entry.afterRevision, `Redo ${entry.label}`);
      if (!next) return;
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, { ...entry, appliedFingerprint: next.fingerprint }]);
    } catch (error) {
      show({
        title: 'Redo failed',
        description: error instanceof Error ? error.message : 'The edit could not be replayed.',
        variant: 'error',
      });
    }
  }, [busy, project, redoStack, restoreTimelineRevision, show]);

  const queueRender = useCallback(() => {
    setBusy('render');
    void enqueueVideoProjectRender(projectId)
      .then(() => {
        show({
          title: 'Master queued',
          description: 'Open the render inbox to run it on this device.',
        });
        return getVideoProjectSummary(projectId);
      })
      .then(() => refresh())
      .catch((error) =>
        show({
          title: 'Render could not be queued',
          description: error instanceof Error ? error.message : 'The render request failed.',
          variant: 'error',
        }),
      )
      .finally(() => setBusy(null));
  }, [projectId, refresh, show]);

  const generate = useCallback(
    async (kind: EditorGenerationKind, shotId?: string) => {
      setBusy(`${kind}:${shotId ?? 'project'}`);
      try {
        await generateVideoCandidates({ projectId, kind, shotId });
        show({
          title: 'Generation queued',
          description: 'Candidates will appear here automatically.',
        });
        await refresh();
      } catch (error) {
        show({
          title: 'Generation blocked',
          description: error instanceof Error ? error.message : 'The request could not start.',
          variant: 'warning',
        });
      } finally {
        setBusy(null);
      }
    },
    [projectId, refresh, show],
  );

  const pinnedPool = useMemo(
    () => pool.filter((source) => source.sourceAssetId && source.sourceVersionId),
    [pool],
  );
  const counts = useMemo(() => {
    const shots = project?.production.shots ?? [];
    return {
      shots: shots.length,
      frames: shots.filter((shot) => shot.selection.frameTakeId).length,
      motion: shots.filter((shot) => shot.selection.motionDraftTakeId).length,
      masters: shots.filter((shot) => shot.selection.motionMasterTakeId).length,
    };
  }, [project]);

  const addShot = () => {
    const order = project?.production.shots.length ?? 0;
    void commit({
      commandType: 'upsert_shot',
      shot: {
        id: crypto.randomUUID(),
        order,
        title: `Shot ${order + 1}`,
        brief: 'A single clear story beat grounded in the approved visual language.',
        subjectAction: 'The subject performs one deliberate action.',
        cameraMove: 'Slow controlled dolly in.',
        inSceneEvent: 'A visible change happens inside the scene during the shot.',
        targetDurationSec: 8,
        referenceIds: [],
        takes: [],
        selection: {},
      },
    });
  };

  if (!project) return null;
  const style = project.production.styleContract;

  const takeGrid = (kind: EditorTake['kind'], generationKind: EditorGenerationKind) => (
    <div className="space-y-4">
      {project.production.shots.map((shot) => {
        const takes = shot.takes.filter((take) => take.kind === kind);
        const selectedId =
          kind === 'frame'
            ? shot.selection.frameTakeId
            : kind === 'motion_draft'
              ? shot.selection.motionDraftTakeId
              : shot.selection.motionMasterTakeId;
        return (
          <section key={shot.id} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{shot.title}</h3>
                <p className="text-xs text-muted-foreground">{shot.brief}</p>
              </div>
              <Button
                size="sm"
                onClick={() => void generate(generationKind, shot.id)}
                disabled={Boolean(busy)}
              >
                {busy === `${generationKind}:${shot.id}` ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {generationKind === 'frame'
                  ? 'Generate 4'
                  : generationKind === 'motion_draft'
                    ? 'Generate 3'
                    : 'Generate 1080p master'}
              </Button>
            </div>
            {takes.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
                No candidates yet.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {takes.map((take) => (
                  <article
                    key={take.id}
                    className="overflow-hidden rounded-lg border border-border/70 bg-background"
                  >
                    <TakePreview take={take} brandId={brandId} />
                    <div className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-2xs text-muted-foreground">
                          {take.model}
                        </span>
                        <Badge variant={take.id === selectedId ? 'default' : 'secondary'}>
                          {take.id === selectedId ? 'Keeper' : take.status}
                        </Badge>
                      </div>
                      {take.status === 'ready' && take.id !== selectedId ? (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() =>
                            void commit({
                              commandType: 'approve_take',
                              shotId: shot.id,
                              takeId: take.id,
                            })
                          }
                          disabled={Boolean(busy)}
                        >
                          <Check /> Choose keeper
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="md:left-[var(--app-sidebar-width,3.5rem)]"
        className="left-4 right-4 top-4 bottom-4 z-50 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border border-border/60 p-0 shadow-2xl sm:max-w-none md:left-[calc(var(--app-sidebar-width,3.5rem)+1rem)]"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/60 px-5 py-4 text-left">
          <div>
            <DialogTitle>{project.title}</DialogTitle>
            <DialogDescription>
              Human-directed production · revision {project.revision}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{project.production.workflowStage.replaceAll('_', ' ')}</Badge>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </DialogHeader>

        <nav className="grid grid-cols-5 border-b border-border/60 bg-muted/20 px-5">
          {STAGES.map((stage, index) => {
            const completed =
              stage.id === 'style'
                ? style?.status === 'approved'
                : stage.id === 'frames'
                  ? counts.shots > 0 && counts.frames === counts.shots
                  : stage.id === 'motion'
                    ? counts.shots > 0 && counts.motion === counts.shots
                    : stage.id === 'masters'
                      ? counts.shots > 0 && counts.masters === counts.shots
                      : project.production.workflowStage === 'complete';
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-xs transition-colors ${activeStage === stage.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-2xs ${completed ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  {completed ? <Check className="size-3" /> : index + 1}
                </span>
                {stage.label}
              </button>
            );
          })}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-5">
          {activeStage === 'style' ? (
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-medium">Style contract</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lock the lens, light, palette, texture, blocking, and atmosphere before
                      spending on motion.
                    </p>
                  </div>
                  <Badge>{style?.status ?? 'not extracted'}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {pinnedPool.map((source) => (
                    <Badge key={source.nodeId} variant="outline">
                      {source.label}
                    </Badge>
                  ))}
                  {pinnedPool.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Connect pinned Library images to the node first.
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    disabled={pinnedPool.length === 0 || Boolean(busy)}
                    onClick={() =>
                      void commit({
                        commandType: 'set_production_references',
                        references: pinnedPool.map((source) => {
                          const existing = project.production.references.find(
                            (reference) => reference.id === source.nodeId,
                          );
                          return {
                            id: source.nodeId,
                            role: existing?.role ?? ('style' as const),
                            asset: {
                              assetId: source.sourceAssetId as string,
                              versionId: source.sourceVersionId as string,
                            },
                            label: source.label,
                          };
                        }),
                      })
                    }
                  >
                    Pin connected references
                  </Button>
                  <Button
                    disabled={
                      !project.production.references.some(
                        (reference) => reference.role === 'style',
                      ) || Boolean(busy)
                    }
                    onClick={() => void generate('style_extract')}
                  >
                    {busy === 'style_extract:project' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    Extract style
                  </Button>
                </div>
              </div>
              {style ? (
                <div className="rounded-xl border border-border/60 bg-card p-5">
                  <Textarea
                    value={styleText}
                    onChange={(event) => setStyleText(event.target.value)}
                    rows={8}
                    disabled={style.status === 'approved'}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    {style.status === 'draft' ? (
                      <>
                        <Button
                          variant="outline"
                          disabled={!styleText.trim() || Boolean(busy)}
                          onClick={() =>
                            void commit({
                              commandType: 'set_style_contract',
                              styleContract: { ...style, lockedText: styleText, status: 'draft' },
                            })
                          }
                        >
                          Save edits
                        </Button>
                        <Button
                          disabled={Boolean(busy)}
                          onClick={() => void commit({ commandType: 'approve_style_contract' })}
                        >
                          <Check /> Approve style
                        </Button>
                      </>
                    ) : (
                      <Badge>
                        <Check /> Human approved
                      </Badge>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeStage === 'frames' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium">Frames first</h2>
                  <p className="text-xs text-muted-foreground">
                    Explore composition cheaply, then choose one keeper per shot.
                  </p>
                </div>
                <Button variant="outline" onClick={addShot} disabled={Boolean(busy)}>
                  <ImageIcon /> Add shot
                </Button>
              </div>
              {takeGrid('frame', 'frame')}
            </div>
          ) : null}
          {activeStage === 'motion' ? takeGrid('motion_draft', 'motion_draft') : null}
          {activeStage === 'masters' ? takeGrid('motion_master', 'motion_master') : null}
          {activeStage === 'assembly' ? (
            <EditorProjectV2Assembly
              project={project}
              brandId={brandId}
              pool={pinnedPool}
              busy={Boolean(busy)}
              canUndo={undoStack.at(-1)?.appliedFingerprint === project.fingerprint}
              canRedo={redoStack.at(-1)?.redoFingerprint === project.fingerprint}
              canRender={counts.shots > 0 && counts.masters === counts.shots}
              onApply={(operation) => void applyAssemblyOperation(operation)}
              onUndo={() => void undoAssembly()}
              onRedo={() => void redoAssembly()}
              onRender={queueRender}
            />
          ) : null}
        </main>
      </DialogContent>
    </Dialog>
  );
}
