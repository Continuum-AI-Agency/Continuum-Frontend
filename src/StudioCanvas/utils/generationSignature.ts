import {
  STUDIO_NODE_TYPES,
  type StudioNodeType,
  studioNodeSignatureFields,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';

// A run reuses a node's existing output unless the node was edited since it
// generated. We detect that by comparing a canonical signature of the node's
// generation inputs (own settings + input wiring) against the signature stored
// when it last produced output. This lives as durable node data
// (`generationSignature`) so the check survives save/reload and broadcast sync.
//
// The leading `sig1:` and the `|`/`(`/`)` delimiters keep the stored value from
// matching the base64 strip in workflowSerialization (isEncodedPayload), so it
// is never dropped on save.

const SIGNATURE_VERSION = 'sig2';

const VIDEO_GENERATOR_FIELDS = [
  'prompt',
  'negativePrompt',
  'model',
  'enhancePrompt',
  'skillIds',
  'aspectRatio',
  'resolution',
  'durationSeconds',
  'referenceMode',
] as const;

// Generation-relevant own fields per node type, DERIVED from the contracts node
// registry rather than transcribed beside it. These mirror the inputs buildNodePayload
// sends to the Backend; a change to any of them means a different asset would be
// produced, so the ORDER and the MEMBERSHIP are load-bearing (the signature is a join
// of `field=value` in list order). `generationSignature.test.ts` pins both against the
// registry's own constants — that assertion is what this derivation replaces the old
// hand-copied literal with.
const OWN_FIELDS_BY_TYPE: Record<string, readonly string[]> = Object.fromEntries(
  STUDIO_NODE_TYPES.map((type: StudioNodeType) => [type, studioNodeSignatureFields(type)]).filter(
    (entry): entry is [StudioNodeType, readonly string[]] => entry[1] !== undefined,
  ),
);

// sig1's nanoGen recipe, kept verbatim so a node stamped before the sig2 bump can
// still be checked against the recipe that produced it.
const SIG1_OWN_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  nanoGen: [
    'positivePrompt',
    'model',
    'aspectRatio',
    'imageSize',
    'stylePreset',
    'skillIds',
    'seed',
    'steps',
    'guidance',
    'scheduler',
    'promptEnhancement',
  ],
  videoGen: VIDEO_GENERATOR_FIELDS,
  veoDirector: VIDEO_GENERATOR_FIELDS,
  veoFast: VIDEO_GENERATOR_FIELDS,
};

// Every recipe this app has ever stamped, keyed by its version prefix.
//
// Staleness must answer "was this node EDITED since it generated?", never "has the
// signature format changed since?". Comparing a sig1 signature against the sig2
// recipe answers the second question, so the sig2 bump made every pre-existing
// node look edited: running a video regenerated the perfectly good image feeding
// it (bug #221). Bumping the version now means adding the outgoing recipe here.
const OWN_FIELDS_BY_VERSION: Record<string, Record<string, readonly string[]>> = {
  sig1: SIG1_OWN_FIELDS_BY_TYPE,
  sig2: OWN_FIELDS_BY_TYPE,
};

// Node types whose output is fully determined by their own settings + wiring, so
// an edit can be detected by signature drift. Special media nodes (extendVideo /
// timelineEditor) carry their own commit/await reuse semantics and
// are intentionally NOT signature-tracked here.
export function isSignatureTracked(nodeType?: string): boolean {
  if (typeof nodeType !== 'string') return false;
  return OWN_FIELDS_BY_TYPE[nodeType] !== undefined;
}

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    // Order-independent for sets like skillIds.
    return [...value].map(serializeValue).sort().join(',');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Identity of the inputs feeding this node. For text sources we fold in the
// source's current `value` so editing an upstream prompt node is detected as a
// change here; for media sources we fold in source id + handle (the source's
// *content* change is handled by the executor's downstream cascade, not here).
function referenceSignature(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): string {
  const parts = edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => {
      const handle = `${edge.sourceHandle ?? ''}>${edge.targetHandle ?? ''}`;
      const source = nodeById.get(edge.source);
      if (source && (source.type === 'string' || source.type === 'videoDecode')) {
        const value = (source.data as Record<string, unknown>).value;
        return `${handle}:text=${serializeValue(value)}`;
      }
      const sourceData = source?.data as Record<string, unknown> | undefined;
      const durableIdentity = [
        sourceData?.assetId,
        sourceData?.sourcePath,
        sourceData?.generatedImageStoragePath,
        sourceData?.generatedVideoStoragePath,
      ].find((value): value is string => typeof value === 'string' && value.length > 0);
      return `${handle}:src=${edge.source}:media=${durableIdentity ?? ''}`;
    })
    .sort();
  return parts.join('|');
}

function signatureForVersion(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
  version: string,
  ownFieldsByType: Record<string, readonly string[]>,
): string {
  const data = node.data as Record<string, unknown>;
  const fields = ownFieldsByType[node.type ?? ''] ?? [];
  const own = fields.map((field) => `${field}=${serializeValue(data[field])}`).join('|');
  const refs = referenceSignature(node, edges, nodeById);
  return `${version}:${node.type ?? ''}|${own}|refs(${refs})`;
}

/** The signature to STAMP on a node that just generated — always the current version. */
export function computeGenerationSignature(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): string {
  return signatureForVersion(node, edges, nodeById, SIGNATURE_VERSION, OWN_FIELDS_BY_TYPE);
}

/** The version prefix a stored signature was stamped with, when it has one. */
function storedSignatureVersion(stored: string): string | undefined {
  const separator = stored.indexOf(':');
  return separator === -1 ? undefined : stored.slice(0, separator);
}

// True when a signature-tracked node has output that no longer matches its
// current settings/wiring. A node with no stored signature (legacy canvas, or
// one generated before this feature shipped) is treated as NOT stale, so we
// reuse it rather than force-regenerate everyone's existing work.
//
// The stored signature is re-derived under ITS OWN version's recipe. That is the
// whole point: a version bump changes the format, not the node, and only a real
// edit may mark a node stale.
export function nodeIsStale(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): boolean {
  if (!isSignatureTracked(node.type)) return false;
  const stored = (node.data as Record<string, unknown>).generationSignature;
  if (typeof stored !== 'string' || stored.length === 0) return false;

  const version = storedSignatureVersion(stored);
  // A signature from a version this build does not know (a rollback, or a
  // hand-edited row) cannot be compared honestly — reuse rather than destroy work.
  if (version === undefined) return false;
  const ownFields = OWN_FIELDS_BY_VERSION[version];
  if (!ownFields) return false;

  return stored !== signatureForVersion(node, edges, nodeById, version, ownFields);
}
