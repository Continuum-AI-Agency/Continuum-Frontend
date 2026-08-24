import { createNodeData, isStudioNodeType, type StudioNodeType } from '@continuum/contracts';

import { Edge as AiElementsEdge } from '@/components/ai-elements/edge';
import { ApiRenderBlock } from '../nodes/ApiRenderBlock';
import { AudioNode } from '../nodes/AudioNode';
import { ActionNode } from '../nodes/action/ActionNode';
import { DesignRefNode } from '../nodes/DesignRefNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { ElementNode } from '../nodes/ElementNode';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { ExportNode } from '../nodes/export/ExportNode';
import { FrameExtractBlock } from '../nodes/FrameExtractBlock';
import { HyperframesAgentBlock } from '../nodes/HyperframesAgentBlock';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { ImageNode } from '../nodes/ImageNode';
import { NoteNode } from '../nodes/NoteNode';
import { OmniGenBlock } from '../nodes/OmniGenBlock';
import { OrganicPublishBlock } from '../nodes/OrganicPublishBlock';
import { PlannerDraftBlock } from '../nodes/PlannerDraftBlock';
import { PaidPublisherBlock } from '../nodes/PublishingBlock';
import { RouterNode } from '../nodes/RouterNode';
import { StringNode } from '../nodes/StringNode';
import { TimelineEditorBlock } from '../nodes/TimelineEditorBlock';
import { VideoDecoderBlock } from '../nodes/VideoDecoderBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  getVideoGeneratorReferenceMode,
  type VideoGeneratorModel,
} from '../utils/videoModel';

// Typed on the contracts registry's `StudioNodeType`, NOT on the palette catalog's own
// hand-rolled union: the registry is what decides which node types exist, and taking the
// union from the catalog made adding a type here depend on editing a file the palette
// owns. Everything the catalog can name is a member of this union, so existing callers
// narrow to it unchanged.
//
// This set is the IMPLEMENTED subset — a type is here only once it has a component. The
// registry declares 27; `batch` and `layerEditor` have their vocabulary but not their
// runtime, and registering a type with no implementation is worse than leaving it out:
// React Flow renders nothing and the node looks broken rather than absent.
export const NODE_TYPES = new Set<StudioNodeType>([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'omniGen',
  'extendVideo',
  'hyperframesAgent',
  'timelineEditor',
  'plannerDraft',
  'organicPublish',
  'paidPublisher',
  'apiRender',
  'string',
  'note',
  'image',
  'audio',
  'document',
  'video',
  'videoDecode',
  'frameExtract',
  'action',
  'router',
  // Wave 3: terminal writer. `nodeTypes` below mounts it; the palette line in
  // addNodeCatalog.ts graduates it.
  'export',
  // Registered by the elements and design-reference shells in this same wave — their
  // components exist, so the declaration has to follow or the drift guard (rightly)
  // fails: a component in `nodeTypes` with no entry here is the exact half-landing
  // this file exists to catch.
  'element',
  'designRef',
]);

export const isStudioCanvasNodeType = (value: string): value is StudioNodeType =>
  isStudioNodeType(value) && NODE_TYPES.has(value);

export const createNodeConfig = (
  type: StudioNodeType,
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

  if (
    type === 'plannerDraft' ||
    type === 'organicPublish' ||
    type === 'paidPublisher' ||
    type === 'apiRender'
  ) {
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

  if (type === 'frameExtract') {
    return createNodeData('frameExtract');
  }

  // An action is born with NO op: contracts gives an `actionId: null` node no handles
  // and refuses every connection, which is the honest state for "you have not chosen
  // what this does yet". The palette always creates one with an op already set.
  if (type === 'action' || type === 'router' || type === 'element' || type === 'designRef') {
    return createNodeData(type);
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

export const nodeTypes = {
  nanoGen: ImageGenBlock,
  videoGen: VideoGenBlock,
  veoDirector: VideoGenBlock,
  veoFast: VideoGenBlock,
  omniGen: OmniGenBlock,
  extendVideo: ExtendVideoBlock,
  hyperframesAgent: HyperframesAgentBlock,
  timelineEditor: TimelineEditorBlock,
  plannerDraft: PlannerDraftBlock,
  organicPublish: OrganicPublishBlock,
  paidPublisher: PaidPublisherBlock,
  apiRender: ApiRenderBlock,
  string: StringNode,
  note: NoteNode,
  image: ImageNode,
  audio: AudioNode,
  document: DocumentNode,
  video: VideoReferenceNode,
  videoDecode: VideoDecoderBlock,
  frameExtract: FrameExtractBlock,
  action: ActionNode,
  designRef: DesignRefNode,
  element: ElementNode,
  export: ExportNode,
  router: RouterNode,
};

export const edgeTypes = {
  button: AiElementsEdge.DataType,
  dataType: AiElementsEdge.DataType,
};
