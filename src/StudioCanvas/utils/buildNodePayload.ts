import type { Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { ExtendVideoPayload, GenerationPayload, NodeOutput } from '../types/execution';
import { BackendChatImageRequestPayload, BackendExtendVideoRequestPayload } from '@/lib/types/chatImage';
import { NanoGenNodeData, VideoGenNodeData, ExtendVideoNodeData } from '../types';
import { parseDataUrl } from './dataUrl';

const BRAND_PROFILE_ID = "default-brand";

function resolveInputValue(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[]
): { text?: string; image?: string; fileName?: string } | undefined {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle === handleId
  );

  if (!incomingEdge) return undefined;

  const sourceOutput = resolvedData.get(incomingEdge.source);
  if (sourceOutput) {
    if (sourceOutput.type === 'text') {
      return { text: sourceOutput.value };
    }
    if (sourceOutput.type === 'image') {
      return { image: sourceOutput.base64 };
    }
    return undefined;
  }

  const sourceNode = nodes.find(n => n.id === incomingEdge.source);
  if (sourceNode) {
    if (sourceNode.type === 'string' && sourceNode.data.value) {
      return { text: sourceNode.data.value as string };
    }
    if (sourceNode.type === 'image') {
      const parsed = parseDataUrl((sourceNode.data as any).image as string | undefined);
      if (parsed) {
        return {
          image: parsed.base64,
          fileName: (sourceNode.data as any).fileName,
        };
      }
    }
  }

  return undefined;
}

function resolveVideoInput(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[]
): { data: string; mimeType: string; filename?: string } | undefined {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle === handleId
  );

  if (!incomingEdge) return undefined;

  const sourceOutput = resolvedData.get(incomingEdge.source);
  if (sourceOutput?.type === 'video') {
    const parsed = parseDataUrl(sourceOutput.url);
    if (parsed?.base64) {
      return { data: parsed.base64, mimeType: parsed.mimeType };
    }
    return undefined;
  }

  const sourceNode = nodes.find(n => n.id === incomingEdge.source);
  if (sourceNode?.type === 'video') {
    const parsed = parseDataUrl((sourceNode.data as any).video as string | undefined);
    if (parsed?.base64) {
      return {
        data: parsed.base64,
        mimeType: parsed.mimeType,
        filename: (sourceNode.data as any).fileName,
      };
    }
  }

  return undefined;
}

export function buildNanoGenPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[]
): GenerationPayload | null {
  const data = node.data as NanoGenNodeData;

  let prompt = data.positivePrompt || "";
  const promptInput = resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges);
  if (promptInput?.text) {
    prompt = promptInput.text;
  }



  if (!prompt.trim()) {
    return null;
  }

  const refImageEdges = allEdges.filter(
    (e) => e.target === node.id && (e.targetHandle === 'ref-image' || e.targetHandle === 'ref-images')
  );
  const referenceImages = refImageEdges
    .map((edge) => {
      const output = resolvedData.get(edge.source);
      if (output?.type === 'image') {
        return {
          data: output.base64,
          mimeType: output.mimeType,
          weight: 1,
          referenceType: 'asset' as const,
        };
      }
      return null;
    })
    .filter(Boolean) as GenerationPayload['referenceImages'];

  const backendModel = data.model === 'nano-banana'
    ? 'gemini-2.5-flash-image'
    : data.model === 'nano-banana-pro'
      ? 'gemini-3-pro-image-preview'
      : data.model;

  return {
    brandId: BRAND_PROFILE_ID,
    model: backendModel,
    medium: 'image',
    prompt,
    negativePrompt: typeof data.negativePrompt === 'string' && data.negativePrompt.trim()
      ? data.negativePrompt
      : undefined,
    aspectRatio: data.aspectRatio || '16:9',
    resolution: '1024x1024',
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
  };
}

export function buildVeoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[]
): GenerationPayload | null {
  const data = node.data as VideoGenNodeData;

  let prompt = data.prompt || "";
  const promptInput = resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges) || resolveInputValue(node.id, 'prompt-in', resolvedData, allNodes, allEdges);
  if (promptInput?.text) {
    prompt = promptInput.text;
  }

  let negativePrompt = data.negativePrompt || "";
  const negativeInput = resolveInputValue(node.id, 'negative', resolvedData, allNodes, allEdges);
  if (negativeInput?.text) {
    negativePrompt = negativeInput.text;
  }

  if (!prompt.trim()) {
    return null;
  }

  const referenceMode = data.referenceMode ?? 'images';
  let firstFrame: GenerationPayload['firstFrame'] = undefined;
  let lastFrame: GenerationPayload['lastFrame'] = undefined;

  if (referenceMode === 'frames') {
    const frame0Input = resolveInputValue(node.id, 'frame-0', resolvedData, allNodes, allEdges);
    firstFrame = frame0Input?.image
      ? { data: frame0Input.image, mimeType: 'image/png', filename: frame0Input.fileName || 'frame-0.png' }
      : undefined;

    if (!firstFrame) {
        const legacyFirst = resolveInputValue(node.id, 'first-frame', resolvedData, allNodes, allEdges);
        if (legacyFirst?.image) {
            firstFrame = { data: legacyFirst.image, mimeType: 'image/png', filename: legacyFirst.fileName || 'frame-0.png' };
        }
    }

    const frameList = (data as any).frameList || [];
    if (!firstFrame && frameList[0]?.src) {
        firstFrame = { data: frameList[0].src, mimeType: 'image/png', filename: 'frame-0.png' };
    }

    const legacyLast = resolveInputValue(node.id, 'last-frame', resolvedData, allNodes, allEdges);
    if (legacyLast?.image) {
        lastFrame = { data: legacyLast.image, mimeType: 'image/png', filename: legacyLast.fileName || 'frame-last.png' };
    } else {
        for (let i = 8; i > 0; i--) {
            const frameInput = resolveInputValue(node.id, `frame-${i}`, resolvedData, allNodes, allEdges);
            if (frameInput?.image) {
                lastFrame = { data: frameInput.image, mimeType: 'image/png', filename: frameInput.fileName || `frame-${i}.png` };
                break;
            }
            if (frameList[i]?.src) {
                lastFrame = { data: frameList[i].src, mimeType: 'image/png', filename: `frame-${i}.png` };
                break;
            }
        }
    }
  }

  const referenceImages = referenceMode === 'images'
    ? allEdges
        .filter((e) => e.target === node.id && (e.targetHandle === 'ref-image' || e.targetHandle === 'ref-images'))
        .map((edge) => {
          const output = resolvedData.get(edge.source);
          if (output?.type === 'image') {
            return {
              data: output.base64,
              mimeType: output.mimeType,
              weight: 1,
              referenceType: 'asset' as const,
            };
          }
          return null;
        })
        .filter(Boolean) as GenerationPayload['referenceImages']
    : undefined;

  const backendModel = data.model === 'veo-3.1-fast'
    ? 'veo-3.1-fast-generate-preview'
    : 'veo-3.1-generate-preview';

  return {
    brandId: BRAND_PROFILE_ID,
    model: backendModel,
    medium: 'video',
    prompt,
    negativePrompt: negativePrompt || undefined,
    aspectRatio: '16:9',
    resolution: '720p',
    durationSeconds: 8,
    firstFrame,
    lastFrame,
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
  };
}

export function buildExtendVideoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[]
): ExtendVideoPayload | null {
  const data = node.data as ExtendVideoNodeData;

  const promptInput = resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges);
  const prompt = (promptInput?.text ?? data.prompt ?? '').trim();

  const videoInput = resolveVideoInput(node.id, 'video', resolvedData, allNodes, allEdges);
  if (!videoInput?.data) {
    return null;
  }

  return {
    brandId: BRAND_PROFILE_ID,
    service: 'veo-3.1',
    model: 'veo-3.1-generate-preview',
    prompt,
    aspectRatio: '16:9',
    resolution: '720p',
    video: {
      data: videoInput.data,
      mimeType: videoInput.mimeType,
      filename: videoInput.filename,
    },
  };
}

export function toBackendPayload(payload: GenerationPayload): BackendChatImageRequestPayload {
  return {
    brand_id: payload.brandId,
    model: payload.model as any,
    medium: payload.medium,
    prompt: payload.prompt,
    aspect_ratio: payload.aspectRatio || '16:9',
    resolution: payload.resolution,
    duration_seconds: payload.durationSeconds ? String(payload.durationSeconds) as "4" | "6" | "8" : undefined,
    negative_prompt: payload.negativePrompt,
    first_frame: payload.firstFrame
      ? { data: payload.firstFrame.data, mime_type: payload.firstFrame.mimeType, filename: payload.firstFrame.filename }
      : undefined,
    last_frame: payload.lastFrame
      ? { data: payload.lastFrame.data, mime_type: payload.lastFrame.mimeType, filename: payload.lastFrame.filename }
      : undefined,
    reference_images: payload.referenceImages?.map((img) => ({
      data: img.data,
      mime_type: img.mimeType,
      filename: img.filename,
      weight: img.weight,
      referenceType: img.referenceType,
    })),
  };
}

export function toBackendExtendVideoPayload(
  payload: ExtendVideoPayload
): BackendExtendVideoRequestPayload {
  const videoPayload = 'data' in payload.video
    ? {
        data: payload.video.data,
        mime_type: payload.video.mimeType,
        filename: payload.video.filename,
      }
    : { uri: payload.video.uri };

  return {
    service: payload.service,
    model: payload.model,
    prompt: payload.prompt,
    brand_id: payload.brandId,
    aspect_ratio: payload.aspectRatio,
    resolution: payload.resolution,
    video: videoPayload,
  };
}
