import { createNodeData } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';

import {
  type PlannerAiStudioHandoff,
  resolveWorkflowConceptSpec,
} from '@/lib/organic/ai-studio-bridge';
import type { StudioNode } from '../types';
import { IMAGE_GENERATOR_NODE_BOUNDS, snapNodeDimensionsToAspectRatio } from './aspectRatioSizing';
import { computeGenerationSignature } from './generationSignature';

export type SeedNodeBuild = {
  nodes: StudioNode[];
  edges: Edge[];
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
export function parseSupabaseStorageRef(
  url: string,
): { bucket: string; storagePath: string } | null {
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
export function buildSeedGeneratedImageData(seedImage: string): Record<string, unknown> {
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

export function buildSeedPrompt(seed: PlannerAiStudioHandoff): string {
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

// Instagram publishes at most 10 slides per carousel, so a draft that claims more
// still seeds 10 generators.
const CAROUSEL_MAX_SLIDES = 10;

// One text node per slide, each carrying the shared brief VERBATIM plus that
// slide's own direction. A wired prompt REPLACES a generator's positivePrompt, so
// N generators fed by one shared text node render N identical images — the slide
// marker alone is what keeps the seeded prompts distinct when the draft carries no
// per-slide copy at all.
function buildCarouselSlidePrompt(
  seed: PlannerAiStudioHandoff,
  index: number,
  count: number,
): string {
  const direction = seed.slides?.find((slide) => slide.index === index)?.prompt.trim();
  return [
    `Slide ${index + 1} of ${count}`,
    direction ? `Slide direction:\n${direction}` : '',
    buildSeedPrompt(seed),
  ]
    .filter(Boolean)
    .join('\n\n');
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

export function buildStarterFlow(seed: PlannerAiStudioHandoff): SeedNodeBuild {
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
        // The mode is left to createNodeData so it tracks whatever defaultModel is,
        // rather than pinning 'frames' and going stale if that model changes.
        ...createNodeData('videoGen', {
          model: workflowSpec.defaultModel,
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
    const count = Math.max(1, Math.min(seed.authoritativeCount ?? 1, CAROUSEL_MAX_SLIDES));
    const nodes: StudioNode[] = [];
    const edges: Edge[] = [];
    let seedNodeId: string | null = null;

    if (seedImage) {
      seedNodeId = `organic-seed-image-ref-${seed.draftId}`;
      nodes.push({
        id: seedNodeId,
        type: 'image',
        position: { x: 120, y: -260 },
        data: buildSeedImageNodeData(seedImage),
        style: { width: 180, height: 180 },
      } as StudioNode);
    }

    // Two prompt/generator pairs per row so a slide's copy sits next to the slide
    // it drives, instead of every generator hanging off one anonymous text block.
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const x = 120 + col * 880;
      const y = 120 + row * 420;
      const slideTextNodeId = `organic-seed-text-${seed.draftId}-${index + 1}`;
      const nodeId = `organic-seed-carousel-${seed.draftId}-${index + 1}`;

      nodes.push({
        id: slideTextNodeId,
        type: 'string',
        position: { x, y },
        data: { value: buildCarouselSlidePrompt(seed, index, count) },
        style: { width: 380, height: 300 },
      } as StudioNode);

      nodes.push({
        id: nodeId,
        type: 'nanoGen',
        position: { x: x + 440, y },
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
        id: `e-${slideTextNodeId}-${nodeId}-prompt`,
        source: slideTextNodeId,
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
