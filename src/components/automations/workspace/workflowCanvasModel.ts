import {
  type AutomationPortType,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowValidation,
  getAutomationNodePortSpec,
} from '@continuum/contracts';
import type { Connection, Edge } from '@xyflow/react';
import type { WorkflowCanvasEdge } from './WorkflowEdge';
import type { WorkflowCanvasNode } from './WorkflowNodeCard';

type ExecutionByNodeId = WorkflowCanvasNode['data']['execution'] extends infer Execution
  ? Map<string, Execution>
  : never;

export const toCanvasNodes = ({
  definition,
  validation,
  executionByNodeId,
  locked,
}: {
  definition: AutomationWorkflowDefinition;
  validation?: AutomationWorkflowValidation | null;
  executionByNodeId?: ExecutionByNodeId;
  locked: boolean;
}): WorkflowCanvasNode[] =>
  definition.nodes.map((workflowNode) => ({
    id: workflowNode.id,
    type: 'workflow',
    position: workflowNode.position,
    data: {
      workflowNode,
      locked,
      issues: validation?.issues.filter((issue) => issue.nodeId === workflowNode.id) ?? [],
      execution: executionByNodeId?.get(workflowNode.id),
    },
  }));

export const toCanvasEdges = ({
  definition,
  completedNodeIds = new Set<string>(),
}: {
  definition: AutomationWorkflowDefinition;
  completedNodeIds?: ReadonlySet<string>;
}): WorkflowCanvasEdge[] => {
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  return definition.edges.map((edge) => ({
    ...edge,
    type: 'workflow',
    data: {
      status:
        completedNodeIds.has(edge.source) && completedNodeIds.has(edge.target)
          ? 'completed'
          : 'idle',
      sourceLabel: nodes.get(edge.source)?.label ?? edge.source,
      targetLabel: nodes.get(edge.target)?.label ?? edge.target,
      sourcePort: edge.sourceHandle,
      targetPort: edge.targetHandle,
    },
  }));
};

export const toWorkflowDefinition = ({
  base,
  nodes,
  edges,
}: {
  base: AutomationWorkflowDefinition;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
}): AutomationWorkflowDefinition => ({
  ...base,
  nodes: nodes.map((node) => ({
    ...node.data.workflowNode,
    position: node.position,
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? 'output',
    target: edge.target,
    targetHandle: edge.targetHandle ?? 'input',
  })),
});

const portTypesCompatible = (
  source: AutomationPortType,
  target: AutomationPortType | AutomationPortType[],
) => {
  const targets = Array.isArray(target) ? target : [target];
  return source === 'any' || targets.includes('any') || targets.includes(source);
};

const wouldCreateCycle = ({ connection, edges }: { connection: Connection; edges: Edge[] }) => {
  if (!connection.source || !connection.target) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    if (current === connection.source) return true;
    visited.add(current);
    pending.push(...(outgoing.get(current) ?? []));
  }
  return false;
};

export type WorkflowConnectionEvaluation =
  | { valid: true; code: 'valid'; reason: 'Connection is valid.' }
  | {
      valid: false;
      code:
        | 'incomplete'
        | 'self_connection'
        | 'duplicate'
        | 'missing_node'
        | 'disabled_node'
        | 'missing_port'
        | 'incompatible_ports'
        | 'cycle';
      reason: string;
    };

const portLabel = (port: AutomationPortType) => `${port.slice(0, 1).toUpperCase()}${port.slice(1)}`;

export function evaluateWorkflowConnection({
  connection,
  nodes,
  edges,
}: {
  connection: Connection;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
}): WorkflowConnectionEvaluation {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    return { valid: false, code: 'incomplete', reason: 'Choose both an output and an input.' };
  }
  if (connection.source === connection.target) {
    return { valid: false, code: 'self_connection', reason: 'A node cannot connect to itself.' };
  }

  if (
    edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        edge.sourceHandle === connection.sourceHandle &&
        edge.targetHandle === connection.targetHandle,
    )
  ) {
    return { valid: false, code: 'duplicate', reason: 'This connection already exists.' };
  }

  const source = nodes.find((node) => node.id === connection.source)?.data.workflowNode;
  const target = nodes.find((node) => node.id === connection.target)?.data.workflowNode;
  if (!source || !target) {
    return { valid: false, code: 'missing_node', reason: 'One of these nodes is unavailable.' };
  }
  if (source.disabled || target.disabled) {
    return {
      valid: false,
      code: 'disabled_node',
      reason: 'Enable both nodes before connecting them.',
    };
  }

  const sourcePort = getAutomationNodePortSpec(source).outputs[connection.sourceHandle];
  const targetPort = getAutomationNodePortSpec(target).inputs[connection.targetHandle];
  if (!sourcePort || !targetPort) {
    return { valid: false, code: 'missing_port', reason: 'This port is no longer available.' };
  }
  if (!portTypesCompatible(sourcePort, targetPort)) {
    return {
      valid: false,
      code: 'incompatible_ports',
      reason: `${portLabel(sourcePort)} output cannot connect to this input.`,
    };
  }
  if (wouldCreateCycle({ connection, edges })) {
    return {
      valid: false,
      code: 'cycle',
      reason: 'This connection would create a cycle. Use repeatUntil for bounded repetition.',
    };
  }

  return { valid: true, code: 'valid', reason: 'Connection is valid.' };
}

export function isWorkflowConnectionValid(input: {
  connection: Connection;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
}): boolean {
  return evaluateWorkflowConnection(input).valid;
}

export function findCompatibleWorkflowConnection({
  sourceId,
  targetId,
  nodes,
  edges,
}: {
  sourceId: string;
  targetId: string;
  nodes: WorkflowCanvasNode[];
  edges: Edge[];
}): {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
} | null {
  const source = nodes.find((node) => node.id === sourceId)?.data.workflowNode;
  const target = nodes.find((node) => node.id === targetId)?.data.workflowNode;
  if (!source || !target) return null;

  const sourceHandles = Object.keys(getAutomationNodePortSpec(source).outputs);
  const targetHandles = Object.keys(getAutomationNodePortSpec(target).inputs);
  for (const sourceHandle of sourceHandles) {
    for (const targetHandle of targetHandles) {
      const connection = { source: sourceId, sourceHandle, target: targetId, targetHandle };
      if (evaluateWorkflowConnection({ connection, nodes, edges }).valid) return connection;
    }
  }
  return null;
}
