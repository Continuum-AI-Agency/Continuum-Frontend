import { createNodeData } from '@continuum/contracts';

import { Edge as AiElementsEdge } from '@/components/ai-elements/edge';
import { ApiRenderBlock } from '../nodes/ApiRenderBlock';
import { AudioNode } from '../nodes/AudioNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { FrameExtractBlock } from '../nodes/FrameExtractBlock';
import { HyperframesAgentBlock } from '../nodes/HyperframesAgentBlock';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { ImageNode } from '../nodes/ImageNode';
import { NoteNode } from '../nodes/NoteNode';
import { OmniGenBlock } from '../nodes/OmniGenBlock';
import { OrganicPublishBlock } from '../nodes/OrganicPublishBlock';
import { PlannerDraftBlock } from '../nodes/PlannerDraftBlock';
import { PaidPublisherBlock } from '../nodes/PublishingBlock';
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
import type { StudioCanvasNodeType } from './addNodeCatalog';

export const NODE_TYPES = new Set<StudioCanvasNodeType>([
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
]);

export const isStudioCanvasNodeType = (value: string): value is StudioCanvasNodeType =>
  NODE_TYPES.has(value as StudioCanvasNodeType);

export const createNodeConfig = (
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
};

export const edgeTypes = {
  button: AiElementsEdge.DataType,
  dataType: AiElementsEdge.DataType,
};
