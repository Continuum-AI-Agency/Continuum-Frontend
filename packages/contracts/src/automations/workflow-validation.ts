import type {
  AutomationPortType,
  AutomationValidationIssue,
  AutomationWorkflowDefinition,
  AutomationWorkflowEdge,
  AutomationWorkflowNode,
  AutomationWorkflowNodeType,
  AutomationWorkflowValidation,
} from './workflow';
import { automationWorkflowDefinitionSchema } from './workflow';

type PortSpec = {
  inputs: Record<string, AutomationPortType | AutomationPortType[]>;
  outputs: Record<string, AutomationPortType>;
  requiredInputs?: string[];
};

const triggerTypes = new Set<AutomationWorkflowNodeType>([
  'trigger.manual',
  'trigger.schedule',
  'trigger.event',
  'trigger.metric',
  'trigger.webhook',
]);

const outcomeTypes = new Set<AutomationWorkflowNodeType>([
  'action.email',
  'action.library_save',
  'action.planner_upsert',
  'action.organic_publish',
  'action.ai_studio_generate',
  'action.paid_optimizer',
  'action.outbound_webhook',
]);

const actionTypes = outcomeTypes;

const passthrough: PortSpec = {
  inputs: { input: 'any' },
  outputs: { output: 'any' },
  requiredInputs: ['input'],
};

export function getAutomationNodePortSpec(node: AutomationWorkflowNode): PortSpec {
  if (triggerTypes.has(node.type)) return { inputs: {}, outputs: { output: 'control' } };
  switch (node.type) {
    case 'source':
      return { inputs: { input: ['control', 'any'] }, outputs: { output: 'records' } };
    case 'integration.query':
    case 'mcp.read':
      return {
        inputs: { input: ['control', 'records', 'text', 'any'] },
        outputs: { output: 'records' },
      };
    case 'instruction':
      return { inputs: { input: ['control', 'any'] }, outputs: { output: 'text' } };
    case 'agent':
      return {
        inputs: { input: ['control', 'records', 'text', 'report', 'media', 'artifact', 'any'] },
        outputs: { output: 'artifact' },
        requiredInputs: ['input'],
      };
    case 'output.formatter':
      return {
        inputs: { input: ['artifact', 'records', 'text', 'any'] },
        outputs: { output: 'structured' },
        requiredInputs: ['input'],
      };
    case 'report':
      return {
        inputs: { input: ['structured', 'text', 'records', 'report', 'any'] },
        outputs: { output: 'report' },
        requiredInputs: ['input'],
      };
    case 'logic.if':
      return {
        inputs: { input: 'any' },
        outputs: { true: 'any', false: 'any' },
        requiredInputs: ['input'],
      };
    case 'logic.switch':
      return {
        inputs: { input: 'any' },
        outputs: Object.fromEntries([
          ...node.config.cases.map((item) => [item.id, 'any' as const]),
          ['default', 'any' as const],
        ]),
        requiredInputs: ['input'],
      };
    case 'logic.parallel':
      return {
        inputs: { input: 'any' },
        outputs: { branch: 'any' },
        requiredInputs: ['input'],
      };
    case 'logic.join':
      return {
        inputs: { input: 'any' },
        outputs: { output: 'records' },
        requiredInputs: ['input'],
      };
    case 'logic.repeat_until':
      return {
        inputs: { input: 'any' },
        outputs: { repeat: 'any', complete: 'any' },
        requiredInputs: ['input'],
      };
    case 'action.email':
      return {
        inputs: { input: ['report', 'structured', 'text'] },
        outputs: { receipt: 'records' },
        requiredInputs: ['input'],
      };
    case 'action.library_save':
      return {
        inputs: { input: ['media', 'report', 'text', 'records'] },
        outputs: { receipt: 'records' },
        requiredInputs: ['input'],
      };
    case 'action.planner_upsert':
    case 'action.organic_publish':
      return {
        inputs: { input: ['records', 'media', 'text'] },
        outputs: { receipt: 'records' },
        requiredInputs: ['input'],
      };
    case 'action.ai_studio_generate':
      return {
        inputs: { input: ['records', 'media', 'text', 'any'] },
        outputs: { receipt: 'media' },
        requiredInputs: ['input'],
      };
    case 'action.paid_optimizer':
      return {
        inputs: { input: ['records', 'text', 'any'] },
        outputs: { receipt: 'records' },
        requiredInputs: ['input'],
      };
    case 'action.outbound_webhook':
      return {
        inputs: { input: 'structured' },
        outputs: { receipt: 'records' },
        requiredInputs: ['input'],
      };
    default:
      return passthrough;
  }
}

const typesCompatible = (
  source: AutomationPortType,
  target: AutomationPortType | AutomationPortType[],
): boolean => {
  const targets = Array.isArray(target) ? target : [target];
  return source === 'any' || targets.includes('any') || targets.includes(source);
};

const pushDuplicateIssues = (
  ids: string[],
  code: Extract<AutomationValidationIssue['code'], 'duplicate_node_id' | 'duplicate_edge_id'>,
  issues: AutomationValidationIssue[],
): void => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        severity: 'error',
        code,
        message: `Duplicate id "${id}".`,
        ...(code === 'duplicate_node_id' ? { nodeId: id } : { edgeId: id }),
      });
    }
    seen.add(id);
  }
};

const topologicalSort = (
  nodes: AutomationWorkflowNode[],
  edges: AutomationWorkflowEdge[],
): { order: string[]; cyclic: string[] } => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return {
    order,
    cyclic: nodes.filter((node) => !order.includes(node.id)).map((node) => node.id),
  };
};

const collectReachableNodeIds = (
  startingNodeIds: string[],
  outgoing: ReadonlyMap<string, AutomationWorkflowEdge[]>,
): Set<string> => {
  const reachable = new Set<string>();
  const queue = [...startingNodeIds];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const edge of outgoing.get(nodeId) ?? []) queue.push(edge.target);
  }
  return reachable;
};

export function validateAutomationWorkflow(input: unknown): AutomationWorkflowValidation {
  const parsed = automationWorkflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      topologicalOrder: [],
      issues: parsed.error.issues.map((issue) => ({
        severity: 'error',
        code: 'invalid_action',
        message: `${issue.path.join('.') || 'workflow'}: ${issue.message}`,
      })),
    };
  }

  const definition = parsed.data;
  const issues: AutomationValidationIssue[] = [];
  pushDuplicateIssues(
    definition.nodes.map((node) => node.id),
    'duplicate_node_id',
    issues,
  );
  pushDuplicateIssues(
    definition.edges.map((edge) => edge.id),
    'duplicate_edge_id',
    issues,
  );

  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, AutomationWorkflowEdge[]>();
  const outgoing = new Map<string, AutomationWorkflowEdge[]>();

  for (const edge of definition.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      issues.push({
        severity: 'error',
        code: 'dangling_edge',
        message: 'Connection references a missing node.',
        edgeId: edge.id,
      });
      continue;
    }
    if (edge.source === edge.target) {
      issues.push({
        severity: 'error',
        code: 'self_connection',
        message: 'A node cannot connect to itself.',
        edgeId: edge.id,
        nodeId: edge.source,
      });
      continue;
    }
    const sourceSpec = getAutomationNodePortSpec(source);
    const targetSpec = getAutomationNodePortSpec(target);
    const sourceType = sourceSpec.outputs[edge.sourceHandle];
    const targetType = targetSpec.inputs[edge.targetHandle];
    if (!sourceType || !targetType || !typesCompatible(sourceType, targetType)) {
      issues.push({
        severity: 'error',
        code: 'incompatible_ports',
        message: `Incompatible connection ${source.type}.${edge.sourceHandle} → ${target.type}.${edge.targetHandle}.`,
        edgeId: edge.id,
      });
    }
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  const triggers = definition.nodes.filter((node) => triggerTypes.has(node.type) && !node.disabled);
  if (triggers.length === 0) {
    issues.push({
      severity: 'error',
      code: 'missing_trigger',
      message: 'Add at least one enabled trigger.',
    });
  }
  const outcomes = definition.nodes.filter((node) => outcomeTypes.has(node.type) && !node.disabled);
  if (outcomes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'missing_outcome',
      message: 'Add at least one enabled outcome action.',
    });
  }

  const reachable = new Set<string>();
  const queue = triggers.map((node) => node.id);
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
  }

  const repeatBodyNodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (node.type !== 'logic.repeat_until' || node.disabled) continue;
    const nodeOutgoing = outgoing.get(node.id) ?? [];
    const repeatStarts = nodeOutgoing
      .filter((edge) => edge.sourceHandle === 'repeat')
      .map((edge) => edge.target);
    const completeStarts = nodeOutgoing
      .filter((edge) => edge.sourceHandle === 'complete')
      .map((edge) => edge.target);

    if (repeatStarts.length === 0 || completeStarts.length === 0) {
      issues.push({
        severity: 'error',
        code: 'invalid_branch_handle',
        message: `"${node.label}" needs both a Repeat branch and an After repetitions branch.`,
        nodeId: node.id,
      });
      continue;
    }

    const repeatReachable = collectReachableNodeIds(repeatStarts, outgoing);
    const completeReachable = collectReachableNodeIds(completeStarts, outgoing);
    const overlap = [...repeatReachable].filter((nodeId) => completeReachable.has(nodeId));
    if (overlap.length > 0) {
      issues.push({
        severity: 'error',
        code: 'invalid_branch_handle',
        message: `"${node.label}" must keep its repeated body separate from its after-repetitions path.`,
        nodeId: node.id,
      });
      continue;
    }

    for (const bodyNodeId of repeatReachable) {
      repeatBodyNodeIds.add(bodyNodeId);
      const bodyNode = nodes.get(bodyNodeId);
      const externalInputs = (incoming.get(bodyNodeId) ?? []).filter(
        (edge) => edge.source !== node.id && !repeatReachable.has(edge.source),
      );
      if (externalInputs.length > 0) {
        issues.push({
          severity: 'error',
          code: 'invalid_branch_handle',
          message: `"${bodyNode?.label ?? bodyNodeId}" cannot receive input from outside "${node.label}". Route that input into the Repeat node instead.`,
          nodeId: bodyNodeId,
        });
      }
      if (bodyNode?.type === 'logic.repeat_until') {
        issues.push({
          severity: 'error',
          code: 'invalid_branch_handle',
          message: `"${node.label}" cannot contain another Repeat node.`,
          nodeId: bodyNode.id,
        });
      }
      if (bodyNode && outcomeTypes.has(bodyNode.type)) {
        issues.push({
          severity: 'error',
          code: 'invalid_action',
          message: `"${bodyNode.label}" cannot perform an external action inside a repeated body. Connect actions after repetitions complete.`,
          nodeId: bodyNode.id,
        });
      }
    }
  }

  for (const node of definition.nodes) {
    if (node.disabled) continue;
    if (!reachable.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'unreachable_node',
        message: `"${node.label}" is not reachable from an enabled trigger.`,
        nodeId: node.id,
      });
    }
    const spec = getAutomationNodePortSpec(node);
    for (const required of spec.requiredInputs ?? []) {
      if (!(incoming.get(node.id) ?? []).some((edge) => edge.targetHandle === required)) {
        issues.push({
          severity: 'error',
          code: 'missing_input',
          message: `"${node.label}" needs a connection on ${required}.`,
          nodeId: node.id,
        });
      }
    }
    if (
      !outcomeTypes.has(node.type) &&
      !node.disabled &&
      (outgoing.get(node.id) ?? []).length === 0 &&
      !repeatBodyNodeIds.has(node.id)
    ) {
      issues.push({
        severity: 'warning',
        code: 'dead_end',
        message: `"${node.label}" has no downstream connection.`,
        nodeId: node.id,
      });
    }
  }

  const sorted = topologicalSort(definition.nodes, definition.edges);
  if (sorted.cyclic.length > 0) {
    issues.push({
      severity: 'error',
      code: 'cycle',
      message: `Direct graph cycles are not allowed. Use bounded loop nodes: ${sorted.cyclic.join(', ')}.`,
    });
  }

  for (const node of definition.nodes) {
    if (node.type === 'logic.if') {
      const handles = new Set((outgoing.get(node.id) ?? []).map((edge) => edge.sourceHandle));
      for (const handle of handles) {
        if (handle !== 'true' && handle !== 'false') {
          issues.push({
            severity: 'error',
            code: 'invalid_branch_handle',
            message: 'If nodes only expose true and false branches.',
            nodeId: node.id,
          });
        }
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
    topologicalOrder: sorted.order,
  };
}

export function isAutomationTriggerType(type: AutomationWorkflowNodeType): boolean {
  return triggerTypes.has(type);
}

export function isAutomationActionType(type: AutomationWorkflowNodeType): boolean {
  return actionTypes.has(type);
}

export function isAutomationOutcomeType(type: AutomationWorkflowNodeType): boolean {
  return outcomeTypes.has(type);
}

export function getAutomationTriggerSchedule(
  definition: AutomationWorkflowDefinition,
): AutomationWorkflowNode | null {
  return (
    definition.nodes.find((node) => node.type === 'trigger.schedule' && !node.disabled) ?? null
  );
}
