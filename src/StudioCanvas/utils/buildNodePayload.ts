import { coerceImageSize, imageResolutionFor } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type {
  BackendChatImageRequestPayload,
  BackendExtendVideoRequestPayload,
} from '@/lib/types/chatImage';
import type {
  ExtendVideoNodeData,
  ImageNodeData,
  NanoGenNodeData,
  StringNodeData,
  StudioNode,
  VideoGenNodeData,
} from '../types';
import type {
  EnrichPromptPayload,
  ExtendVideoInput,
  ExtendVideoPayload,
  GenerationPayload,
  NodeOutput,
} from '../types/execution';
import { DEFAULT_BRAND_BOOK_PIECES, effectiveBrandBookPieces } from './brandEnforcement';
import { compositeImages } from './compositeImages';
import { parseDataUrl } from './dataUrl';
import {
  getVideoGeneratorBackendModel,
  getVideoGeneratorReferenceMode,
  isVideoGeneratorNodeType,
  resolveVideoGeneratorModel,
  supportsVideoGeneratorFrameInputs,
  supportsVideoGeneratorReferenceVideo,
} from './videoModel';

// A reference image for a generation/enrich payload. A signed `imageUrl` is the
// source of truth; base64 `data` is the emergency fallback (un-uploaded media).
// `storageBucket`/`storagePath` accompany a generated canvas image so the Backend
// can download the bytes via the service-role client instead of fetching a signed
// URL that may have expired or is not publicly reachable.
type ImageRef = {
  data?: string;
  imageUrl?: string;
  mimeType: string;
  storageBucket?: string;
  storagePath?: string;
};

const isHttpUrl = (value?: string | null): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const imageRefFromOutput = (output: NodeOutput | undefined): ImageRef | undefined => {
  if (output?.type !== 'image') return undefined;
  if (output.base64) return { data: output.base64, mimeType: output.mimeType };
  if (isHttpUrl(output.url)) {
    return {
      imageUrl: output.url.trim(),
      mimeType: output.mimeType,
      storageBucket: output.storageBucket,
      storagePath: output.storagePath,
    };
  }
  return undefined;
};

// The Library asset ids behind a node's reference images. Reference nodes carry
// `assetId` once they come from the Library (dragged in, uploaded, or seeded by
// "Open in Canvas"); a node with no assetId is a loose file with no performance
// history, and is simply omitted rather than guessed at.
const collectReferenceAssetIds = (
  edges: Edge[],
  allNodes: { id: string; data?: unknown }[],
): string[] => {
  const ids = edges
    .map((edge) => allNodes.find((n) => n.id === edge.source))
    .map((node) => (node?.data as ImageNodeData | undefined)?.assetId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
};

const imageRefFromValue = (
  value: string | undefined,
  fallbackMime = 'image/png',
): ImageRef | undefined => {
  const parsed = parseDataUrl(value);
  if (parsed?.base64) return { data: parsed.base64, mimeType: parsed.mimeType };
  if (isHttpUrl(value)) return { imageUrl: value.trim(), mimeType: fallbackMime };
  return undefined;
};

function resolveInputValue(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[],
): { text?: string; image?: string; imageUrl?: string; fileName?: string } | undefined {
  const incomingEdge = edges.find((e) => e.target === nodeId && e.targetHandle === handleId);

  if (!incomingEdge) return undefined;

  const sourceOutput = resolvedData.get(incomingEdge.source);
  if (sourceOutput) {
    if (sourceOutput.type === 'text') {
      return { text: sourceOutput.value };
    }
    if (sourceOutput.type === 'image') {
      const ref = imageRefFromOutput(sourceOutput);
      return ref ? { image: ref.data, imageUrl: ref.imageUrl } : undefined;
    }
    return undefined;
  }

  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (sourceNode) {
    if (sourceNode.type === 'string' && sourceNode.data.value) {
      return { text: sourceNode.data.value as string };
    }
    if (sourceNode.type === 'image') {
      const ref = imageRefFromValue((sourceNode.data as any).image as string | undefined);
      if (ref) {
        return {
          image: ref.data,
          imageUrl: ref.imageUrl,
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
  edges: Edge[],
):
  | {
      data?: string;
      mimeType: string;
      filename?: string;
      sourcePath?: string;
      sourceUrl?: string;
    }
  | undefined {
  const incomingEdge = edges.find((e) => e.target === nodeId && e.targetHandle === handleId);

  if (!incomingEdge) return undefined;

  const sourceOutput = resolvedData.get(incomingEdge.source);
  if (sourceOutput?.type === 'video') {
    const parsed = parseDataUrl(sourceOutput.url);
    if (parsed?.base64) {
      return { data: parsed.base64, mimeType: parsed.mimeType };
    }
    if (sourceOutput.url.trim()) {
      return {
        mimeType: 'video/mp4',
        sourceUrl: sourceOutput.url.trim(),
        sourcePath: sourceOutput.storagePath,
      };
    }
    return undefined;
  }

  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
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
    const sourceUrl =
      (typeof (sourceNode.data as any).sourceUrl === 'string' &&
        (sourceNode.data as any).sourceUrl.trim()) ||
      (typeof (sourceNode.data as any).video === 'string' && (sourceNode.data as any).video.trim());
    if (sourceUrl) {
      return {
        mimeType: 'video/mp4',
        filename: (sourceNode.data as any).fileName,
        sourcePath: (sourceNode.data as any).sourcePath,
        sourceUrl,
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
  edges: Edge[],
): ExtendVideoInput | undefined {
  const incomingEdge = edges.find((e) => e.target === nodeId && e.targetHandle === handleId);

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
    const fallbackUri =
      (typeof generatedVideo === 'string' && generatedVideo.trim()) ||
      (typeof generatedVideoUrl === 'string' && generatedVideoUrl.trim());
    if (fallbackUri) {
      return { uri: fallbackUri };
    }
  }

  return undefined;
}

async function resolveImageInput(
  edge: Edge,
  resolvedData: Map<string, NodeOutput>,
  nodeById: Map<string, StudioNode>,
): Promise<
  | { data?: string; imageUrl?: string; mimeType: string; sourcePath?: string; sourceUrl?: string }
  | undefined
> {
  const output = resolvedData.get(edge.source);
  const outputRef = imageRefFromOutput(output);
  if (outputRef) {
    return { data: outputRef.data, imageUrl: outputRef.imageUrl, mimeType: outputRef.mimeType };
  }

  const sourceNode = nodeById.get(edge.source);
  if (sourceNode?.type === 'image') {
    const imageData = sourceNode.data as ImageNodeData;

    if (imageData.markupLayer && imageData.originalImage) {
      try {
        const composited = await compositeImages(imageData.originalImage, imageData.markupLayer);
        return {
          data: composited.base64,
          mimeType: composited.mimeType,
          sourcePath: imageData.sourcePath,
          sourceUrl: imageData.sourceUrl,
        };
      } catch (error) {
        console.error('Failed to composite image with markup:', error);
      }
    }

    const ref = imageRefFromValue(imageData.image);
    if (ref) {
      return {
        data: ref.data,
        imageUrl: ref.imageUrl,
        mimeType: ref.mimeType,
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
  edges: Edge[],
): { base64: string; mimeType: string } | undefined {
  const incomingEdge = edges.find((e) => e.target === nodeId && e.targetHandle === handleId);

  if (!incomingEdge) return undefined;

  const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
  if (sourceNode?.type === 'audio') {
    const parsed = parseDataUrl((sourceNode.data as any).audio as string | undefined);
    if (parsed?.base64) {
      return { base64: parsed.base64, mimeType: parsed.mimeType };
    }
  }

  return undefined;
}

// Resolved document entry for the enrich/generation payload. The server reads
// these in priority order: extractedText > sourceUrl > sourceDocumentId > content.
type ResolvedDocument = {
  name: string;
  // Pre-extracted text (brand_documents with pre-parsed chunks; best path).
  extractedText?: string;
  // Signed storage URL (server fetches and reads the file).
  sourceUrl?: string;
  // brand_profiles.brand_documents row id (server loads pre-extracted chunks).
  sourceDocumentId?: string;
  // Base64 data URL (last-resort fallback for locally-uploaded files).
  content?: string;
  type: 'pdf' | 'txt';
};

function resolveDocumentInput(
  nodeId: string,
  handleId: string,
  resolvedData: Map<string, NodeOutput>,
  nodes: StudioNode[],
  edges: Edge[],
): ResolvedDocument[] | undefined {
  const incomingEdges = edges.filter((e) => e.target === nodeId && e.targetHandle === handleId);

  if (incomingEdges.length === 0) return undefined;

  const documents: ResolvedDocument[] = [];

  for (const edge of incomingEdges) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (sourceNode?.type !== 'document') continue;
    const docs = (sourceNode.data as any).documents || [];
    for (const doc of docs) {
      // Only include if there is at least one data source to read.
      const hasSource = doc.extractedText || doc.sourceUrl || doc.sourceDocumentId || doc.content;
      if (!hasSource) continue;
      documents.push({
        name: doc.name || 'document',
        extractedText: doc.extractedText ?? undefined,
        sourceUrl: doc.sourceUrl ?? undefined,
        sourceDocumentId: doc.sourceDocumentId ?? undefined,
        content: doc.content ?? undefined,
        type: doc.type ?? 'txt',
      });
    }
  }

  return documents.length > 0 ? documents : undefined;
}

const normalizeVeoResolution = (model: VideoGenNodeData['model'], resolution?: string): string => {
  if (
    (model === 'veo-3.1' || model === 'veo-3.1-fast' || model === 'veo-3.1-lite') &&
    resolution === '4K'
  ) {
    return '4k';
  }
  return resolution || '720p';
};

// Enrichment inherits its grounding from the generation node the text box feeds:
// the same skills + brand-book pieces that node would generate with, so the
// enriched prompt reflects the actual output. Falls back to the default-ON brand
// book (no skills) when the text box is not yet wired to a generator. Takes the
// first connected generator when several are downstream.
export function resolveInheritedGrounding(
  nodeId: string,
  allNodes: StudioNode[],
  allEdges: Edge[],
): Pick<EnrichPromptPayload, 'skillIds' | 'brandBookPieces'> {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const targetGenNode = allEdges
    .filter((edge) => edge.source === nodeId)
    .map((edge) => nodeById.get(edge.target))
    .find(
      (candidate): candidate is StudioNode =>
        !!candidate && (candidate.type === 'nanoGen' || isVideoGeneratorNodeType(candidate.type)),
    );

  if (targetGenNode) {
    const genData = targetGenNode.data as NanoGenNodeData | VideoGenNodeData;
    return {
      skillIds: genData.skillIds && genData.skillIds.length > 0 ? genData.skillIds : undefined,
      brandBookPieces: effectiveBrandBookPieces(genData.brandBookPieces),
    };
  }

  return { brandBookPieces: DEFAULT_BRAND_BOOK_PIECES };
}

export interface BuildEnrichPayloadOptions {
  /**
   * Enrich even a `promptMode: 'literal'` node.
   *
   * Literal mode exists to stop a whole-graph RUN spending a second model call
   * re-enriching a prompt the composer already wrote generation-ready. It was
   * never meant to disable the node's own "Enrich Prompt" button — but because
   * the button routes through the same builder, every composer-authored node
   * came out permanently un-enrichable. An explicitly targeted enrich sets this.
   */
  ignoreLiteralMode?: boolean;
}

export async function buildEnrichPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string,
  options: BuildEnrichPayloadOptions = {},
): Promise<EnrichPromptPayload | null> {
  const data = node.data as StringNodeData;
  const prompt = data.value || '';

  if (data.promptMode === 'literal' && !options.ignoreLiteralMode) return null;

  // Resolve Images (Multiple allowed)
  const imageEdges = allEdges.filter((e) => e.target === node.id && e.targetHandle === 'image');

  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const imagePromises = imageEdges.map((edge) =>
    resolveImageInput(edge, resolvedData, nodeById as Map<string, StudioNode>),
  );
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

  const grounding = resolveInheritedGrounding(node.id, allNodes, allEdges);

  return {
    prompt,
    brandId,
    ...grounding,
    context: {
      images:
        images.length > 0
          ? images.map((img) => ({
              type: (img!.imageUrl ? 'url' : 'base64') as 'url' | 'base64',
              data: img!.data,
              imageUrl: img!.imageUrl,
              mimeType: img!.mimeType,
              sourcePath: img!.sourcePath,
              sourceUrl: img!.sourceUrl,
            }))
          : undefined,
      audio: audio
        ? { type: 'base64' as const, data: audio.base64, mimeType: audio.mimeType }
        : undefined,
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
    },
  };
}

export function buildNanoGenPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string,
): GenerationPayload | null {
  const data = node.data as NanoGenNodeData;

  let prompt = data.positivePrompt || '';
  const promptInput = resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges);
  if (promptInput?.text) {
    prompt = promptInput.text;
  }

  if (!prompt.trim()) {
    return null;
  }

  const refImageEdges = allEdges.filter(
    (e) =>
      e.target === node.id && (e.targetHandle === 'ref-image' || e.targetHandle === 'ref-images'),
  );

  const injectionParts: string[] = [];

  const referenceImages = refImageEdges
    .map((edge, index) => {
      const output = resolvedData.get(edge.source);
      const sourceNode = allNodes.find((n) => n.id === edge.source);
      const refType = (sourceNode?.data as ImageNodeData)?.referenceType || 'default';

      if (refType !== 'default') {
        const refNumber = index + 1;
        if (refType === 'product') {
          injectionParts.push(`Ref. Image #${refNumber} is the primary Product to feature.`);
        } else if (refType === 'color') {
          injectionParts.push(
            `Ref. Image #${refNumber} provides the Color/Theme to generate in compliance with.`,
          );
        } else if (refType === 'person') {
          injectionParts.push(
            `Ref. Image #${refNumber} is a Person/Character that must appear in the generation.`,
          );
        }
      }

      const ref = imageRefFromOutput(output);
      if (ref) {
        return {
          data: ref.data,
          imageUrl: ref.imageUrl,
          mimeType: ref.mimeType,
          storageBucket: ref.storageBucket,
          storagePath: ref.storagePath,
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

  // The Library ids of the creatives feeding this generation. The Backend looks up
  // what they actually EARNED and folds it into the prompt (<asset_performance>),
  // so a variant is made knowing how the original performed instead of blind.
  const referenceAssetIds = collectReferenceAssetIds(refImageEdges, allNodes);

  const backendModel =
    data.model === 'nano-banana'
      ? 'gemini-2.5-flash-image'
      : data.model === 'nano-banana-pro'
        ? 'gemini-3-pro-image'
        : data.model === 'nano-banana-2'
          ? 'gemini-3.1-flash-image'
          : data.model === 'gpt-image-2'
            ? 'openai/gpt-image-2/edit'
            : data.model === 'flux-2-pro'
              ? 'fal-ai/flux-2-pro/edit'
              : data.model === 'flux-2-max'
                ? 'fal-ai/flux-2-max/edit'
                : data.model;
  // The size the model will actually be sent. Every value that is not legal FOR THIS
  // MODEL — an agent-written "1024px", a 512px left behind by a switch to Pro — is
  // corrected here rather than travelling on to a 400. `undefined` means the model
  // takes no size at all (gemini-2.5-flash-image always renders 1024px).
  const imageSize = coerceImageSize(data.model, data.imageSize);
  const resolution = imageResolutionFor(data.model, imageSize);

  let negativePrompt = typeof data.negativePrompt === 'string' ? data.negativePrompt : '';
  const negativeInput = resolveInputValue(node.id, 'negative', resolvedData, allNodes, allEdges);
  if (negativeInput?.text) {
    negativePrompt = negativeInput.text;
  }

  return {
    brandId,
    model: backendModel,
    medium: 'image',
    prompt,
    negativePrompt: negativePrompt.trim() ? negativePrompt : undefined,
    aspectRatio: data.aspectRatio || '16:9',
    resolution,
    imageSize,
    referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
    referenceAssetIds: referenceAssetIds.length > 0 ? referenceAssetIds : undefined,
    skillIds: data.skillIds && data.skillIds.length > 0 ? data.skillIds : undefined,
    brandBookPieces: effectiveBrandBookPieces(data.brandBookPieces),
  };
}

export function buildVeoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string,
): GenerationPayload | null {
  const data = node.data as VideoGenNodeData;
  const model = resolveVideoGeneratorModel(node);
  const referenceMode = getVideoGeneratorReferenceMode(model);

  let prompt = data.prompt || '';
  const promptInput =
    resolveInputValue(node.id, 'prompt', resolvedData, allNodes, allEdges) ||
    resolveInputValue(node.id, 'prompt-in', resolvedData, allNodes, allEdges);
  if (promptInput?.text) {
    prompt = promptInput.text;
  }

  let negativePrompt = data.negativePrompt || '';
  const negativeInput = resolveInputValue(node.id, 'negative', resolvedData, allNodes, allEdges);
  if (negativeInput?.text) {
    negativePrompt = negativeInput.text;
  }

  if (!prompt.trim()) {
    return null;
  }

  let firstFrame: GenerationPayload['firstFrame'];
  let lastFrame: GenerationPayload['lastFrame'];
  let referenceVideo: GenerationPayload['referenceVideo'];
  let imageReferences: GenerationPayload['imageReferences'];

  const frameFromInput = (
    input: { image?: string; imageUrl?: string; fileName?: string } | undefined,
    filename: string,
  ): GenerationPayload['firstFrame'] | undefined => {
    if (input?.image)
      return { data: input.image, mimeType: 'image/png', filename: input.fileName || filename };
    if (input?.imageUrl)
      return {
        imageUrl: input.imageUrl,
        mimeType: 'image/png',
        filename: input.fileName || filename,
      };
    return undefined;
  };

  const frameFromValue = (
    value: string | undefined,
    filename: string,
  ): GenerationPayload['firstFrame'] | undefined => {
    const ref = imageRefFromValue(value);
    if (!ref) return undefined;
    return { data: ref.data, imageUrl: ref.imageUrl, mimeType: 'image/png', filename };
  };

  if (supportsVideoGeneratorFrameInputs(model)) {
    const frame0Input = resolveInputValue(node.id, 'frame-0', resolvedData, allNodes, allEdges);
    firstFrame = frameFromInput(frame0Input, 'frame-0.png');

    if (!firstFrame) {
      const legacyFirst = resolveInputValue(
        node.id,
        'first-frame',
        resolvedData,
        allNodes,
        allEdges,
      );
      firstFrame = frameFromInput(legacyFirst, 'frame-0.png');
    }

    const frameList = (data as any).frameList || [];
    if (!firstFrame && frameList[0]?.src) {
      firstFrame = frameFromValue(frameList[0].src, 'frame-0.png') ?? undefined;
    }

    const legacyLast = resolveInputValue(node.id, 'last-frame', resolvedData, allNodes, allEdges);
    const legacyLastFrame = frameFromInput(legacyLast, 'frame-last.png');
    if (legacyLastFrame) {
      lastFrame = legacyLastFrame;
    } else {
      for (let i = 8; i > 0; i--) {
        const frameInput = resolveInputValue(
          node.id,
          `frame-${i}`,
          resolvedData,
          allNodes,
          allEdges,
        );
        const frameFrame = frameFromInput(frameInput, `frame-${i}.png`);
        if (frameFrame) {
          lastFrame = frameFrame;
          break;
        }
        if (frameList[i]?.src) {
          lastFrame = frameFromValue(frameList[i].src, `frame-${i}.png`) ?? undefined;
          break;
        }
      }
    }
  }

  if (supportsVideoGeneratorReferenceVideo(model)) {
    const refVideoInput = resolveVideoInput(node.id, 'ref-video', resolvedData, allNodes, allEdges);
    if (refVideoInput?.data || refVideoInput?.sourceUrl) {
      referenceVideo = {
        data: refVideoInput.data,
        videoUrl: refVideoInput.sourceUrl,
        mimeType: refVideoInput.mimeType,
        filename: refVideoInput.filename || 'reference-video.mp4',
      };
    }
  }

  const referenceImages =
    referenceMode === 'images' || model === 'kling-omni'
      ? (() => {
          const edges = allEdges.filter(
            (e) =>
              e.target === node.id &&
              (e.targetHandle === 'ref-image' || e.targetHandle === 'ref-images'),
          );
          const injectionParts: string[] = [];

          const refs = edges
            .map((edge, index) => {
              const output = resolvedData.get(edge.source);
              const sourceNode = allNodes.find((n) => n.id === edge.source);
              const refType = (sourceNode?.data as ImageNodeData)?.referenceType || 'default';

              if (refType !== 'default') {
                const refNumber = index + 1;
                if (refType === 'product') {
                  injectionParts.push(
                    `Ref. Image #${refNumber} is the primary Product to feature.`,
                  );
                } else if (refType === 'color') {
                  injectionParts.push(
                    `Ref. Image #${refNumber} provides the Color/Theme to generate in compliance with.`,
                  );
                } else if (refType === 'person') {
                  injectionParts.push(
                    `Ref. Image #${refNumber} is a Person/Character that must appear in the generation.`,
                  );
                }
              }

              const ref = imageRefFromOutput(output);
              if (ref) {
                return {
                  data: ref.data,
                  imageUrl: ref.imageUrl,
                  mimeType: ref.mimeType,
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
          return refs;
        })()
      : undefined;

  if (model === 'seedance-2.0') {
    const mappedImageReferences = referenceImages?.map((image, index) => ({
      data: image.data,
      imageUrl: image.imageUrl,
      mimeType: image.mimeType,
      filename: image.filename ?? `seedance-ref-${index + 1}.png`,
    }));

    imageReferences =
      mappedImageReferences && mappedImageReferences.length > 0 ? mappedImageReferences : undefined;
  }

  const backendModel = getVideoGeneratorBackendModel(model);

  return {
    brandId,
    model: backendModel,
    medium: 'video',
    prompt,
    negativePrompt: negativePrompt || undefined,
    aspectRatio: data.aspectRatio || '16:9',
    resolution: normalizeVeoResolution(model, data.resolution),
    durationSeconds: data.durationSeconds ? Number(data.durationSeconds) : 8,
    firstFrame,
    lastFrame,
    referenceVideo,
    imageReferences,
    // seedance-2.0 uses imageReferences (data/mimeType/filename); original referenceImages intentionally omitted to avoid duplicate payload
    referenceImages:
      model !== 'seedance-2.0' && referenceImages && referenceImages.length > 0
        ? referenceImages
        : undefined,
    skillIds: data.skillIds && data.skillIds.length > 0 ? data.skillIds : undefined,
    brandBookPieces: effectiveBrandBookPieces(data.brandBookPieces),
  };
}

export function buildExtendVideoPayload(
  node: StudioNode,
  resolvedData: Map<string, NodeOutput>,
  allNodes: StudioNode[],
  allEdges: Edge[],
  brandId: string,
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
    duration_seconds: payload.durationSeconds
      ? (String(payload.durationSeconds) as '4' | '6' | '8')
      : undefined,
    negative_prompt: payload.negativePrompt,
    first_frame: payload.firstFrame
      ? {
          data: payload.firstFrame.data,
          image_url: payload.firstFrame.imageUrl,
          mime_type: payload.firstFrame.mimeType,
          filename: payload.firstFrame.filename,
        }
      : undefined,
    last_frame: payload.lastFrame
      ? {
          data: payload.lastFrame.data,
          image_url: payload.lastFrame.imageUrl,
          mime_type: payload.lastFrame.mimeType,
          filename: payload.lastFrame.filename,
        }
      : undefined,
    reference_video: payload.referenceVideo
      ? {
          data: payload.referenceVideo.data,
          video_url: payload.referenceVideo.videoUrl,
          mime_type: payload.referenceVideo.mimeType,
          filename: payload.referenceVideo.filename,
        }
      : undefined,
    image_references: payload.imageReferences?.map((image) => ({
      data: image.data,
      image_url: image.imageUrl,
      mime_type: image.mimeType,
      filename: image.filename,
    })),
    reference_images: payload.referenceImages?.map((img) => ({
      data: img.data,
      image_url: img.imageUrl,
      storage_bucket: img.storageBucket,
      storage_path: img.storagePath,
      mime_type: img.mimeType,
      filename: img.filename,
      weight: img.weight,
      referenceType: img.referenceType,
    })),
    skill_ids: payload.skillIds,
    brand_book_pieces: payload.brandBookPieces,
    reference_asset_ids: payload.referenceAssetIds,
  };
}

export function toBackendExtendVideoPayload(
  payload: ExtendVideoPayload,
): BackendExtendVideoRequestPayload {
  const videoPayload =
    'data' in payload.video
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
