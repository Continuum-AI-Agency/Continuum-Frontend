// Turns a canvas selection into a Technique's port contract.
//
// A Technique is a saved subgraph, so the interesting question at save time is
// not "which nodes did you pick" — the nodes are already in the row — but "what
// does this piece take, and what does it give back". That is answered by looking
// at where the selection's boundary falls:
//
//   input  ← an edge that lands inside the selection from a node left outside
//   input  ← a REQUIRED handle nothing is wired into (the slot you fill in later)
//   output ← an edge that leaves the selection for a node left outside
//   output ← a media producer inside the selection with nothing downstream at all
//
// The second input rule is what makes a self-contained premade a usable object:
// a closed subgraph has no boundary-crossing edges, so an edges-only inference
// reports zero ports and the Technique reads as a black box. Every port carries
// `origin` so a reader can always tell which rule produced it.
//
// Types come from contracts' own resolver rather than a second copy of the
// handle table: getStudioPortMetadata already answers (node, handle) → dataType
// for every node type, including the action/router/batch cases that a handle
// name alone cannot settle.

import {
  type CanvasTechniquePort,
  getStudioPortMetadata,
  mediaKindForHandle,
  STUDIO_MEDIA_NODE_TYPES,
  type StudioNodeType,
  type StudioPortDataType,
  type WorkflowFragmentKind,
} from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';

/** canvasTechniqueMetadataSchema caps each side at 12. */
export const MAX_TECHNIQUE_PORTS = 12;

export type TechniquePortInference = {
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
  /** True when a side had more than MAX_TECHNIQUE_PORTS candidates and was cut. */
  truncated: boolean;
};

type PortDraft = {
  nodeRef: string;
  handleId: string;
  dataType?: StudioPortDataType;
  label?: string;
  origin: 'edge' | 'open' | 'terminal';
  /** Sort key so re-saving the same selection yields the same port ids. */
  x: number;
  y: number;
};

const isMediaProducer = (node: StudioNode): boolean =>
  STUDIO_MEDIA_NODE_TYPES.has(node.type as StudioNodeType);

/**
 * Contracts' port table for one node, keyed by handle. Built per node rather
 * than per port because getStudioPortMetadata computes the whole side at once.
 */
const portTable = (node: StudioNode, direction: 'input' | 'output') => {
  const metadata = getStudioPortMetadata(
    { id: node.id, type: node.type, data: node.data },
    direction,
  );
  return new Map(metadata.map((port) => [port.id, port]));
};

/**
 * A handle the Frontend renders but contracts does not list is not an error to
 * throw on — the ref-image/ref-images alias is a live example. Degrade the type,
 * never the save.
 */
const fallbackDataType = (handleId: string): StudioPortDataType =>
  mediaKindForHandle(handleId) ?? 'text';

const draftsToPorts = (
  drafts: PortDraft[],
  prefix: 'in' | 'out',
): { ports: CanvasTechniquePort[]; truncated: boolean } => {
  const seen = new Set<string>();
  const deduped = drafts
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.handleId.localeCompare(b.handleId))
    .filter((draft) => {
      const key = `${draft.nodeRef}::${draft.handleId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const kept = deduped.slice(0, MAX_TECHNIQUE_PORTS);
  return {
    truncated: deduped.length > kept.length,
    ports: kept.map((draft, index) => ({
      id: `${prefix}-${index + 1}`,
      nodeRef: draft.nodeRef,
      handleId: draft.handleId,
      ...(draft.dataType ? { dataType: draft.dataType } : {}),
      ...(draft.label ? { label: draft.label } : {}),
      origin: draft.origin,
    })),
  };
};

export function inferTechniquePorts(
  selection: StudioNode[],
  edges: Edge[],
): TechniquePortInference {
  const selected = new Map(selection.map((node) => [node.id, node]));
  const inputDrafts: PortDraft[] = [];
  const outputDrafts: PortDraft[] = [];

  // Handles already carrying an edge, so the "open input" pass can skip them,
  // and the nodes with anything downstream, so the terminal pass can skip those.
  const wiredInputs = new Set<string>();
  const hasOutgoing = new Set<string>();

  // One pass over the edges. No traversal, so a cycle inside the selection is
  // safe by construction rather than by a visited set.
  for (const edge of edges) {
    const target = selected.get(edge.target);
    const source = selected.get(edge.source);
    if (source) hasOutgoing.add(edge.source);

    if (target) {
      const handleId = edge.targetHandle ?? 'in';
      wiredInputs.add(`${edge.target}::${handleId}`);
      if (!source) {
        const port = portTable(target, 'input').get(handleId);
        inputDrafts.push({
          nodeRef: target.id,
          handleId,
          dataType: port?.dataType ?? fallbackDataType(handleId),
          label: port?.name,
          origin: 'edge',
          x: target.position.x,
          y: target.position.y,
        });
      }
    }

    if (source && !target) {
      const handleId = edge.sourceHandle ?? 'out';
      const port = portTable(source, 'output').get(handleId);
      outputDrafts.push({
        nodeRef: source.id,
        handleId,
        dataType: port?.dataType ?? fallbackDataType(handleId),
        label: port?.name,
        origin: 'edge',
        x: source.position.x,
        y: source.position.y,
      });
    }
  }

  for (const node of selection) {
    for (const port of portTable(node, 'input').values()) {
      if (!port.required) continue;
      if (wiredInputs.has(`${node.id}::${port.id}`)) continue;
      inputDrafts.push({
        nodeRef: node.id,
        handleId: port.id,
        dataType: port.dataType,
        label: port.name,
        origin: 'open',
        x: node.position.x,
        y: node.position.y,
      });
    }

    if (hasOutgoing.has(node.id) || !isMediaProducer(node)) continue;
    const [primary] = [...portTable(node, 'output').values()];
    if (!primary) continue;
    outputDrafts.push({
      nodeRef: node.id,
      handleId: primary.id,
      dataType: primary.dataType,
      label: primary.name,
      origin: 'terminal',
      x: node.position.x,
      y: node.position.y,
    });
  }

  const inputs = draftsToPorts(inputDrafts, 'in');
  const outputs = draftsToPorts(outputDrafts, 'out');
  return {
    inputPorts: inputs.ports,
    outputPorts: outputs.ports,
    truncated: inputs.truncated || outputs.truncated,
  };
}

const PUBLISHER_TYPES = new Set<string>(['organicPublish', 'paidPublisher', 'plannerDraft']);
const ASSEMBLY_TYPES = new Set<string>(['timelineEditor', 'layerEditor', 'hyperframesAgent']);

/**
 * Seeds the dialog's kind field. The human picks — this only saves them a click
 * on the common shapes.
 */
export function suggestTechniqueKind(selection: StudioNode[]): WorkflowFragmentKind {
  const types = selection.map((node) => node.type ?? '');
  if (types.some((type) => PUBLISHER_TYPES.has(type))) return 'delivery';
  if (types.some((type) => ASSEMBLY_TYPES.has(type))) return 'assembly';
  if (types.some((type) => STUDIO_MEDIA_NODE_TYPES.has(type as StudioNodeType))) {
    // A generator plus its inputs is a generation recipe; a lone transformer is not.
    return types.some((type) => type === 'action' || type === 'frameExtract')
      ? 'transformation'
      : 'generation';
  }
  if (types.some((type) => type === 'action' || type === 'frameExtract')) return 'transformation';
  return 'reference';
}
