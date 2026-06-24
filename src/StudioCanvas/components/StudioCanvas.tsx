import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection as ReactFlowConnection,
  type Edge,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { AtSign, FolderOpen, Plus, ScanLine, Sparkles, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { Panel } from '@/components/ai-elements/panel';
import { Connection as ConnectionLine } from '@/components/ai-elements/connection';
import { Edge as AiElementsEdge } from '@/components/ai-elements/edge';

import { useStudioStore } from '../stores/useStudioStore';
import { NoteNode } from '../nodes/NoteNode';
import { StringNode } from '../nodes/StringNode';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { ImageNode } from '../nodes/ImageNode';
import { AudioNode } from '../nodes/AudioNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import { VideoDecoderBlock } from '../nodes/VideoDecoderBlock';
import { VideoEditorBlock } from '../nodes/VideoEditorBlock';
import { TimelineEditorBlock } from '../nodes/TimelineEditorBlock';
import { Toolbar } from './Toolbar';
import { InteractionModeToggle } from './InteractionModeToggle';
import { SaveWorkflowDialog } from './SaveWorkflowDialog';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { CreateSkillFromSelectionDialog } from './CreateSkillFromSelectionDialog';
import { InstagramMediaBrowser } from './InstagramMediaBrowser';
import { layoutInRow } from '../utils/layoutImportedNodes';
import { buildReferenceNodes } from '../utils/buildReferenceNodes';
import { inlineReferenceImageNodes } from '../utils/inlineReferenceImageNodes';
import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import type { UnfurlMediaItem } from '@continuum/contracts';
import { WorkflowLibrary } from '@/components/ai-studio/WorkflowLibrary';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { useToast } from '@/components/ui/ToastProvider';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { isValidConnection } from '../utils/isValidConnection';
import { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { Cursor } from '@/components/realtime/cursor';
import { CanvasSyncStatus } from '@/components/ai-studio/CanvasSyncStatus';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { AIStudioChat } from '@/components/ai-studio/chat/AIStudioChat';
import { CanvasRoomsTabs } from '@/components/ai-studio/CanvasRoomsTabs';
import { useCanvasRooms } from '@/components/ai-studio/hooks/useCanvasRooms';
import { CanvasMediaLoader } from '@/components/ai-studio/CanvasMediaLoader';
import { StudioNode } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_MODELS,
  getVideoGeneratorReferenceMode,
  type VideoGeneratorModel,
} from '../utils/videoModel';
import {
  buildPendingApplyStorageKey,
  plannerAiStudioApplyResponseSchema,
  resolveWorkflowConceptSpec,
  type PlannerAiStudioApplyRequest,
  type PlannerAiStudioHandoff,
  type WorkflowConceptSpec,
} from '@/lib/organic/ai-studio-bridge';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

type StudioCanvasNodeType =
  | 'nanoGen'
  | 'videoGen'
  | 'veoDirector'
  | 'veoFast'
  | 'extendVideo'
  | 'videoEditor'
  | 'timelineEditor'
  | 'string'
  | 'note'
  | 'image'
  | 'audio'
  | 'document'
  | 'video'
  | 'videoDecode';

type LibraryItem = {
  type: StudioCanvasNodeType;
  label: string;
  desc: string;
  tag: string;
  modelOptions?: readonly VideoGeneratorModel[];
  disabled?: boolean;
};

type LibrarySection = {
  value: string;
  label: string;
  items: LibraryItem[];
};

const LIBRARY_SECTIONS: LibrarySection[] = [
  {
    value: 'image',
    label: 'Image',
    items: [
      {
        type: 'nanoGen',
        label: 'Image Generation',
        desc: 'Canvas and generator output',
        tag: 'Creative',
      },
      {
        type: 'image',
        label: 'Image Reference',
        desc: 'Image file input',
        tag: 'Utility',
      },
    ],
  },
  {
    value: 'video',
    label: 'Video',
    items: [
      {
        type: 'videoGen',
        label: 'Video Generation',
        desc: 'Generate clips with selectable models',
        tag: 'Creative',
        modelOptions: VIDEO_GENERATOR_MODELS,
      },
      {
        type: 'extendVideo',
        label: 'Extend Video',
        desc: 'Continue existing footage',
        tag: 'Creative',
      },
      {
        type: 'videoEditor',
        label: 'Video Splicer',
        desc: 'Concatenate clips in-browser',
        tag: 'Editing',
      },
      {
        type: 'timelineEditor',
        label: 'Video Editor',
        desc: 'Trim & sequence clips + stills — manual break-point',
        tag: 'Editing',
      },
      {
        type: 'video',
        label: 'Video Reference',
        desc: 'Video file input',
        tag: 'Utility',
      },
      {
        type: 'videoDecode',
        label: 'Video Decoder',
        desc: 'Frame-by-frame creative breakdown',
        tag: 'Intelligence',
      },
    ],
  },
  {
    value: 'utility',
    label: 'Utility',
    items: [
      {
        type: 'audio',
        label: 'Audio Reference',
        desc: 'Voice or sound input',
        tag: 'Utility',
      },
      {
        type: 'document',
        label: 'Document Context',
        desc: 'PDF and text knowledge',
        tag: 'Utility',
      },
      {
        type: 'string',
        label: 'Text Block',
        desc: 'Prompt and enrichment input',
        tag: 'Intelligence',
      },
      {
        type: 'note',
        label: 'Note / Annotation',
        desc: 'Free-text canvas note with bold (⌘B)',
        tag: 'Utility',
      },
    ],
  },
];

const NODE_TYPES = new Set<StudioCanvasNodeType>([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'videoEditor',
  'timelineEditor',
  'string',
  'note',
  'image',
  'audio',
  'document',
  'video',
  'videoDecode',
]);

const isStudioCanvasNodeType = (value: string): value is StudioCanvasNodeType =>
  NODE_TYPES.has(value as StudioCanvasNodeType);

const createNodeConfig = (
  type: StudioCanvasNodeType,
  options?: { model?: VideoGeneratorModel }
): { data: Record<string, unknown>; style?: Record<string, number> } => {
  if (type === 'nanoGen') {
    return {
      data: { model: 'nano-banana-2', imageSize: '512px', positivePrompt: '', aspectRatio: '16:9' },
      style: { width: 400, height: 225 },
    };
  }

  if (type === 'videoGen' || type === 'veoDirector' || type === 'veoFast') {
    const model =
      options?.model ??
      (type === 'veoDirector' ? 'veo-3.1' : type === 'veoFast' ? 'veo-3.1-fast' : DEFAULT_VIDEO_GENERATOR_MODEL);
    const referenceMode = getVideoGeneratorReferenceMode(model);
    return {
      data: { model, prompt: '', negativePrompt: '', enhancePrompt: false, referenceMode },
      style: { width: 512, height: 288 },
    };
  }

  if (type === 'extendVideo') {
    return {
      data: { prompt: '' },
      style: { width: 360, height: 200 },
    };
  }

  if (type === 'videoEditor') {
    return {
      data: {
        clipSlots: [
          { id: crypto.randomUUID?.() ?? `slot-${Date.now()}-1`, order: 0 },
          { id: crypto.randomUUID?.() ?? `slot-${Date.now()}-2`, order: 1 },
        ],
        outputFormat: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
      },
      style: { width: 380, height: 460 },
    };
  }

  if (type === 'timelineEditor') {
    return {
      data: {
        items: [
          { id: crypto.randomUUID?.() ?? `item-${Date.now()}-1`, order: 0 },
          { id: crypto.randomUUID?.() ?? `item-${Date.now()}-2`, order: 1 },
        ],
        outputFormat: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        committed: false,
      },
      style: { width: 440, height: 520 },
    };
  }

  if (type === 'string') {
    return { data: { value: '' } };
  }

  if (type === 'note') {
    return {
      data: { content: '' },
      style: { width: 260, height: 160 },
    };
  }

  if (type === 'videoDecode') {
    return { data: { value: '' }, style: { width: 360, height: 320 } };
  }

  if (type === 'image') {
    return {
      data: { image: undefined, aspectRatio: '1:1' },
      style: { width: 192, height: 192 },
    };
  }

  if (type === 'audio') {
    return {
      data: { audio: undefined },
      style: { width: 192, height: 100 },
    };
  }

  if (type === 'document') {
    return {
      data: { documents: [] },
      style: { width: 200, height: 200 },
    };
  }

  return {
    data: { video: undefined },
    style: { width: 192, height: 192 },
  };
};

const nodeTypes = {
  nanoGen: ImageGenBlock,
  videoGen: VideoGenBlock,
  veoDirector: VideoGenBlock,
  veoFast: VideoGenBlock,
  extendVideo: ExtendVideoBlock,
  videoEditor: VideoEditorBlock,
  timelineEditor: TimelineEditorBlock,
  string: StringNode,
  note: NoteNode,
  image: ImageNode,
  audio: AudioNode,
  document: DocumentNode,
  video: VideoReferenceNode,
  videoDecode: VideoDecoderBlock,
};

const edgeTypes = {
  button: AiElementsEdge.DataType,
  dataType: AiElementsEdge.DataType,
};

type SeedNodeBuild = {
  nodes: StudioNode[];
  edges: Edge[];
};

type ApplyAssetCandidate = {
  nodeId: string;
  role: string;
  kind: "image" | "video";
  source: string;
};

function resolveSeedMediaDataUrl(seed: PlannerAiStudioHandoff): string | null {
  const assetUrl =
    typeof seed.mediaSuggestion?.assetUrl === "string"
      ? seed.mediaSuggestion.assetUrl.trim()
      : "";
  if (assetUrl.length > 0) return assetUrl;

  const assetBase64 =
    typeof seed.mediaSuggestion?.assetBase64 === "string"
      ? seed.mediaSuggestion.assetBase64.trim()
      : "";
  if (!assetBase64) return null;

  return assetBase64.startsWith("data:image/")
    ? assetBase64
    : `data:image/png;base64,${assetBase64}`;
}

// Builds the data for a planner/Library seed image reference node. When the seed
// is a remote URL (a short-TTL signed URL), it is carried as `sourceUrl` so the
// node can be inlined to base64 (inlineReferenceImageNodes) and re-hydrated after a
// save strips the inline data. Without this a Library-sourced seed is dropped at
// generation, while an upload (inline base64) is not.
function buildSeedImageNodeData(seedImage: string): Record<string, unknown> {
  const isRemoteUrl = /^https?:\/\//i.test(seedImage.trim());
  return {
    image: seedImage,
    fileName: "planner-seed-image.png",
    ...(isRemoteUrl ? { sourceUrl: seedImage.trim() } : {}),
  };
}

function buildSeedPrompt(seed: PlannerAiStudioHandoff): string {
  const workflowSpec = resolveWorkflowConceptSpec({
    platform: seed.platform,
    postType: seed.postType,
    workflowConcept: seed.workflowConcept,
  });
  const promptSections = [
    seed.title ? `Title: ${seed.title}` : "",
    seed.summary ? `Summary: ${seed.summary}` : "",
    seed.captionPreview ? `Draft caption:\n${seed.captionPreview}` : "",
    seed.creativeDirectionPrompt
      ? `Creative direction:\n${seed.creativeDirectionPrompt}`
      : "",
    seed.thumbnailPrompt ? `Thumbnail direction:\n${seed.thumbnailPrompt}` : "",
  ].filter(Boolean);

  if (workflowSpec.outputKind === "video") {
    promptSections.push("Goal: Generate a short-form social reel concept with clear motion direction.");
  } else if (workflowSpec.outputMode === "ordered") {
    promptSections.push("Goal: Generate distinct but coherent slide visuals for the full carousel.");
  } else {
    promptSections.push("Goal: Generate a clean social thumbnail concept with clear hierarchy and one focal subject.");
  }

  return promptSections.join("\n\n");
}

function sortNodesByCanvasPosition(nodes: StudioNode[]): StudioNode[] {
  return [...nodes].sort((left, right) => {
    const xDiff = (left.position?.x ?? 0) - (right.position?.x ?? 0);
    if (Math.abs(xDiff) > 16) return xDiff;
    return (left.position?.y ?? 0) - (right.position?.y ?? 0);
  });
}

function collectApplyAssetCandidates(nodes: StudioNode[]): ApplyAssetCandidate[] {
  const sorted = sortNodesByCanvasPosition(nodes);
  const imageCandidates: ApplyAssetCandidate[] = [];
  const videoCandidates: ApplyAssetCandidate[] = [];

  sorted.forEach((node) => {
    if (node.type === "nanoGen") {
      const nodeData = node.data as { generatedImage?: unknown; generatedImageUrl?: unknown };
      const generatedImage =
        typeof nodeData.generatedImage === "string"
          ? (nodeData.generatedImage ?? "").trim()
          : "";
      const generatedImageUrl =
        typeof nodeData.generatedImageUrl === "string"
          ? (nodeData.generatedImageUrl ?? "").trim()
          : "";
      const source = generatedImage || generatedImageUrl;
      if (!source) return;
      imageCandidates.push({
        nodeId: node.id,
        role: `image_${imageCandidates.length + 1}`,
        kind: "image",
        source,
      });
      return;
    }

    if (node.type === "videoGen" || node.type === "extendVideo") {
      const nodeData = node.data as { generatedVideo?: unknown; generatedVideoUrl?: unknown };
      const generatedVideo =
        typeof nodeData.generatedVideo === "string"
          ? (nodeData.generatedVideo ?? "").trim()
          : "";
      const generatedVideoUrl =
        typeof nodeData.generatedVideoUrl === "string"
          ? (nodeData.generatedVideoUrl ?? "").trim()
          : "";
      const source = generatedVideo || generatedVideoUrl;
      if (!source) return;
      videoCandidates.push({
        nodeId: node.id,
        role: `video_${videoCandidates.length + 1}`,
        kind: "video",
        source,
      });
    }
  });

  return [...imageCandidates, ...videoCandidates];
}

function buildStarterFlow(seed: PlannerAiStudioHandoff): SeedNodeBuild {
  const workflowSpec = resolveWorkflowConceptSpec({
    platform: seed.platform,
    postType: seed.postType,
    workflowConcept: seed.workflowConcept,
  });
  const promptValue = buildSeedPrompt(seed);
  const seedImage = resolveSeedMediaDataUrl(seed);
  const textNodeId = `organic-seed-text-${seed.draftId}`;
  const textNode: StudioNode = {
    id: textNodeId,
    type: "string",
    position: { x: 120, y: 160 },
    data: { value: promptValue },
    style: { width: 420, height: 240 },
  } as StudioNode;

  if (workflowSpec.outputKind === "video") {
    const videoNodeId = `organic-seed-reel-${seed.draftId}`;
    const nodes: StudioNode[] = [
      textNode,
      {
        id: videoNodeId,
        type: "videoGen",
        position: { x: 620, y: 160 },
        data: {
          model: workflowSpec.defaultModel,
          prompt: "",
          negativePrompt: "",
          enhancePrompt: false,
          referenceMode: "frames",
        },
        style: { width: 512, height: 288 },
      } as StudioNode,
    ];

    const edges: Edge[] = [
      {
        id: `e-${textNodeId}-${videoNodeId}-prompt`,
        source: textNodeId,
        sourceHandle: "text",
        target: videoNodeId,
        targetHandle: "prompt-in",
        type: "dataType",
        data: { dataType: "text", pathType: "bezier" },
      },
    ];

    if (seedImage) {
      const imageRefId = `organic-seed-image-ref-${seed.draftId}`;
      nodes.push({
        id: imageRefId,
        type: "image",
        position: { x: 620, y: 500 },
        data: buildSeedImageNodeData(seedImage),
        style: { width: 196, height: 196 },
      } as StudioNode);
      edges.push({
        id: `e-${imageRefId}-${videoNodeId}-first`,
        source: imageRefId,
        sourceHandle: "image",
        target: videoNodeId,
        targetHandle: "first-frame",
        type: "dataType",
        data: { dataType: "image", pathType: "bezier" },
      });
    }

    return { nodes, edges };
  }

  if (workflowSpec.outputMode === "ordered") {
    const count = Math.max(1, Math.min(seed.authoritativeCount ?? 1, 10));
    const nodes: StudioNode[] = [textNode];
    const edges: Edge[] = [];
    let seedNodeId: string | null = null;

    if (seedImage) {
      seedNodeId = `organic-seed-image-ref-${seed.draftId}`;
      nodes.push({
        id: seedNodeId,
        type: "image",
        position: { x: 120, y: 470 },
        data: buildSeedImageNodeData(seedImage),
        style: { width: 180, height: 180 },
      } as StudioNode);
    }

    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const nodeId = `organic-seed-carousel-${seed.draftId}-${index + 1}`;
      nodes.push({
        id: nodeId,
        type: "nanoGen",
        position: { x: 620 + col * 380, y: 140 + row * 360 },
        data: {
          model: workflowSpec.defaultModel,
          positivePrompt: "",
          aspectRatio: "1:1",
          imageSize: "512px",
          maxReferenceImages: workflowSpec.maxReferenceImages,
        },
        style: { width: 340, height: 340 },
      } as StudioNode);

      edges.push({
        id: `e-${textNodeId}-${nodeId}-prompt`,
        source: textNodeId,
        sourceHandle: "text",
        target: nodeId,
        targetHandle: "prompt",
        type: "dataType",
        data: { dataType: "text", pathType: "bezier" },
      });

      if (seedNodeId) {
        edges.push({
          id: `e-${seedNodeId}-${nodeId}-ref`,
          source: seedNodeId,
          sourceHandle: "image",
          target: nodeId,
          targetHandle: "ref-image",
          type: "dataType",
          data: { dataType: "image", pathType: "bezier" },
        });
      }
    }

    return { nodes, edges };
  }

  const imageGenNodeId = `organic-seed-image-${seed.draftId}`;
  const nodes: StudioNode[] = [
    textNode,
    {
      id: imageGenNodeId,
      type: "nanoGen",
      position: { x: 620, y: 190 },
      data: {
        model: workflowSpec.defaultModel,
        positivePrompt: "",
        aspectRatio: "1:1",
        imageSize: "1K",
        maxReferenceImages: workflowSpec.maxReferenceImages,
      },
      style: { width: 420, height: 420 },
    } as StudioNode,
  ];
  const edges: Edge[] = [
    {
      id: `e-${textNodeId}-${imageGenNodeId}-prompt`,
      source: textNodeId,
      sourceHandle: "text",
      target: imageGenNodeId,
      targetHandle: "prompt",
      type: "dataType",
      data: { dataType: "text", pathType: "bezier" },
    },
  ];

  if (seedImage) {
    const imageRefId = `organic-seed-image-ref-${seed.draftId}`;
    nodes.push({
      id: imageRefId,
      type: "image",
      position: { x: 620, y: 650 },
      data: { image: seedImage, fileName: "planner-seed-image.png" },
      style: { width: 196, height: 196 },
    } as StudioNode);
    edges.push({
      id: `e-${imageRefId}-${imageGenNodeId}-ref`,
      source: imageRefId,
      sourceHandle: "image",
      target: imageGenNodeId,
      targetHandle: "ref-image",
      type: "dataType",
      data: { dataType: "image", pathType: "bezier" },
    });
  }

  return { nodes, edges };
}

function Flow({
  brandProfileId,
  realtime,
  activeRoomId,
  organicPlannerSeed,
}: {
  brandProfileId?: string;
  realtime: ReturnType<typeof useCanvasRealtime>;
  activeRoomId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
}) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    takeSnapshot,
    undo,
    redo,
    interactionMode,
    setInteractionMode,
    triggerSave,
    setBrandId,
    updateNodeData,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
  } = useStudioStore();

  const { remoteCursors, updateCursor, isLoading } = realtime;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePositionRef = useRef({ x: 240, y: 180 });
  const contextMenuAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const { screenToFlowPosition, deleteElements, fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    if (brandProfileId) {
      setBrandId(brandProfileId);
    }
  }, [brandProfileId, setBrandId]);

  // When the walkthrough seeds starter nodes, frame them so the tour's node
  // steps always have an on-screen target. Runs once per Flow instance.
  const hasFitTourSeedRef = useRef(false);
  useEffect(() => {
    if (hasFitTourSeedRef.current) return;
    if (!nodes.some((node) => node.data?.isTourSeed === true)) return;
    hasFitTourSeedRef.current = true;
    const handle = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 0 });
    });
    return () => cancelAnimationFrame(handle);
  }, [nodes, fitView]);

  const { onConnectStart, onConnectEnd } = useEdgeDropNode();
  const { show } = useToast();
  const [isLoadWorkflowOpen, setIsLoadWorkflowOpen] = useState(false);
  const [isInstagramBrowserOpen, setIsInstagramBrowserOpen] = useState(false);
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [skillSelectionNodes, setSkillSelectionNodes] = useState<StudioNode[]>([]);
  const hydratedPlannerSeedRef = useRef<string | null>(null);

  const openCreateSkillFromSelection = useCallback(() => {
    setSkillSelectionNodes(nodes.filter((node) => node.selected));
    setIsCreateSkillOpen(true);
  }, [nodes]);

  // Places unfurled media as unattached reference nodes, laid out in a centered
  // row at the viewport center. Nodes have no edges, so they are inert references
  // until the user wires them into a generator.
  const placeImportedReferenceNodes = useCallback(
    (items: UnfurlMediaItem[]) => {
      if (items.length === 0) return;
      takeSnapshot();
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
      const center = screenToFlowPosition({ x: viewportWidth / 2, y: viewportHeight / 2 });
      const positions = layoutInRow(items.length, center);
      const built = buildReferenceNodes(items, positions, () => uuidv4());
      const newNodes = built.map(
        (node) =>
          ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data as StudioNode['data'],
            style: node.style,
          }) as StudioNode,
      );
      setNodes(nodes.concat(newNodes));
      triggerSave();

      // Remote-URL image references (e.g. Instagram CDN) are invisible to the
      // generation model until inlined to base64. Convert via the server-side
      // proxy in the background, surfacing processing/ready status on each node.
      void inlineReferenceImageNodes(built, {
        inline: inlineRemoteImage,
        updateNodeData,
      });
    },
    [nodes, screenToFlowPosition, setNodes, takeSnapshot, triggerSave, updateNodeData],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
      if (!reactFlowWrapper.current) return;
      const { x, y } = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      updateCursor(x, y);
    },
    [screenToFlowPosition, updateCursor],
  );

  const addNodeAtPointer = useCallback(
    (type: StudioCanvasNodeType, options?: { model?: VideoGeneratorModel }) => {
      takeSnapshot();
      const anchorPosition = contextMenuAnchorRef.current ?? lastMousePositionRef.current;
      const position = screenToFlowPosition(anchorPosition);
        const canonicalType: StudioCanvasNodeType =
          type === 'veoDirector' || type === 'veoFast' ? 'videoGen' : type;
      const { data, style } = createNodeConfig(canonicalType, options);

      const newNode: StudioNode = {
        id: uuidv4(),
        type: canonicalType,
        position,
        data: data as StudioNode['data'],
        style,
      } as StudioNode;

      setNodes(nodes.concat(newNode));
      triggerSave();
    },
    [nodes, screenToFlowPosition, setNodes, takeSnapshot, triggerSave],
  );

  const handleCanvasContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    contextMenuAnchorRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (!open) {
      contextMenuAnchorRef.current = null;
    }
  }, []);

  const clearCanvas = useCallback(() => {
    takeSnapshot();
    setNodes([]);
    setEdges([]);
    triggerSave();
  }, [setEdges, setNodes, takeSnapshot, triggerSave]);

  useEffect(() => {
    if (isLoading) return;
    if (!organicPlannerSeed) return;
    if (nodes.length > 0 || edges.length > 0) return;

    const roomScope = activeRoomId ?? 'default-room';
    const hydrationKey = `${roomScope}:${organicPlannerSeed.draftId}`;
    if (hydratedPlannerSeedRef.current === hydrationKey) return;
    const starter = buildStarterFlow(organicPlannerSeed);

    takeSnapshot();
    setNodes(starter.nodes);
    setEdges(starter.edges);
    triggerSave();
    hydratedPlannerSeedRef.current = hydrationKey;

    // Load the Library/planner seed image into the node as inline base64 (like an
    // upload), so it reaches the generation model and survives a save+reload via
    // re-hydration. Mirrors the unfurl drop path; runs in the background with a
    // per-node processing/ready status.
    void inlineReferenceImageNodes(starter.nodes, {
      inline: inlineRemoteImage,
      updateNodeData,
    });
  }, [
    activeRoomId,
    edges.length,
    isLoading,
    nodes.length,
    organicPlannerSeed,
    setEdges,
    setNodes,
    takeSnapshot,
    triggerSave,
    updateNodeData,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'y') {
        redo();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
        copySelectedNodes();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'x') {
        cutSelectedNodes();
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
        pasteNodes();
        event.preventDefault();
        return;
      }

      if (event.key.toLowerCase() === 'h') {
        setInteractionMode('pan');
        return;
      }

      if (event.key.toLowerCase() === 'v') {
        setInteractionMode('select');
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          takeSnapshot();
          deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelectedNodes, cutSelectedNodes, deleteElements, edges, nodes, pasteNodes, redo, setInteractionMode, takeSnapshot, undo]);

  const readyNodeIds = useMemo(() => {
    const isGeneratorReady = (node: StudioNode) => {
      if (node.type === 'nanoGen') {
        const hasPromptEdge = edges.some((edge) => edge.target === node.id && edge.targetHandle === 'prompt');
        const promptValue =
          typeof (node.data as { positivePrompt?: string }).positivePrompt === 'string'
            ? (node.data as { positivePrompt?: string }).positivePrompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      if (node.type === 'videoGen' || node.type === 'veoDirector' || node.type === 'veoFast') {
        const hasPromptEdge = edges.some((edge) => edge.target === node.id && edge.targetHandle === 'prompt-in');
        const promptValue =
          typeof (node.data as { prompt?: string }).prompt === 'string'
            ? (node.data as { prompt?: string }).prompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      return false;
    };

    return new Set(nodes.filter(isGeneratorReady).map((node) => node.id));
  }, [edges, nodes]);

  const styledEdges = useMemo(() => {
    const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));

    const resolveDataType = (edge: Edge) => {
      const dataType = (edge.data as { dataType?: string } | undefined)?.dataType;
      if (dataType === 'image' || dataType === 'video' || dataType === 'audio' || dataType === 'document' || dataType === 'text') {
        return dataType;
      }
      if (edge.sourceHandle === 'image') return 'image';
      if (edge.sourceHandle === 'video') return 'video';
      if (edge.sourceHandle === 'audio') return 'audio';
      if (edge.sourceHandle === 'document') return 'document';
      return 'text';
    };

    const resolvePathType = (edge: Edge) => {
      const dataPathType = (edge.data as { pathType?: string } | undefined)?.pathType;
      if (dataPathType === 'bezier' || dataPathType === 'straight' || dataPathType === 'step' || dataPathType === 'smoothstep') {
        return dataPathType;
      }
      if (edge.type === 'bezier' || edge.type === 'straight' || edge.type === 'step' || edge.type === 'smoothstep') {
        return edge.type;
      }
      return 'bezier';
    };

    return edges.map((edge) => {
      const dataType = resolveDataType(edge);
      const targetType = nodeTypeById.get(edge.target);
      const isTargetGenerator =
        targetType === 'nanoGen' ||
        targetType === 'videoGen' ||
        targetType === 'veoDirector' ||
        targetType === 'veoFast';
      const isActive = isTargetGenerator && readyNodeIds.has(edge.target);
      const isDotted = isTargetGenerator && !readyNodeIds.has(edge.target);
      const pathType = resolvePathType(edge);
      const className = [edge.className, 'studio-edge', isActive ? 'studio-edge--active' : '', isDotted ? 'studio-edge--inactive' : '']
        .filter(Boolean)
        .join(' ');

      return {
        ...edge,
        type: 'dataType',
        animated: false,
        className,
        style: {
          ...edge.style,
          ['--edge-color' as keyof React.CSSProperties]: `var(--edge-${dataType})`,
        },
        data: {
          ...(edge.data as Record<string, unknown> | undefined),
          dataType,
          isActive,
          isDotted,
          pathType,
        },
      };
    });
  }, [edges, nodes, readyNodeIds]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onNodeDragStop = useCallback(() => {
    triggerSave();
  }, [triggerSave]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      takeSnapshot();

      const droppedType = event.dataTransfer.getData('application/reactflow');
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (isStudioCanvasNodeType(droppedType)) {
        const canonicalType: StudioCanvasNodeType =
          droppedType === 'veoDirector' || droppedType === 'veoFast' ? 'videoGen' : droppedType;
        const { data, style } = createNodeConfig(canonicalType);
        const newNode: StudioNode = {
          id: uuidv4(),
          type: canonicalType,
          position,
          data: data as StudioNode['data'],
          style,
        } as StudioNode;

        setNodes(nodes.concat(newNode));
        triggerSave();
        return;
      }

      const rawPayload =
        event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        event.dataTransfer.getData(RF_DRAG_MIME) ||
        event.dataTransfer.getData(TEXT_MIME);

      if (!rawPayload) {
        return;
      }

      const resolved = await resolveCreativeAssetDrop(rawPayload, resolveDroppedBase64);
      if (resolved.status === 'error') {
        show({
          title: resolved.title,
          description: resolved.description,
          variant: resolved.variant ?? 'error',
        });
        return;
      }

      const assetNodeType = resolved.nodeType;
      let assetData = {};
      let style = { width: 192, height: 192 };

      if (assetNodeType === 'image') {
        assetData = {
          image: resolved.dataUrl,
          fileName: resolved.fileName,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'video') {
        assetData = {
          video: resolved.dataUrl,
          fileName: resolved.fileName,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'audio') {
        assetData = { audio: resolved.dataUrl, fileName: resolved.fileName };
        style = { width: 192, height: 100 };
      } else if (assetNodeType === 'document') {
        assetData = {
          documents: [
            {
              name: resolved.fileName || 'Document',
              content: resolved.dataUrl,
              type: resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt',
            },
          ],
        };
        style = { width: 200, height: 200 };
      }

      const newNode: StudioNode = {
        id: uuidv4(),
        type: assetNodeType,
        position,
        data: assetData as StudioNode['data'],
        style,
      } as StudioNode;

      setNodes(nodes.concat(newNode));
      triggerSave();
    },
    [nodes, screenToFlowPosition, setNodes, show, takeSnapshot, triggerSave],
  );

  const isValidConnectionCallback = useCallback(
    (connection: ReactFlowConnection | Edge) => {
      return isValidConnection(connection, edges, nodes);
    },
    [edges, nodes],
  );

  if (isLoading) {
    return <CanvasMediaLoader />;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: canvas wrapper tracks cursor position for real-time collaboration; no semantic role applies
    <div
      className="h-full min-h-0 w-full"
      ref={reactFlowWrapper}
      onMouseMove={handleMouseMove}
    >
      <ContextMenu onOpenChange={handleContextMenuOpenChange}>
        <ContextMenuTrigger className="block h-full w-full">
          <Canvas
            nodes={nodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnectionCallback}
            connectionLineComponent={ConnectionLine}
            panOnDrag={interactionMode === 'pan'}
            panOnScroll
            selectionOnDrag={interactionMode === 'select'}
            selectionMode={SelectionMode.Partial}
            className="studio-canvas"
            onPaneContextMenu={handleCanvasContextMenu}
            defaultEdgeOptions={{
              type: 'dataType',
              animated: false,
              className: 'studio-edge',
            }}
          >
            <Panel position="top-left" className="flex items-center gap-2 bg-background/95 p-1 backdrop-blur">
              <InteractionModeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsInstagramBrowserOpen((open) => !open)}
                aria-label="Import media from Instagram"
              >
                <AtSign className="mr-2 h-4 w-4" />
                Import from Instagram
              </Button>
            </Panel>

            {isInstagramBrowserOpen && (
              <InstagramMediaBrowser
                brandProfileId={brandProfileId}
                onPlace={placeImportedReferenceNodes}
                onClose={() => setIsInstagramBrowserOpen(false)}
              />
            )}

            <Controls />
            <MiniMap className="!border !bg-background/95" />

            {Object.entries(remoteCursors).map(([userId, cursor]) => (
              <Cursor key={userId} x={cursor.x} y={cursor.y} color={cursor.color} name={cursor.name} />
            ))}

            <Panel position="bottom-right" className="mb-4 mr-4 border-none bg-transparent p-0 shadow-none">
              <AIStudioChat brandProfileId={brandProfileId || ''} roomId={activeRoomId} />
            </Panel>

            <Panel position="bottom-center" className="flex items-center gap-1.5 px-3 py-1.5 bg-background/80 backdrop-blur border-border/50">
              <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘C</kbd>
              <span className="text-[10px] text-muted-foreground">copy</span>
              <span className="text-muted-foreground/30 select-none mx-0.5">·</span>
              <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘V</kbd>
              <span className="text-[10px] text-muted-foreground">paste</span>
              <span className="text-muted-foreground/30 select-none mx-0.5">·</span>
              <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">⌘X</kbd>
              <span className="text-[10px] text-muted-foreground">cut</span>
              <span className="text-muted-foreground/30 select-none mx-0.5">·</span>
              <kbd className="inline-flex items-center rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">Del</kbd>
              <span className="text-[10px] text-muted-foreground">delete</span>
            </Panel>
          </Canvas>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-[clamp(14rem,18vw,18rem)]">
          <ContextMenuLabel>Canvas Actions</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <Plus className="mr-2 h-4 w-4" />
              Add Node
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-72">
              {LIBRARY_SECTIONS.map((section) => (
                <ContextMenuSub key={section.value}>
                  <ContextMenuSubTrigger inset>{section.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-72">
                    {section.items.map((item) =>
                      item.modelOptions ? (
                        <ContextMenuSub key={`${item.type}-models`}>
                          <ContextMenuSubTrigger inset>{item.label}</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-56">
                            {item.modelOptions.map((model) => (
                              <ContextMenuItem
                                key={`${item.type}-${model}`}
                                onClick={() => addNodeAtPointer(item.type, { model })}
                              >
                                <div className="flex min-w-0 flex-col">
                                  <span>{VIDEO_GENERATOR_MODEL_LABELS[model]}</span>
                                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                                </div>
                                <ContextMenuShortcut>{item.tag}</ContextMenuShortcut>
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      ) : (
                        <ContextMenuItem
                          key={item.type}
                          disabled={Boolean(item.disabled)}
                          onClick={() => addNodeAtPointer(item.type)}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span>{item.label}</span>
                            <span className="text-xs text-muted-foreground">{item.desc}</span>
                          </div>
                          <ContextMenuShortcut>{item.tag}</ContextMenuShortcut>
                        </ContextMenuItem>
                      )
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuItem inset onSelect={() => setIsLoadWorkflowOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Load Workflow
          </ContextMenuItem>

          <ContextMenuItem inset onSelect={() => setIsInstagramBrowserOpen(true)}>
            <AtSign className="mr-2 h-4 w-4" />
            Import from Instagram
          </ContextMenuItem>

          <ContextMenuItem
            inset
            disabled={!nodes.some((node) => node.selected)}
            onSelect={openCreateSkillFromSelection}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create skill from selection
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <ScanLine className="mr-2 h-4 w-4" />
              View and Interaction
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-64">
              <ContextMenuCheckboxItem checked={interactionMode === 'pan'} onClick={() => setInteractionMode('pan')}>
                Pan Mode
                <ContextMenuShortcut>H</ContextMenuShortcut>
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem checked={interactionMode === 'select'} onClick={() => setInteractionMode('select')}>
                Select Mode
                <ContextMenuShortcut>V</ContextMenuShortcut>
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => zoomIn({ duration: 250 })}>
                <ZoomIn className="mr-2 h-4 w-4" />
                Zoom In
              </ContextMenuItem>
              <ContextMenuItem onClick={() => zoomOut({ duration: 250 })}>
                <ZoomOut className="mr-2 h-4 w-4" />
                Zoom Out
              </ContextMenuItem>
              <ContextMenuItem onClick={() => fitView({ padding: 0.2, duration: 350 })}>
                Fit View
                <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={clearCanvas}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Canvas
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <LoadWorkflowDialog
        brandProfileId={brandProfileId}
        open={isLoadWorkflowOpen}
        onOpenChange={setIsLoadWorkflowOpen}
        showTrigger={false}
      />
      <CreateSkillFromSelectionDialog
        open={isCreateSkillOpen}
        onOpenChange={setIsCreateSkillOpen}
        brandId={brandProfileId}
        nodes={skillSelectionNodes}
      />
    </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
  brandProfileId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
}

export function StudioCanvas({
  embedded = false,
  brandProfileId,
  organicPlannerSeed,
}: StudioCanvasProps) {
  const router = useRouter();
  const { show } = useToast();
  const nodes = useStudioStore((state) => state.nodes);
  const { rooms } = useCanvasRooms(brandProfileId || '');
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(undefined);
  const [isApplyingBack, setIsApplyingBack] = useState(false);
  const [selectedLinkedinNodeId, setSelectedLinkedinNodeId] = useState<string | null>(null);
  const workflowSpec = useMemo<WorkflowConceptSpec | null>(
    () =>
      organicPlannerSeed
        ? resolveWorkflowConceptSpec({
            platform: organicPlannerSeed.platform,
            postType: organicPlannerSeed.postType,
            workflowConcept: organicPlannerSeed.workflowConcept,
          })
        : null,
    [organicPlannerSeed]
  );

  const applyCandidates = useMemo(() => collectApplyAssetCandidates(nodes), [nodes]);
  const linkedinImageCandidates = useMemo(
    () => applyCandidates.filter((candidate) => candidate.kind === "image"),
    [applyCandidates]
  );
  const requiresExplicitSelection = Boolean(
    workflowSpec?.requiresExplicitPickOnMultiOutput && linkedinImageCandidates.length > 1
  );
  const applyReadiness = useMemo(() => {
    if (!organicPlannerSeed || !workflowSpec) return null;

    const imageCount = applyCandidates.filter((candidate) => candidate.kind === "image").length;
    const videoCount = applyCandidates.filter((candidate) => candidate.kind === "video").length;

    if (workflowSpec.outputKind === "video") {
      const total = 1;
      const completed = Math.min(videoCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: `${completed}/${total} video ready`,
        detail:
          completed >= total
            ? "Ready to apply this reel back to Planner."
            : "Generate one video output to enable apply-back.",
      };
    }

    if (workflowSpec.outputMode === "ordered") {
      const total = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
      const completed = Math.min(imageCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: `${completed}/${total} slides ready`,
        detail:
          completed >= total
            ? "Ordered carousel outputs are ready to apply."
            : "Generate all required carousel slides before applying.",
      };
    }

    const total = 1;
    const completed = Math.min(imageCount, total);
    const missingSelection =
      workflowSpec.requiresExplicitPickOnMultiOutput && imageCount > 1 && !selectedLinkedinNodeId;
    return {
      ready: completed >= total && !missingSelection,
      completed,
      total,
      label: `${completed}/${total} image ready`,
      detail: missingSelection
        ? "Select one image output before applying."
        : completed >= total
          ? "Ready to apply this draft back to Planner."
          : "Generate one image output to enable apply-back.",
    };
  }, [
    applyCandidates,
    organicPlannerSeed,
    selectedLinkedinNodeId,
    workflowSpec,
  ]);
  const workflowSummaryLabel = useMemo(() => {
    if (!workflowSpec) return null;
    if (workflowSpec.outputKind === "video") return "Reel workflow";
    if (workflowSpec.outputMode === "ordered") return "Carousel workflow";
    if (workflowSpec.requiresExplicitPickOnMultiOutput) return "LinkedIn post workflow";
    return "Single-image workflow";
  }, [workflowSpec]);

  useEffect(() => {
    if (!requiresExplicitSelection) {
      setSelectedLinkedinNodeId(null);
      return;
    }
    if (selectedLinkedinNodeId && linkedinImageCandidates.some((candidate) => candidate.nodeId === selectedLinkedinNodeId)) {
      return;
    }
    setSelectedLinkedinNodeId(linkedinImageCandidates[0]?.nodeId ?? null);
  }, [linkedinImageCandidates, requiresExplicitSelection, selectedLinkedinNodeId]);

  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0].id);
    }
  }, [activeRoomId, rooms]);

  const realtime = useCanvasRealtime(brandProfileId || '', activeRoomId);
  const handleReturnToPlanner = useCallback(() => {
    if (!organicPlannerSeed) return;

    const params = new URLSearchParams({
      tab: "planner",
      draftId: organicPlannerSeed.draftId,
      weekStartId: organicPlannerSeed.weekStartId,
      from: "ai-studio",
    });
    router.push(`/organic?${params.toString()}`);
  }, [organicPlannerSeed, router]);

  const resolveCandidateSource = useCallback(async (source: string) => {
    if (source.startsWith("data:")) {
      return { sourceDataUrl: source };
    }
    if (source.startsWith("http://") || source.startsWith("https://")) {
      return { sourceUrl: source };
    }
    if (source.startsWith("blob:")) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error("Unable to read local asset blob for apply.");
      }
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          if (!result) {
            reject(new Error("Unable to convert blob output to data URL."));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error("Unable to convert blob output to data URL."));
        reader.readAsDataURL(blob);
      });
      return { sourceDataUrl: dataUrl };
    }
    return { sourceBase64: source };
  }, []);

  const handleApplyBackToPlanner = useCallback(async () => {
    if (!organicPlannerSeed || !brandProfileId) {
      show({
        title: "Apply unavailable",
        description: "Missing Planner context for this canvas session.",
        variant: "warning",
      });
      return;
    }

    setIsApplyingBack(true);
    try {
      if (!workflowSpec) {
        throw new Error("Workflow concept is missing for this Planner draft.");
      }
      const imageCandidates = applyCandidates.filter((candidate) => candidate.kind === "image");
      const videoCandidates = applyCandidates.filter((candidate) => candidate.kind === "video");

      let selectedCandidates: ApplyAssetCandidate[] = [];
      if (workflowSpec.outputKind === "video") {
        const firstVideo = videoCandidates[0];
        if (!firstVideo) {
          throw new Error("Generate at least one video output before applying back.");
        }
        selectedCandidates = [firstVideo];
      } else if (workflowSpec.outputMode === "ordered") {
        const requiredCount = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
        if (imageCandidates.length < requiredCount) {
          throw new Error(
            `Carousel requires ${requiredCount} generated images, but only ${imageCandidates.length} found.`
          );
        }
        selectedCandidates = imageCandidates.slice(0, requiredCount);
      } else if (workflowSpec.requiresExplicitPickOnMultiOutput) {
        if (imageCandidates.length === 0) {
          throw new Error("Generate at least one image output before applying back.");
        }
        if (imageCandidates.length > 1 && !selectedLinkedinNodeId) {
          throw new Error("Select one image output before applying.");
        }
        selectedCandidates =
          imageCandidates.length > 1
            ? imageCandidates.filter((candidate) => candidate.nodeId === selectedLinkedinNodeId)
            : [imageCandidates[0]];
      } else {
        const firstImage = imageCandidates[0];
        if (!firstImage) {
          throw new Error("Generate at least one image output before applying back.");
        }
        selectedCandidates = [firstImage];
      }

      const assets = await Promise.all(
        selectedCandidates.map(async (candidate, index) => {
          const source = await resolveCandidateSource(candidate.source);
          return {
            role:
              workflowSpec.outputMode === "ordered" ? `slide_${index + 1}` : candidate.role,
            kind: candidate.kind,
            slideIndex: workflowSpec.outputMode === "ordered" ? index : undefined,
            ...source,
          };
        })
      );

      const requestPayload: PlannerAiStudioApplyRequest = {
        schemaVersion: "planner_ai_apply_v1",
        draftId: organicPlannerSeed.draftId,
        brandProfileId,
        postType: organicPlannerSeed.postType,
        platform: organicPlannerSeed.platform,
        overwrite: true,
        contentPatch: {
          title: organicPlannerSeed.title,
          summary: organicPlannerSeed.summary,
          captionPreview: organicPlannerSeed.captionPreview,
          creativeDirectionPrompt: organicPlannerSeed.creativeDirectionPrompt,
          thumbnailPrompt: organicPlannerSeed.thumbnailPrompt,
        },
        assets,
        selection: {
          required: requiresExplicitSelection,
          selectedAssetRole:
            requiresExplicitSelection && selectedCandidates[0]
              ? selectedCandidates[0].role
              : undefined,
        },
      };

      const response = await fetch("/api/organic/ai-studio/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      const responseJson = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          responseJson && typeof responseJson.error === "string"
            ? responseJson.error
            : "Failed to apply output to Planner.";
        throw new Error(message);
      }

      const parsed = plannerAiStudioApplyResponseSchema.safeParse(responseJson);
      if (!parsed.success) {
        throw new Error("Apply response payload is invalid.");
      }

      window.localStorage.setItem(
        buildPendingApplyStorageKey(organicPlannerSeed.draftId),
        JSON.stringify(parsed.data)
      );

      show({
        title: "Applied to Planner",
        description: "Returning to Organic Planner.",
        variant: "success",
      });

      const params = new URLSearchParams({
        tab: "planner",
        draftId: organicPlannerSeed.draftId,
        weekStartId: organicPlannerSeed.weekStartId,
        from: "ai-studio",
      });
      router.push(`/organic?${params.toString()}`);
    } catch (error) {
      show({
        title: "Apply failed",
        description: error instanceof Error ? error.message : "Unable to apply output to Planner.",
        variant: "error",
      });
    } finally {
      setIsApplyingBack(false);
    }
  }, [
    applyCandidates,
    brandProfileId,
    organicPlannerSeed,
    requiresExplicitSelection,
    resolveCandidateSource,
    router,
    selectedLinkedinNodeId,
    show,
    workflowSpec,
  ]);

  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 w-full flex-col bg-background">
        {!embedded && (
          <div className="relative z-[100] flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Continuum</span>
                <span className="font-normal text-muted-foreground">Studio</span>
              </div>
              <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
              <div data-tour-id="studio-multiplayer" className="flex items-center gap-4">
                <div className="flex h-10 items-center rounded-lg border border-primary/20 bg-primary/10 px-2 shadow-[0_0_15px_rgba(90,72,249,0.1)]">
                  <CanvasSyncStatus status={realtime.status} dbStatus={realtime.dbStatus} isSaving={realtime.isSaving} isCollaborative={realtime.isCollaborative} />
                  <div className="mx-1 h-4 w-px bg-primary/20" />
                  <ActiveUsersStack onlineUsers={realtime.onlineUsers} status={realtime.status as never} />
                </div>
                <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
                <CanvasRoomsTabs
                  brandProfileId={brandProfileId || ''}
                  activeRoomId={activeRoomId}
                  onRoomChange={setActiveRoomId}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {organicPlannerSeed ? (
                <>
                  {applyReadiness && workflowSummaryLabel ? (
                    <div className="hidden min-w-[18rem] items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 lg:flex">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="outline" className="h-5 px-2 text-[10px]">
                            {workflowSummaryLabel}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {applyReadiness.label}
                          </span>
                        </div>
                        <Progress
                          value={(applyReadiness.completed / applyReadiness.total) * 100}
                          className="h-1.5"
                        />
                        <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                          {applyReadiness.detail}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {requiresExplicitSelection ? (
                    <Select
                      value={selectedLinkedinNodeId ?? undefined}
                      onValueChange={(value) => setSelectedLinkedinNodeId(value)}
                    >
                      <SelectTrigger className="h-9 w-[15rem]">
                        <SelectValue placeholder="Pick one output to apply" />
                      </SelectTrigger>
                      <SelectContent>
                        {linkedinImageCandidates.map((candidate, index) => (
                          <SelectItem key={candidate.nodeId} value={candidate.nodeId}>
                            {`Output ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleReturnToPlanner}
                  >
                    Back to Planner
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void handleApplyBackToPlanner();
                    }}
                    disabled={isApplyingBack || !applyReadiness?.ready}
                  >
                    {isApplyingBack ? "Applying..." : "Apply Back to Planner"}
                  </Button>
                </>
              ) : null}
              <LoadWorkflowDialog brandProfileId={brandProfileId} />
              <SaveWorkflowDialog brandProfileId={brandProfileId} />
              <WorkflowLibrary />
              <Toolbar />
            </div>
          </div>
        )}

        <main className="relative flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <Flow
            brandProfileId={brandProfileId}
            realtime={realtime}
            activeRoomId={activeRoomId}
            organicPlannerSeed={organicPlannerSeed}
          />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
