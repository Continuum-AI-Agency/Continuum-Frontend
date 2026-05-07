import type { Edge } from '@xyflow/react';
import { StudioNode } from '../types';
import { EnrichPromptPayload, ExtendVideoInput, ExtendVideoPayload, GenerationPayload, NodeOutput } from '../types/execution';
import { BackendChatImageRequestPayload, BackendExtendVideoRequestPayload } from '@/lib/types/chatImage';
import { NanoGenNodeData, VideoGenNodeData, ExtendVideoNodeData, StringNodeData, ImageNodeData } from '../types';
import { parseDataUrl } from './dataUrl';
import { compositeImages } from './compositeImages';
import {
  getVideoGeneratorBackendModel,
  getVideoGeneratorReferenceMode,
  supportsVideoGeneratorFrameInputs,
  supportsVideoGeneratorReferenceVideo,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
} from './videoModel';

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
): { data: string; mimeType: string; filename?: string; sourcePath?: string; sourceUrl?: string } | undefined {
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
        sourcePath: (sourceNode.data as any).sourcePath,
        sourceUrl: (sourceNode.data as any).sourceUrl,
      };
    }
  }

  return undefined;
}

function resolveExtendVideoInput(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[]
): ExtendVideoInput | undefined {
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
    if (typeof sourceOutput.url === 'string' && sourceOutput.url.trim()) {
      return { uri: sourceOutput.url.trim() };
    }
    return undefined;
  }

  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (sourceNode?.type === 'video') {
    const rawVideo = (sourceNode.data as any).video as string | undefined;
    const parsed = parseDataUrl(rawVideo);
    if (parsed?.base64) {
      return {
        data: parsed.base64,
        mimeType: parsed.mimeType,
        filename: (sourceNode.data as any).fileName,
      };
    }
    if (typeof rawVideo === 'string' && rawVideo.trim()) {
      return { uri: rawVideo.trim() };
    }
    return undefined;
  }

  if (isVideoGeneratorNodeType(sourceNode?.type) || sourceNode?.type === 'extendVideo') {
    const generatedVideo = (sourceNode.data as any).generatedVideo as string | undefined;
    const generatedVideoUrl = (sourceNode.data as any).generatedVideoUrl as string | undefined;
    const parsed = parseDataUrl(generatedVideo);
    if (parsed?.base64) {
      return { data: parsed.base64, mimeType: parsed.mimeType };
    }
    const fallbackUri = (typeof generatedVideo === 'string' && generatedVideo.trim()) || (typeof generatedVideoUrl === 'string' && generatedVideoUrl.trim());
    if (fallbackUri) {
      return { uri: fallbackUri };
    }
  }

  return undefined;
}

async function resolveImageInput(
  edge: Edge,
  resolvedData: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>
): Promise<{ base64: string; mimeType: string; sourcePath?: string; sourceUrl?: string } | undefined> {
  const output = resolvedData.get(edge.source);
  if (output?.type === 'image' && output.base64) {
    return { base64: output.base64, mimeType: output.mimeType };
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'image') {
    const imageData = sourceNode.data as ImageNodeData;
    
    if (imageData.markupLayer && imageData.originalImage) {
      try {
        const composited = await compositeImages(imageData.originalImage, imageData.markupLayer);
        return {
          base64: composited.base64,
          mimeType: composited.mimeType,
          sourcePath: imageData.sourcePath,
          sourceUrl: imageData.sourceUrl,
        };
      } catch (error) {
        console.error('Failed to composite image with markup:', error);
      }
    }
    
    const parsed = parseDataUrl(imageData.image);
    if (parsed?.base64) {
      return {
        base64: parsed.base64,
        mimeType: parsed.mimeType,
        sourcePath: imageData.sourcePath,
        sourceUrl: imageData.sourceUrl,
      };
    }
  }

  return undefined;
}

function resolveAudioInput(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[]
): { base64: string; mimeType: string } | undefined {
  const incomingEdge = edges.find(
    (e) => e.target === nodeId && e.targetHandle === handleId
  );

  if (!incomingEdge) return undefined;

  const sourceNode = nodes.find(n => n.id === incomingEdge.source);
  if (sourceNode?.type === 'audio') {
    const parsed = parseDataUrl((sourceNode.data as any).audio as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  return undefined;
}

function resolveDocumentInput(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[]
): Array<{ name: string; content: string }> | undefined {
  const incomingEdges = edges.filter(
    (e) => e.target === nodeId && e.targetHandle === handleId
  );

  if (incomingEdges.length === 0) return undefined;

  const documents: Array<{ name: string; content: string }> = [];

  for (const edge of incomingEdges) {
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (sourceNode?.type === 'document') {
        const docs = (sourceNode.data as any).documents || [];
        for (const doc of docs) {
            if (doc.content) {
                documents.push({ name: doc.name || 'document', content: doc.content });
            }
        }
    }
  }

  return documents.length > 0 ? documents : undefined;
}


export async function buildEnrichPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string
): Promise<EnrichPromptPayload | null> {
  const data = node.data as StringNodeData;
  const prompt = data.value || "";

  // Resolve Images (Multiple allowed)
  const imageEdges = allEdges.filter(
    (e) => e.target === node.id && e.targetHandle === 'image'
  );
  
  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  const imagePromises = imageEdges.map(edge => resolveImageInput(edge, resolvedData, nodeById as Map<string, StudioNode>));
  const images = (await Promise.all(imagePromises)).filter(Boolean);

  // Resolve Audio (Single)
  const audio = resolveAudioInput(node.id, 'audio', resolvedData, allNodes, allEdges);

  const video = resolveVideoInput(node.id, 'video', resolvedData, allNodes, allEdges);

  // Resolve Documents (Multiple)
  const documents = resolveDocumentInput(node.id, 'document', resolvedData, allNodes, allEdges);

  if (!prompt && !images.length && !audio && !documents?.length && !video) {
    if (node.type === 'string') {
       // BDD: Given a string node, when all input handles are empty, then return an empty payload to trigger fast enrichment.
    } else {
       return null;
    }
  }

  return {
    prompt,
    brandId,
    context: {
      images: images.length > 0
        ? images.map((img) => ({
            type: 'base64' as const,
            data: img!.base64,
            mimeType: img!.mimeType,
            sourcePath: img!.sourcePath,
            sourceUrl: img!.sourceUrl,
          }))
        : undefined,
      audio: audio ? { type: 'base64' as const, data: audio.base64, mimeType: audio.mimeType } : undefined,
      video: video
        ? {
            type: 'base64' as const,
            data: video.data,
            mimeType: video.mimeType,
            sourcePath: video.sourcePath,
            sourceUrl: video.sourceUrl,
          }
        : undefined,
      documents: documents,
    }
  };
}

export function buildNanoGenPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string
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

  const injectionParts: string[] = [];

  const referenceImages = refImageEdges
    .map((edge, index) => {
      const output = resolvedData.get(edge.source);
      const sourceNode = allNodes.find(n => n.id === edge.source);
      const refType = (sourceNode?.data as ImageNodeData)?.referenceType || 'default';

      if (refType !== 'default') {
          const refNumber = index + 1;
          if (refType === 'product') {
              injectionParts.push(`Ref. Image #${refNumber} is the primary Product to feature.`);
          } else if (refType === 'color') {
              injectionParts.push(`Ref. Image #${refNumber} provides the Color/Theme to generate in compliance with.`);
          } else if (refType === 'person') {
              injectionParts.push(`Ref. Image #${refNumber} is a Person/Character that must appear in the generation.`);
          }
      }

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

  if (injectionParts.length > 0) {
      prompt += `\n\n[System Context Injection]\n${injectionParts.join('\n')}`;
  }

  const backendModel = data.model === 'nano-banana'
    ? 'gemini-2.5-flash-image'
    : data.model === 'nano-banana-pro'
      ? 'gemini-3-pro-image-preview'
      : data.model === 'nano-banana-2'
        ? 'gemini-3.1-flash-image-preview'
        : data.model === 'gpt-image-2'
          ? 'openai/gpt-image-2/edit'
          : data.model === 'flux-2-pro'
            ? 'fal-ai/flux-2-pro/edit'
            : data.model === 'flux-2-max'
              ? 'fal-ai/flux-2-max/edit'
              : data.model;
  const isHighFidelityNanoModel = data.model === 'nano-banana-pro' || data.model === 'nano-banana-2';
  const imageSize = data.model === 'nano-banana-pro'
    ? (data.imageSize === '1K' || data.imageSize === '2K' || data.imageSize === '4K' ? data.imageSize : '1K')
    : data.model === 'nano-banana-2'
      ? (data.imageSize || '512px')
      : undefined;
  const resolution = data.model === 'nano-banana'
    ? '1024x1024'
    : imageSize === '512px'
      ? '512x512'
      : imageSize === '2K'
        ? '2048x2048'
        : imageSize === '4K'
          ? '4096x4096'
          : '1024x1024';

  return {
    brandId,
    model: backendModel,
    medium: 'image',
    prompt,
    negativePrompt: typeof data.negativePrompt === 'string' && data.negativePrompt.trim()
      ? data.negativePrompt
      : undefined,
    aspectRatio: data.aspectRatio || '16:9',
    resolution,
    imageSize: isHighFidelityNanoModel ? imageSize : undefined,
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
  };
}

export function buildVeoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string
): GenerationPayload | null {
  const data = node.data as VideoGenNodeData;
  const model = resolveVideoGeneratorModel(node);
  const referenceMode = getVideoGeneratorReferenceMode(model);

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

  let firstFrame: GenerationPayload['firstFrame'] = undefined;
  let lastFrame: GenerationPayload['lastFrame'] = undefined;
  let referenceVideo: GenerationPayload['referenceVideo'] = undefined;
  let imageReferences: GenerationPayload['imageReferences'] = undefined;

  if (supportsVideoGeneratorFrameInputs(model)) {
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

  if (supportsVideoGeneratorReferenceVideo(model)) {
    const refVideoInput = resolveVideoInput(node.id, 'ref-video', resolvedData, allNodes, allEdges);
    if (refVideoInput?.data) {
      referenceVideo = {
        data: refVideoInput.data,
        mimeType: refVideoInput.mimeType,
        filename: refVideoInput.filename || 'reference-video.mp4',
      };
    }
  }

  const referenceImages = referenceMode === 'images' || model === 'kling-omni'
    ? (() => {
        const edges = allEdges.filter((e) => e.target === node.id && (e.targetHandle === 'ref-image' || e.targetHandle === 'ref-images'));
        const injectionParts: string[] = [];
        
        const refs = edges.map((edge, index) => {
          const output = resolvedData.get(edge.source);
          const sourceNode = allNodes.find(n => n.id === edge.source);
          const refType = (sourceNode?.data as ImageNodeData)?.referenceType || 'default';

          if (refType !== 'default') {
              const refNumber = index + 1;
              if (refType === 'product') {
                  injectionParts.push(`Ref. Image #${refNumber} is the primary Product to feature.`);
              } else if (refType === 'color') {
                  injectionParts.push(`Ref. Image #${refNumber} provides the Color/Theme to generate in compliance with.`);
              } else if (refType === 'person') {
                  injectionParts.push(`Ref. Image #${refNumber} is a Person/Character that must appear in the generation.`);
              }
          }

          if (output?.type === 'image') {
            return {
              data: output.base64,
              mimeType: output.mimeType,
              weight: 1,
              referenceType: 'asset' as const,
            };
          }
          return null;
        }).filter(Boolean) as GenerationPayload['referenceImages'];

        if (injectionParts.length > 0) {
            prompt += `\n\n[System Context Injection]\n${injectionParts.join('\n')}`;
        }
        return refs;
    })()
    : undefined;

  if (model === 'seedance-2.0') {
    const mappedImageReferences = referenceImages?.map((image, index) => ({
      data: image.data,
      mimeType: image.mimeType,
      filename: image.filename ?? `seedance-ref-${index + 1}.png`,
    }));

    imageReferences = mappedImageReferences && mappedImageReferences.length > 0
      ? mappedImageReferences
      : undefined;
  }

  const backendModel = getVideoGeneratorBackendModel(model);

  return {
    brandId,
    model: backendModel,
    medium: 'video',
    prompt,
    negativePrompt: negativePrompt || undefined,
    aspectRatio: data.aspectRatio || '16:9',
    resolution: (data as any).resolution || '720p',
    durationSeconds: data.durationSeconds ? Number(data.durationSeconds) : 8,
    firstFrame,
    lastFrame,
    referenceVideo,
    imageReferences,
    // seedance-2.0 uses imageReferences (data/mimeType/filename); original referenceImages intentionally omitted to avoid duplicate payload
    referenceImages: model !== 'seedance-2.0' && referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
  };
}

export function buildExtendVideoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string
): ExtendVideoPayload | null {
  const data = node.data as ExtendVideoNodeData;

  const promptInput = resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges);
  const prompt = (promptInput?.text ?? data.prompt ?? '').trim();

  const videoInput = resolveExtendVideoInput(node.id, 'video', resolvedData, allNodes, allEdges);
  if (!videoInput) {
    return null;
  }

  return {
    brandId,
    service: 'veo-3.1',
    model: 'veo-3.1-generate-preview',
    prompt,
    aspectRatio: '16:9',
    resolution: '720p',
    video: videoInput,
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
    image_size: payload.imageSize,
    duration_seconds: payload.durationSeconds ? String(payload.durationSeconds) as "4" | "6" | "8" : undefined,
    negative_prompt: payload.negativePrompt,
    first_frame: payload.firstFrame
      ? { data: payload.firstFrame.data, mime_type: payload.firstFrame.mimeType, filename: payload.firstFrame.filename }
      : undefined,
    last_frame: payload.lastFrame
      ? { data: payload.lastFrame.data, mime_type: payload.lastFrame.mimeType, filename: payload.lastFrame.filename }
      : undefined,
    reference_video: payload.referenceVideo
      ? { data: payload.referenceVideo.data, mime_type: payload.referenceVideo.mimeType, filename: payload.referenceVideo.filename }
      : undefined,
    image_references: payload.imageReferences?.map((image) => ({
      data: image.data,
      mime_type: image.mimeType,
      filename: image.filename,
    })),
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
