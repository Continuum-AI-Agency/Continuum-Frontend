import {
  type Edge,
  MiniMap,
  type Connection as ReactFlowConnection,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { createNodeData, type UnfurlMediaItem } from '@continuum/contracts';
import {
  AtSign,
  FolderOpen,
  Keyboard,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { Canvas } from '@/components/ai-elements/canvas';
import { Connection as ConnectionLine } from '@/components/ai-elements/connection';
import { Controls } from '@/components/ai-elements/controls';
import { Edge as AiElementsEdge } from '@/components/ai-elements/edge';
import { Panel } from '@/components/ai-elements/panel';
import { CanvasMediaLoader } from '@/components/ai-studio/CanvasMediaLoader';
import { CanvasRoomsTabs } from '@/components/ai-studio/CanvasRoomsTabs';
import { CanvasSyncStatus } from '@/components/ai-studio/CanvasSyncStatus';
import { AIStudioChat } from '@/components/ai-studio/chat/AIStudioChat';
import { CanvasComposer } from '@/components/ai-studio/composer/CanvasComposer';
import { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { useCanvasRooms } from '@/components/ai-studio/hooks/useCanvasRooms';
import { useCanvasRunRequests } from '@/components/ai-studio/hooks/useCanvasRunRequests';
import { WorkflowLibrary } from '@/components/ai-studio/WorkflowLibrary';
import { StudioMediaLibraryPanel } from '@/components/creative-assets/StudioMediaLibraryPanel';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { Cursor } from '@/components/realtime/cursor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/ToastProvider';
import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { STUDIO_ASSET_DROP_EFFECT } from '@/lib/creative-assets/studioAssetDrop';
import {
  buildPendingApplyStorageKey,
  type PlannerAiStudioApplyRequest,
  type PlannerAiStudioHandoff,
  plannerAiStudioApplyResponseSchema,
  resolveWorkflowConceptSpec,
  type WorkflowConceptSpec,
} from '@/lib/organic/ai-studio-bridge';
import { CanvasRuntimeProvider } from '../contexts/CanvasRuntimeContext';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { useTimelineRenderContinuations } from '../hooks/useTimelineRenderContinuations';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { AudioNode } from '../nodes/AudioNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { HyperframesAgentBlock } from '../nodes/HyperframesAgentBlock';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { ImageNode } from '../nodes/ImageNode';
import { NoteNode } from '../nodes/NoteNode';
import { OmniGenBlock } from '../nodes/OmniGenBlock';
import { OrganicPublisherBlock, PaidPublisherBlock } from '../nodes/PublishingBlock';
import { StringNode } from '../nodes/StringNode';
import { TimelineEditorBlock } from '../nodes/TimelineEditorBlock';
import { VideoDecoderBlock } from '../nodes/VideoDecoderBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import {
  IMAGE_GENERATOR_NODE_BOUNDS,
  snapNodeDimensionsToAspectRatio,
} from '../utils/aspectRatioSizing';
import { DEFAULT_BRAND_BOOK_PIECES } from '../utils/brandEnforcement';
import { buildReferenceNodes } from '../utils/buildReferenceNodes';
import { executeWorkflow } from '../utils/executeWorkflow';
import { STUDIO_FIT_VIEW_OPTIONS } from '../utils/fitViewOptions';
import { computeGenerationSignature } from '../utils/generationSignature';
import { inlineReferenceImageNodes } from '../utils/inlineReferenceImageNodes';
import { isValidConnection } from '../utils/isValidConnection';
import { layoutInRow } from '../utils/layoutImportedNodes';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { resolveSidebarDropTarget } from '../utils/resolveSidebarDropTarget';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorReferenceMode,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_MODELS,
  type VideoGeneratorModel,
} from '../utils/videoModel';
import { InstagramMediaBrowser } from './InstagramMediaBrowser';
import { InteractionModeToggle } from './InteractionModeToggle';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { SaveStarterDialog } from './SaveStarterDialog';
import { SaveWorkflowDialog } from './SaveWorkflowDialog';
import { SourceDropNodePicker } from './SourceDropNodePicker';
import { Toolbar } from './Toolbar';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

type StudioCanvasNodeType =
  | 'nanoGen'
  | 'videoGen'
  | 'veoDirector'
  | 'veoFast'
  | 'omniGen'
  | 'extendVideo'
  | 'hyperframesAgent'
  | 'timelineEditor'
  | 'organicPublisher'
  | 'paidPublisher'
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
        type: 'hyperframesAgent',
        label: 'HyperFrames Agent',
        desc: 'Agentic HTML video creation with media references',
        tag: 'Creative',
      },
      {
        type: 'videoGen',
        label: 'Video Generation',
        desc: 'Generate clips with selectable models',
        tag: 'Creative',
        modelOptions: VIDEO_GENERATOR_MODELS,
      },
      {
        type: 'omniGen',
        label: 'Omni Flash (Edit)',
        desc: 'Generate a clip, then chat to edit it into variations',
        tag: 'Creative',
      },
      {
        type: 'extendVideo',
        label: 'Extend Video',
        desc: 'Continue existing footage',
        tag: 'Creative',
      },
      {
        type: 'timelineEditor',
        label: 'Video Editor',
        desc: 'Full editor — trim, split & sequence clips + stills',
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
  {
    value: 'publishing',
    label: 'Publishing',
    items: [
      {
        type: 'organicPublisher',
        label: 'Organic Planner',
        desc: 'Attach an image, carousel, or video to a Planner draft',
        tag: 'Publishing',
      },
      {
        type: 'paidPublisher',
        label: 'Paid Ad',
        desc: 'Replace creative on a paused or active Meta ad',
        tag: 'Publishing',
      },
    ],
  },
];

const NODE_TYPES = new Set<StudioCanvasNodeType>([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'omniGen',
  'extendVideo',
  'hyperframesAgent',
  'timelineEditor',
  'organicPublisher',
  'paidPublisher',
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
  options?: { model?: VideoGeneratorModel },
): { data: Record<string, unknown>; style?: Record<string, number> } => {
  // One factory for the node defaults (@continuum/contracts) — the canvas, the
  // edge-drop menu and the agent write path must create the SAME node. It also sizes
  // the node to its aspect ratio, so a 1:1 generation is not born in a 16:9 box.
  if (type === 'nanoGen') {
    return createNodeData('nanoGen');
  }

  if (type === 'videoGen' || type === 'veoDirector' || type === 'veoFast') {
    const model =
      options?.model ??
      (type === 'veoDirector'
        ? 'veo-3.1'
        : type === 'veoFast'
          ? 'veo-3.1-fast'
          : DEFAULT_VIDEO_GENERATOR_MODEL);
    return createNodeData(type, {
      model,
      referenceMode: getVideoGeneratorReferenceMode(model),
    });
  }

  if (type === 'extendVideo') {
    return {
      data: { prompt: '' },
      style: { width: 360, height: 200 },
    };
  }

  if (type === 'timelineEditor') {
    return {
      data: {
        items: [],
        outputFormat: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        committed: false,
      },
      style: { width: 320, height: 260 },
    };
  }

  if (type === 'hyperframesAgent') {
    return createNodeData('hyperframesAgent');
  }

  if (type === 'string') {
    return { data: { value: '' } };
  }

  if (type === 'organicPublisher' || type === 'paidPublisher') {
    return createNodeData(type);
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

  if (type === 'omniGen') {
    return createNodeData('omniGen');
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
  omniGen: OmniGenBlock,
  extendVideo: ExtendVideoBlock,
  hyperframesAgent: HyperframesAgentBlock,
  timelineEditor: TimelineEditorBlock,
  organicPublisher: OrganicPublisherBlock,
  paidPublisher: PaidPublisherBlock,
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
  kind: 'image' | 'video';
  source: string;
};

function resolveSeedMediaDataUrl(seed: PlannerAiStudioHandoff): string | null {
  const assetUrl =
    typeof seed.mediaSuggestion?.assetUrl === 'string' ? seed.mediaSuggestion.assetUrl.trim() : '';
  if (assetUrl.length > 0) return assetUrl;

  const assetBase64 =
    typeof seed.mediaSuggestion?.assetBase64 === 'string'
      ? seed.mediaSuggestion.assetBase64.trim()
      : '';
  if (!assetBase64) return null;

  return assetBase64.startsWith('data:image/')
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
    fileName: 'planner-seed-image.png',
    ...(isRemoteUrl ? { sourceUrl: seedImage.trim() } : {}),
  };
}

// Pulls the durable bucket + object path out of a Supabase storage URL (signed,
// public, or authenticated). The path segment after `/storage/v1/object/<mode>/`
// is `<bucket>/<path...>`, independent of the expiring `?token`. Returns null for
// any non-storage URL (e.g. a third-party CDN), which simply skips durable coords.
function parseSupabaseStorageRef(url: string): { bucket: string; storagePath: string } | null {
  try {
    const { pathname } = new URL(url);
    const marker = '/storage/v1/object/';
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    let rest = pathname.slice(markerIndex + marker.length);
    for (const mode of ['sign/', 'public/', 'authenticated/']) {
      if (rest.startsWith(mode)) {
        rest = rest.slice(mode.length);
        break;
      }
    }
    const firstSlash = rest.indexOf('/');
    if (firstSlash <= 0) return null;
    const bucket = decodeURIComponent(rest.slice(0, firstSlash));
    const storagePath = decodeURIComponent(rest.slice(firstSlash + 1));
    if (!bucket || !storagePath) return null;
    return { bucket, storagePath };
  } catch {
    return null;
  }
}

// Presents the already-produced creative AS the generator node's own output, so
// "Open in AI Studio" opens the flow that made the post — prompt node + the image
// it produced — rather than parking the image as a side reference. A remote signed
// URL is mirrored onto both fields the way the node's own expiry-resign does, and
// its durable storage coords are persisted so the resign machinery can refresh the
// thumbnail once the seeded signed URL expires (otherwise it stays broken forever).
function buildSeedGeneratedImageData(seedImage: string): Record<string, unknown> {
  const trimmed = seedImage.trim();
  const isRemoteUrl = /^https?:\/\//i.test(trimmed);
  if (!isRemoteUrl) return { generatedImage: seedImage };

  const storageRef = parseSupabaseStorageRef(trimmed);
  return {
    generatedImage: seedImage,
    generatedImageUrl: seedImage,
    ...(storageRef
      ? {
          generatedImageStoragePath: storageRef.storagePath,
          generatedImageBucket: storageRef.bucket,
        }
      : {}),
  };
}

function buildSeedPrompt(seed: PlannerAiStudioHandoff): string {
  const workflowSpec = resolveWorkflowConceptSpec({
    platform: seed.platform,
    postType: seed.postType,
    workflowConcept: seed.workflowConcept,
  });
  const promptSections = [
    seed.title ? `Title: ${seed.title}` : '',
    seed.summary ? `Summary: ${seed.summary}` : '',
    seed.captionPreview ? `Draft caption:\n${seed.captionPreview}` : '',
    seed.creativeDirectionPrompt ? `Creative direction:\n${seed.creativeDirectionPrompt}` : '',
    seed.thumbnailPrompt ? `Thumbnail direction:\n${seed.thumbnailPrompt}` : '',
  ].filter(Boolean);

  if (workflowSpec.outputKind === 'video') {
    promptSections.push(
      'Goal: Generate a short-form social reel concept with clear motion direction.',
    );
  } else if (workflowSpec.outputMode === 'ordered') {
    promptSections.push(
      'Goal: Generate distinct but coherent slide visuals for the full carousel.',
    );
  } else {
    promptSections.push(
      'Goal: Generate a clean social thumbnail concept with clear hierarchy and one focal subject.',
    );
  }

  return promptSections.join('\n\n');
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
    if (node.type === 'nanoGen') {
      const nodeData = node.data as { generatedImage?: unknown; generatedImageUrl?: unknown };
      const generatedImage =
        typeof nodeData.generatedImage === 'string' ? (nodeData.generatedImage ?? '').trim() : '';
      const generatedImageUrl =
        typeof nodeData.generatedImageUrl === 'string'
          ? (nodeData.generatedImageUrl ?? '').trim()
          : '';
      const source = generatedImage || generatedImageUrl;
      if (!source) return;
      imageCandidates.push({
        nodeId: node.id,
        role: `image_${imageCandidates.length + 1}`,
        kind: 'image',
        source,
      });
      return;
    }

    if (node.type === 'videoGen' || node.type === 'extendVideo') {
      const nodeData = node.data as { generatedVideo?: unknown; generatedVideoUrl?: unknown };
      const generatedVideo =
        typeof nodeData.generatedVideo === 'string' ? (nodeData.generatedVideo ?? '').trim() : '';
      const generatedVideoUrl =
        typeof nodeData.generatedVideoUrl === 'string'
          ? (nodeData.generatedVideoUrl ?? '').trim()
          : '';
      const source = generatedVideo || generatedVideoUrl;
      if (!source) return;
      videoCandidates.push({
        nodeId: node.id,
        role: `video_${videoCandidates.length + 1}`,
        kind: 'video',
        source,
      });
    }
  });

  return [...imageCandidates, ...videoCandidates];
}

// The planner seed draws bigger generator nodes than the canvas default so a handoff
// reads at a glance, but the SHAPE still comes from the one sizing helper — a seed that
// hardcodes both dimensions is how a 9:16 post ends up in a landscape box (#230).
function seedGeneratorStyle(aspectRatio: string, edge: number): { width: number; height: number } {
  return snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: edge,
    currentHeight: edge,
    minWidth: IMAGE_GENERATOR_NODE_BOUNDS.minWidth,
    minHeight: IMAGE_GENERATOR_NODE_BOUNDS.minHeight,
    fallbackWidth: edge,
  });
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
    type: 'string',
    position: { x: 120, y: 160 },
    data: { value: promptValue },
    style: { width: 420, height: 240 },
  } as StudioNode;

  if (workflowSpec.outputKind === 'video') {
    const videoNodeId = `organic-seed-reel-${seed.draftId}`;
    // A Reel is vertical. This seed used to be stamped with the 16:9 default box, so the
    // very first thing a planner handoff showed for a 9:16 post was a landscape node.
    const seedAspectRatio = seed.postType === 'reel' ? '9:16' : '16:9';
    const nodes: StudioNode[] = [
      textNode,
      {
        id: videoNodeId,
        type: 'videoGen',
        position: { x: 620, y: 160 },
        ...createNodeData('videoGen', {
          model: workflowSpec.defaultModel,
          referenceMode: 'frames',
          aspectRatio: seedAspectRatio,
        }),
      } as StudioNode,
    ];

    const edges: Edge[] = [
      {
        id: `e-${textNodeId}-${videoNodeId}-prompt`,
        source: textNodeId,
        sourceHandle: 'text',
        target: videoNodeId,
        targetHandle: 'prompt-in',
        type: 'dataType',
        data: { dataType: 'text', pathType: 'bezier' },
      },
    ];

    if (seedImage) {
      const imageRefId = `organic-seed-image-ref-${seed.draftId}`;
      nodes.push({
        id: imageRefId,
        type: 'image',
        position: { x: 620, y: 500 },
        data: buildSeedImageNodeData(seedImage),
        style: { width: 196, height: 196 },
      } as StudioNode);
      edges.push({
        id: `e-${imageRefId}-${videoNodeId}-first`,
        source: imageRefId,
        sourceHandle: 'image',
        target: videoNodeId,
        targetHandle: 'first-frame',
        type: 'dataType',
        data: { dataType: 'image', pathType: 'bezier' },
      });
    }

    return { nodes, edges };
  }

  if (workflowSpec.outputMode === 'ordered') {
    const count = Math.max(1, Math.min(seed.authoritativeCount ?? 1, 10));
    const nodes: StudioNode[] = [textNode];
    const edges: Edge[] = [];
    let seedNodeId: string | null = null;

    if (seedImage) {
      seedNodeId = `organic-seed-image-ref-${seed.draftId}`;
      nodes.push({
        id: seedNodeId,
        type: 'image',
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
        type: 'nanoGen',
        position: { x: 620 + col * 380, y: 140 + row * 360 },
        data: {
          model: workflowSpec.defaultModel,
          positivePrompt: '',
          aspectRatio: '1:1',
          imageSize: '512px',
          maxReferenceImages: workflowSpec.maxReferenceImages,
        },
        style: seedGeneratorStyle('1:1', 340),
      } as StudioNode);

      edges.push({
        id: `e-${textNodeId}-${nodeId}-prompt`,
        source: textNodeId,
        sourceHandle: 'text',
        target: nodeId,
        targetHandle: 'prompt',
        type: 'dataType',
        data: { dataType: 'text', pathType: 'bezier' },
      });

      if (seedNodeId) {
        edges.push({
          id: `e-${seedNodeId}-${nodeId}-ref`,
          source: seedNodeId,
          sourceHandle: 'image',
          target: nodeId,
          targetHandle: 'ref-image',
          type: 'dataType',
          data: { dataType: 'image', pathType: 'bezier' },
        });
      }
    }

    return { nodes, edges };
  }

  const imageGenNodeId = `organic-seed-image-${seed.draftId}`;
  const imageGenNode: StudioNode = {
    id: imageGenNodeId,
    type: 'nanoGen',
    position: { x: 620, y: 190 },
    data: {
      model: workflowSpec.defaultModel,
      positivePrompt: '',
      aspectRatio: '1:1',
      imageSize: '1K',
      maxReferenceImages: workflowSpec.maxReferenceImages,
      // Seed the produced creative as this node's output so the flow opens showing
      // the posted image, editable in place. See buildSeedGeneratedImageData.
      ...(seedImage ? buildSeedGeneratedImageData(seedImage) : {}),
    },
    style: seedGeneratorStyle('1:1', 420),
  } as StudioNode;
  const nodes: StudioNode[] = [textNode, imageGenNode];
  const edges: Edge[] = [
    {
      id: `e-${textNodeId}-${imageGenNodeId}-prompt`,
      source: textNodeId,
      sourceHandle: 'text',
      target: imageGenNodeId,
      targetHandle: 'prompt',
      type: 'dataType',
      data: { dataType: 'text', pathType: 'bezier' },
    },
  ];

  // Store a signature matching the seeded output + its prompt wiring. Without it a
  // node with output but no signature reads as "not stale" and a Run would reuse
  // the seeded image; with it, editing the prompt drifts the signature so Run
  // regenerates — which is exactly the "change the image we gave you" the user wants.
  if (seedImage) {
    const nodeById = new Map(nodes.map((node): [string, StudioNode] => [node.id, node]));
    (imageGenNode.data as Record<string, unknown>).generationSignature = computeGenerationSignature(
      imageGenNode,
      edges,
      nodeById,
    );
  }

  return { nodes, edges };
}

function Flow({
  brandProfileId,
  realtime,
  activeRoomId,
  focusNodeId,
  organicPlannerSeed,
}: {
  brandProfileId?: string;
  realtime: ReturnType<typeof useCanvasRealtime>;
  activeRoomId?: string;
  focusNodeId?: string;
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
    keyboardScope,
    triggerSave,
    setBrandId,
    setActiveRoomId,
    updateNodeData,
    copySelectedNodes,
    cutSelectedNodes,
    pasteNodes,
    defaultEdgeType,
  } = useStudioStore();

  const { remoteCursors, updateCursor, isLoading } = realtime;

  // Pick up MCP-issued run requests for this room and execute them on the open
  // canvas (results persist + broadcast through the normal autosave path).
  useCanvasRunRequests(brandProfileId || '', activeRoomId);
  useTimelineRenderContinuations(brandProfileId, activeRoomId);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePositionRef = useRef({ x: 240, y: 180 });
  const contextMenuAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const { screenToFlowPosition, deleteElements, fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    if (brandProfileId) {
      setBrandId(brandProfileId);
    }
  }, [brandProfileId, setBrandId]);

  useEffect(() => {
    setActiveRoomId(activeRoomId);
  }, [activeRoomId, setActiveRoomId]);

  const focusedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNodeId || isLoading || focusedNodeRef.current === focusNodeId) return;
    const target = nodes.find((node) => node.id === focusNodeId);
    if (!target) return;
    focusedNodeRef.current = focusNodeId;
    setNodes(nodes.map((node) => ({ ...node, selected: node.id === focusNodeId })));
    const handle = requestAnimationFrame(() => {
      fitView({ nodes: [target], padding: 0.65, duration: 350 });
    });
    return () => cancelAnimationFrame(handle);
  }, [fitView, focusNodeId, isLoading, nodes, setNodes]);

  // When the walkthrough seeds starter nodes, frame them so the tour's node
  // steps always have an on-screen target. Runs once per Flow instance.
  const hasFitTourSeedRef = useRef(false);
  useEffect(() => {
    if (hasFitTourSeedRef.current) return;
    if (!nodes.some((node) => node.data?.isTourSeed === true)) return;
    hasFitTourSeedRef.current = true;
    const handle = requestAnimationFrame(() => {
      fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 0 });
    });
    return () => cancelAnimationFrame(handle);
  }, [nodes, fitView]);

  const {
    onConnectStart,
    onConnectEnd,
    pendingSourceDrop,
    resolveSourceDropPick,
    dismissSourceDropPick,
  } = useEdgeDropNode();
  const { show } = useToast();
  const [isLoadWorkflowOpen, setIsLoadWorkflowOpen] = useState(false);
  const [isInstagramBrowserOpen, setIsInstagramBrowserOpen] = useState(false);
  const [isLibraryBrowserOpen, setIsLibraryBrowserOpen] = useState(false);
  const [isSaveStarterOpen, setIsSaveStarterOpen] = useState(false);
  // Team chat open/closed lifted here so the composer can reserve the chat panel's
  // footprint and the two overlays never fight for the same bottom-right region.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [starterSelectionNodes, setStarterSelectionNodes] = useState<StudioNode[]>([]);
  const hydratedPlannerSeedRef = useRef<string | null>(null);

  const openSaveStarter = useCallback(() => {
    setStarterSelectionNodes(nodes.filter((node) => node.selected));
    setIsSaveStarterOpen(true);
  }, [nodes]);

  // The Composer builds; the user runs. Same execution path as the toolbar's Run
  // Flow — the composed workflow is an ordinary canvas, with nothing special about it.
  const composerExecutionControls = useWorkflowExecution();
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );
  const handleComposerRun = useCallback(() => {
    void executeWorkflow(composerExecutionControls, { brandId: brandProfileId });
  }, [composerExecutionControls, brandProfileId]);

  // Applies full brand-book enforcement to every selected generation node at once,
  // so the user can brand-enforce a whole flow in one action. Reference/text nodes
  // are ignored (they carry no generation prompt).
  const enforceBrandBookOnSelection = useCallback(() => {
    const targets = nodes.filter(
      (node) =>
        node.selected &&
        (node.type === 'nanoGen' ||
          node.type === 'videoGen' ||
          node.type === 'veoDirector' ||
          node.type === 'veoFast'),
    );
    if (targets.length === 0) {
      show({
        title: 'No generation nodes selected',
        description: 'Select image or video generation nodes to enforce the brand book.',
        variant: 'error',
      });
      return;
    }
    targets.forEach((node) =>
      updateNodeData(node.id, { brandBookPieces: DEFAULT_BRAND_BOOK_PIECES }),
    );
    triggerSave();
    show({
      title: 'Brand book enforced',
      description: `${targets.length} node${targets.length === 1 ? '' : 's'} will follow the full brand book.`,
      variant: 'success',
    });
  }, [nodes, show, triggerSave, updateNodeData]);

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
      // A full-screen editor (e.g. the Video Editor dialog) owns the keyboard
      // while open. Standing down here keeps Delete/Backspace, copy/paste, and
      // undo from acting on the canvas node behind the editor.
      if (keyboardScope === 'modal') {
        return;
      }
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
  }, [
    copySelectedNodes,
    cutSelectedNodes,
    deleteElements,
    edges,
    keyboardScope,
    nodes,
    pasteNodes,
    redo,
    setInteractionMode,
    takeSnapshot,
    undo,
  ]);

  const readyNodeIds = useMemo(() => {
    const isGeneratorReady = (node: StudioNode) => {
      if (node.type === 'nanoGen') {
        const hasPromptEdge = edges.some(
          (edge) => edge.target === node.id && edge.targetHandle === 'prompt',
        );
        const promptValue =
          typeof (node.data as { positivePrompt?: string }).positivePrompt === 'string'
            ? (node.data as { positivePrompt?: string }).positivePrompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      if (node.type === 'videoGen' || node.type === 'veoDirector' || node.type === 'veoFast') {
        const hasPromptEdge = edges.some(
          (edge) => edge.target === node.id && edge.targetHandle === 'prompt-in',
        );
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
      if (
        dataType === 'image' ||
        dataType === 'video' ||
        dataType === 'audio' ||
        dataType === 'document' ||
        dataType === 'text'
      ) {
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
      if (
        dataPathType === 'bezier' ||
        dataPathType === 'straight' ||
        dataPathType === 'step' ||
        dataPathType === 'smoothstep'
      ) {
        return dataPathType;
      }
      if (
        edge.type === 'bezier' ||
        edge.type === 'straight' ||
        edge.type === 'step' ||
        edge.type === 'smoothstep'
      ) {
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
      const className = [
        edge.className,
        'studio-edge',
        isActive ? 'studio-edge--active' : '',
        isDotted ? 'studio-edge--inactive' : '',
      ]
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
    // Must match the drag source's effectAllowed (STUDIO_ASSET_DROP_EFFECT); a
    // mismatched dropEffect makes the browser drop the drop and never fire onDrop.
    event.dataTransfer.dropEffect = STUDIO_ASSET_DROP_EFFECT;
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

      // assetId is only set when the drop came from the Library. It is what lets a
      // generation fed by this node be credited back to the asset that fed it.
      if (assetNodeType === 'image') {
        assetData = {
          image: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
          sourcePath: resolved.sourcePath,
          bucket: resolved.bucket,
          sourceUrl: resolved.sourceUrl,
        };
      } else if (assetNodeType === 'video') {
        assetData = {
          video: resolved.dataUrl,
          fileName: resolved.fileName,
          assetId: resolved.assetId,
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

      const dropTarget = resolveSidebarDropTarget(
        event.clientX,
        event.clientY,
        assetNodeType,
        nodes,
        edges,
      );

      if (dropTarget) {
        const newEdge: Edge = {
          id: `e-${newNode.id}-${dropTarget.nodeId}-${Date.now()}`,
          source: newNode.id,
          sourceHandle: assetNodeType,
          target: dropTarget.nodeId,
          targetHandle: dropTarget.handleId,
          type: 'dataType',
          className: 'studio-edge studio-edge--connected',
          data: {
            dataType: assetNodeType,
            pathType: defaultEdgeType,
          },
        };
        setNodes(nodes.concat(newNode));
        setEdges(edges.concat(newEdge));
      } else {
        setNodes(nodes.concat(newNode));
      }

      triggerSave();
    },
    [
      nodes,
      edges,
      screenToFlowPosition,
      setNodes,
      setEdges,
      show,
      takeSnapshot,
      triggerSave,
      defaultEdgeType,
    ],
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
      className="relative h-full min-h-0 w-full"
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
            // Default 20px is tight against our 12-16px handles, especially on
            // video-generator nodes stacking up to 6 target handles closely.
            connectionRadius={24}
            // While a modal editor owns the keyboard, disable React Flow's own
            // Backspace/Delete node-deletion. Spread conditionally: passing
            // deleteKeyCode={undefined} would still override the Canvas default
            // (["Backspace","Delete"]) since Canvas spreads props after it, so
            // only inject the prop in the modal case. null = no delete key.
            {...(keyboardScope === 'modal' ? { deleteKeyCode: null } : {})}
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
            <Panel
              position="top-left"
              className="flex items-center gap-2 bg-background/95 p-1 backdrop-blur"
            >
              <InteractionModeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsLibraryBrowserOpen((open) => !open)}
                aria-label="Browse media library"
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Library
              </Button>
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

            {isLibraryBrowserOpen && (
              <Panel position="top-left" className="ml-1 mt-14 nodrag nowheel">
                <div className="flex h-[560px] w-[360px] flex-col overflow-hidden rounded-lg border border-border/60 bg-background/95 shadow-lg backdrop-blur">
                  <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                    <span className="text-sm font-medium">Media Library</span>
                    <button
                      type="button"
                      onClick={() => setIsLibraryBrowserOpen(false)}
                      aria-label="Close media library"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <StudioMediaLibraryPanel brandProfileId={brandProfileId || ''} />
                  </div>
                </div>
              </Panel>
            )}

            {isInstagramBrowserOpen && (
              <InstagramMediaBrowser
                brandProfileId={brandProfileId}
                onPlace={placeImportedReferenceNodes}
                onClose={() => setIsInstagramBrowserOpen(false)}
              />
            )}

            <Controls fitViewOptions={STUDIO_FIT_VIEW_OPTIONS} />
            <MiniMap className="!border !bg-background/95" />

            {Object.entries(remoteCursors).map(([userId, cursor]) => (
              <Cursor
                key={userId}
                x={cursor.x}
                y={cursor.y}
                color={cursor.color}
                name={cursor.name}
              />
            ))}

            {pendingSourceDrop && (
              <SourceDropNodePicker
                candidates={pendingSourceDrop.candidates}
                screenPosition={pendingSourceDrop.screenPosition}
                onSelect={resolveSourceDropPick}
                onDismiss={dismissSourceDropPick}
              />
            )}

            <Panel
              position="bottom-right"
              className="mb-4 mr-4 border-none bg-transparent p-0 shadow-none"
            >
              <AIStudioChat
                brandProfileId={brandProfileId || ''}
                roomId={activeRoomId}
                onOpenChange={setIsChatOpen}
              />
            </Panel>

            <Panel position="bottom-center" className="border-none bg-transparent p-0 shadow-none">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-2 bg-background/90 px-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur"
                    aria-label="Show canvas keyboard shortcuts"
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                    Shortcuts
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" side="top" className="w-64 p-3">
                  <p className="mb-2 text-xs font-medium text-foreground">Canvas shortcuts</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
                    {[
                      ['Copy selected nodes', '⌘ C'],
                      ['Paste nodes', '⌘ V'],
                      ['Cut selected nodes', '⌘ X'],
                      ['Delete selected nodes', 'Delete'],
                      ['Pan mode', 'H'],
                      ['Select mode', 'V'],
                      ['Fit view', 'Shift F'],
                    ].map(([label, shortcut]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd>
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground">
                            {shortcut}
                          </kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </PopoverContent>
              </Popover>
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
                      ),
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
            onSelect={openSaveStarter}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Save selection as starter
          </ContextMenuItem>

          <ContextMenuItem
            inset
            disabled={!nodes.some((node) => node.selected)}
            onSelect={enforceBrandBookOnSelection}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Enforce brand book on selection
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <ScanLine className="mr-2 h-4 w-4" />
              View and Interaction
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-64">
              <ContextMenuCheckboxItem
                checked={interactionMode === 'pan'}
                onClick={() => setInteractionMode('pan')}
              >
                Pan Mode
                <ContextMenuShortcut>H</ContextMenuShortcut>
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem
                checked={interactionMode === 'select'}
                onClick={() => setInteractionMode('select')}
              >
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
              <ContextMenuItem
                onClick={() => fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 350 })}
              >
                Fit View
                <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onClick={clearCanvas}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Canvas
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {/* Overlaid on the canvas rather than mounted as a React Flow Panel: the hero
          state centres itself on an empty canvas, which the Panel grid cannot express. */}
      <CanvasComposer
        brandProfileId={brandProfileId}
        roomId={activeRoomId}
        isCanvasEmpty={nodes.length === 0}
        selectedNodeIds={selectedNodeIds}
        chatOpen={isChatOpen}
        onRun={handleComposerRun}
      />
      <LoadWorkflowDialog
        brandProfileId={brandProfileId}
        open={isLoadWorkflowOpen}
        onOpenChange={setIsLoadWorkflowOpen}
        showTrigger={false}
      />
      <SaveStarterDialog
        open={isSaveStarterOpen}
        onOpenChange={setIsSaveStarterOpen}
        brandProfileId={brandProfileId}
        nodes={starterSelectionNodes}
      />
    </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
  brandProfileId?: string;
  initialRoomId?: string;
  focusNodeId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
}

export function StudioCanvas({
  embedded = false,
  brandProfileId,
  initialRoomId,
  focusNodeId,
  organicPlannerSeed,
}: StudioCanvasProps) {
  const router = useRouter();
  const { show } = useToast();
  const nodes = useStudioStore((state) => state.nodes);
  const { rooms, isLoading: roomsLoading } = useCanvasRooms(brandProfileId || '');
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(initialRoomId);
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
    [organicPlannerSeed],
  );

  const applyCandidates = useMemo(() => collectApplyAssetCandidates(nodes), [nodes]);
  const linkedinImageCandidates = useMemo(
    () => applyCandidates.filter((candidate) => candidate.kind === 'image'),
    [applyCandidates],
  );
  const requiresExplicitSelection = Boolean(
    workflowSpec?.requiresExplicitPickOnMultiOutput && linkedinImageCandidates.length > 1,
  );
  const applyReadiness = useMemo(() => {
    if (!organicPlannerSeed || !workflowSpec) return null;

    const imageCount = applyCandidates.filter((candidate) => candidate.kind === 'image').length;
    const videoCount = applyCandidates.filter((candidate) => candidate.kind === 'video').length;

    if (workflowSpec.outputKind === 'video') {
      const total = 1;
      const completed = Math.min(videoCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: `${completed}/${total} video ready`,
        detail:
          completed >= total
            ? 'Ready to apply this reel back to Planner.'
            : 'Generate one video output to enable apply-back.',
      };
    }

    if (workflowSpec.outputMode === 'ordered') {
      const total = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
      const completed = Math.min(imageCount, total);
      return {
        ready: completed >= total,
        completed,
        total,
        label: `${completed}/${total} slides ready`,
        detail:
          completed >= total
            ? 'Ordered carousel outputs are ready to apply.'
            : 'Generate all required carousel slides before applying.',
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
        ? 'Select one image output before applying.'
        : completed >= total
          ? 'Ready to apply this draft back to Planner.'
          : 'Generate one image output to enable apply-back.',
    };
  }, [applyCandidates, organicPlannerSeed, selectedLinkedinNodeId, workflowSpec]);
  const workflowSummaryLabel = useMemo(() => {
    if (!workflowSpec) return null;
    if (workflowSpec.outputKind === 'video') return 'Reel workflow';
    if (workflowSpec.outputMode === 'ordered') return 'Carousel workflow';
    if (workflowSpec.requiresExplicitPickOnMultiOutput) return 'LinkedIn post workflow';
    return 'Single-image workflow';
  }, [workflowSpec]);

  useEffect(() => {
    if (!requiresExplicitSelection) {
      setSelectedLinkedinNodeId(null);
      return;
    }
    if (
      selectedLinkedinNodeId &&
      linkedinImageCandidates.some((candidate) => candidate.nodeId === selectedLinkedinNodeId)
    ) {
      return;
    }
    setSelectedLinkedinNodeId(linkedinImageCandidates[0]?.nodeId ?? null);
  }, [linkedinImageCandidates, requiresExplicitSelection, selectedLinkedinNodeId]);

  // On an in-app brand switch (no full navigation, so the server-resolved
  // initialRoomId is stale) drop the previous brand's room so the fallback below
  // re-resolves against the new brand's rooms. Skips the initial mount via the ref
  // so initialRoomId survives first paint.
  const previousBrandRef = useRef(brandProfileId);
  useEffect(() => {
    if (previousBrandRef.current !== brandProfileId) {
      previousBrandRef.current = brandProfileId;
      setActiveRoomId(undefined);
    }
  }, [brandProfileId]);

  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0].id);
    }
  }, [activeRoomId, rooms]);

  const realtime = useCanvasRealtime(brandProfileId || '', activeRoomId);
  const canvasRuntime = useMemo(
    () =>
      brandProfileId && activeRoomId
        ? {
            brandProfileId,
            roomId: activeRoomId,
            flushSave: realtime.saveCanvasToDatabase,
          }
        : null,
    [activeRoomId, brandProfileId, realtime.saveCanvasToDatabase],
  );
  const handleReturnToPlanner = useCallback(() => {
    if (!organicPlannerSeed) return;

    const params = new URLSearchParams({
      tab: 'planner',
      draftId: organicPlannerSeed.draftId,
      weekStartId: organicPlannerSeed.weekStartId,
      from: 'ai-studio',
    });
    router.push(`/organic?${params.toString()}`);
  }, [organicPlannerSeed, router]);

  const resolveCandidateSource = useCallback(async (source: string) => {
    if (source.startsWith('data:')) {
      return { sourceDataUrl: source };
    }
    if (source.startsWith('http://') || source.startsWith('https://')) {
      return { sourceUrl: source };
    }
    if (source.startsWith('blob:')) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error('Unable to read local asset blob for apply.');
      }
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result) {
            reject(new Error('Unable to convert blob output to data URL.'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Unable to convert blob output to data URL.'));
        reader.readAsDataURL(blob);
      });
      return { sourceDataUrl: dataUrl };
    }
    return { sourceBase64: source };
  }, []);

  const handleApplyBackToPlanner = useCallback(async () => {
    if (!organicPlannerSeed || !brandProfileId) {
      show({
        title: 'Apply unavailable',
        description: 'Missing Planner context for this canvas session.',
        variant: 'warning',
      });
      return;
    }

    setIsApplyingBack(true);
    try {
      if (!workflowSpec) {
        throw new Error('Workflow concept is missing for this Planner draft.');
      }
      const imageCandidates = applyCandidates.filter((candidate) => candidate.kind === 'image');
      const videoCandidates = applyCandidates.filter((candidate) => candidate.kind === 'video');

      let selectedCandidates: ApplyAssetCandidate[] = [];
      if (workflowSpec.outputKind === 'video') {
        const firstVideo = videoCandidates[0];
        if (!firstVideo) {
          throw new Error('Generate at least one video output before applying back.');
        }
        selectedCandidates = [firstVideo];
      } else if (workflowSpec.outputMode === 'ordered') {
        const requiredCount = Math.max(1, organicPlannerSeed.authoritativeCount ?? 1);
        if (imageCandidates.length < requiredCount) {
          throw new Error(
            `Carousel requires ${requiredCount} generated images, but only ${imageCandidates.length} found.`,
          );
        }
        selectedCandidates = imageCandidates.slice(0, requiredCount);
      } else if (workflowSpec.requiresExplicitPickOnMultiOutput) {
        if (imageCandidates.length === 0) {
          throw new Error('Generate at least one image output before applying back.');
        }
        if (imageCandidates.length > 1 && !selectedLinkedinNodeId) {
          throw new Error('Select one image output before applying.');
        }
        selectedCandidates =
          imageCandidates.length > 1
            ? imageCandidates.filter((candidate) => candidate.nodeId === selectedLinkedinNodeId)
            : [imageCandidates[0]];
      } else {
        const firstImage = imageCandidates[0];
        if (!firstImage) {
          throw new Error('Generate at least one image output before applying back.');
        }
        selectedCandidates = [firstImage];
      }

      const assets = await Promise.all(
        selectedCandidates.map(async (candidate, index) => {
          const source = await resolveCandidateSource(candidate.source);
          return {
            role: workflowSpec.outputMode === 'ordered' ? `slide_${index + 1}` : candidate.role,
            kind: candidate.kind,
            slideIndex: workflowSpec.outputMode === 'ordered' ? index : undefined,
            ...source,
          };
        }),
      );

      const requestPayload: PlannerAiStudioApplyRequest = {
        schemaVersion: 'planner_ai_apply_v1',
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

      const response = await fetch('/api/organic/ai-studio/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const responseJson = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          responseJson && typeof responseJson.error === 'string'
            ? responseJson.error
            : 'Failed to apply output to Planner.';
        throw new Error(message);
      }

      const parsed = plannerAiStudioApplyResponseSchema.safeParse(responseJson);
      if (!parsed.success) {
        throw new Error('Apply response payload is invalid.');
      }

      window.localStorage.setItem(
        buildPendingApplyStorageKey(organicPlannerSeed.draftId),
        JSON.stringify(parsed.data),
      );

      show({
        title: 'Applied to Planner',
        description: 'Returning to Organic Planner.',
        variant: 'success',
      });

      const params = new URLSearchParams({
        tab: 'planner',
        draftId: organicPlannerSeed.draftId,
        weekStartId: organicPlannerSeed.weekStartId,
        from: 'ai-studio',
      });
      router.push(`/organic?${params.toString()}`);
    } catch (error) {
      show({
        title: 'Apply failed',
        description: error instanceof Error ? error.message : 'Unable to apply output to Planner.',
        variant: 'error',
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
          // One fixed-height row held ~11 children that could neither wrap nor shrink, so
          // opening the Studio from the planner drew the readiness pill and the
          // Back/Apply buttons ON TOP of the workspace tabs (Airtable #224). The row
          // wraps now, each group keeps its own line, and the tabs scroll inside their
          // own box instead of painting outside the group that holds them.
          <div
            className="relative z-[100] flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background px-4 py-2"
            data-testid="studio-canvas-header"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
              <div className="flex shrink-0 items-center gap-2 text-lg font-bold">
                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  Continuum
                </span>
                <span className="font-normal text-muted-foreground">Studio</span>
              </div>
              <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
              <div
                data-tour-id="studio-multiplayer"
                className="flex min-w-0 shrink items-center gap-4"
              >
                <div className="flex h-10 items-center rounded-lg border border-primary/20 bg-primary/10 px-2 shadow-[0_0_15px_rgba(90,72,249,0.1)]">
                  <CanvasSyncStatus
                    status={realtime.status}
                    dbStatus={realtime.dbStatus}
                    isSaving={realtime.isSaving}
                    isCollaborative={realtime.isCollaborative}
                    roomsLoading={roomsLoading}
                    hasRoom={Boolean(activeRoomId)}
                  />
                  <div className="mx-1 h-4 w-px bg-primary/20" />
                  <ActiveUsersStack
                    onlineUsers={realtime.onlineUsers}
                    status={realtime.status as never}
                  />
                </div>
                <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
                <CanvasRoomsTabs
                  brandProfileId={brandProfileId || ''}
                  activeRoomId={activeRoomId}
                  onRoomChange={setActiveRoomId}
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {organicPlannerSeed ? (
                <>
                  {applyReadiness && workflowSummaryLabel ? (
                    <div className="hidden w-72 max-w-full items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 lg:flex">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge variant="outline" className="h-5 px-2 text-2xs">
                            {workflowSummaryLabel}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {applyReadiness.label}
                          </span>
                        </div>
                        <Progress
                          value={(applyReadiness.completed / applyReadiness.total) * 100}
                          className="h-1.5"
                        />
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
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
                  <Button type="button" size="sm" variant="outline" onClick={handleReturnToPlanner}>
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
                    {isApplyingBack ? 'Applying...' : 'Apply Back to Planner'}
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
          <CanvasRuntimeProvider value={canvasRuntime}>
            <Flow
              brandProfileId={brandProfileId}
              realtime={realtime}
              activeRoomId={activeRoomId}
              focusNodeId={focusNodeId}
              organicPlannerSeed={organicPlannerSeed}
            />
          </CanvasRuntimeProvider>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
