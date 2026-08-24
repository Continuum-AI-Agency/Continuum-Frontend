import { z } from 'zod';
import {
  type ConnectSpec,
  connectSpecSchema,
  type NodeSpec,
  nodeSpecSchema,
} from './workflow-builder';
import { studioNodeTypeEnum, studioPortDataTypeSchema } from './workflow-graph';

const fragmentIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

const fragmentPortIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i);

export const workflowFragmentKindSchema = z.enum([
  'reference',
  'generation',
  'transformation',
  'assembly',
  'delivery',
]);
export type WorkflowFragmentKind = z.infer<typeof workflowFragmentKindSchema>;

export const workflowFragmentPortSchema = z
  .object({
    id: fragmentPortIdSchema,
    nodeRef: z.string().min(1).max(120),
  })
  .strict();
export type WorkflowFragmentPort = z.infer<typeof workflowFragmentPortSchema>;

export const workflowFragmentSchema = z
  .object({
    version: z.literal(1),
    moduleId: fragmentIdSchema,
    label: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    nodes: z.array(nodeSpecSchema).min(1).max(24),
    connections: z.array(connectSpecSchema).max(48),
    inputPorts: z.array(workflowFragmentPortSchema).max(12),
    outputPorts: z.array(workflowFragmentPortSchema).max(12),
  })
  .strict();
export type WorkflowFragment = z.infer<typeof workflowFragmentSchema>;

// ---------------------------------------------------------------------------
// Techniques — a saved canvas selection, re-appliable as a subgraph
// ---------------------------------------------------------------------------
//
// A Technique is a `canvas_workflows` row (per brand) or a `workflow_library`
// row with visibility='global' (a premade) whose metadata carries the block
// below. Zero new tables: the nodes and edges live in their normal columns, so
// the apply path is the same one a plain saved workflow already travels.
//
// The port shape EXTENDS the agent fragment's port rather than widening it. The
// agent path's `workflowFragmentPortSchema` is `.strict()` and hand-duplicated as
// an LLM `Output.object` schema in the Backend's fragmentWorkers, so a new field
// there is a change to what a model is asked to emit. A Technique needs none of
// that — it needs the same id/nodeRef discipline plus the handle it actually
// sits on.

export const canvasTechniquePortSchema = workflowFragmentPortSchema
  .extend({
    /** The real React Flow handle this port sits on, e.g. 'ref-image'. */
    handleId: z.string().min(1).max(120).optional(),
    dataType: studioPortDataTypeSchema.optional(),
    /** Human label, from the same PORT_LABELS table the canvas renders. */
    label: z.string().min(1).max(120).optional(),
    /**
     * Which inference rule produced this port:
     *   'edge'     — an edge crosses the selection boundary here
     *   'open'     — a required input handle nothing is wired into
     *   'terminal' — a media producer inside the selection with no outgoing edge
     * Kept so a reader can tell a declared contract from a derived one.
     */
    origin: z.enum(['edge', 'open', 'terminal']).optional(),
  })
  .strict();
export type CanvasTechniquePort = z.infer<typeof canvasTechniquePortSchema>;

export const canvasTechniqueMetadataSchema = z
  .object({
    version: z.literal(1),
    kind: workflowFragmentKindSchema,
    // Same cap as workflowFragmentSchema: a fragment with more than 12 ports on a
    // side is not a reusable piece, it is a canvas.
    inputPorts: z.array(canvasTechniquePortSchema).max(12),
    outputPorts: z.array(canvasTechniquePortSchema).max(12),
  })
  .strict();
export type CanvasTechniqueMetadata = z.infer<typeof canvasTechniqueMetadataSchema>;

/** The metadata key, mirroring STARTER_METADATA_FLAG on the Frontend. */
export const TECHNIQUE_METADATA_FLAG = 'technique';

/**
 * Reads the technique block off a workflow row's metadata bag. Returns undefined
 * for every row that is not a Technique — which is most of them — so callers can
 * use it as both the predicate and the parse.
 */
export function parseTechniqueMetadata(
  metadata?: Record<string, unknown> | null,
): CanvasTechniqueMetadata | undefined {
  if (!metadata) return undefined;
  const parsed = canvasTechniqueMetadataSchema.safeParse(metadata[TECHNIQUE_METADATA_FLAG]);
  return parsed.success ? parsed.data : undefined;
}

const workflowFragmentInputRequestSchema = z
  .object({
    id: fragmentPortIdSchema,
    description: z.string().min(1).max(300),
    role: z.string().min(1).max(80),
  })
  .strict();

const workflowFragmentOutputRequestSchema = z
  .object({
    id: fragmentPortIdSchema,
    description: z.string().min(1).max(300),
  })
  .strict();

const duplicateValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
};

export const workflowFragmentTaskSchema = z
  .object({
    id: fragmentIdSchema,
    label: z.string().min(1).max(120),
    kind: workflowFragmentKindSchema,
    objective: z.string().min(1).max(3000),
    allowedNodeTypes: z.array(studioNodeTypeEnum).min(1).max(10),
    inputPorts: z.array(workflowFragmentInputRequestSchema).max(12),
    outputPorts: z.array(workflowFragmentOutputRequestSchema).max(12),
  })
  .strict()
  .superRefine((task, context) => {
    for (const id of duplicateValues(task.inputPorts.map((port) => port.id))) {
      context.addIssue({
        code: 'custom',
        path: ['inputPorts'],
        message: `Duplicate input port "${id}"`,
      });
    }
    for (const id of duplicateValues(task.outputPorts.map((port) => port.id))) {
      context.addIssue({
        code: 'custom',
        path: ['outputPorts'],
        message: `Duplicate output port "${id}"`,
      });
    }
  });
export type WorkflowFragmentTask = z.infer<typeof workflowFragmentTaskSchema>;

const moduleJoinSourceSchema = z
  .object({
    kind: z.literal('module'),
    moduleId: fragmentIdSchema,
    portId: fragmentPortIdSchema,
  })
  .strict();

const canvasNodeJoinSourceSchema = z
  .object({
    kind: z.literal('canvas_node'),
    nodeId: z.string().min(1).max(160),
  })
  .strict();

export const workflowFragmentJoinSchema = z
  .object({
    from: z.discriminatedUnion('kind', [moduleJoinSourceSchema, canvasNodeJoinSourceSchema]),
    to: z
      .object({
        moduleId: fragmentIdSchema,
        portId: fragmentPortIdSchema,
      })
      .strict(),
    role: z.string().min(1).max(80).optional(),
  })
  .strict();
export type WorkflowFragmentJoin = z.infer<typeof workflowFragmentJoinSchema>;

const hasModuleCycle = (moduleIds: string[], joins: WorkflowFragmentJoin[]): boolean => {
  const outgoing = new Map<string, string[]>(moduleIds.map((id) => [id, []]));
  for (const join of joins) {
    if (join.from.kind !== 'module') continue;
    outgoing.get(join.from.moduleId)?.push(join.to.moduleId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (moduleId: string): boolean => {
    if (visiting.has(moduleId)) return true;
    if (visited.has(moduleId)) return false;
    visiting.add(moduleId);
    for (const target of outgoing.get(moduleId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(moduleId);
    visited.add(moduleId);
    return false;
  };
  return moduleIds.some(visit);
};

export const parallelWorkflowPlanSchema = z
  .object({
    objective: z.string().min(1).max(4000),
    modules: z.array(workflowFragmentTaskSchema).min(2).max(6),
    joins: z.array(workflowFragmentJoinSchema).max(24),
  })
  .strict()
  .superRefine((plan, context) => {
    const moduleById = new Map(plan.modules.map((module) => [module.id, module]));
    for (const id of duplicateValues(plan.modules.map((module) => module.id))) {
      context.addIssue({
        code: 'custom',
        path: ['modules'],
        message: `Duplicate module id "${id}"`,
      });
    }

    plan.joins.forEach((join, index) => {
      if (join.from.kind === 'module') {
        const sourceRef = join.from;
        const source = moduleById.get(sourceRef.moduleId);
        if (!source?.outputPorts.some((port) => port.id === sourceRef.portId)) {
          context.addIssue({
            code: 'custom',
            path: ['joins', index, 'from'],
            message: `Unknown output port "${sourceRef.moduleId}.${sourceRef.portId}"`,
          });
        }
      }
      const target = moduleById.get(join.to.moduleId);
      if (!target?.inputPorts.some((port) => port.id === join.to.portId)) {
        context.addIssue({
          code: 'custom',
          path: ['joins', index, 'to'],
          message: `Unknown input port "${join.to.moduleId}.${join.to.portId}"`,
        });
      }
    });

    if (
      hasModuleCycle(
        plan.modules.map((module) => module.id),
        plan.joins,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['joins'],
        message: 'Workflow modules must form an acyclic dependency graph',
      });
    }
  });
export type ParallelWorkflowPlan = z.infer<typeof parallelWorkflowPlanSchema>;

export interface JoinedWorkflowModule {
  id: string;
  label: string;
  kind: WorkflowFragmentKind;
  nodeRefs: string[];
  inputPorts: WorkflowFragmentPort[];
  outputPorts: WorkflowFragmentPort[];
}

export interface JoinedWorkflowFragments {
  ok: boolean;
  nodes: NodeSpec[];
  connections: ConnectSpec[];
  modules: JoinedWorkflowModule[];
  errors: string[];
}

const validateFragmentPorts = (
  task: WorkflowFragmentTask,
  fragment: WorkflowFragment,
  nodeRefs: Set<string>,
): string[] => {
  const errors: string[] = [];
  const validate = (
    direction: 'input' | 'output',
    declared: Array<{ id: string }>,
    actual: WorkflowFragmentPort[],
  ) => {
    const actualById = new Map(actual.map((port) => [port.id, port]));
    for (const port of declared) {
      if (!actualById.has(port.id)) {
        errors.push(`Module "${task.id}" omitted declared ${direction} port "${port.id}".`);
      }
    }
    const declaredIds = new Set(declared.map((port) => port.id));
    for (const port of actual) {
      if (!declaredIds.has(port.id)) {
        errors.push(`Module "${task.id}" returned undeclared ${direction} port "${port.id}".`);
      }
      if (!nodeRefs.has(port.nodeRef)) {
        errors.push(
          `Module "${task.id}" ${direction} port "${port.id}" references missing node "${port.nodeRef}".`,
        );
      }
    }
  };
  validate('input', task.inputPorts, fragment.inputPorts);
  validate('output', task.outputPorts, fragment.outputPorts);
  return errors;
};

const namespacePort = (moduleId: string, port: WorkflowFragmentPort): WorkflowFragmentPort => ({
  ...port,
  nodeRef: `${moduleId}:${port.nodeRef}`,
});

export function joinWorkflowFragments(input: {
  plan: ParallelWorkflowPlan;
  fragments: WorkflowFragment[];
}): JoinedWorkflowFragments {
  const parsedPlan = parallelWorkflowPlanSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    return {
      ok: false,
      nodes: [],
      connections: [],
      modules: [],
      errors: parsedPlan.error.issues.map((issue) => issue.message),
    };
  }

  const errors: string[] = [];
  const fragmentByModule = new Map<string, WorkflowFragment>();
  for (const candidate of input.fragments) {
    const parsed = workflowFragmentSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(
        `Invalid fragment "${candidate.moduleId ?? 'unknown'}": ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
      continue;
    }
    if (fragmentByModule.has(parsed.data.moduleId)) {
      errors.push(`Duplicate fragment for module "${parsed.data.moduleId}".`);
      continue;
    }
    fragmentByModule.set(parsed.data.moduleId, parsed.data);
  }

  const taskIds = new Set(parsedPlan.data.modules.map((task) => task.id));
  for (const moduleId of fragmentByModule.keys()) {
    if (!taskIds.has(moduleId)) errors.push(`Unexpected fragment for module "${moduleId}".`);
  }

  const nodes: NodeSpec[] = [];
  const connections: ConnectSpec[] = [];
  const modules: JoinedWorkflowModule[] = [];
  const portsByModule = new Map<
    string,
    { input: Map<string, WorkflowFragmentPort>; output: Map<string, WorkflowFragmentPort> }
  >();

  for (const task of parsedPlan.data.modules) {
    const fragment = fragmentByModule.get(task.id);
    if (!fragment) {
      errors.push(`Missing fragment for module "${task.id}".`);
      continue;
    }
    const refs = fragment.nodes.map((node) => node.ref);
    const nodeRefs = new Set(refs);
    for (const ref of duplicateValues(refs)) {
      errors.push(`Module "${task.id}" returned duplicate node ref "${ref}".`);
    }
    const allowedNodeTypes: readonly string[] = task.allowedNodeTypes;
    for (const node of fragment.nodes) {
      if (!allowedNodeTypes.includes(node.type)) {
        errors.push(`Module "${task.id}" used disallowed node type "${node.type}".`);
      }
    }
    for (const connection of fragment.connections) {
      if (!nodeRefs.has(connection.from_ref) || !nodeRefs.has(connection.to_ref)) {
        errors.push(
          `Module "${task.id}" has an internal connection with a missing endpoint: ${connection.from_ref} → ${connection.to_ref}.`,
        );
      }
    }
    errors.push(...validateFragmentPorts(task, fragment, nodeRefs));

    const namespacedInputs = fragment.inputPorts.map((port) => namespacePort(task.id, port));
    const namespacedOutputs = fragment.outputPorts.map((port) => namespacePort(task.id, port));
    portsByModule.set(task.id, {
      input: new Map(namespacedInputs.map((port) => [port.id, port])),
      output: new Map(namespacedOutputs.map((port) => [port.id, port])),
    });
    nodes.push(
      ...fragment.nodes.map((node) => ({
        ...node,
        ref: `${task.id}:${node.ref}`,
        data: {
          ...(node.data ?? {}),
          workflowFragmentId: task.id,
          workflowFragmentRole: node.ref,
        },
      })),
    );
    connections.push(
      ...fragment.connections.map((connection) => ({
        ...connection,
        from_ref: `${task.id}:${connection.from_ref}`,
        to_ref: `${task.id}:${connection.to_ref}`,
      })),
    );
    modules.push({
      id: task.id,
      label: task.label,
      kind: task.kind,
      nodeRefs: refs.map((ref) => `${task.id}:${ref}`),
      inputPorts: namespacedInputs,
      outputPorts: namespacedOutputs,
    });
  }

  for (const join of parsedPlan.data.joins) {
    const target = portsByModule.get(join.to.moduleId)?.input.get(join.to.portId);
    const targetTask = parsedPlan.data.modules.find((module) => module.id === join.to.moduleId);
    const targetRequest = targetTask?.inputPorts.find((port) => port.id === join.to.portId);
    const source =
      join.from.kind === 'canvas_node'
        ? join.from.nodeId
        : portsByModule.get(join.from.moduleId)?.output.get(join.from.portId)?.nodeRef;
    if (!source || !target) {
      errors.push(
        `Could not resolve join ${join.from.kind === 'module' ? `${join.from.moduleId}.${join.from.portId}` : join.from.nodeId} → ${join.to.moduleId}.${join.to.portId}.`,
      );
      continue;
    }
    connections.push({
      from_ref: source,
      to_ref: target.nodeRef,
      role: join.role ?? targetRequest?.role,
    });
  }

  return { ok: errors.length === 0, nodes, connections, modules, errors };
}
