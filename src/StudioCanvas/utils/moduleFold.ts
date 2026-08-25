// Folding an applied Technique down to one node, and back.
//
// The fold is a PURE DERIVATION that sits between the store and <Canvas>. It never
// writes `state.nodes` / `state.edges`, which is the whole design: `executeWorkflow`
// opens with `useStudioStore.getState()`, so a run over a collapsed module and a run
// over the expanded one read the identical arrays. Unfolding is therefore not an
// inverse operation that has to be kept honest — it is simply "stop folding", and
// the round trip is byte-equal by construction.
//
// Membership is NOT a new record. `useApplyWorkflow` already namespaces every applied
// member as `module:<uuid>:<originalId>` and already builds the `metadata.workflowModule`
// block, so the id prefix is a durable membership record that survives save, reload and
// the realtime merge. This module reads that prefix; the label rides along in the
// presentation store because the FE canvas has nowhere durable to keep it.
//
// The collapsed node is a VIEW type (`techniqueCollapsed`), deliberately not a
// `StudioNodeType`. Registering it in `canvasNodeTypes` would fail that file's drift
// guard and force a contracts registry entry, which cascades into the Backend headless
// support table, the add-node catalog and generationSignature — for a node the runtime
// must never see.

import {
  type CanvasTechniquePort,
  mediaKindForHandle,
  type StudioPortDataType,
} from '@continuum/contracts';
import type { Edge, Node, NodeChange, XYPosition } from '@xyflow/react';

import type { StudioNode } from '../types';
import { inferTechniquePorts } from './techniqueFragment';

/** The namespace `namespaceWorkflowSnapshot` stamps onto every applied member. */
export const MODULE_ID_PREFIX = 'module:';
/** The synthetic node's id prefix. Distinct from MODULE_ID_PREFIX so the e2e bench's
 *  `[data-id^="module:"]` member count can never accidentally include the fold. */
export const COLLAPSED_NODE_PREFIX = 'collapsed-module:';
export const COLLAPSED_NODE_TYPE = 'techniqueCollapsed';

const COLLAPSED_WIDTH = 240;
const COLLAPSED_HEADER_HEIGHT = 64;
const COLLAPSED_PORT_ROW_HEIGHT = 22;

export interface WorkflowModuleRecord {
  /** `module:<uuid>` — the segment every member id shares. */
  id: string;
  label: string;
  nodeIds: string[];
}

export interface CollapsedModuleData extends Record<string, unknown> {
  moduleId: string;
  label: string;
  memberCount: number;
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
}

export type CollapsedModuleNode = Node<CollapsedModuleData, typeof COLLAPSED_NODE_TYPE>;

export const collapsedNodeId = (moduleId: string): string => `${COLLAPSED_NODE_PREFIX}${moduleId}`;

export const isCollapsedNodeId = (nodeId: string): boolean =>
  nodeId.startsWith(COLLAPSED_NODE_PREFIX);

/**
 * `module:<uuid>` for a member node, or undefined for a node the user made by hand.
 * The original id may itself contain colons, so only the first two segments count.
 */
export function moduleIdForNode(nodeId: string): string | undefined {
  if (!nodeId.startsWith(MODULE_ID_PREFIX)) return undefined;
  const rest = nodeId.slice(MODULE_ID_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) return undefined;
  return `${MODULE_ID_PREFIX}${rest.slice(0, separator)}`;
}

/**
 * Rebuilds the membership records straight off the live graph. This is what makes a
 * module still collapsible after a reload, when the apply-time record is long gone —
 * the node ids are the record.
 */
export function deriveModulesFromNodes(
  nodes: StudioNode[],
  known: Readonly<Record<string, WorkflowModuleRecord>> = {},
): WorkflowModuleRecord[] {
  const byModule = new Map<string, string[]>();
  for (const node of nodes) {
    const moduleId = moduleIdForNode(node.id);
    if (!moduleId) continue;
    const members = byModule.get(moduleId);
    if (members) members.push(node.id);
    else byModule.set(moduleId, [node.id]);
  }
  return [...byModule.entries()].map(([id, nodeIds]) => ({
    id,
    // ponytail: a reloaded canvas has no label to read — canvas_sessions stores
    // nodes/edges only. Upgrade path is a metadata column, deliberately not opened here.
    label: known[id]?.label ?? 'Technique',
    nodeIds,
  }));
}

const refKey = (nodeRef: string, handleId: string) => `${nodeRef}::${handleId}`;

/**
 * Contracts marks `handleId` optional on a technique port. A port with none names no
 * React Flow handle, so no edge can be re-anchored onto it and it is left out of the
 * lookup rather than asserted away — the boundary-edge pass below then mints a port for
 * that (node, handle) pair, so nothing is lost either way.
 */
const anchorableEntries = (ports: CanvasTechniquePort[]): Array<[string, string]> =>
  ports.flatMap((port) =>
    port.handleId ? [[refKey(port.nodeRef, port.handleId), port.id] as [string, string]] : [],
  );

interface ModulePorts {
  inputPorts: CanvasTechniquePort[];
  outputPorts: CanvasTechniquePort[];
  inputIdByRef: Map<string, string>;
  outputIdByRef: Map<string, string>;
}

const fallbackDataType = (handleId: string): StudioPortDataType =>
  mediaKindForHandle(handleId) ?? 'text';

/**
 * The port contract of one collapsed module, derived from the LIVE graph by the same
 * Wave-2 inference that decides a saved Technique's ports — so the card shows the same
 * boundary the technique itself declares, plus the open/terminal stubs you wire into.
 *
 * `inferTechniquePorts` caps each side at 12. A boundary edge whose port was cut would
 * re-anchor onto a handle the card never renders, and React Flow drops such an edge
 * silently — losing wiring, which is exactly what this feature must not do. So every
 * boundary edge is guaranteed a port here, capped or not.
 */
export function collapsedModulePorts(members: StudioNode[], edges: Edge[]): ModulePorts {
  const inferred = inferTechniquePorts(members, edges);
  const inputPorts = [...inferred.inputPorts];
  const outputPorts = [...inferred.outputPorts];
  const inputIdByRef = new Map(anchorableEntries(inputPorts));
  const outputIdByRef = new Map(anchorableEntries(outputPorts));

  const memberIds = new Set(members.map((node) => node.id));
  for (const edge of edges) {
    const sourceInside = memberIds.has(edge.source);
    const targetInside = memberIds.has(edge.target);
    if (sourceInside === targetInside) continue;

    if (targetInside) {
      const handleId = edge.targetHandle ?? 'in';
      const key = refKey(edge.target, handleId);
      if (!inputIdByRef.has(key)) {
        const id = `in-x${inputIdByRef.size + 1}`;
        inputIdByRef.set(key, id);
        inputPorts.push({
          id,
          nodeRef: edge.target,
          handleId,
          dataType: fallbackDataType(handleId),
          origin: 'edge',
        });
      }
    } else {
      const handleId = edge.sourceHandle ?? 'out';
      const key = refKey(edge.source, handleId);
      if (!outputIdByRef.has(key)) {
        const id = `out-x${outputIdByRef.size + 1}`;
        outputIdByRef.set(key, id);
        outputPorts.push({
          id,
          nodeRef: edge.source,
          handleId,
          dataType: fallbackDataType(handleId),
          origin: 'edge',
        });
      }
    }
  }

  return { inputPorts, outputPorts, inputIdByRef, outputIdByRef };
}

export function moduleTopLeft(members: StudioNode[]): XYPosition {
  return {
    x: Math.min(...members.map((node) => node.position.x)),
    y: Math.min(...members.map((node) => node.position.y)),
  };
}

interface FoldedModule {
  record: WorkflowModuleRecord;
  members: StudioNode[];
  ports: ModulePorts;
}

function indexCollapsedModules(
  nodes: StudioNode[],
  edges: Edge[],
  collapsed: WorkflowModuleRecord[],
): { modules: Map<string, FoldedModule>; moduleIdByNode: Map<string, string> } {
  const modules = new Map<string, FoldedModule>();
  const moduleIdByNode = new Map<string, string>();

  for (const record of collapsed) {
    const members = nodes.filter((node) => moduleIdForNode(node.id) === record.id);
    // A record whose nodes are gone (deleted, or a stale id from another room) folds
    // nothing rather than injecting an empty card.
    if (members.length === 0) continue;
    modules.set(record.id, { record, members, ports: collapsedModulePorts(members, edges) });
    for (const member of members) moduleIdByNode.set(member.id, record.id);
  }

  return { modules, moduleIdByNode };
}

function collapsedNodeFor(module: FoldedModule): CollapsedModuleNode {
  const { record, members, ports } = module;
  const rows = Math.max(ports.inputPorts.length, ports.outputPorts.length);
  return {
    id: collapsedNodeId(record.id),
    type: COLLAPSED_NODE_TYPE,
    position: moduleTopLeft(members),
    // Derived, never stored: the card reads as selected exactly when the module does.
    selected: members.every((member) => member.selected === true),
    data: {
      moduleId: record.id,
      label: record.label,
      memberCount: members.length,
      inputPorts: ports.inputPorts,
      outputPorts: ports.outputPorts,
    },
    style: {
      width: COLLAPSED_WIDTH,
      height: COLLAPSED_HEADER_HEIGHT + rows * COLLAPSED_PORT_ROW_HEIGHT,
    },
  };
}

/**
 * The display graph. Members are omitted rather than flagged `hidden` — omission keeps
 * them out of React Flow's measurement pass entirely, so a collapsed module costs
 * nothing and cannot contribute a stray handle.
 *
 * Returns the input arrays BY REFERENCE when nothing is collapsed, so the common case
 * adds no allocation and no re-render.
 */
export function foldCollapsedModules(
  nodes: StudioNode[],
  edges: Edge[],
  collapsed: WorkflowModuleRecord[],
): { nodes: Node[]; edges: Edge[] } {
  if (collapsed.length === 0) return { nodes, edges };

  const { modules, moduleIdByNode } = indexCollapsedModules(nodes, edges, collapsed);
  if (modules.size === 0) return { nodes, edges };

  // The collapsed card takes the array slot of the module's first member, so folding
  // does not reshuffle paint order around it.
  const emitted = new Set<string>();
  const foldedNodes: Node[] = [];
  for (const node of nodes) {
    const moduleId = moduleIdByNode.get(node.id);
    if (!moduleId) {
      foldedNodes.push(node);
      continue;
    }
    if (emitted.has(moduleId)) continue;
    emitted.add(moduleId);
    const module = modules.get(moduleId);
    if (module) foldedNodes.push(collapsedNodeFor(module));
  }

  const foldedEdges: Edge[] = [];
  for (const edge of edges) {
    const sourceModule = moduleIdByNode.get(edge.source);
    const targetModule = moduleIdByNode.get(edge.target);
    if (!sourceModule && !targetModule) {
      foldedEdges.push(edge);
      continue;
    }
    // Wiring wholly inside one folded module is what the fold is hiding.
    if (sourceModule && sourceModule === targetModule) continue;

    // The edge keeps its id: the real `edges` array is untouched, so unfolding restores
    // the original object, not a reconstruction of it.
    let next = edge;
    if (sourceModule) {
      const ports = modules.get(sourceModule)?.ports;
      next = {
        ...next,
        source: collapsedNodeId(sourceModule),
        sourceHandle: ports?.outputIdByRef.get(refKey(edge.source, edge.sourceHandle ?? 'out')),
      };
    }
    if (targetModule) {
      const ports = modules.get(targetModule)?.ports;
      next = {
        ...next,
        target: collapsedNodeId(targetModule),
        targetHandle: ports?.inputIdByRef.get(refKey(edge.target, edge.targetHandle ?? 'in')),
      };
    }
    foldedEdges.push(next);
  }

  return { nodes: foldedNodes, edges: foldedEdges };
}

/**
 * React Flow emits changes against the DISPLAY graph, so a drag of the collapsed card
 * names an id the real node list has never heard of and `applyNodeChanges` would drop
 * it on the floor. Translate those into changes on the members, and pass everything
 * else through untouched.
 *
 * Returns the surviving changes plus, when a collapsed change was consumed, the new
 * real-node array to hand to `setNodes`.
 */
/**
 * `NodeChange` is a union and its `add` variant carries an `item`, not an `id`. Narrow
 * on the discriminant rather than reaching for `id` and hoping.
 */
const changeNodeId = (change: NodeChange<StudioNode>): string | undefined =>
  change.type === 'add' ? undefined : change.id;

export function translateFoldedNodeChanges(
  changes: NodeChange<StudioNode>[],
  nodes: StudioNode[],
  collapsed: WorkflowModuleRecord[],
): { changes: NodeChange<StudioNode>[]; nodes: StudioNode[] | null } {
  if (!changes.some((change) => isCollapsedNodeId(changeNodeId(change) ?? ''))) {
    return { changes, nodes: null };
  }

  const collapsedIds = new Set(collapsed.map((record) => record.id));
  const moduleIdOf = (nodeId: string): string | undefined => {
    const moduleId = moduleIdForNode(nodeId);
    return moduleId && collapsedIds.has(moduleId) ? moduleId : undefined;
  };

  const passThrough: NodeChange<StudioNode>[] = [];
  let working = nodes;
  let touched = false;

  for (const change of changes) {
    const changedId = changeNodeId(change);
    if (!changedId || !isCollapsedNodeId(changedId)) {
      passThrough.push(change);
      continue;
    }
    const moduleId = changedId.slice(COLLAPSED_NODE_PREFIX.length);
    const members = working.filter((node) => moduleIdOf(node.id) === moduleId);
    if (members.length === 0) continue;

    if (change.type === 'position' && change.position) {
      const from = moduleTopLeft(members);
      const dx = change.position.x - from.x;
      const dy = change.position.y - from.y;
      if (dx === 0 && dy === 0) continue;
      const memberIds = new Set(members.map((node) => node.id));
      working = working.map((node) =>
        memberIds.has(node.id)
          ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
          : node,
      );
      touched = true;
      continue;
    }

    if (change.type === 'select') {
      const memberIds = new Set(members.map((node) => node.id));
      working = working.map((node) =>
        memberIds.has(node.id) ? { ...node, selected: change.selected } : node,
      );
      touched = true;
      continue;
    }

    if (change.type === 'remove') {
      const memberIds = new Set(members.map((node) => node.id));
      working = working.filter((node) => !memberIds.has(node.id));
      touched = true;
    }

    // Dimensions and replace changes describe the card, which owns no persisted
    // geometry. Consumed and dropped rather than written back onto the members.
  }

  return { changes: passThrough, nodes: touched ? working : null };
}

/**
 * A connection the user drew to or from a collapsed card, rewritten onto the real
 * member node and handle behind that port.
 *
 * Without this the card's ports are decoration: React Flow would hand the shell a
 * connection naming a node id the store has never heard of, `isValidConnection` would
 * refuse it, and the wire would vanish on drop with nothing said. Wiring INTO a folded
 * technique's open input is the main thing you drop one onto a canvas to do.
 */
export function resolveFoldedConnection<
  T extends {
    source?: string | null;
    sourceHandle?: string | null;
    target?: string | null;
    targetHandle?: string | null;
  },
>(connection: T, nodes: StudioNode[], edges: Edge[], collapsed: WorkflowModuleRecord[]): T {
  if (collapsed.length === 0) return connection;

  const collapsedIds = new Set(collapsed.map((record) => record.id));
  const resolve = (
    nodeId: string | null | undefined,
    handleId: string | null | undefined,
    side: 'source' | 'target',
  ): { nodeId: string; handleId: string } | undefined => {
    if (!nodeId || !isCollapsedNodeId(nodeId)) return undefined;
    const moduleId = nodeId.slice(COLLAPSED_NODE_PREFIX.length);
    if (!collapsedIds.has(moduleId)) return undefined;
    const members = nodes.filter((node) => moduleIdForNode(node.id) === moduleId);
    if (members.length === 0) return undefined;
    const ports = collapsedModulePorts(members, edges);
    const port = (side === 'source' ? ports.outputPorts : ports.inputPorts).find(
      (candidate) => candidate.id === handleId,
    );
    // Same optional-handleId case: without a real handle there is nothing to rewrite
    // the connection onto, so leave it alone rather than point it at `undefined`.
    return port?.handleId ? { nodeId: port.nodeRef, handleId: port.handleId } : undefined;
  };

  const source = resolve(connection.source, connection.sourceHandle, 'source');
  const target = resolve(connection.target, connection.targetHandle, 'target');
  if (!source && !target) return connection;

  return {
    ...connection,
    ...(source ? { source: source.nodeId, sourceHandle: source.handleId } : {}),
    ...(target ? { target: target.nodeId, targetHandle: target.handleId } : {}),
  };
}
