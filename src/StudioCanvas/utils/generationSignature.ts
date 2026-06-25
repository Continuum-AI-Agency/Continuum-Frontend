import type { Edge } from "@xyflow/react";
import type { StudioNode } from "../types";
import { isVideoGeneratorNodeType } from "./videoModel";

// A run reuses a node's existing output unless the node was edited since it
// generated. We detect that by comparing a canonical signature of the node's
// generation inputs (own settings + input wiring) against the signature stored
// when it last produced output. This lives as durable node data
// (`generationSignature`) so the check survives save/reload and broadcast sync.
//
// The leading `sig1:` and the `|`/`(`/`)` delimiters keep the stored value from
// matching the base64 strip in workflowSerialization (isEncodedPayload), so it
// is never dropped on save.

const SIGNATURE_VERSION = "sig1";

const VIDEO_GENERATOR_FIELDS = [
  "prompt",
  "negativePrompt",
  "model",
  "enhancePrompt",
  "skillIds",
  "aspectRatio",
  "resolution",
  "durationSeconds",
  "referenceMode",
] as const;

// Generation-relevant own fields per node type. These mirror the inputs
// buildNodePayload sends to the Backend; a change to any of them means a
// different asset would be produced.
const OWN_FIELDS_BY_TYPE: Record<string, readonly string[]> = {
  nanoGen: [
    "positivePrompt",
    "model",
    "aspectRatio",
    "imageSize",
    "stylePreset",
    "skillIds",
    "seed",
    "steps",
    "guidance",
    "scheduler",
    "promptEnhancement",
  ],
  videoGen: VIDEO_GENERATOR_FIELDS,
  veoDirector: VIDEO_GENERATOR_FIELDS,
  veoFast: VIDEO_GENERATOR_FIELDS,
};

// Node types whose output is fully determined by their own settings + wiring, so
// an edit can be detected by signature drift. Special media nodes (extendVideo /
// videoEditor / timelineEditor) carry their own commit/await reuse semantics and
// are intentionally NOT signature-tracked here.
export function isSignatureTracked(nodeType?: string): boolean {
  if (typeof nodeType !== "string") return false;
  return nodeType === "nanoGen" || isVideoGeneratorNodeType(nodeType);
}

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    // Order-independent for sets like skillIds.
    return [...value].map(serializeValue).sort().join(",");
  }
  if (typeof value === "object") return JSON.stringify(value);
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
      const handle = `${edge.sourceHandle ?? ""}>${edge.targetHandle ?? ""}`;
      const source = nodeById.get(edge.source);
      if (source && (source.type === "string" || source.type === "videoDecode")) {
        const value = (source.data as Record<string, unknown>).value;
        return `${handle}:text=${serializeValue(value)}`;
      }
      return `${handle}:src=${edge.source}`;
    })
    .sort();
  return parts.join("|");
}

export function computeGenerationSignature(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): string {
  const data = node.data as Record<string, unknown>;
  const fields = OWN_FIELDS_BY_TYPE[node.type ?? ""] ?? [];
  const own = fields.map((field) => `${field}=${serializeValue(data[field])}`).join("|");
  const refs = referenceSignature(node, edges, nodeById);
  return `${SIGNATURE_VERSION}:${node.type ?? ""}|${own}|refs(${refs})`;
}

// True when a signature-tracked node has output that no longer matches its
// current settings/wiring. A node with no stored signature (legacy canvas, or
// one generated before this feature shipped) is treated as NOT stale, so we
// reuse it rather than force-regenerate everyone's existing work.
export function nodeIsStale(
  node: StudioNode,
  edges: Edge[],
  nodeById: Map<string, StudioNode>,
): boolean {
  if (!isSignatureTracked(node.type)) return false;
  const stored = (node.data as Record<string, unknown>).generationSignature;
  if (typeof stored !== "string" || stored.length === 0) return false;
  return stored !== computeGenerationSignature(node, edges, nodeById);
}
