import {
  IMAGE_REFERENCE_MAX_BYTES,
  inferMimeTypeFromPath,
  type ParsedReferenceDropPayload,
  resolveReferenceMimeType,
  VIDEO_REFERENCE_MAX_BYTES,
} from '@/lib/ai-studio/referenceDrop';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import type { StudioNode } from '../types';
import { buildDataUrl, parseDataUrl } from './dataUrl';
import { resignCanvasNodes } from './resignCanvasNodes';

type Resign = (nodes: StudioNode[], brandProfileId?: string) => Promise<StudioNode[]>;

type Base64Resolver = (
  parsed: ParsedReferenceDropPayload,
  maxBytes: number,
) => Promise<{ base64: string; sourceName?: string; byteLength?: number }>;

const HTTP_URL_PATTERN = /^https?:\/\//i;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHttpUrl(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized && HTTP_URL_PATTERN.test(normalized) ? normalized : undefined;
}

export function hasHydratableMediaReference(node: StudioNode): boolean {
  if (node.type !== 'image' && node.type !== 'video') return false;
  const data = node.data as Record<string, unknown>;
  const currentValue = normalizeString(data[node.type]);
  if (currentValue && parseDataUrl(currentValue)) return false;
  return Boolean(
    normalizeString(data.sourcePath) ||
      normalizeHttpUrl(data.sourceUrl) ||
      normalizeHttpUrl(currentValue),
  );
}

function buildRemotePayload(
  sourcePath: string | undefined,
  sourceUrl: string | undefined,
): ParsedReferenceDropPayload | null {
  if (!sourcePath && !sourceUrl) return null;
  return {
    kind: 'remote',
    path: sourcePath,
    publicUrl: sourceUrl,
    mimeType: inferMimeTypeFromPath(sourceUrl ?? sourcePath ?? '') ?? undefined,
  };
}

async function rehydrateMediaNode(
  node: StudioNode,
  options: {
    key: 'image' | 'video';
    maxBytes: number;
    resolver: Base64Resolver;
  },
): Promise<StudioNode> {
  const data = node.data as Record<string, unknown>;
  const currentValue = normalizeString(data[options.key]);
  if (currentValue && parseDataUrl(currentValue)) {
    return node;
  }

  const sourcePath = normalizeString(data.sourcePath);
  const sourceUrlFromData = normalizeHttpUrl(data.sourceUrl);
  const sourceUrlFromCurrentValue = normalizeHttpUrl(currentValue);
  const sourceUrl = sourceUrlFromData ?? sourceUrlFromCurrentValue;
  const remotePayload = buildRemotePayload(sourcePath, sourceUrl);

  if (!remotePayload) {
    return node;
  }

  try {
    const { base64, sourceName } = await options.resolver(remotePayload, options.maxBytes);
    const mimeType = resolveReferenceMimeType(remotePayload);

    const nextData: Record<string, unknown> = {
      ...data,
      [options.key]: buildDataUrl(mimeType, base64),
      sourcePath,
      sourceUrl,
    };

    if (!normalizeString(data.fileName) && sourceName && sourceName !== 'data-url') {
      nextData.fileName = sourceName;
    }

    return {
      ...node,
      data: nextData as StudioNode['data'],
    };
  } catch {
    return node;
  }
}

export async function rehydrateWorkflowMediaNodes(
  nodes: StudioNode[],
  resolver: Base64Resolver = resolveDroppedBase64,
  brandProfileId?: string,
  resign: Resign = resignCanvasNodes,
): Promise<StudioNode[]> {
  // Re-sign BEFORE inlining anything. A reference node with durable coordinates
  // (sourcePath + bucket) gets a fresh signed URL written straight into its media
  // value, and the Backend resolves that to bytes itself. Downloading the same image
  // into the browser and base64-encoding it first only produces a data URL that the
  // re-sign then overwrites — pure waste, paid on every generate.
  //
  // Also re-signs durable storage paths on generator nodes (nanoGen, video gen types),
  // whose generated image/video URLs are stripped on save.
  const resigned = await resign(nodes, brandProfileId);

  return Promise.all(
    resigned.map(async (node, index) => {
      // Left untouched by re-signing means there was nothing durable to re-sign (a
      // remote CDN reference with no bucket) or the re-sign failed. Inlining the bytes
      // is then the only way that reference reaches the model, so the fallback stands.
      if (node !== nodes[index]) return node;
      if (node.type === 'image') {
        return rehydrateMediaNode(node, {
          key: 'image',
          maxBytes: IMAGE_REFERENCE_MAX_BYTES,
          resolver,
        });
      }
      if (node.type === 'video') {
        return rehydrateMediaNode(node, {
          key: 'video',
          maxBytes: VIDEO_REFERENCE_MAX_BYTES,
          resolver,
        });
      }
      return node;
    }),
  );
}
