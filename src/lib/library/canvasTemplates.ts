// Library-originated canvas templates: the pre-made workflows the Library hands
// into the Studio Canvas. Pure graph factories — asset + brand pieces + presets in,
// {nodes, edges} out — so the seeding route, the tests, and any future template
// picker all build the exact same graph with no store and no React.
//
// The shapes here are NOT invented: they mirror what the canvas already persists
// and executes (StudioCanvas/components/StudioCanvas.tsx seed builders,
// utils/executeWorkflow.ts handle resolution). A reference node carries DURABLE
// storage coordinates (bucket + sourcePath) and no signed URL — resignCanvasNodes
// mints a fresh preview URL on canvas load and rehydrateWorkflowMedia inlines the
// bytes at run time, so the seed never rots the way a stored signed URL would.

import type { BrandBookPieceKind } from '@continuum/contracts';
import { snapNodeDimensionsToAspectRatio } from '@/StudioCanvas/utils/aspectRatioSizing';
import { QUICK_LOOK_BASE_PROMPT, RESIZE_PRESETS, type ResizePreset } from './quickLook';

export const LIBRARY_CANVAS_TEMPLATES = ['brand-align', 'resize-pack', 'blank'] as const;
export type LibraryCanvasTemplate = (typeof LIBRARY_CANVAS_TEMPLATES)[number];

// The canvas's own default for a generation node that has no explicit selection is
// the whole brand book; the seed states it rather than relying on the implicit
// default, so what the user sees on the node chip is what the Backend enforces.
export const DEFAULT_SEED_BRAND_PIECES: readonly BrandBookPieceKind[] = ['full'];

const GEN_MODEL = 'nano-banana-2';
const GEN_IMAGE_SIZE = '1K';
const REFERENCE_NODE_SIZE = 208;
const GEN_MIN_WIDTH = 260;
const GEN_MIN_HEIGHT = 180;
const GEN_TARGET_EDGE = 400;
const GEN_COLUMN_X = 620;
const GEN_ROW_GAP = 60;
const ORIGIN = { x: 120, y: 160 } as const;

export type LibrarySeedAsset = {
  id: string;
  kind: 'image' | 'video';
  bucket: string;
  storagePath: string;
  fileName: string;
};

export type CanvasTemplateNode = {
  id: string;
  type: 'image' | 'video' | 'nanoGen';
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style: { width: number; height: number };
};

export type CanvasTemplateEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  type: 'dataType';
  data: { dataType: 'image'; pathType: 'bezier' };
};

export type CanvasTemplateGraph = {
  nodes: CanvasTemplateNode[];
  edges: CanvasTemplateEdge[];
};

export type BuildTemplateInput = {
  template: LibraryCanvasTemplate;
  asset: LibrarySeedAsset;
  /** Stable token distinguishing this seeding from an earlier one of the same asset. */
  seedId: string;
  brandPieces?: readonly BrandBookPieceKind[];
  /** Defaults to every RESIZE_PRESETS entry; narrowed by the caller for a subset pack. */
  presets?: readonly ResizePreset[];
};

// A generation node sized to its own aspect ratio, so the canvas reads as the pack it
// produces rather than a column of identical squares. This used to be a hand-rolled
// clone of snapNodeDimensionsToAspectRatio and would have drifted from the canvas the
// first time either changed; only the envelope is local now — a library pack is drawn
// larger than a bare node, and the shape comes from the one shared helper.
function genNodeSize(aspectRatio: string): { width: number; height: number } {
  return snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: GEN_TARGET_EDGE,
    currentHeight: GEN_TARGET_EDGE,
    minWidth: GEN_MIN_WIDTH,
    minHeight: GEN_MIN_HEIGHT,
    fallbackWidth: GEN_TARGET_EDGE,
  });
}

export function referenceNodeId(seedId: string): string {
  return `library-${seedId}-ref`;
}

export function genNodeId(seedId: string, suffix: string): string {
  return `library-${seedId}-gen-${suffix}`;
}

// Durable-only: no `image` / `sourceUrl`. The canvas re-signs from bucket+sourcePath
// on load (resignCanvasNodes) and inlines the bytes at run (rehydrateWorkflowMedia).
// `libraryAssetId` is the breadcrumb the round-trip reads back.
function buildReferenceNode(asset: LibrarySeedAsset, seedId: string): CanvasTemplateNode {
  return {
    id: referenceNodeId(seedId),
    type: asset.kind === 'video' ? 'video' : 'image',
    position: { ...ORIGIN },
    data: {
      fileName: asset.fileName,
      bucket: asset.bucket,
      sourcePath: asset.storagePath,
      libraryAssetId: asset.id,
      ...(asset.kind === 'image' ? { referenceType: 'default' } : {}),
    },
    style: { width: REFERENCE_NODE_SIZE, height: REFERENCE_NODE_SIZE },
  };
}

// `sourceAssetId` on the generation node is what makes the round-trip work: the
// register-canvas route reads it back off the persisted graph and stamps it into the
// new asset's origin_ref, so a canvas output stays traceable to the Library asset it
// came from even after the node is deleted.
function buildGenNode(params: {
  id: string;
  prompt: string;
  aspectRatio: string;
  brandPieces: readonly BrandBookPieceKind[];
  sourceAssetId: string;
  position: { x: number; y: number };
}): CanvasTemplateNode {
  return {
    id: params.id,
    type: 'nanoGen',
    position: params.position,
    data: {
      model: GEN_MODEL,
      imageSize: GEN_IMAGE_SIZE,
      positivePrompt: params.prompt,
      aspectRatio: params.aspectRatio,
      brandBookPieces: [...params.brandPieces],
      maxReferenceImages: 1,
      sourceAssetId: params.sourceAssetId,
    },
    style: genNodeSize(params.aspectRatio),
  };
}

function buildReferenceEdge(sourceId: string, targetId: string): CanvasTemplateEdge {
  return {
    id: `e-${sourceId}-${targetId}-ref`,
    source: sourceId,
    sourceHandle: 'image',
    target: targetId,
    targetHandle: 'ref-image',
    type: 'dataType',
    data: { dataType: 'image', pathType: 'bezier' },
  };
}

export function resizePresetPrompt(preset: ResizePreset): string {
  return (
    `Reframe the reference image for a ${preset.platform} ${preset.label.toLowerCase()} placement ` +
    `at a ${preset.ratio} aspect ratio. Keep the subject, product, and brand marks fully in frame ` +
    'and uncropped; extend or recompose the background as needed rather than stretching the image.'
  );
}

// Only image assets can drive a generation node; a video asset lands as a reference
// the user can wire into a video block themselves.
export function templateSupportsAsset(
  template: LibraryCanvasTemplate,
  kind: LibrarySeedAsset['kind'],
): boolean {
  if (template === 'blank') return true;
  return kind === 'image';
}

export function buildLibraryCanvasTemplate(input: BuildTemplateInput): CanvasTemplateGraph {
  const { template, asset, seedId } = input;
  if (!templateSupportsAsset(template, asset.kind)) {
    throw new Error(`Template "${template}" needs an image asset, got "${asset.kind}"`);
  }

  const brandPieces = input.brandPieces ?? DEFAULT_SEED_BRAND_PIECES;
  const reference = buildReferenceNode(asset, seedId);

  if (template === 'blank') {
    return { nodes: [reference], edges: [] };
  }

  if (template === 'brand-align') {
    const gen = buildGenNode({
      id: genNodeId(seedId, 'brand'),
      prompt: QUICK_LOOK_BASE_PROMPT,
      aspectRatio: '1:1',
      brandPieces,
      sourceAssetId: asset.id,
      position: { x: GEN_COLUMN_X, y: ORIGIN.y },
    });
    return { nodes: [reference, gen], edges: [buildReferenceEdge(reference.id, gen.id)] };
  }

  const presets = input.presets ?? RESIZE_PRESETS;
  const nodes: CanvasTemplateNode[] = [reference];
  const edges: CanvasTemplateEdge[] = [];
  let cursorY = ORIGIN.y;

  for (const preset of presets) {
    const gen = buildGenNode({
      id: genNodeId(seedId, preset.fileSuffix),
      prompt: resizePresetPrompt(preset),
      aspectRatio: preset.apiAspectRatio,
      brandPieces,
      sourceAssetId: asset.id,
      position: { x: GEN_COLUMN_X, y: cursorY },
    });
    nodes.push(gen);
    edges.push(buildReferenceEdge(reference.id, gen.id));
    cursorY += gen.style.height + GEN_ROW_GAP;
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Additive merge — the half of the CAS write that must be pure, because a lost
// revision race replays it against the graph that won.
//
// Append-only: existing nodes and edges are never dropped, reordered, or rewritten,
// and a seed whose ids already landed (a replayed retry) is idempotent. It now lives
// in the canvas layer because the planner handoff needs the same guarantee — see
// `@/StudioCanvas/utils/mergeSeedIntoGraph` for why it could not be imported from
// here. Re-exported so this module's own consumers are unchanged.
export {
  mergeSeedIntoGraph,
  type PersistedGraph,
} from '@/StudioCanvas/utils/mergeSeedIntoGraph';
