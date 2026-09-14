import {
  type BrandBookPieceKind,
  HYPERFRAMES_AGENT_MODEL,
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_PROMPT_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_OUTPUT_HANDLE,
  type HyperframesAgentEvent,
  hyperframesAgentEventSchema,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import { AlertTriangle, Check, Circle, Clock, Film, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/ToastProvider';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { useClientRenderQueueIfMounted } from '@/lib/client-render/ClientRenderProvider';
import { GroundingChip } from '../components/GroundingChip';
import { NodeVideoPreview } from '../components/NodeVideoPreview';
import { useCanvasRuntime } from '../contexts/CanvasRuntimeContext';
import { useSnapToVideoAspect } from '../hooks/useSnapToVideoAspect';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData } from '../types';
import { toggleBrandPiece, toggleSkillId } from '../utils/brandEnforcement';
import {
  inspectHyperframesInputs,
  startHyperframesAgentNode,
} from '../utils/startHyperframesAgent';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
import { NodeDownloadButton } from './NodeDownloadButton';

const labelForStatus = (status: HyperframesAgentNodeData['status']): string => {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'drafting':
      return 'Drafting composition';
    case 'reviewing':
      return 'Reviewing frames';
    case 'rendering':
      return 'Rendering in browser';
    case 'completed':
      return 'Video ready';
    case 'failed':
      return 'Run failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ready';
  }
};

// Mirrors the NodeResizer minimums below.
const HYPERFRAMES_NODE_BOUNDS = { minWidth: 360, minHeight: 360, fallbackWidth: 360 };

type StageState = 'pending' | 'active' | 'done' | 'failed';

const stageIcon = (state: StageState) => {
  if (state === 'done') return <Check className="size-3" />;
  if (state === 'failed') return <AlertTriangle className="size-3" />;
  return <Circle className={state === 'active' ? 'size-3 fill-current' : 'size-3'} />;
};

const latestEvent = <T extends HyperframesAgentEvent['type']>(
  events: HyperframesAgentEvent[],
  type: T,
) =>
  [...events]
    .reverse()
    .find((event): event is Extract<HyperframesAgentEvent, { type: T }> => event.type === type);

export function HyperframesAgentBlock({
  id,
  data,
  selected,
}: NodeProps<ReactFlowNode<HyperframesAgentNodeData>>) {
  const runtime = useCanvasRuntime();
  const updateNodeData = useStudioStore((state) => state.updateNodeData);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const runRecord = useAgentRunStore((state) =>
    data.activeRunId ? state.runs[data.activeRunId] : undefined,
  );
  const { show } = useToast();
  const [starting, setStarting] = useState(false);
  const video = data.generatedVideoUrl;

  const events = useMemo(
    () =>
      (runRecord?.events ?? []).flatMap((event) => {
        const parsed = hyperframesAgentEventSchema.safeParse(event);
        return parsed.success ? [parsed.data] : [];
      }),
    [runRecord?.events],
  );
  const revision = latestEvent(events, 'hyperframes.composition.revision');
  const review = latestEvent(events, 'hyperframes.visual_review.completed');
  const quality = review?.data.qualitySummary ?? data.qualitySummary;
  const renderRequested = latestEvent(events, 'hyperframes.render.requested');
  const runError = latestEvent(events, 'response.error')?.data.message;
  const inputs = useMemo(() => inspectHyperframesInputs(id, nodes, edges), [edges, id, nodes]);
  const effectivePrompt = inputs.prompt?.value ?? data.prompt.trim();

  // The render happens in a browser, and only a tab that opted in claims the job. A tab
  // that reloaded no longer has, so the node has to SHOW that it is waiting instead of
  // repeating "rendering continues in this tab" over a job nothing is running — three
  // jobs sat `ready` for days under that copy (Airtable #296).
  const queue = useClientRenderQueueIfMounted();
  const renderJob = queue?.jobs.find(
    (job) =>
      job.executionSpec.kind === 'hyperframes_agent' &&
      (job.executionSpec.runId === data.activeRunId || job.executionSpec.nodeId === id),
  );
  const renderFailure = renderJob?.state === 'failed' ? renderJob.errorMessage : undefined;
  const failure = renderFailure || runError || data.error;
  const runStatus = runRecord?.run.status;
  const running =
    !failure &&
    (starting || runStatus === 'queued' || runStatus === 'running' || Boolean(data.isExecuting));
  // `willAutoRun` is literally the question the provider asks on its next poll — asked
  // THROUGH the provider because the answer now depends on who is signed in, so a render
  // this person started never flashes "waiting" in the gap before the claim.
  const waitingForDevice =
    renderJob?.state === 'ready' &&
    !queue?.willAutoRun(renderJob) &&
    !queue?.isRunningLocally(renderJob) &&
    !starting;

  const displayedStatus = failure
    ? 'Run failed'
    : waitingForDevice
      ? 'Waiting for a device'
      : renderJob?.state === 'rendering' || renderJob?.state === 'saving'
        ? labelForStatus('rendering')
        : labelForStatus(data.status);
  const stages: Array<{ label: string; state: StageState }> = [
    {
      label: 'Inputs',
      state: inputs.issues.length > 0 ? 'failed' : effectivePrompt ? 'done' : 'pending',
    },
    {
      label: 'Draft',
      state: revision ? 'done' : failure ? 'failed' : running ? 'active' : 'pending',
    },
    {
      label: 'Review',
      state: review ? 'done' : failure && revision ? 'failed' : revision ? 'active' : 'pending',
    },
    {
      label: 'Render',
      state: video
        ? 'done'
        : renderFailure
          ? 'failed'
          : renderRequested || renderJob
            ? 'active'
            : 'pending',
    },
  ];

  // Box re-snaps to the composition the agent actually rendered. `data.aspectRatio`
  // is the request the next run sends and is left alone.
  useSnapToVideoAspect({ nodeId: id, src: video, bounds: HYPERFRAMES_NODE_BOUNDS });

  useEffect(() => {
    if (!review?.data.qualitySummary || data.qualitySummary?.revisionId === quality?.revisionId)
      return;
    updateNodeData(id, { qualitySummary: review.data.qualitySummary });
    triggerSave();
  }, [
    data.qualitySummary?.revisionId,
    id,
    quality?.revisionId,
    review,
    triggerSave,
    updateNodeData,
  ]);

  const reviseScene = useCallback(
    (sceneId: string) => {
      const blocker = quality?.blockers.find((item) => item.sceneId === sceneId);
      if (!quality || !blocker) return;
      updateNodeData(id, {
        prompt: blocker.message,
        status: 'idle',
        revisionTarget: {
          revisionId: quality.revisionId,
          sceneId,
          criterionId: blocker.criterionId,
          blocker: blocker.message,
        },
      });
      triggerSave();
    },
    [id, quality, triggerSave, updateNodeData],
  );

  const start = useCallback(async () => {
    if (!runtime || running) return;
    setStarting(true);
    try {
      await startHyperframesAgentNode({
        nodeId: id,
        roomId: runtime.roomId,
        brandId: runtime.brandProfileId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start HyperFrames Agent.';
      updateNodeData(id, { status: 'failed', isExecuting: false, error: message });
      show({ title: 'HyperFrames Agent failed to start', description: message, variant: 'error' });
    } finally {
      setStarting(false);
    }
  }, [id, running, runtime, show, updateNodeData]);

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNodeData(id, { skillIds: toggleSkillId(data.skillIds, skillId) });
      triggerSave();
    },
    [data.skillIds, id, triggerSave, updateNodeData],
  );

  const handleToggleBrandPiece = useCallback(
    (kind: BrandBookPieceKind) => {
      updateNodeData(id, { brandBookPieces: toggleBrandPiece(data.brandBookPieces, kind) });
      triggerSave();
    },
    [data.brandBookPieces, id, triggerSave, updateNodeData],
  );

  return (
    <div className="relative size-full min-h-[360px] min-w-[360px]">
      <NodeResizer
        minWidth={360}
        minHeight={360}
        isVisible={selected}
        lineClassName="border-brand-primary/60"
        handleClassName="h-3 w-3 rounded-full border-2 border-background bg-brand-primary"
      />
      {/* `size-full`, not `h-full`: the Card's own default is `w-sm` (384px), so a node
          sized 420 wide drew a 384px card inside a 420px box and the NodeResizer's handles
          floated 36px clear of what the node actually rendered (Airtable #295). */}
      <CanvasNode
        selected={selected}
        handles={{ target: false, source: false }}
        className="size-full overflow-hidden border-border/60 bg-background p-0 shadow-sm"
      >
        <NodeTitleBar
          icon={Sparkles}
          label="HyperFrames Agent"
          title={quality?.modelProvenance.draftModelId ?? HYPERFRAMES_AGENT_MODEL}
        >
          {/* IN the title bar, not floating over it. A pill parked at `top-2` painted over
              the node's own title and ate its first characters (Airtable #295). */}
          <div className="shrink-0" data-testid="studio-grounding-chip">
            <GroundingChip
              nodeId={id}
              nodeType="hyperframesAgent"
              brandId={runtime?.brandProfileId}
              skillIds={data.skillIds}
              brandBookPieces={data.brandBookPieces}
              editable
              onToggleSkill={handleToggleSkill}
              onTogglePiece={handleToggleBrandPiece}
              className="h-5 px-1.5"
            />
          </div>
          <NodeBadge>{displayedStatus}</NodeBadge>
        </NodeTitleBar>
        <NodeContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          <textarea
            value={data.prompt}
            onChange={(event) =>
              updateNodeData(id, {
                prompt: event.target.value,
                status: data.status === 'completed' ? 'idle' : data.status,
              })
            }
            placeholder="Describe the video, motion, pacing, copy, and how to use the attached media…"
            className="min-h-20 w-full resize-none rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs outline-none transition focus:border-brand-primary/60"
          />

          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className="font-semibold text-foreground">Source</span>
            <span className={inputs.issues.length ? 'text-destructive' : 'text-muted-foreground'}>
              {inputs.issues[0]?.message ??
                (inputs.media.length > 0
                  ? `${inputs.media.length} connected media${inputs.prompt ? ' + Text node' : ''}`
                  : effectivePrompt
                    ? inputs.prompt
                      ? 'Connected Text node'
                      : 'Text-only composition'
                    : 'Add a prompt or connect Text')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-2xs">
            <label className="space-y-1 text-muted-foreground">
              <span>Energy</span>
              <select
                value={data.energy}
                onChange={(event) =>
                  updateNodeData(id, {
                    energy: event.target.value as HyperframesAgentNodeData['energy'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="calm">Calm</option>
                <option value="balanced">Balanced</option>
                <option value="high-energy">High energy</option>
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>Format</span>
              <select
                value={data.aspectRatio}
                onChange={(event) =>
                  updateNodeData(id, {
                    aspectRatio: event.target.value as HyperframesAgentNodeData['aspectRatio'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>Length</span>
              <select
                value={data.durationSeconds}
                onChange={(event) =>
                  updateNodeData(id, { durationSeconds: Number(event.target.value) })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                {[5, 10, 15, 20, 30].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>Resolution</span>
              <select
                value={data.resolution}
                onChange={(event) =>
                  updateNodeData(id, {
                    resolution: event.target.value as HyperframesAgentNodeData['resolution'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
          </div>

          <ol className="grid grid-cols-4 gap-1" aria-label="Production progress">
            {stages.map((stage) => (
              <li
                key={stage.label}
                className={`flex items-center justify-center gap-1 rounded-md border px-1 py-1 text-2xs ${
                  stage.state === 'failed'
                    ? 'border-destructive/40 text-destructive'
                    : stage.state === 'active'
                      ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary'
                      : stage.state === 'done'
                        ? 'border-emerald-500/30 text-emerald-600'
                        : 'border-border/60 text-muted-foreground'
                }`}
              >
                {stageIcon(stage.state)}
                {stage.label}
              </li>
            ))}
          </ol>

          {revision?.data.feedback ? (
            <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2 text-2xs">
              <p className="font-medium text-foreground">{revision.data.feedback.summary}</p>
              {revision.data.feedback.assetDecisions.map((decision) => (
                <div key={decision.assetId} className="flex gap-1 text-muted-foreground">
                  <span className="shrink-0 font-medium text-foreground/80">
                    {inputs.media.find((media) => media.assetId === decision.assetId)?.label ??
                      decision.assetId}
                    :
                  </span>
                  <span>{decision.note}</span>
                </div>
              ))}
              {review?.data.craftScore ? (
                <p className="font-medium text-foreground">Craft {review.data.craftScore}/10</p>
              ) : null}
            </div>
          ) : null}

          {quality ? (
            <details className="rounded-lg border border-border/60 bg-muted/20 p-2 text-2xs" open>
              <summary className="cursor-pointer font-semibold text-foreground">
                Production slate · {quality.gate === 'passed' ? 'passed' : 'needs revision'}
                {quality.advisoryScore === null
                  ? ''
                  : ` · ${(quality.advisoryScore * 10).toFixed(1)}/10 advisory`}
              </summary>
              <div className="mt-2 space-y-1.5">
                {quality.scenes.map((scene) => {
                  const blocker = quality.blockers.find((item) => item.sceneId === scene.id);
                  return (
                    <div
                      key={scene.id}
                      className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-background/60 p-1.5"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {scene.role} · {scene.start_seconds.toFixed(1)}–
                          {(scene.start_seconds + scene.duration_seconds).toFixed(1)}s
                        </p>
                        <p className={blocker ? 'text-destructive' : 'text-muted-foreground'}>
                          {blocker?.message ?? `${scene.motion.verb} · ${scene.layout}`}
                        </p>
                      </div>
                      {blocker ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 shrink-0 px-2 text-2xs"
                          onClick={() => reviseScene(scene.id)}
                          aria-label={`Revise ${scene.role} scene`}
                        >
                          Revise
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                <p className="text-muted-foreground">
                  Creator {quality.modelProvenance.draftModelId}
                  {quality.modelProvenance.repairModelIds.length
                    ? ` · Repair ${quality.modelProvenance.repairModelIds.join(', ')}`
                    : ''}
                  {quality.modelProvenance.criticModelId
                    ? ` · Critic ${quality.modelProvenance.criticModelId} (advisory)`
                    : ''}
                </p>
              </div>
            </details>
          ) : null}

          <div className="relative flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-black/90">
            <NodeDownloadButton
              nodeType="hyperframesAgent"
              data={data}
              baseName="hyperframes"
              label="Download rendered clip"
            />
            {video ? (
              <NodeVideoPreview src={video} className="bg-transparent" />
            ) : waitingForDevice && renderJob ? (
              <div className="flex w-3/4 flex-col items-center gap-3 text-center">
                <Clock className="h-6 w-6 text-amber-400" />
                <span className="text-2xs text-muted-foreground">
                  Waiting for a device to render this composition.
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void queue?.run(renderJob).catch(() => undefined)}
                >
                  Render here
                </Button>
              </div>
            ) : running ? (
              <div className="flex w-3/4 flex-col items-center gap-3 text-center">
                <Film className="h-6 w-6 animate-pulse text-violet-400" />
                <Progress value={(data.progress ?? 0) * 100} className="h-1.5 w-full" />
                <span className="text-2xs text-muted-foreground">
                  You can leave AI Studio; rendering continues in this tab.
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Connect media, add a prompt, then run the agent.
              </span>
            )}
          </div>

          {failure ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{failure}</span>
            </div>
          ) : null}

          {renderFailure && renderJob ? (
            <Button onClick={() => void queue?.retry(renderJob)} className="w-full">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          ) : (
            <Button onClick={() => void start()} disabled={!runtime || running} className="w-full">
              <Play className="mr-2 h-3.5 w-3.5" />
              {data.sessionId ? 'Send revision' : 'Create video'}
            </Button>
          )}
        </NodeContent>
      </CanvasNode>

      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_PROMPT_INPUT_HANDLE}
        style={{ top: '20%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-slate-400"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_IMAGE_INPUT_HANDLE}
        style={{ top: '40%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-pink-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_VIDEO_INPUT_HANDLE}
        style={{ top: '60%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={HYPERFRAMES_AUDIO_INPUT_HANDLE}
        style={{ top: '80%' }}
        className="!h-3 !w-3 !border-2 !border-background !bg-amber-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={HYPERFRAMES_VIDEO_OUTPUT_HANDLE}
        className="!h-3 !w-3 !border-2 !border-background !bg-blue-500"
      />
    </div>
  );
}
