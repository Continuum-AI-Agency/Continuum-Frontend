import {
  type BrandBookPieceKind,
  HYPERFRAMES_AGENT_MODEL,
  HYPERFRAMES_AUDIO_INPUT_HANDLE,
  HYPERFRAMES_IMAGE_INPUT_HANDLE,
  HYPERFRAMES_PROMPT_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_INPUT_HANDLE,
  HYPERFRAMES_VIDEO_OUTPUT_HANDLE,
  type HyperframesAgentEvent,
  type HyperframesStoryAngle,
  hyperframesAgentEventSchema,
} from '@continuum/contracts';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  type Node as ReactFlowNode,
} from '@xyflow/react';
import {
  AlertTriangle,
  Check,
  Circle,
  Clock,
  Download,
  ExternalLink,
  Film,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/ToastProvider';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { useElements } from '@/lib/ai-studio/elements';
import {
  getHyperframesStoryAngles,
  getHyperframesStoryboard,
} from '@/lib/api/hyperframesAgent.client';
import { useClientRenderQueueIfMounted } from '@/lib/client-render/ClientRenderProvider';
import {
  buildHyperframesProjectZip,
  downloadHyperframesProjectZip,
} from '@/lib/hyperframes-agent/exportProject';
import { InteractiveHyperframesPreview } from '@/lib/hyperframes-agent/InteractivePreview';
import { sendHyperframesToEditor } from '@/lib/hyperframes-agent/sendToEditor';
import { createShareLink } from '@/lib/library/share';
import { GroundingChip } from '../components/GroundingChip';
import { NodeVideoPreview } from '../components/NodeVideoPreview';
import { useCanvasRuntime } from '../contexts/CanvasRuntimeContext';
import { useSnapToVideoAspect } from '../hooks/useSnapToVideoAspect';
import { useStudioStore } from '../stores/useStudioStore';
import type { HyperframesAgentNodeData } from '../types';
import { toggleBrandPiece, toggleSkillId } from '../utils/brandEnforcement';
import {
  hyperframesStoryboardInputKey,
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
  const router = useRouter();
  const { elements } = useElements(runtime?.brandProfileId);
  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState<'angles' | 'storyboard' | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [openingEditor, setOpeningEditor] = useState(false);
  const [embedCode, setEmbedCode] = useState<{ video: string; interactive: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<'video' | 'interactive'>('video');
  const [sceneFeedback, setSceneFeedback] = useState<Record<string, string>>({});
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
  const inputs = useMemo(
    () =>
      inspectHyperframesInputs(
        id,
        nodes,
        edges,
        elements,
        data.referenceVideoAssetIds,
        data.referenceImageAssetIds,
      ),
    [data.referenceVideoAssetIds, data.referenceImageAssetIds, edges, elements, id, nodes],
  );
  const effectivePrompt = inputs.prompt?.value ?? data.prompt.trim();
  const storyboardInputKey = useMemo(
    () =>
      hyperframesStoryboardInputKey({
        prompt: effectivePrompt,
        assets: inputs.assets,
        energy: data.energy,
        aspectRatio: data.aspectRatio,
        durationSeconds: data.durationSeconds,
      }),
    [data.aspectRatio, data.durationSeconds, data.energy, effectivePrompt, inputs.assets],
  );
  const planCurrent = data.storyboardInputKey === storyboardInputKey;
  const storyboard = planCurrent ? data.storyboard : undefined;
  const approved = Boolean(storyboard && data.storyboardApproved);
  const openEditor = useCallback(async () => {
    if (
      !runtime ||
      !data.generatedVideoAssetId ||
      typeof data.renderOutputAssetVersionId !== 'string' ||
      openingEditor
    )
      return;
    setOpeningEditor(true);
    try {
      const landscape = data.aspectRatio === '16:9';
      const square = data.aspectRatio === '1:1';
      const longEdge = data.resolution === '720p' ? 1280 : 1920;
      const shortEdge = data.resolution === '720p' ? 720 : 1080;
      const href = await sendHyperframesToEditor({
        brandId: runtime.brandProfileId,
        assetId: data.generatedVideoAssetId,
        versionId: data.renderOutputAssetVersionId,
        title: storyboard?.title ?? data.label ?? 'HyperFrames film',
        durationSeconds: data.durationSeconds,
        width: landscape ? longEdge : shortEdge,
        height: landscape ? shortEdge : square ? shortEdge : longEdge,
        storyboard,
      });
      router.push(href);
    } catch (error) {
      show({
        title: 'Could not open Video Editor',
        description: error instanceof Error ? error.message : 'The handoff failed.',
        variant: 'error',
      });
    } finally {
      setOpeningEditor(false);
    }
  }, [data, openingEditor, router, runtime, show, storyboard]);

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
      const note = sceneFeedback[sceneId]?.trim() || blocker?.message;
      if (!quality || !note) return;
      updateNodeData(id, {
        status: 'idle',
        revisionPrompt: note,
        revisionTarget: {
          revisionId: quality.revisionId,
          sceneId,
          criterionId: blocker?.criterionId ?? 'creator-feedback',
          blocker: note,
        },
      });
      triggerSave();
    },
    [id, quality, sceneFeedback, triggerSave, updateNodeData],
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

  const storyRequest = useCallback(() => {
    if (!runtime) throw new Error('Open this canvas in a brand workspace.');
    if (!effectivePrompt.trim()) throw new Error('Add a brief or connect a Text node.');
    if (inputs.issues[0]) throw new Error(inputs.issues[0].message);
    return {
      brandId: runtime.brandProfileId,
      prompt: effectivePrompt.trim(),
      assets: inputs.assets,
      energy: data.energy,
      aspectRatio: data.aspectRatio,
      durationSeconds: data.durationSeconds,
    };
  }, [data.aspectRatio, data.durationSeconds, data.energy, effectivePrompt, inputs, runtime]);

  const generateAngles = useCallback(async () => {
    setPlanning('angles');
    setPlanError(null);
    try {
      const result = await getHyperframesStoryAngles(storyRequest());
      updateNodeData(id, {
        storyAngles: result.angles,
        selectedStoryAngle: undefined,
        storyboard: undefined,
        storyboardApproved: false,
        storyboardInputKey,
      });
      triggerSave();
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Could not generate story angles.');
    } finally {
      setPlanning(null);
    }
  }, [id, storyboardInputKey, storyRequest, triggerSave, updateNodeData]);

  const selectAngle = useCallback(
    (angle: HyperframesStoryAngle) => {
      updateNodeData(id, {
        selectedStoryAngle: angle,
        storyboard: undefined,
        storyboardApproved: false,
      });
      triggerSave();
    },
    [id, triggerSave, updateNodeData],
  );

  const generateSheet = useCallback(async () => {
    if (!data.selectedStoryAngle) return;
    setPlanning('storyboard');
    setPlanError(null);
    try {
      const result = await getHyperframesStoryboard({
        ...storyRequest(),
        angle: data.selectedStoryAngle,
      });
      updateNodeData(id, {
        storyboard: result.storyboard,
        storyboardApproved: false,
        storyboardInputKey,
      });
      triggerSave();
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : 'Could not generate storyboard.');
    } finally {
      setPlanning(null);
    }
  }, [data.selectedStoryAngle, id, storyboardInputKey, storyRequest, triggerSave, updateNodeData]);

  const exportProject = useCallback(async () => {
    if (!data.activeRunId) return;
    setExporting(true);
    try {
      const zip = await buildHyperframesProjectZip(data.activeRunId, data.storyboard);
      downloadHyperframesProjectZip(zip);
    } catch (error) {
      show({
        title: 'Project export failed',
        description: error instanceof Error ? error.message : 'Could not export project.',
        variant: 'error',
      });
    } finally {
      setExporting(false);
    }
  }, [data.activeRunId, data.storyboard, show]);

  const createEmbed = useCallback(async () => {
    if (!runtime || !data.generatedVideoAssetId) return;
    setSharing(true);
    try {
      const link = await createShareLink({
        brandId: runtime.brandProfileId,
        scope: 'asset',
        assetId: data.generatedVideoAssetId,
        versionMode: 'live',
        allowComments: false,
        allowApproval: false,
        allowDownload: false,
        showMetadata: false,
        showCustomFields: false,
        requireIdentity: false,
      });
      const src = `${window.location.origin}/embed/${encodeURIComponent(link.token)}`;
      const frame = (url: string, title: string) =>
        `<iframe src="${url}" title="${title}" allow="fullscreen" allowfullscreen style="width:100%;aspect-ratio:${data.aspectRatio.replace(':', '/')};border:0"></iframe>`;
      const code = {
        video: frame(src, 'HyperFrames video'),
        interactive: frame(`${src}?mode=interactive`, 'Interactive HyperFrames composition'),
      };
      setEmbedCode(code);
      await navigator.clipboard.writeText(code.video).catch(() => undefined);
    } catch (error) {
      show({
        title: 'Embed link failed',
        description: error instanceof Error ? error.message : 'Could not create embed link.',
        variant: 'error',
      });
    } finally {
      setSharing(false);
    }
  }, [data.aspectRatio, data.generatedVideoAssetId, runtime, show]);

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
          {inputs.media
            .filter((item) => (item.kind === 'video' || item.kind === 'image') && item.assetId)
            .map((item) => (
              <label
                key={item.sourceNodeId}
                className="flex items-center gap-2 text-2xs text-muted-foreground"
              >
                <input
                  type="checkbox"
                  checked={item.purpose === 'reference'}
                  onChange={(event) => {
                    const key =
                      item.kind === 'image' ? 'referenceImageAssetIds' : 'referenceVideoAssetIds';
                    const next = new Set(data[key] ?? []);
                    if (event.target.checked && item.assetId) next.add(item.assetId);
                    else if (item.assetId) next.delete(item.assetId);
                    updateNodeData(id, { [key]: [...next] });
                    triggerSave();
                  }}
                />
                Use {item.label} as a {item.kind === 'image' ? 'visual' : 'motion'} reference only
              </label>
            ))}

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
                {[5, 10, 14, 15, 20, 30, 45, 60, 90].map((seconds) => (
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
            <label className="space-y-1 text-muted-foreground">
              <span>Frame rate</span>
              <select
                value={data.fps ?? 30}
                onChange={(event) =>
                  updateNodeData(id, { fps: Number(event.target.value) as 30 | 60 })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </label>
          </div>

          {!data.revisionTarget ? (
            <section
              className="space-y-2 rounded-lg border border-border/60 p-2 text-2xs"
              aria-label="Story planning"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Story direction</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-2xs"
                  onClick={() => void generateAngles()}
                  disabled={!runtime || Boolean(planning) || running}
                >
                  {planning === 'angles' ? 'Thinking…' : 'Generate 5 angles'}
                </Button>
              </div>
              {planCurrent &&
                data.storyAngles?.map((angle, index) => (
                  <button
                    type="button"
                    key={`${angle.title}-${index}`}
                    className={`w-full rounded-md border p-2 text-left ${data.selectedStoryAngle?.title === angle.title ? 'border-brand-primary bg-brand-primary/10' : 'border-border/60'}`}
                    onClick={() => selectAngle(angle)}
                    disabled={running}
                  >
                    <strong>
                      {index + 1}. {angle.title}
                    </strong>
                    <span className="block text-muted-foreground">{angle.premise}</span>
                    <span className="block">Viewer gets: {angle.viewerTakeaway}</span>
                  </button>
                ))}
              {planCurrent && data.selectedStoryAngle ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-2xs"
                  onClick={() => void generateSheet()}
                  disabled={Boolean(planning) || running}
                >
                  {planning === 'storyboard'
                    ? 'Building storyboard…'
                    : 'Build storyboard contact sheet'}
                </Button>
              ) : null}
              {storyboard ? (
                <div className="space-y-2">
                  <p className="font-medium">
                    {storyboard.title} · {storyboard.scenes.length} scenes
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {storyboard.scenes.map((scene, index) => {
                      const media = inputs.media.find((item) => item.assetId === scene.asset_id);
                      const source = media && nodes.find((node) => node.id === media.sourceNodeId);
                      const sourceData = source?.data as Record<string, unknown> | undefined;
                      const image = [
                        sourceData?.image,
                        sourceData?.previewUrl,
                        sourceData?.sourceUrl,
                      ].find(
                        (value) =>
                          typeof value === 'string' && /^(https?:|data:image\/)/.test(value),
                      ) as string | undefined;
                      return (
                        <div
                          key={scene.id}
                          className="overflow-hidden rounded-md border border-border/60"
                        >
                          <div
                            className="relative flex min-h-24 items-center justify-center bg-slate-950 p-3 text-center text-white"
                            style={{ aspectRatio: data.aspectRatio.replace(':', ' / ') }}
                          >
                            {image ? (
                              <img
                                src={image}
                                alt=""
                                className="absolute inset-0 size-full object-cover opacity-50"
                              />
                            ) : null}
                            <span className="relative font-semibold">{scene.on_screen}</span>
                          </div>
                          <div className="space-y-0.5 p-1.5 text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {index + 1}. {scene.start_seconds.toFixed(1)}–
                              {(scene.start_seconds + scene.duration_seconds).toFixed(1)}s ·{' '}
                              {scene.role}
                            </p>
                            <p>{scene.motion}</p>
                            {media ? <p>Media: {media.label}</p> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    variant={approved ? 'secondary' : 'default'}
                    onClick={() => {
                      updateNodeData(id, { storyboardApproved: true });
                      triggerSave();
                    }}
                    disabled={running}
                  >
                    {approved ? 'Storyboard approved' : 'Approve storyboard'}
                  </Button>
                </div>
              ) : null}
              {!planCurrent && data.storyboardInputKey ? (
                <p className="text-amber-600">
                  Inputs changed. Generate new angles before rendering.
                </p>
              ) : null}
              {planError ? (
                <p role="alert" className="text-destructive">
                  {planError}
                </p>
              ) : null}
            </section>
          ) : null}

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
                      <div className="flex shrink-0 flex-col gap-1">
                        <input
                          value={sceneFeedback[scene.id] ?? ''}
                          onChange={(event) =>
                            setSceneFeedback((current) => ({
                              ...current,
                              [scene.id]: event.target.value,
                            }))
                          }
                          placeholder="Scene feedback"
                          aria-label={`Feedback for ${scene.id}`}
                          className="h-6 w-28 rounded border bg-background px-1 text-2xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-2xs"
                          onClick={() => reviseScene(scene.id)}
                          disabled={!sceneFeedback[scene.id]?.trim() && !blocker}
                          aria-label={`Revise ${scene.role} scene`}
                        >
                          Revise scene
                        </Button>
                      </div>
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

          {data.sessionId && !data.revisionTarget ? (
            <textarea
              value={data.feedbackPrompt ?? ''}
              onChange={(event) => {
                updateNodeData(id, { feedbackPrompt: event.target.value });
                triggerSave();
              }}
              placeholder="Global feedback: slow every zoom to 0.7x, adjust pacing, change the closing line…"
              aria-label="Global video feedback"
              className="min-h-14 w-full resize-y rounded-md border bg-muted/20 p-2 text-xs"
            />
          ) : null}

          {data.activeRunId && (data.revisionId || revision) ? (
            <fieldset className="flex gap-1 text-2xs" aria-label="Preview mode">
              <Button
                size="sm"
                variant={previewMode === 'video' ? 'default' : 'outline'}
                onClick={() => setPreviewMode('video')}
              >
                MP4
              </Button>
              <Button
                size="sm"
                variant={previewMode === 'interactive' ? 'default' : 'outline'}
                onClick={() => setPreviewMode('interactive')}
              >
                Interactive composition
              </Button>
            </fieldset>
          ) : null}
          <div className="relative flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-black/90">
            <NodeDownloadButton
              nodeType="hyperframesAgent"
              data={data}
              baseName="hyperframes"
              label="Download rendered clip"
            />
            {previewMode === 'interactive' && data.activeRunId && (data.revisionId || revision) ? (
              <InteractiveHyperframesPreview key={data.activeRunId} runId={data.activeRunId} />
            ) : video ? (
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
            <Button
              onClick={() => void start()}
              disabled={!runtime || running || (!data.revisionTarget && !approved)}
              className="w-full"
            >
              <Play className="mr-2 h-3.5 w-3.5" />
              {data.revisionTarget
                ? 'Send scene revision'
                : data.sessionId
                  ? 'Send global revision'
                  : 'Animate approved storyboard'}
            </Button>
          )}
          {data.revisionId || revision ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void exportProject()}
              disabled={exporting}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {exporting ? 'Exporting project…' : 'Download editable project ZIP'}
            </Button>
          ) : null}
          {data.generatedVideoAssetId && typeof data.renderOutputAssetVersionId === 'string' ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void openEditor()}
              disabled={openingEditor}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              {openingEditor ? 'Opening Video Editor…' : 'Send to Video Editor'}
            </Button>
          ) : null}
          {data.generatedVideoAssetId ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void createEmbed()}
              disabled={sharing}
            >
              <Share2 className="mr-2 h-3.5 w-3.5" />
              {sharing ? 'Creating embeds…' : 'Create public embeds'}
            </Button>
          ) : null}
          {embedCode ? (
            <div className="space-y-1">
              <label className="block text-2xs">
                MP4 embed
                <textarea
                  readOnly
                  value={embedCode.video}
                  className="min-h-14 w-full rounded-md border bg-muted/20 p-2 text-2xs"
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <label className="block text-2xs">
                Interactive embed
                <textarea
                  readOnly
                  value={embedCode.interactive}
                  className="min-h-14 w-full rounded-md border bg-muted/20 p-2 text-2xs"
                  onFocus={(event) => event.target.select()}
                />
              </label>
            </div>
          ) : null}
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
