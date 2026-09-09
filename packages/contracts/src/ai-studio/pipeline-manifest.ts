import { z } from 'zod';
import { elementCategorySchema } from '../media/element';
import { pinnedLibraryAssetRefSchema } from '../media/library-reference';
import { studioPortDataTypeSchema } from './workflow-graph';

/**
 * What a caller — a model, a bench, the DCO, the Library — needs to know about a Pipeline
 * BEFORE it spends anything: which ports it must feed, what comes out, and whether a server
 * can run it at all.
 *
 * The Backend's `describePipeline` produces this from a saved graph; the Frontend's Library
 * and workflow loader render it. That second reader is why it lives here: a shape that
 * crosses the FE/BE boundary is a contract, not a Backend interface (root AGENTS.md §4).
 *
 * TWO HEADLESS ANSWERS, and the distinction is the whole point of a port contract:
 * `runnable_headless` is the walker's verdict on the SAVED graph, which is what a corpus
 * sweep can compare against `planHeadlessCanvasNodes` directly. `runnable_when_fed` is the
 * verdict on the graph a caller actually gets — every declared input port wired to a source
 * — and it is the one a run should gate on. A pipeline whose only prompt arrives through a
 * declared port is `runnable_headless: false` and `runnable_when_fed: true`, and refusing it
 * on the first number would refuse the exact shape publishing exists to create.
 */

/** Reported instead of dropping a port whose node is not on the graph. */
export const MISSING_NODE = 'missing_node';

export const pipelineManifestInputSchema = z
  .object({
    port_id: z.string().min(1),
    kind: studioPortDataTypeSchema,
    /** The caller must supply this or the run refuses. */
    required: z.boolean(),
    label: z.string().optional(),
    /** The node this port feeds, or `missing_node`. */
    consumer_node_type: z.string(),
    /**
     * Whether a value for this port can actually be wired in.
     *
     * The constraint is OCCUPANCY, not legality: `resolveConnection` walks every allowed
     * target handle and takes the first `isValidConnection` accepts, so a port declared on a
     * handle the AUTHOR already feeds can never be written — and it fails LATE, inside
     * `runPipeline`, as "no compatible handle". Asking the same pure resolver at publish or
     * display time moves that failure to before anything is spent.
     */
    handle_free: z.boolean(),
  })
  .strict();
export type PipelineManifestInput = z.infer<typeof pipelineManifestInputSchema>;

export const pipelineManifestOutputSchema = z
  .object({
    port_id: z.string().min(1),
    node_type: z.string(),
    media: z.enum(['image', 'video', 'other']),
    aspect_ratio: z.string().optional(),
    image_size: z.string().optional(),
    resolution: z.string().optional(),
    duration_seconds: z.number().optional(),
    /**
     * How many assets this port produces per attempt.
     *
     * One unless the author set `variationCount`, which multiplies every attempt — a node
     * saved at 4 makes twelve generations across a 3-attempt refusal. Reporting the authored
     * number rather than a flat 1 is what lets a caller see that before it pays for it.
     */
    count: z.number(),
  })
  .strict();
export type PipelineManifestOutput = z.infer<typeof pipelineManifestOutputSchema>;

export const pipelineManifestHeadlessSchema = z
  .object({
    /** The walker's verdict on the graph AS SAVED. */
    runnable_headless: z.boolean(),
    /** Every blocker on the saved graph, named. Empty string when there are none. */
    blocked: z.string(),
    /** The verdict once every declared input port is fed — what a real run gets. */
    runnable_when_fed: z.boolean(),
    blocked_when_fed: z.string(),
    generators: z.number(),
    generator_cap: z.number(),
    over_cap: z.boolean(),
    /** True when the graph carries a render node an authorised run could execute. */
    requires_authorisation: z.boolean(),
  })
  .strict();
export type PipelineManifestHeadless = z.infer<typeof pipelineManifestHeadlessSchema>;

export const pipelineManifestSchema = z
  .object({
    pipeline_id: z.string().min(1),
    name: z.string(),
    source: z.enum(['brand', 'global']),
    inputs: z.array(pipelineManifestInputSchema),
    outputs: z.array(pipelineManifestOutputSchema),
    headless: pipelineManifestHeadlessSchema,
    /** The one field a caller should gate on: fed-runnable AND every required port writable. */
    runnable: z.boolean(),
  })
  .strict();
export type PipelineManifest = z.infer<typeof pipelineManifestSchema>;

/** `GET /api/ai-studio/pipelines?brandProfileId=…` — every Pipeline this brand may run. */
export const PIPELINE_MANIFEST_LIST_ROUTE = '/api/ai-studio/pipelines';

export const pipelineManifestListResponseSchema = z
  .object({ manifests: z.array(pipelineManifestSchema) })
  .strict();
export type PipelineManifestListResponse = z.infer<typeof pipelineManifestListResponseSchema>;

// ---------------------------------------------------------------------------
// Pipeline Capability V2 — the published, agent-facing interface
// ---------------------------------------------------------------------------

const capabilityIdSchema = z.string().uuid();
const capabilityKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_-]*$/);
const semanticRoleSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/);
const pipelineMediaSchema = z.enum(['image', 'video', 'audio', 'document', 'other']);

/** Stable family + immutable published revision. Invocations must echo all three fields. */
export const pipelineCapabilityIdentitySchema = z
  .object({
    family_id: capabilityIdSchema,
    revision: z.number().int().positive(),
    contract_hash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type PipelineCapabilityIdentity = z.infer<typeof pipelineCapabilityIdentitySchema>;

const semanticInputBase = {
  input_id: capabilityKeySchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(500).optional(),
  required: z.boolean(),
  semantic_role: semanticRoleSchema,
};

export const pipelineSemanticInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...semanticInputBase,
      kind: z.literal('text'),
      min_length: z.number().int().nonnegative().optional(),
      max_length: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      ...semanticInputBase,
      kind: z.literal('asset'),
      media: pipelineMediaSchema,
      min_items: z.number().int().nonnegative(),
      max_items: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      ...semanticInputBase,
      kind: z.literal('element'),
      allowed_categories: z.array(elementCategorySchema).min(1),
      min_items: z.number().int().nonnegative(),
      max_items: z.number().int().positive(),
    })
    .strict(),
]);
export type PipelineSemanticInput = z.infer<typeof pipelineSemanticInputSchema>;

const scalarControlBase = {
  control_id: capabilityKeySchema,
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(500).optional(),
  required: z.boolean(),
};

/** Only these declared scalar controls may cross the public seam into graph configuration. */
export const pipelineScalarControlSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...scalarControlBase,
      kind: z.literal('boolean'),
      default: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...scalarControlBase,
      kind: z.literal('integer'),
      minimum: z.number().int().optional(),
      maximum: z.number().int().optional(),
      step: z.number().int().positive().optional(),
      default: z.number().int().optional(),
    })
    .strict(),
  z
    .object({
      ...scalarControlBase,
      kind: z.literal('number'),
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
      step: z.number().positive().finite().optional(),
      default: z.number().finite().optional(),
    })
    .strict(),
  z
    .object({
      ...scalarControlBase,
      kind: z.literal('string'),
      min_length: z.number().int().nonnegative().optional(),
      max_length: z.number().int().positive().optional(),
      default: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ...scalarControlBase,
      kind: z.literal('enum'),
      options: z.array(z.string().min(1).max(120)).min(1).max(50),
      default: z.string().min(1).max(120).optional(),
    })
    .strict(),
]);
export type PipelineScalarControl = z.infer<typeof pipelineScalarControlSchema>;

export const pipelineCapabilityOutputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      output_id: capabilityKeySchema,
      kind: z.literal('asset'),
      label: z.string().min(1).max(120),
      description: z.string().min(1).max(500).optional(),
      media: pipelineMediaSchema,
      count: z.number().int().positive().max(24),
    })
    .strict(),
  z
    .object({
      output_id: capabilityKeySchema,
      kind: z.literal('element_candidate'),
      label: z.string().min(1).max(120),
      description: z.string().min(1).max(500).optional(),
      category: elementCategorySchema,
      count: z.number().int().positive().max(8),
    })
    .strict(),
]);
export type PipelineCapabilityOutput = z.infer<typeof pipelineCapabilityOutputSchema>;

export const pipelineExecutionPolicySchema = z
  .object({
    runtime: z.enum(['server', 'client', 'hybrid']),
    timeout_seconds: z.number().int().positive().max(3_600),
    max_attempts: z.number().int().positive().max(3),
    max_generations: z.number().int().positive().max(24),
  })
  .strict();
export type PipelineExecutionPolicy = z.infer<typeof pipelineExecutionPolicySchema>;

export const pipelineCostPolicySchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    max_amount_minor: z.number().int().nonnegative(),
    approval: z.enum(['within_limit', 'always']),
    on_exceed: z.literal('refuse'),
  })
  .strict();
export type PipelineCostPolicy = z.infer<typeof pipelineCostPolicySchema>;

export const pipelineQualityPolicySchema = z
  .object({
    minimum_score: z.number().min(0).max(1),
    required_checks: z.array(capabilityKeySchema).min(1).max(24),
    on_failure: z.literal('refuse'),
  })
  .strict();
export type PipelineQualityPolicy = z.infer<typeof pipelineQualityPolicySchema>;

export const pipelineAgentGuideSchema = z
  .object({
    version: z.literal(1),
    use_when: z.array(z.string().min(1).max(160)).min(1).max(6),
    avoid_when: z.array(z.string().min(1).max(160)).max(6),
    input_guidance: z
      .array(
        z
          .object({
            input_id: capabilityKeySchema,
            instruction: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(24),
    invocation_notes: z.array(z.string().min(1).max(300)).max(8),
  })
  .strict();
export type PipelineAgentGuide = z.infer<typeof pipelineAgentGuideSchema>;

export const pipelineCapabilityV2Schema = z
  .object({
    contract_version: z.literal(2),
    pipeline_id: capabilityIdSchema,
    identity: pipelineCapabilityIdentitySchema,
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1_000).optional(),
    agent_guide: pipelineAgentGuideSchema.optional(),
    source: z.enum(['brand', 'global']),
    inputs: z.array(pipelineSemanticInputSchema).max(24),
    controls: z.array(pipelineScalarControlSchema).max(24),
    outputs: z.array(pipelineCapabilityOutputSchema).min(1).max(24),
    execution_policy: pipelineExecutionPolicySchema,
    cost_policy: pipelineCostPolicySchema,
    quality_policy: pipelineQualityPolicySchema,
  })
  .strict()
  .superRefine((capability, context) => {
    if (!capability.agent_guide) return;
    const declaredInputs = new Set(capability.inputs.map((input) => input.input_id));
    const guidedInputs = new Set<string>();
    capability.agent_guide.input_guidance.forEach((guidance, index) => {
      if (!declaredInputs.has(guidance.input_id)) {
        context.addIssue({
          code: 'custom',
          path: ['agent_guide', 'input_guidance', index, 'input_id'],
          message: 'Agent guidance may reference only a declared public input.',
        });
      }
      if (guidedInputs.has(guidance.input_id)) {
        context.addIssue({
          code: 'custom',
          path: ['agent_guide', 'input_guidance', index, 'input_id'],
          message: 'Each public input may have at most one agent-guidance entry.',
        });
      }
      guidedInputs.add(guidance.input_id);
    });
  });
export type PipelineCapabilityV2 = z.infer<typeof pipelineCapabilityV2Schema>;

/** Compact discovery row. Load the full capability with pipeline_describe before invoking it. */
export const pipelineCapabilitySummarySchema = z
  .object({
    pipeline_id: capabilityIdSchema,
    identity: pipelineCapabilityIdentitySchema,
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1_000).optional(),
    source: z.enum(['brand', 'global']),
    use_when: z.array(z.string().min(1).max(160)).max(6),
    required_inputs: z.array(pipelineSemanticInputSchema).max(24),
    outputs: z.array(pipelineCapabilityOutputSchema).min(1).max(24),
    control_count: z.number().int().nonnegative().max(24),
  })
  .strict();
export type PipelineCapabilitySummary = z.infer<typeof pipelineCapabilitySummarySchema>;

/**
 * A compatibility reader for catalogs during the V1 to V2 transition.
 * `pipelineManifestSchema` itself remains unchanged; only this reader stamps legacy identity.
 */
export const legacyPipelineCapabilitySchema = pipelineManifestSchema.transform((legacy) => ({
  ...legacy,
  contract_version: 1 as const,
  legacy: true as const,
}));
export type LegacyPipelineCapability = z.infer<typeof legacyPipelineCapabilitySchema>;

export const pipelineCapabilitySchema = z.union([
  pipelineCapabilityV2Schema,
  legacyPipelineCapabilitySchema,
]);
export type PipelineCapability = z.infer<typeof pipelineCapabilitySchema>;

export const pipelineCapabilityListResponseSchema = z
  .object({ capabilities: z.array(pipelineCapabilityV2Schema) })
  .strict();
export type PipelineCapabilityListResponse = z.infer<typeof pipelineCapabilityListResponseSchema>;

export const pipelineInvocationOriginSchema = z.enum([
  'client',
  'service_provider',
  'server_agent',
]);
export type PipelineInvocationOrigin = z.infer<typeof pipelineInvocationOriginSchema>;

export const pipelineInvocationInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }).strict(),
  z
    .object({
      kind: z.literal('asset'),
      assets: z.array(pinnedLibraryAssetRefSchema).min(1).max(24),
    })
    .strict(),
  z
    .object({
      kind: z.literal('element'),
      element_id: capabilityIdSchema,
    })
    .strict(),
]);
export type PipelineInvocationInput = z.infer<typeof pipelineInvocationInputSchema>;

/** The server-owned, exact-version input set persisted before execution starts. */
export const pipelineResolvedInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string() }).strict(),
  z
    .object({
      kind: z.literal('asset'),
      assets: z.array(pinnedLibraryAssetRefSchema).min(1).max(24),
    })
    .strict(),
  z
    .object({
      kind: z.literal('element'),
      element_id: capabilityIdSchema,
      reference_assets: z.array(pinnedLibraryAssetRefSchema).min(1).max(8),
    })
    .strict(),
]);
export type PipelineResolvedInput = z.infer<typeof pipelineResolvedInputSchema>;

export const pipelineScalarValueSchema = z.union([z.boolean(), z.number().finite(), z.string()]);
export type PipelineScalarValue = z.infer<typeof pipelineScalarValueSchema>;

export const pipelineInvocationRequestSchema = z
  .object({
    brand_profile_id: capabilityIdSchema,
    pipeline_id: capabilityIdSchema,
    identity: pipelineCapabilityIdentitySchema,
    idempotency_key: z.string().min(1).max(200),
    origin: pipelineInvocationOriginSchema,
    inputs: z.record(capabilityKeySchema, pipelineInvocationInputSchema),
    controls: z.record(capabilityKeySchema, pipelineScalarValueSchema),
  })
  .strict();
export type PipelineInvocationRequest = z.infer<typeof pipelineInvocationRequestSchema>;

export const pipelineQualityCheckEvidenceSchema = z
  .object({
    check_id: capabilityKeySchema,
    verdict: z.enum(['passed', 'failed', 'not_evaluated']),
    score: z.number().min(0).max(1).nullable(),
    evidence: z.string().min(1).max(2_000),
  })
  .strict();
export type PipelineQualityCheckEvidence = z.infer<typeof pipelineQualityCheckEvidenceSchema>;

export const pipelineQualityEvidenceSchema = z
  .object({
    verdict: z.enum(['passed', 'failed', 'not_evaluated']),
    score: z.number().min(0).max(1).nullable(),
    checks: z.array(pipelineQualityCheckEvidenceSchema).max(24),
  })
  .strict()
  .superRefine((quality, context) => {
    if (quality.verdict !== 'not_evaluated' && quality.score === null) {
      context.addIssue({
        code: 'custom',
        path: ['score'],
        message: 'A passed or failed quality verdict requires a score.',
      });
    }
  });
export type PipelineQualityEvidence = z.infer<typeof pipelineQualityEvidenceSchema>;

export const pipelineArtifactProvenanceSchema = z
  .object({
    run_id: capabilityIdSchema,
    pipeline_id: capabilityIdSchema,
    identity: pipelineCapabilityIdentitySchema,
    output_id: capabilityKeySchema,
    generated_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type PipelineArtifactProvenance = z.infer<typeof pipelineArtifactProvenanceSchema>;

export const pipelineElementCandidateSchema = z
  .object({
    candidate_id: capabilityIdSchema,
    name: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().max(2_000).nullable(),
    rights_note: z.string().min(1).max(500).nullable(),
    member_assets: z.array(pinnedLibraryAssetRefSchema).min(1).max(8),
    reference_asset: pinnedLibraryAssetRefSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      (candidate.category === 'model' || candidate.category === 'character') &&
      candidate.rights_note === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rights_note'],
        message: 'A person Element candidate requires a rights note.',
      });
    }
  });
export type PipelineElementCandidate = z.infer<typeof pipelineElementCandidateSchema>;

const pipelineArtifactBase = {
  artifact_id: capabilityIdSchema,
  output_id: capabilityKeySchema,
  provenance: pipelineArtifactProvenanceSchema,
  quality: pipelineQualityEvidenceSchema,
};

export const pipelineRunArtifactSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...pipelineArtifactBase,
      kind: z.literal('asset'),
      media: pipelineMediaSchema,
      asset: pinnedLibraryAssetRefSchema,
    })
    .strict(),
  z
    .object({
      ...pipelineArtifactBase,
      kind: z.literal('element_candidate'),
      candidate: pipelineElementCandidateSchema,
    })
    .strict(),
]);
export type PipelineRunArtifact = z.infer<typeof pipelineRunArtifactSchema>;

export const pipelineRunCostSchema = z
  .object({
    /** Null until a provider adapter reports measured spend; never substitute a fictional zero. */
    amount_minor: z.number().int().nonnegative().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    generation_count: z.number().int().nonnegative(),
  })
  .strict();
export type PipelineRunCost = z.infer<typeof pipelineRunCostSchema>;

export const PIPELINE_ERROR_CODES = [
  'invalid_request',
  'pipeline_not_found',
  'contract_mismatch',
  'input_missing',
  'input_invalid',
  'control_not_approved',
  'policy_refused',
  'execution_failed',
  'output_invalid',
  'quality_failed',
  'run_indeterminate',
] as const;
export const pipelineErrorCodeSchema = z.enum(PIPELINE_ERROR_CODES);
export type PipelineErrorCode = z.infer<typeof pipelineErrorCodeSchema>;

const errorContextValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

export const pipelineRunErrorSchema = z
  .object({
    code: pipelineErrorCodeSchema,
    message: z.string().min(1).max(2_000),
    retryable: z.boolean(),
    field: z.string().min(1).max(200).optional(),
    context: z.record(z.string().min(1).max(100), errorContextValueSchema).optional(),
  })
  .strict();
export type PipelineRunError = z.infer<typeof pipelineRunErrorSchema>;

export const pipelineRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'refused',
  'failed',
  'indeterminate',
]);
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;

export const pipelineRunReceiptSchema = z
  .object({
    run_id: capabilityIdSchema,
    brand_profile_id: capabilityIdSchema,
    pipeline_id: capabilityIdSchema,
    identity: pipelineCapabilityIdentitySchema,
    idempotency_key: z.string().min(1).max(200),
    origin: pipelineInvocationOriginSchema,
    status: pipelineRunStatusSchema,
    resolved_inputs: z.record(capabilityKeySchema, pipelineResolvedInputSchema).nullable(),
    artifacts: z.array(pipelineRunArtifactSchema).max(24),
    cost: pipelineRunCostSchema.nullable(),
    quality: pipelineQualityEvidenceSchema.nullable(),
    error: pipelineRunErrorSchema.nullable(),
    created_at: z.string().datetime({ offset: true }),
    started_at: z.string().datetime({ offset: true }).nullable(),
    finished_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((receipt, context) => {
    for (const [index, artifact] of receipt.artifacts.entries()) {
      const provenance = artifact.provenance;
      const provenanceMatchesReceipt =
        provenance.run_id === receipt.run_id &&
        provenance.pipeline_id === receipt.pipeline_id &&
        provenance.identity.family_id === receipt.identity.family_id &&
        provenance.identity.revision === receipt.identity.revision &&
        provenance.identity.contract_hash === receipt.identity.contract_hash &&
        provenance.output_id === artifact.output_id;
      if (!provenanceMatchesReceipt) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts', index, 'provenance'],
          message: 'Artifact provenance must identify this run, contract, and output.',
        });
      }
    }

    const active = receipt.status === 'queued' || receipt.status === 'running';
    if (active) {
      if (receipt.error !== null) {
        context.addIssue({
          code: 'custom',
          path: ['error'],
          message: 'An active run cannot have a terminal error.',
        });
      }
      if (receipt.finished_at !== null) {
        context.addIssue({
          code: 'custom',
          path: ['finished_at'],
          message: 'An active run cannot have a finished timestamp.',
        });
      }
    }

    if (receipt.status === 'completed') {
      if (receipt.error !== null) {
        context.addIssue({
          code: 'custom',
          path: ['error'],
          message: 'A completed run cannot have an error.',
        });
      }
      if (
        receipt.finished_at === null ||
        receipt.resolved_inputs === null ||
        receipt.cost === null ||
        receipt.quality === null
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'A completed run requires finished_at, resolved_inputs, cost, and quality evidence.',
        });
      }
      if (receipt.artifacts.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts'],
          message: 'A completed run requires at least one artifact.',
        });
      }
      if (
        receipt.quality?.verdict !== 'passed' ||
        receipt.artifacts.some((artifact) => artifact.quality.verdict !== 'passed')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['quality'],
          message: 'A completed run requires passing quality evidence.',
        });
      }
    }

    const terminalError =
      receipt.status === 'refused' ||
      receipt.status === 'failed' ||
      receipt.status === 'indeterminate';
    if (terminalError && (receipt.error === null || receipt.finished_at === null)) {
      context.addIssue({
        code: 'custom',
        message: 'A refused, failed, or indeterminate run requires an error and finished_at.',
      });
    }
  });
export type PipelineRunReceipt = z.infer<typeof pipelineRunReceiptSchema>;

/** V2 catalog, invoke, and durable status routes shared by every caller adapter. */
export const PIPELINE_CATALOG_ROUTE = '/api/ai-studio/pipeline-capabilities';
export const PIPELINE_RUNS_ROUTE = '/api/ai-studio/pipeline-runs';
export function pipelineRunRoute(runId: string): string {
  return `${PIPELINE_RUNS_ROUTE}/${capabilityIdSchema.parse(runId)}`;
}

/**
 * Why this pipeline cannot run, in the sentence a person should read — or undefined when it
 * can.
 *
 * ONE derivation, because two surfaces answer this question: Jaina refuses a `pipeline_run`
 * with it, and the Library badges a published pipeline with it. Two copies would drift into
 * two explanations of the same fact, and the reader who saw one and then the other would not
 * know which was true. Callers add their own lead-in ("X cannot run.") and this supplies the
 * because.
 */
export function pipelineBlockedReason(manifest: PipelineManifest): string | undefined {
  if (manifest.runnable) return undefined;

  const blocked = manifest.inputs
    .filter((input) => input.required && !input.handle_free)
    .map((input) => input.label ?? input.port_id);
  if (blocked.length > 0) {
    const one = blocked.length === 1;
    return (
      `Required port${one ? '' : 's'} ${blocked.join(', ')} ${one ? 'is' : 'are'} declared on a ` +
      `handle something is already wired into, so a value for ${one ? 'it' : 'them'} can never ` +
      'be written. The pipeline has to be republished against a free handle.'
    );
  }

  if (manifest.headless.over_cap) {
    return (
      `It runs ${manifest.headless.generators} generators, over the ` +
      `${manifest.headless.generator_cap} one unattended run may start.`
    );
  }

  return manifest.headless.blocked_when_fed
    ? `It needs a browser: ${manifest.headless.blocked_when_fed}`
    : 'It cannot run headlessly.';
}
