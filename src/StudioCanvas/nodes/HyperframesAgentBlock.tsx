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
  type MotionTarget,
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
  Download,
  ExternalLink,
  Film,
  Play,
  Share2,
  Sparkles,
} from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Node as CanvasNode, NodeContent } from '@/components/ai-elements/node';
import { appendDictation, DictationButton } from '@/components/dictation/DictationButton';
import { forgeDeepLinkHref } from '@/components/forge/forgeDeepLink';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { useElements } from '@/lib/ai-studio/elements';
import {
  getHyperframesStoryAngles,
  getHyperframesStoryboard,
} from '@/lib/api/hyperframesAgent.client';
import { formatDecimal } from '@/lib/format/decimal';
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
import { workflowNodeError } from '../utils/workflowUiFailure';
import { NodeBadge, NodeTitleBar } from './NodeChrome';
import { NodeDownloadButton } from './NodeDownloadButton';

const STATUS_KEYS = {
  queued: 'queued_661ff40a',
  drafting: 'statusDraftingComposition',
  reviewing: 'statusReviewingFrames',
  rendering: 'statusRenderingBrowser',
  completed: 'statusVideoReady',
  failed: 'runFailedFallback',
  cancelled: 'statusCancelled',
} as const;

// Mirrors the NodeResizer minimums below.
const HYPERFRAMES_NODE_BOUNDS = {
  minWidth: 360,
  minHeight: 360,
  fallbackWidth: 360,
};

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
  const decimalLocale = useUiLocale();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

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
  const [embedCode, setEmbedCode] = useState<{
    video: string;
    interactive: string;
  } | null>(null);
  const [previewMode, setPreviewMode] = useState<'video' | 'interactive'>('video');
  const [sceneFeedback, setSceneFeedback] = useState<Record<string, string>>({});
  const [motionTarget, setMotionTarget] = useState<MotionTarget | null>(null);
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
        title: storyboard?.title ?? data.label ?? translateUi('hyperframes_film_6314dff2'),
        durationSeconds: data.durationSeconds,
        width: landscape ? longEdge : shortEdge,
        height: landscape ? shortEdge : square ? shortEdge : longEdge,
        storyboard,
        // Only when the film is that revision's render: the editor edits motion through the link.
        ...(revision && revision.data.revisionId === data.revisionId
          ? {
              hyperframes: {
                revisionId: revision.data.revisionId,
                fingerprint: revision.data.fingerprint,
              },
            }
          : {}),
      });
      router.push(href);
    } catch (error) {
      show({
        title: translateUi('could_not_open_video_editor_2476a8a0'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setOpeningEditor(false);
    }
  }, [data, openingEditor, revision, router, runtime, show, storyboard, uiErrorText, translateUi]);

  // The film renders on the server; the run's events and the node's own status carry it.
  const failure = runError || workflowNodeError(data, translateUi);
  const runStatus = runRecord?.run.status;
  const running =
    !failure &&
    (starting || runStatus === 'queued' || runStatus === 'running' || Boolean(data.isExecuting));
  const displayedStatus = failure
    ? translateUi('runFailedFallback')
    : translateUi(
        data.status && data.status in STATUS_KEYS
          ? STATUS_KEYS[data.status as keyof typeof STATUS_KEYS]
          : 'ready_5fa7aac5',
      );
  const stages: Array<{ label: string; state: StageState }> = [
    {
      label: translateUi('inputs_7abc49df'),
      state: inputs.issues.length > 0 ? 'failed' : effectivePrompt ? 'done' : 'pending',
    },
    {
      label: translateUi('draft_ebf12ef4'),
      state: revision ? 'done' : failure ? 'failed' : running ? 'active' : 'pending',
    },
    {
      label: translateUi('review_aff0766a'),
      state: review ? 'done' : failure && revision ? 'failed' : revision ? 'active' : 'pending',
    },
    {
      label: translateUi('render_6d89eb7d'),
      state: video ? 'done' : failure && review ? 'failed' : renderRequested ? 'active' : 'pending',
    },
  ];

  // Box re-snaps to the composition the agent actually rendered. `data.aspectRatio`
  // is the request the next run sends and is left alone.
  useSnapToVideoAspect({
    nodeId: id,
    src: video,
    bounds: HYPERFRAMES_NODE_BOUNDS,
  });

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
        motionTarget: data.revisionTarget ? null : motionTarget,
      });
    } catch (error) {
      const message = uiErrorText(error);
      updateNodeData(id, {
        status: 'failed',
        isExecuting: false,
        error: message,
      });
      show({
        title: translateUi('hyperframes_agent_failed_to_start_83aa5258'),
        description: message,
        variant: 'error',
      });
    } finally {
      setStarting(false);
    }
  }, [
    data.revisionTarget,
    id,
    motionTarget,
    running,
    runtime,
    show,
    updateNodeData,
    uiErrorText,
    translateUi,
  ]);

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
      console.error('[HyperframesAgentBlock] Story angle generation failed', error);
      setPlanError(uiErrorText(error));
    } finally {
      setPlanning(null);
    }
  }, [id, storyboardInputKey, storyRequest, triggerSave, updateNodeData, uiErrorText]);

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
      console.error('[HyperframesAgentBlock] Storyboard generation failed', error);
      setPlanError(uiErrorText(error));
    } finally {
      setPlanning(null);
    }
  }, [
    data.selectedStoryAngle,
    id,
    storyboardInputKey,
    storyRequest,
    triggerSave,
    updateNodeData,
    uiErrorText,
  ]);

  const exportProject = useCallback(async () => {
    if (!data.activeRunId) return;
    setExporting(true);
    try {
      const zip = await buildHyperframesProjectZip(data.activeRunId, data.storyboard);
      downloadHyperframesProjectZip(zip);
    } catch (error) {
      show({
        title: translateUi('project_export_failed_6804e57a'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setExporting(false);
    }
  }, [data.activeRunId, data.storyboard, show, uiErrorText, translateUi]);

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
        title: translateUi('embed_link_failed_9d612131'),
        description: uiErrorText(error),
        variant: 'error',
      });
    } finally {
      setSharing(false);
    }
  }, [data.aspectRatio, data.generatedVideoAssetId, runtime, show, uiErrorText, translateUi]);

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      updateNodeData(id, { skillIds: toggleSkillId(data.skillIds, skillId) });
      triggerSave();
    },
    [data.skillIds, id, triggerSave, updateNodeData],
  );

  const handleToggleBrandPiece = useCallback(
    (kind: BrandBookPieceKind) => {
      updateNodeData(id, {
        brandBookPieces: toggleBrandPiece(data.brandBookPieces, kind),
      });
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
          label={translateUi('hyperframes_agent_792f74b0')}
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
            placeholder={translateUi('describe_the_video_motion_pacing_co_6043e725')}
            className="min-h-20 w-full resize-none rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs outline-none transition focus:border-brand-primary/60"
          />

          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className="font-semibold text-foreground">{translateUi('source_0e570ca6')}</span>
            <span className={inputs.issues.length ? 'text-destructive' : 'text-muted-foreground'}>
              {inputs.issues[0]?.message ??
                (inputs.media.length > 0
                  ? translateUi('value0_connected_media_value1_d01176b6', {
                      count: Number(inputs.media.length),
                    })
                  : effectivePrompt
                    ? inputs.prompt
                      ? translateUi('connected_text_node_7b023a90')
                      : translateUi('text_only_composition_d6f46a1d')
                    : translateUi('add_a_prompt_or_connect_text_3bc19423'))}
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
                />{' '}
                {translateUi('use_c36d819e')} {item.label} {translateUi('as_a_efc14e9d')}{' '}
                {item.kind === 'image'
                  ? translateUi('visual_a5961f3f')
                  : translateUi('motion_30523827')}{' '}
                {translateUi('reference_only_6f0c08f2')}{' '}
              </label>
            ))}

          <div className="grid grid-cols-2 gap-2 text-2xs">
            <label className="space-y-1 text-muted-foreground">
              <span>{translateUi('energy_f2fcd3f7')}</span>
              <select
                value={data.energy}
                onChange={(event) =>
                  updateNodeData(id, {
                    energy: event.target.value as HyperframesAgentNodeData['energy'],
                  })
                }
                className="w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="calm">{translateUi('calm_38f6b83e')}</option>
                <option value="balanced">{translateUi('balanced_5386ea5d')}</option>
                <option value="high-energy">{translateUi('high_energy_0cc1f098')}</option>
              </select>
            </label>
            <label className="space-y-1 text-muted-foreground">
              <span>{translateUi('format_2f343666')}</span>
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
              <span>{translateUi('length_adc95605')}</span>
              <select
                value={data.durationSeconds}
                onChange={(event) =>
                  updateNodeData(id, {
                    durationSeconds: Number(event.target.value),
                  })
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
              <span>{translateUi('resolution_d4055faf')}</span>
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
              <span>{translateUi('frame_rate_68e19e4c')}</span>
              <select
                value={data.fps ?? 30}
                onChange={(event) =>
                  updateNodeData(id, {
                    fps: Number(event.target.value) as 30 | 60,
                  })
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
              aria-label={translateUi('story_planning_69a4b339')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{translateUi('story_direction_70deffba')}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-2xs"
                  onClick={() => void generateAngles()}
                  disabled={!runtime || Boolean(planning) || running}
                >
                  {planning === 'angles'
                    ? translateUi('thinking_a02f1cea')
                    : translateUi('generate_5_angles_3cc8c585')}
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
                    <span className="block">
                      {translateUi('viewer_gets_8d9f9ab4')} {angle.viewerTakeaway}
                    </span>
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
                    ? translateUi('building_storyboard_bad2e335')
                    : translateUi('build_storyboard_contact_sheet_a73cfc72')}
                </Button>
              ) : null}
              {storyboard ? (
                <div className="space-y-2">
                  <p className="font-medium">
                    {storyboard.title} · {storyboard.scenes.length} {translateUi(
                      'scenes_6dd792f8',
                    )}{' '}
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
                            style={{
                              aspectRatio: data.aspectRatio.replace(':', ' / '),
                            }}
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
                              {index + 1}. {formatDecimal(scene.start_seconds, 1, decimalLocale)}–
                              {formatDecimal(
                                scene.start_seconds + scene.duration_seconds,
                                1,
                                decimalLocale,
                              )}
                              s · {scene.role}
                            </p>
                            <p>{scene.motion}</p>
                            {media ? (
                              <p>
                                {translateUi('media_f69bf966')} {media.label}
                              </p>
                            ) : null}
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
                    {approved
                      ? translateUi('storyboard_approved_5795aeb6')
                      : translateUi('approve_storyboard_b744e7c3')}
                  </Button>
                </div>
              ) : null}
              {!planCurrent && data.storyboardInputKey ? (
                <p className="text-amber-600">
                  {' '}
                  {translateUi('inputs_changed_generate_new_angles__7b668cdd')}{' '}
                </p>
              ) : null}
              {planError ? (
                <p role="alert" className="text-destructive">
                  {planError}
                </p>
              ) : null}
            </section>
          ) : null}

          <ol
            className="grid grid-cols-4 gap-1"
            aria-label={translateUi('production_progress_9d62dac4')}
          >
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
                <p className="font-medium text-foreground">
                  {translateUi('craft_57f64bf9')} {review.data.craftScore}/10
                </p>
              ) : null}
            </div>
          ) : null}

          {revision && runtime?.brandProfileId ? (
            <a
              href={forgeDeepLinkHref({
                templateAssetId: null,
                renderSetId: null,
                rowId: null,
                hyperframesRevisionId: revision.data.revisionId,
                brandId: runtime.brandProfileId,
              })}
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              data-testid="hyperframes-edit-in-forge"
            >
              {' '}
              {translateUi('edit_composition_in_forge_3da99313')}{' '}
            </a>
          ) : null}

          {quality ? (
            <details className="rounded-lg border border-border/60 bg-muted/20 p-2 text-2xs" open>
              <summary className="cursor-pointer font-semibold text-foreground">
                {' '}
                {translateUi('production_slate_0574176b')}{' '}
                {quality.gate === 'passed'
                  ? translateUi('passed_284d1e8c')
                  : translateUi('needs_revision_6bb3994a')}
                {quality.advisoryScore === null
                  ? ''
                  : translateUi('value0_10_advisory_6777c64e', {
                      value0: String(formatDecimal(quality.advisoryScore * 10, 1, decimalLocale)),
                    })}
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
                          {scene.role} · {formatDecimal(scene.start_seconds, 1, decimalLocale)}–
                          {formatDecimal(
                            scene.start_seconds + scene.duration_seconds,
                            1,
                            decimalLocale,
                          )}
                          s
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
                          placeholder={translateUi('scene_feedback_3cf34f89')}
                          aria-label={translateUi('feedback_for_value0_364808ad', {
                            value0: String(scene.id),
                          })}
                          className="h-6 w-28 rounded border bg-background px-1 text-2xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-2xs"
                          onClick={() => reviseScene(scene.id)}
                          disabled={!sceneFeedback[scene.id]?.trim() && !blocker}
                          aria-label={translateUi('revise_value0_scene_e4a8f243', {
                            value0: String(scene.role),
                          })}
                        >
                          {' '}
                          {translateUi('revise_scene_20faf316')}{' '}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-muted-foreground">
                  {' '}
                  {translateUi('creator_88447b83')} {quality.modelProvenance.draftModelId}
                  {quality.modelProvenance.repairModelIds.length
                    ? translateUi('repair_value0_92da5d02', {
                        value0: String(quality.modelProvenance.repairModelIds.join(', ')),
                      })
                    : ''}
                  {quality.modelProvenance.criticModelId
                    ? translateUi('critic_value0_advisory_d31cc419', {
                        value0: String(quality.modelProvenance.criticModelId),
                      })
                    : ''}
                </p>
              </div>
            </details>
          ) : null}

          {data.sessionId && !data.revisionTarget ? (
            <div className="relative">
              <textarea
                value={data.feedbackPrompt ?? ''}
                onChange={(event) => {
                  updateNodeData(id, { feedbackPrompt: event.target.value });
                  triggerSave();
                }}
                placeholder={
                  motionTarget
                    ? translateUi('speak_or_type_the_change_for_the_se_92cdf611')
                    : translateUi('global_feedback_slow_every_zoom_to__173b60b1')
                }
                aria-label={translateUi('global_video_feedback_918b06f1')}
                className="min-h-14 w-full resize-y rounded-md border bg-muted/20 p-2 pr-9 text-xs"
              />
              <DictationButton
                className="absolute right-1 top-1"
                disabled={running}
                onTranscript={(spoken) => {
                  const current = useStudioStore.getState().nodes.find((node) => node.id === id)
                    ?.data as HyperframesAgentNodeData | undefined;
                  updateNodeData(id, {
                    feedbackPrompt: appendDictation(current?.feedbackPrompt ?? '', spoken),
                  });
                  triggerSave();
                }}
              />
            </div>
          ) : null}

          {data.activeRunId && (data.revisionId || revision) ? (
            <fieldset
              className="flex gap-1 text-2xs"
              aria-label={translateUi('preview_mode_481bc90f')}
            >
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
                {' '}
                {translateUi('interactive_composition_37c6a428')}{' '}
              </Button>
            </fieldset>
          ) : null}
          <div className="relative flex min-h-28 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-black/90">
            <NodeDownloadButton
              nodeType="hyperframesAgent"
              data={data}
              baseName="hyperframes"
              label={translateUi('download_rendered_clip_68ba71ab')}
            />
            {previewMode === 'interactive' && data.activeRunId && (data.revisionId || revision) ? (
              <InteractiveHyperframesPreview
                key={data.activeRunId}
                runId={data.activeRunId}
                onMotionTargetChange={setMotionTarget}
              />
            ) : video ? (
              <NodeVideoPreview src={video} className="bg-transparent" />
            ) : running ? (
              <div className="flex w-3/4 flex-col items-center gap-3 text-center">
                <Film className="h-6 w-6 animate-pulse text-violet-400" />
                <Progress value={(data.progress ?? 0) * 100} className="h-1.5 w-full" />
                <span className="text-2xs text-muted-foreground">
                  {' '}
                  {translateUi('you_can_leave_ai_studio_the_film_re_5b911193')}{' '}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {' '}
                {translateUi('connect_media_add_a_prompt_then_run_eb64b265')}{' '}
              </span>
            )}
          </div>

          {failure ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{failure}</span>
            </div>
          ) : null}

          <Button
            onClick={() => void start()}
            disabled={!runtime || running || (!data.revisionTarget && !approved && !motionTarget)}
            className="w-full"
          >
            <Play className="mr-2 h-3.5 w-3.5" />
            {data.revisionTarget
              ? translateUi('send_scene_revision_cc0d5b29')
              : motionTarget
                ? translateUi('send_motion_revision_4b258c72')
                : data.sessionId
                  ? translateUi('send_global_revision_30848b02')
                  : translateUi('animate_approved_storyboard_9ffa3b68')}
          </Button>

          {data.revisionId || revision ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void exportProject()}
              disabled={exporting}
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              {exporting
                ? translateUi('exporting_project_bc51f607')
                : translateUi('download_editable_project_zip_e6f11f77')}
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
              {openingEditor
                ? translateUi('opening_video_editor_a5d5df33')
                : translateUi('send_to_video_editor_7231e444')}
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
              {sharing
                ? translateUi('creating_embeds_b9301ce6')
                : translateUi('create_public_embeds_5349d393')}
            </Button>
          ) : null}
          {embedCode ? (
            <div className="space-y-1">
              <label className="block text-2xs">
                {' '}
                {translateUi('mp4_embed_309cc07a')}{' '}
                <textarea
                  readOnly
                  value={embedCode.video}
                  className="min-h-14 w-full rounded-md border bg-muted/20 p-2 text-2xs"
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <label className="block text-2xs">
                {' '}
                {translateUi('interactive_embed_dfcf87fb')}{' '}
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
