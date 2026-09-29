'use client';

import {
  type EditorGenerationKind,
  type EditorTake,
  editorRenderBlockers,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import { ArrowLeft, Check, ImageIcon, Loader2, Scissors, Sparkles, Waves } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import {
  enqueueVideoProjectRender,
  generateVideoCandidates,
  getVideoProjectSummary,
} from '@/lib/api/videoProjects.client';
import { listAssetVersions } from '@/lib/library/versions';
import { cn } from '@/lib/utils';
import type { TimelineInputSource } from '../../types';
import { buildBeatMarkers } from '../../utils/audio/beatAnalysis';
import { EditorProjectV2Assembly } from './EditorProjectV2Assembly';
import { type EditorCommandDraft, exactVersionPreviewUrl } from './editorProjectV2AssemblyModel';
import { EditWorkspace } from './workspace/EditWorkspace';
import { type EditorProjectController, useEditorProject } from './workspace/useEditorProject';

const STAGES = [
  { id: 'style', label: 'Style' },
  { id: 'frames', label: 'Frames' },
  { id: 'motion', label: 'Motion' },
  { id: 'masters', label: 'Masters' },
  { id: 'sound', label: 'Sound' },
  { id: 'assembly', label: 'Assembly' },
] as const;
type WorkspaceStage = (typeof STAGES)[number]['id'];
type LoadedController = EditorProjectController & {
  project: NonNullable<EditorProjectController['project']>;
};

const stageFor = (project: LoadedController['project']): WorkspaceStage => {
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

/** Assets the edit can draw on (graph wiring, project sources) as the stages' pool. */
const poolSource = (asset: VideoEditorPoolAsset): TimelineInputSource => ({
  nodeId: asset.assetId,
  kind: asset.kind,
  label: asset.title,
  sourceAssetId: asset.assetId,
  ...(asset.versionId ? { sourceVersionId: asset.versionId } : {}),
  ...(asset.durationSec ? { durationSec: asset.durationSec } : {}),
});

/**
 * `/studio/video/[projectId]`. Edit mode — the CapCut-style workspace — is the default.
 * The production stages (Style → Assembly) are a second mode, offered only to projects
 * that have shots, or when the canvas opened the motion editor.
 */
export function VideoStudioWorkspace({
  projectId,
  brandId,
  origin,
  view,
}: {
  projectId: string;
  brandId: string;
  origin: 'canvas' | 'library';
  view?: 'assembly' | 'motion';
}) {
  const controller = useEditorProject(projectId);
  const [mode, setMode] = useState<'edit' | 'production'>(
    view === 'motion' ? 'production' : 'edit',
  );
  const { project } = controller;
  if (!project) {
    return (
      <div className="flex h-[var(--app-content-h)] items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Opening the editor…
      </div>
    );
  }
  const loaded = { ...controller, project };
  const productionAvailable = project.production.shots.length > 0 || view === 'motion';
  return mode === 'production' && productionAvailable ? (
    <ProductionStages
      controller={loaded}
      brandId={brandId}
      origin={origin}
      view={view}
      onOpenEdit={() => setMode('edit')}
    />
  ) : (
    <EditWorkspace
      controller={loaded}
      brandId={brandId}
      origin={origin}
      productionAvailable={productionAvailable}
      onOpenProduction={() => setMode('production')}
    />
  );
}

function ProductionStages({
  controller,
  brandId,
  origin,
  view,
  onOpenEdit,
}: {
  controller: LoadedController;
  brandId: string;
  origin: 'canvas' | 'library';
  view?: 'assembly' | 'motion';
  onOpenEdit: () => void;
}) {
  const { show } = useToast();
  const { project, refresh, commit: commitCommands, runOp } = controller;
  const projectId = project.projectId;
  const [activeStage, setActiveStage] = useState<WorkspaceStage>(() =>
    view ? 'assembly' : stageFor(project),
  );
  const [localBusy, setBusy] = useState<string | null>(null);
  const busy = localBusy ?? controller.busy;
  const [pool, setPool] = useState<TimelineInputSource[]>([]);
  const [scriptText, setScriptText] = useState('');
  const [styleText, setStyleText] = useState('');
  const [narrationText, setNarrationText] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [bpm, setBpm] = useState('120');
  const [beatOffset, setBeatOffset] = useState('0');

  // The drafts follow the project whenever a new revision lands — ours or anyone's.
  const { production } = project;
  useEffect(() => {
    setScriptText(production.sourceScript ?? '');
    setStyleText(production.styleContract?.lockedText ?? '');
    setNarrationText(production.soundPlan?.narrationText ?? production.sourceScript ?? '');
    setMusicPrompt(production.soundPlan?.musicPrompt ?? '');
    setBpm(String(production.soundPlan?.bpm ?? 120));
    setBeatOffset(String(production.soundPlan?.beatOffsetSec ?? 0));
  }, [production]);

  useEffect(() => {
    void runOp('get_pool', {})
      .then((output) => setPool(output.assets.map(poolSource)))
      .catch(() => setPool([]));
  }, [runOp]);

  const commit = useCallback(
    (command: EditorCommandDraft) => commitCommands([command], command.commandType),
    [commitCommands],
  );

  const queueRender = () => {
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
  };

  const generate = async (kind: EditorGenerationKind, shotId?: string) => {
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
  };

  const pinnedPool = pool.filter((source) => source.sourceAssetId && source.sourceVersionId);
  const counts = {
    shots: production.shots.length,
    frames: production.shots.filter((shot) => shot.selection.frameTakeId).length,
    motion: production.shots.filter((shot) => shot.selection.motionDraftTakeId).length,
    masters: production.shots.filter((shot) => shot.selection.motionMasterTakeId).length,
  };

  const addShot = () => {
    const order = production.shots.length;
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

  const style = project.production.styleContract;
  const soundPlan = project.production.soundPlan;
  const soundDraft = (status: 'draft' | 'approved' = 'draft') => ({
    status,
    narrationText,
    voiceId: soundPlan?.voiceId ?? 'Aoede',
    musicPrompt,
    negativePrompt: soundPlan?.negativePrompt ?? '',
    bpm: Number.isFinite(Number(bpm)) ? Number(bpm) : null,
    beatOffsetSec: Math.max(0, Number(beatOffset) || 0),
    beatConfidence: soundPlan?.beatConfidence ?? null,
    ducking: soundPlan?.ducking ?? {
      enabled: true,
      reductionDb: -12,
      attackSec: 0.08,
      releaseSec: 0.3,
    },
    takes: soundPlan?.takes ?? [],
    selectedNarrationTakeId: soundPlan?.selectedNarrationTakeId,
    selectedMusicTakeId: soundPlan?.selectedMusicTakeId,
  });
  const generateSound = async (kind: 'narration' | 'music') => {
    await commit({ commandType: 'set_sound_plan', soundPlan: soundDraft() });
    await generate(kind);
  };

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
    <div className="flex h-[var(--app-content-h)] min-h-[600px] w-full flex-col overflow-hidden bg-background">
      <header className="flex flex-row items-center justify-between border-b border-border/60 px-5 py-4 text-left">
        <div>
          <h1 className="text-sm font-semibold tracking-tight">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            Human-directed production · revision {project.revision}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{project.production.workflowStage.replaceAll('_', ' ')}</Badge>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenEdit}>
            <Scissors className="size-3.5" /> Edit
          </Button>
          <Link
            href={origin === 'library' ? '/library' : '/ai-studio'}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
          >
            <ArrowLeft className="size-3.5" /> Back to {origin === 'library' ? 'Library' : 'Canvas'}
          </Link>
        </div>
      </header>

      <nav className="grid grid-cols-3 border-b border-border/60 bg-muted/20 px-5 sm:grid-cols-6">
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
                    : stage.id === 'sound'
                      ? soundPlan?.status === 'approved'
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
              <h2 className="font-medium">Script</h2>
              <Textarea
                className="mt-4"
                value={scriptText}
                onChange={(event) => setScriptText(event.target.value)}
                rows={8}
                placeholder="Paste or write the source script"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void commit({
                      commandType: 'set_production_script',
                      sourceScript: scriptText,
                    })
                  }
                >
                  Save script
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">Style contract</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Lock the lens, light, palette, texture, blocking, and atmosphere before spending
                    on motion.
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
              {project.production.references.map((reference) => (
                <label
                  key={reference.id}
                  className="mt-2 flex items-center justify-between gap-3 text-xs"
                >
                  <span>{reference.label ?? reference.id}</span>
                  <select
                    aria-label={`Role for ${reference.label ?? reference.id}`}
                    className="h-8 rounded-md border bg-background px-2"
                    value={reference.role}
                    onChange={(event) =>
                      void commit({
                        commandType: 'set_production_references',
                        references: project.production.references.map((item) =>
                          item.id === reference.id
                            ? { ...item, role: event.target.value as typeof item.role }
                            : item,
                        ),
                      })
                    }
                  >
                    {['style', 'character', 'location', 'product', 'score', 'ambience'].map(
                      (role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ))}
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
        {activeStage === 'sound' ? (
          <div className="mx-auto grid max-w-5xl gap-px border border-border/60 bg-border/60 lg:grid-cols-2">
            <section className="space-y-4 bg-background p-5">
              <div>
                <h2 className="font-medium">Voiceover</h2>
                <p className="text-xs text-muted-foreground">
                  Generate a WAV take from the approved script.
                </p>
              </div>
              <Textarea
                value={narrationText}
                onChange={(event) => setNarrationText(event.target.value)}
                rows={8}
              />
              <Button
                disabled={!narrationText.trim() || Boolean(busy)}
                onClick={() => void generateSound('narration')}
              >
                <Sparkles /> Generate narration
              </Button>
            </section>
            <section className="space-y-4 bg-background p-5">
              <div>
                <h2 className="font-medium">Music and beat grid</h2>
                <p className="text-xs text-muted-foreground">
                  Set musical direction, then correct BPM and offset before syncing cuts.
                </p>
              </div>
              <Textarea
                value={musicPrompt}
                onChange={(event) => setMusicPrompt(event.target.value)}
                rows={4}
                placeholder="Percussive, restrained, no vocals"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  aria-label="BPM"
                  type="number"
                  min="30"
                  max="300"
                  value={bpm}
                  onChange={(event) => setBpm(event.target.value)}
                />
                <Input
                  aria-label="Beat offset seconds"
                  type="number"
                  min="0"
                  step="0.01"
                  value={beatOffset}
                  onChange={(event) => setBeatOffset(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!musicPrompt.trim() || Boolean(busy)}
                  onClick={() => void generateSound('music')}
                >
                  <Sparkles /> Generate music
                </Button>
                <Button
                  variant="outline"
                  disabled={!Number(bpm) || Boolean(busy)}
                  onClick={() => {
                    const beats = buildBeatMarkers({
                      durationSec: project.durationSec,
                      bpm: Number(bpm),
                      offsetSec: Number(beatOffset) || 0,
                    });
                    void commitCommands(
                      [
                        ...project.markers
                          .filter((marker) => marker.kind === 'beat')
                          .map((marker) => ({
                            commandType: 'remove_marker' as const,
                            markerId: marker.id,
                          })),
                        ...beats.map((marker) => ({
                          commandType: 'upsert_marker' as const,
                          marker,
                        })),
                        {
                          commandType: 'set_sound_plan' as const,
                          soundPlan: { ...soundDraft(), beatConfidence: 1 },
                        },
                      ],
                      'Beat Sync',
                    );
                  }}
                >
                  <Waves /> Beat Sync
                </Button>
              </div>
              <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void commit({ commandType: 'set_sound_plan', soundPlan: soundDraft() })
                  }
                >
                  Save sound plan
                </Button>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void commit({
                      commandType: 'set_sound_plan',
                      soundPlan: soundDraft('approved'),
                    })
                  }
                >
                  <Check /> Approve sound
                </Button>
              </div>
            </section>
          </div>
        ) : null}
        {activeStage === 'assembly' ? (
          <EditorProjectV2Assembly
            project={project}
            brandId={brandId}
            // The WHOLE connected pool, not just the Library-pinned part: the media bin
            // is where a wired clip has to become visible, and filtering it to pinned
            // sources is what made a connected video invisible in Assembly (#294).
            pool={pool}
            busy={Boolean(busy)}
            canUndo={controller.canUndo}
            canRedo={controller.canRedo}
            renderBlockers={editorRenderBlockers(project)}
            initialTimelineMode={view === 'motion' ? 'motion' : 'edit'}
            onApply={(operation) => void controller.apply(operation)}
            onUndo={() => void controller.undo()}
            onRedo={() => void controller.redo()}
            onRender={queueRender}
          />
        ) : null}
      </main>
    </div>
  );
}
