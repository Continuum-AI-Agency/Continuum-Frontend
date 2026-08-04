import { z } from 'zod';
import {
  campaignArtifactTypeSchema,
  campaignChecklistRegistry,
  goalChecklistRequirementDefinitionSchema,
} from './campaign-artifacts';
import { goalArtifactFormatSchema, goalArtifactRequirementSchema } from './domain';

const idSchema = z.string().trim().min(1).max(240);

export const goalArtifactSectionDefinitionSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(300),
  })
  .strict();
export type GoalArtifactSectionDefinition = z.infer<typeof goalArtifactSectionDefinitionSchema>;

export const goalArtifactCategorySchema = z.enum([
  'objective',
  'intelligence',
  'strategy',
  'audience',
  'creative',
  'creative_operations',
  'media_investment',
  'measurement',
  'governance',
  'readiness',
  'activation',
  'learning',
]);
export type GoalArtifactCategory = z.infer<typeof goalArtifactCategorySchema>;

export const goalArtifactActivationSchema = z
  .object({
    kind: z.enum(['always', 'when_applicable', 'on_demand']),
    prompt: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .superRefine((activation, context) => {
    if (activation.kind !== 'always' && !activation.prompt) {
      context.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: 'Conditional and on-demand artifacts must explain when they are activated.',
      });
    }
  });
export type GoalArtifactActivation = z.infer<typeof goalArtifactActivationSchema>;

const goalArtifactDefinitionBaseSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(2_000),
    category: goalArtifactCategorySchema,
    format: goalArtifactFormatSchema,
    contentSchemaId: campaignArtifactTypeSchema,
    contentSchemaVersion: z.number().int().positive(),
    checklist: z.array(goalChecklistRequirementDefinitionSchema).min(1).max(200),
    requirement: goalArtifactRequirementSchema,
    activation: goalArtifactActivationSchema,
    ownerCapabilities: z.array(idSchema).min(1).max(30),
    approvalCapabilities: z.array(idSchema).min(1).max(30),
    requiredSections: z.array(goalArtifactSectionDefinitionSchema).min(1).max(100),
    defaultDependencies: z.array(idSchema).max(100).default([]),
  })
  .strict();

export const goalArtifactDefinitionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const artifact = value as Record<string, unknown>;
  const artifactType = campaignArtifactTypeSchema.safeParse(artifact.id);
  if (!artifactType.success) return value;
  return {
    ...artifact,
    contentSchemaId: artifactType.data,
    contentSchemaVersion: 1,
    checklist: campaignChecklistRegistry[artifactType.data],
  };
}, goalArtifactDefinitionBaseSchema);
export type GoalArtifactDefinition = z.infer<typeof goalArtifactDefinitionSchema>;

export const goalWorkstreamDefinitionSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(300),
    objective: z.string().trim().min(1).max(2_000),
    requiredCapabilities: z.array(idSchema).min(1).max(30),
    artifactIds: z.array(idSchema).max(100).default([]),
    dependencyIds: z.array(idSchema).max(100).default([]),
  })
  .strict();
export type GoalWorkstreamDefinition = z.infer<typeof goalWorkstreamDefinitionSchema>;

export const goalTemplateReadinessSchema = z
  .object({
    requiredArtifactIds: z.array(idSchema).min(1).max(100),
    requiredCapabilities: z.array(idSchema).min(1).max(30),
    requiresBudgetAuthorization: z.boolean(),
    requiresComplianceApproval: z.boolean(),
    requiresMeasurementQa: z.boolean(),
  })
  .strict();
export type GoalTemplateReadiness = z.infer<typeof goalTemplateReadinessSchema>;

export const goalTemplateSchema = z
  .object({
    id: idSchema,
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(2_000),
    artifacts: z.array(goalArtifactDefinitionSchema).min(1).max(100),
    workstreams: z.array(goalWorkstreamDefinitionSchema).min(1).max(100),
    readiness: goalTemplateReadinessSchema,
  })
  .strict()
  .superRefine((template, context) => {
    const artifactIds = new Set<string>();
    for (const [index, artifact] of template.artifacts.entries()) {
      if (artifactIds.has(artifact.id)) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts', index, 'id'],
          message: 'Artifact definition IDs must be unique within a Goal template.',
        });
      }
      artifactIds.add(artifact.id);

      const sectionIds = new Set<string>();
      for (const [sectionIndex, section] of artifact.requiredSections.entries()) {
        if (sectionIds.has(section.id)) {
          context.addIssue({
            code: 'custom',
            path: ['artifacts', index, 'requiredSections', sectionIndex, 'id'],
            message: 'Required section IDs must be unique within an artifact definition.',
          });
        }
        sectionIds.add(section.id);
      }
    }

    for (const [index, artifact] of template.artifacts.entries()) {
      const expectedActivation = {
        core: 'always',
        conditional: 'when_applicable',
        optional: 'on_demand',
      }[artifact.requirement];
      if (artifact.activation.kind !== expectedActivation) {
        context.addIssue({
          code: 'custom',
          path: ['artifacts', index, 'activation', 'kind'],
          message: `${artifact.requirement} artifacts must use ${expectedActivation} activation.`,
        });
      }
    }

    for (const [index, artifact] of template.artifacts.entries()) {
      for (const dependencyId of artifact.defaultDependencies) {
        if (!artifactIds.has(dependencyId)) {
          context.addIssue({
            code: 'custom',
            path: ['artifacts', index, 'defaultDependencies'],
            message: `Unknown default artifact dependency: ${dependencyId}.`,
          });
        }
        if (dependencyId === artifact.id) {
          context.addIssue({
            code: 'custom',
            path: ['artifacts', index, 'defaultDependencies'],
            message: 'An artifact definition cannot depend on itself.',
          });
        }
      }
    }

    const workstreamIds = new Set<string>();
    for (const [index, workstream] of template.workstreams.entries()) {
      if (workstreamIds.has(workstream.id)) {
        context.addIssue({
          code: 'custom',
          path: ['workstreams', index, 'id'],
          message: 'Workstream definition IDs must be unique within a Goal template.',
        });
      }
      workstreamIds.add(workstream.id);
      for (const artifactId of workstream.artifactIds) {
        if (!artifactIds.has(artifactId)) {
          context.addIssue({
            code: 'custom',
            path: ['workstreams', index, 'artifactIds'],
            message: `Unknown workstream artifact: ${artifactId}.`,
          });
        }
      }
    }

    for (const [index, workstream] of template.workstreams.entries()) {
      for (const dependencyId of workstream.dependencyIds) {
        if (!workstreamIds.has(dependencyId) || dependencyId === workstream.id) {
          context.addIssue({
            code: 'custom',
            path: ['workstreams', index, 'dependencyIds'],
            message: `Invalid workstream dependency: ${dependencyId}.`,
          });
        }
      }
    }

    for (const artifactId of template.readiness.requiredArtifactIds) {
      if (!artifactIds.has(artifactId)) {
        context.addIssue({
          code: 'custom',
          path: ['readiness', 'requiredArtifactIds'],
          message: `Unknown readiness artifact: ${artifactId}.`,
        });
      }
    }
  });
export type GoalTemplate = z.infer<typeof goalTemplateSchema>;

export const CAMPAIGN_CREATION_TEMPLATE_ID = 'campaign-creation' as const;
/** @deprecated New Goals use the campaign-creation identity. */
export const CAMPAIGN_RESEARCH_TEMPLATE_ID = CAMPAIGN_CREATION_TEMPLATE_ID;

export const campaignCreationTemplate = goalTemplateSchema.parse({
  id: CAMPAIGN_CREATION_TEMPLATE_ID,
  version: 1,
  title: 'Campaign Creation',
  description:
    'Evidence-backed campaign planning from objective and audience research through activation, measurement, launch, optimization, and learning.',
  workstreams: [
    {
      id: 'commercial-objective',
      title: 'Commercial Objective',
      objective:
        'Fix the business objective, offer, success criteria, budget envelope, timing, and decision rights.',
      requiredCapabilities: ['strategy', 'operations'],
      artifactIds: ['campaign-charter'],
      dependencyIds: [],
    },
    {
      id: 'research',
      title: 'Research',
      objective:
        'Ground the campaign in traceable market, customer, competitor, and first-party evidence.',
      requiredCapabilities: ['research'],
      artifactIds: ['research-dossier'],
      dependencyIds: ['commercial-objective'],
    },
    {
      id: 'campaign-strategy',
      title: 'Campaign Strategy',
      objective:
        'Turn the commercial objective and evidence into a focused campaign thesis and operating choices.',
      requiredCapabilities: ['strategy'],
      artifactIds: ['campaign-strategy'],
      dependencyIds: ['commercial-objective', 'research'],
    },
    {
      id: 'audience',
      title: 'Audience',
      objective:
        'Define priority segments, exclusions, motivations, journey moments, and targeting signals.',
      requiredCapabilities: ['research', 'paid_media'],
      artifactIds: ['audience-strategy'],
      dependencyIds: ['research', 'campaign-strategy'],
    },
    {
      id: 'creative-strategy',
      title: 'Creative Strategy',
      objective:
        'Define evidence-backed angles, message hierarchy, claims, concepts, and creative guardrails.',
      requiredCapabilities: ['creative', 'strategy'],
      artifactIds: ['creative-strategy'],
      dependencyIds: ['audience', 'campaign-strategy'],
    },
    {
      id: 'creative-operations',
      title: 'Creative Operations',
      objective:
        'Convert approved concepts into an owned production matrix with asset specifications, variants, QA, and delivery dates.',
      requiredCapabilities: ['creative', 'operations'],
      artifactIds: ['creative-production-plan'],
      dependencyIds: ['creative-strategy'],
    },
    {
      id: 'media-budget',
      title: 'Media & Budget',
      objective:
        'Authorize channel allocation, flighting, pacing, placements, scenarios, and optimization rules.',
      requiredCapabilities: ['paid_media', 'strategy'],
      artifactIds: ['media-budget-strategy'],
      dependencyIds: ['audience', 'creative-strategy'],
    },
    {
      id: 'measurement',
      title: 'Measurement',
      objective:
        'Make metrics, identifiers, events, sources of truth, attribution, QA, and reporting executable.',
      requiredCapabilities: ['measurement'],
      artifactIds: ['measurement-plan'],
      dependencyIds: ['commercial-objective', 'media-budget'],
    },
    {
      id: 'compliance-review',
      title: 'Compliance Review',
      objective:
        'Verify claims, consent, brand, legal, accessibility, platform policy, and evidence provenance.',
      requiredCapabilities: ['compliance', 'creative'],
      artifactIds: ['compliance-register'],
      dependencyIds: ['creative-operations', 'media-budget'],
    },
    {
      id: 'launch-readiness',
      title: 'Launch Readiness',
      objective:
        'Reconcile accepted versions, authorizations, QA, ownership, rollback, and the auditable go/no-go decision.',
      requiredCapabilities: ['operations', 'compliance', 'measurement'],
      artifactIds: ['launch-readiness'],
      dependencyIds: ['creative-operations', 'media-budget', 'measurement', 'compliance-review'],
    },
    {
      id: 'campaign-compilation',
      title: 'Campaign Compilation',
      objective:
        'Compile exact accepted artifact and creative versions into a downstream-executable campaign package.',
      requiredCapabilities: ['operations'],
      artifactIds: ['campaign-execution-package'],
      dependencyIds: ['launch-readiness'],
    },
  ],
  readiness: {
    requiredArtifactIds: [
      'campaign-charter',
      'research-dossier',
      'campaign-strategy',
      'audience-strategy',
      'creative-strategy',
      'creative-production-plan',
      'media-budget-strategy',
      'measurement-plan',
      'compliance-register',
      'launch-readiness',
      'campaign-execution-package',
    ],
    requiredCapabilities: [
      'strategy',
      'research',
      'paid_media',
      'creative',
      'measurement',
      'operations',
      'compliance',
      'budget_authority',
    ],
    requiresBudgetAuthorization: true,
    requiresComplianceApproval: true,
    requiresMeasurementQa: true,
  },
  artifacts: [
    {
      id: 'campaign-charter',
      title: 'Campaign Charter',
      description: 'Defines why the campaign exists, what success means, and who may decide.',
      category: 'objective',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['strategy', 'operations'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'objective', title: 'Objective' },
        { id: 'scope-offer', title: 'Scope & Offer' },
        { id: 'success-criteria', title: 'Success Criteria' },
        { id: 'budget-timing', title: 'Budget & Timing' },
        { id: 'constraints-non-goals', title: 'Constraints & Non-Goals' },
        { id: 'ownership-decision-rights', title: 'Ownership & Decision Rights' },
      ],
      defaultDependencies: [],
    },
    {
      id: 'research-dossier',
      title: 'Research Dossier',
      description:
        'Captures the traceable market, customer, competitor, and category evidence behind the campaign.',
      category: 'intelligence',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['research'],
      approvalCapabilities: ['research', 'strategy'],
      requiredSections: [
        { id: 'research-questions', title: 'Research Questions' },
        { id: 'market-category-context', title: 'Market & Category Context' },
        { id: 'customer-competitor-findings', title: 'Customer & Competitor Findings' },
        { id: 'evidence-register', title: 'Evidence Register' },
        { id: 'confidence-unknowns', title: 'Confidence & Unknowns' },
        { id: 'strategic-implications', title: 'Strategic Implications' },
      ],
      defaultDependencies: ['campaign-charter'],
    },
    {
      id: 'campaign-strategy',
      title: 'Campaign Strategy',
      description:
        'Turns the Goal and evidence into a focused strategic thesis and operating choices.',
      category: 'strategy',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['strategy'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'strategic-thesis', title: 'Strategic Thesis' },
        { id: 'objective-offer', title: 'Objective & Offer' },
        { id: 'journey-channel-roles', title: 'Journey & Channel Roles' },
        { id: 'priorities-tradeoffs', title: 'Priorities & Tradeoffs' },
        { id: 'assumptions-risks', title: 'Assumptions & Risks' },
        { id: 'decision-rights', title: 'Decision Rights' },
      ],
      defaultDependencies: ['campaign-charter', 'research-dossier'],
    },
    {
      id: 'audience-strategy',
      title: 'Audience Strategy',
      description:
        'Defines who the campaign serves, who it excludes, and how evidence maps people to moments and targeting.',
      category: 'audience',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['research', 'paid_media'],
      approvalCapabilities: ['strategy', 'paid_media'],
      requiredSections: [
        { id: 'priority-segments', title: 'Priority Segments' },
        { id: 'jobs-pains-motivations', title: 'Jobs, Pains & Motivations' },
        { id: 'exclusions', title: 'Exclusions' },
        { id: 'journey-moments', title: 'Journey Moments' },
        { id: 'targeting-signals', title: 'Targeting Signals & Reach' },
        { id: 'audience-evidence', title: 'Evidence & Confidence' },
      ],
      defaultDependencies: ['research-dossier', 'campaign-strategy'],
    },
    {
      id: 'creative-strategy',
      title: 'Creative Strategy',
      description:
        'Defines separately reviewable creative angles, messages, claims, concepts, and asset variants.',
      category: 'creative',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['creative', 'strategy'],
      approvalCapabilities: ['creative', 'strategy'],
      requiredSections: [
        { id: 'creative-angles', title: 'Creative Angles' },
        { id: 'message-hierarchy', title: 'Message Hierarchy' },
        { id: 'claims-evidence', title: 'Claims & Evidence' },
        { id: 'cta-destination', title: 'CTA & Destination' },
        { id: 'concepts-asset-matrix', title: 'Concepts & Asset Matrix' },
        { id: 'guardrails', title: 'Brand, Accessibility & Policy Guardrails' },
      ],
      defaultDependencies: ['campaign-strategy', 'audience-strategy'],
    },
    {
      id: 'creative-production-plan',
      title: 'Creative Production Plan',
      description:
        'Turns the accepted creative direction into an owned asset matrix, production schedule, specifications, variants, and QA plan.',
      category: 'creative_operations',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['creative', 'operations'],
      approvalCapabilities: ['creative', 'operations'],
      requiredSections: [
        { id: 'deliverable-matrix', title: 'Deliverable & Variant Matrix' },
        { id: 'channel-specifications', title: 'Channel & Placement Specifications' },
        { id: 'source-assets-rights', title: 'Source Assets, Rights & Usage' },
        { id: 'owners-schedule', title: 'Owners, Dependencies & Production Schedule' },
        { id: 'review-qa', title: 'Review, Accessibility & QA Gates' },
        { id: 'delivery-status', title: 'Delivery Status & Version Bindings' },
      ],
      defaultDependencies: ['campaign-strategy', 'audience-strategy', 'creative-strategy'],
    },
    {
      id: 'media-budget-strategy',
      title: 'Media & Budget Strategy',
      description:
        'Makes channel roles, allocation, flighting, targeting, and optimization guardrails independently reviewable.',
      category: 'media_investment',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['paid_media', 'strategy'],
      approvalCapabilities: ['paid_media', 'strategy'],
      requiredSections: [
        { id: 'channel-rationale', title: 'Channel Rationale' },
        { id: 'budget-allocation', title: 'Budget Allocation' },
        { id: 'flighting-pacing', title: 'Flighting & Pacing' },
        { id: 'targeting-placements', title: 'Targeting & Placements' },
        { id: 'scenario-plan', title: 'Budget Scenarios' },
        { id: 'optimization-rules', title: 'Optimization Rules & Owners' },
      ],
      defaultDependencies: ['campaign-strategy', 'audience-strategy', 'creative-strategy'],
    },
    {
      id: 'measurement-plan',
      title: 'Measurement Plan',
      description:
        'Makes success definitions, identifiers, events, sources of truth, and QA executable before launch.',
      category: 'measurement',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['measurement'],
      approvalCapabilities: ['measurement', 'strategy'],
      requiredSections: [
        { id: 'kpi-tree', title: 'KPI Tree' },
        { id: 'metric-definitions', title: 'Metric Definitions' },
        { id: 'source-of-truth', title: 'Source of Truth' },
        { id: 'campaign-naming', title: 'Campaign IDs, Naming & UTMs' },
        { id: 'event-conversion-schema', title: 'Event & Conversion Schema' },
        { id: 'attribution-incrementality', title: 'Attribution & Incrementality' },
        { id: 'qa-reporting', title: 'QA, Reconciliation & Reporting Cadence' },
      ],
      defaultDependencies: ['campaign-charter', 'media-budget-strategy'],
    },
    {
      id: 'compliance-register',
      title: 'Compliance & Claims Register',
      description:
        'Binds every material claim, consent requirement, policy check, accessibility check, and approval to evidence and an accountable reviewer.',
      category: 'governance',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['compliance', 'creative'],
      approvalCapabilities: ['compliance'],
      requiredSections: [
        { id: 'claims-evidence-register', title: 'Claims & Evidence Register' },
        { id: 'brand-legal-review', title: 'Brand & Legal Review' },
        { id: 'platform-policy-review', title: 'Platform Policy Review' },
        { id: 'privacy-consent', title: 'Privacy, Consent & Data Use' },
        { id: 'accessibility-inclusion', title: 'Accessibility & Inclusion' },
        { id: 'approvals-exceptions', title: 'Approvals, Exceptions & Owners' },
      ],
      defaultDependencies: [
        'research-dossier',
        'creative-strategy',
        'creative-production-plan',
        'media-budget-strategy',
      ],
    },
    {
      id: 'launch-readiness',
      title: 'Launch Readiness',
      description:
        'Records the accepted versions, checks, approvals, ownership, and auditable go/no-go decision.',
      category: 'readiness',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['operations'],
      approvalCapabilities: ['operations', 'compliance', 'measurement'],
      requiredSections: [
        { id: 'accepted-versions', title: 'Accepted Artifact Versions' },
        { id: 'budget-authorization', title: 'Budget Authorization' },
        { id: 'brand-legal-policy', title: 'Brand, Legal & Policy Review' },
        { id: 'destination-measurement-qa', title: 'Destination & Measurement QA' },
        { id: 'operational-readiness', title: 'Operational Readiness' },
        { id: 'go-no-go', title: 'Go/No-Go Decision' },
        { id: 'rollback-escalation', title: 'Rollback & Escalation Owner' },
      ],
      defaultDependencies: [
        'creative-production-plan',
        'media-budget-strategy',
        'measurement-plan',
        'compliance-register',
      ],
    },
    {
      id: 'offer-destination-brief',
      title: 'Offer & Destination Brief',
      description:
        'Specifies a new offer, landing experience, conversion path, merchandising, or destination that must be built or materially changed for the campaign.',
      category: 'activation',
      format: 'json',
      requirement: 'conditional',
      activation: {
        kind: 'when_applicable',
        prompt:
          'Activate when the campaign introduces a new offer, dedicated landing page, or material destination change.',
      },
      ownerCapabilities: ['strategy', 'operations'],
      approvalCapabilities: ['strategy', 'measurement'],
      requiredSections: [
        { id: 'offer-value-exchange', title: 'Offer & Value Exchange' },
        { id: 'destination-journey', title: 'Destination & Conversion Journey' },
        { id: 'requirements-owners', title: 'Requirements, Owners & Dependencies' },
        { id: 'content-merchandising', title: 'Content & Merchandising' },
        { id: 'tracking-consent', title: 'Tracking, Consent & Data Capture' },
        { id: 'qa-launch', title: 'QA & Launch Criteria' },
      ],
      defaultDependencies: ['campaign-strategy', 'audience-strategy', 'measurement-plan'],
    },
    {
      id: 'lifecycle-journey-plan',
      title: 'Lifecycle Journey Plan',
      description:
        'Defines the coordinated email, SMS, CRM, nurture, suppression, and handoff journey when lifecycle channels are part of the campaign.',
      category: 'activation',
      format: 'json',
      requirement: 'conditional',
      activation: {
        kind: 'when_applicable',
        prompt:
          'Activate when email, SMS, CRM automation, lead nurture, or customer lifecycle messaging is in campaign scope.',
      },
      ownerCapabilities: ['strategy', 'operations'],
      approvalCapabilities: ['strategy', 'measurement'],
      requiredSections: [
        { id: 'journey-map', title: 'Journey Map & Entry Criteria' },
        { id: 'message-sequence', title: 'Message Sequence & Timing' },
        { id: 'segmentation-suppression', title: 'Segmentation & Suppression' },
        { id: 'handoffs-routing', title: 'Handoffs & Routing' },
        { id: 'automation-data', title: 'Automation & Data Requirements' },
        { id: 'measurement-qa', title: 'Measurement & QA' },
      ],
      defaultDependencies: [
        'campaign-strategy',
        'audience-strategy',
        'creative-strategy',
        'measurement-plan',
      ],
    },
    {
      id: 'partnership-creator-brief',
      title: 'Partnership & Creator Brief',
      description:
        'Defines partner or creator selection, deliverables, rights, disclosures, compensation, review, and measurement.',
      category: 'activation',
      format: 'json',
      requirement: 'conditional',
      activation: {
        kind: 'when_applicable',
        prompt:
          'Activate when creators, affiliates, publishers, sponsorships, or strategic partners participate in the campaign.',
      },
      ownerCapabilities: ['creative', 'operations'],
      approvalCapabilities: ['creative', 'compliance'],
      requiredSections: [
        { id: 'partner-role-fit', title: 'Partner Role & Fit' },
        { id: 'deliverables-brief', title: 'Deliverables & Brief' },
        { id: 'commercial-terms', title: 'Commercial Terms & Compensation' },
        { id: 'rights-disclosures', title: 'Rights, Usage & Disclosures' },
        { id: 'review-workflow', title: 'Review & Publishing Workflow' },
        { id: 'tracking-measurement', title: 'Tracking & Measurement' },
      ],
      defaultDependencies: [
        'campaign-strategy',
        'audience-strategy',
        'creative-strategy',
        'compliance-register',
      ],
    },
    {
      id: 'localization-plan',
      title: 'Localization & Market Adaptation Plan',
      description:
        'Defines market, language, cultural, legal, offer, creative, and operational adaptations for a multi-market campaign.',
      category: 'activation',
      format: 'json',
      requirement: 'conditional',
      activation: {
        kind: 'when_applicable',
        prompt:
          'Activate when the campaign spans more than one market, language, regulatory region, or materially different cultural context.',
      },
      ownerCapabilities: ['strategy', 'creative', 'operations'],
      approvalCapabilities: ['strategy', 'compliance'],
      requiredSections: [
        { id: 'market-priorities', title: 'Market & Language Priorities' },
        { id: 'audience-cultural-context', title: 'Audience & Cultural Context' },
        { id: 'offer-message-adaptations', title: 'Offer & Message Adaptations' },
        { id: 'creative-localization', title: 'Creative Localization Matrix' },
        { id: 'legal-policy-differences', title: 'Legal & Policy Differences' },
        { id: 'owners-qa', title: 'Local Owners & QA' },
      ],
      defaultDependencies: [
        'research-dossier',
        'audience-strategy',
        'creative-strategy',
        'compliance-register',
      ],
    },
    {
      id: 'experiment-plan',
      title: 'Experiment Plan',
      description:
        'Defines an optional decision-grade test with a falsifiable hypothesis, exposure design, stopping rules, and analysis plan.',
      category: 'measurement',
      format: 'json',
      requirement: 'optional',
      activation: {
        kind: 'on_demand',
        prompt:
          'Activate when the team wants a formal incrementality, holdout, creative, audience, offer, or landing-page experiment.',
      },
      ownerCapabilities: ['measurement', 'strategy'],
      approvalCapabilities: ['measurement'],
      requiredSections: [
        { id: 'decision-hypothesis', title: 'Decision & Hypothesis' },
        { id: 'variants-control', title: 'Variants & Control' },
        { id: 'population-allocation', title: 'Population & Allocation' },
        { id: 'metrics-guardrails', title: 'Metrics & Guardrails' },
        { id: 'duration-stopping', title: 'Duration & Stopping Rules' },
        { id: 'analysis-decision-rule', title: 'Analysis & Decision Rule' },
      ],
      defaultDependencies: ['campaign-strategy', 'measurement-plan'],
    },
    {
      id: 'campaign-execution-package',
      title: 'Campaign Execution Package',
      description:
        'Compiles exact accepted campaign and creative versions into a downstream-executable package with no unresolved blockers.',
      category: 'readiness',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['operations'],
      approvalCapabilities: ['operations', 'compliance', 'measurement', 'budget_authority'],
      requiredSections: [
        { id: 'campaign-identity', title: 'Campaign Identity & Objective' },
        { id: 'investment-flight', title: 'Investment & Flight' },
        { id: 'audiences', title: 'Executable Audiences' },
        { id: 'creative-versions', title: 'Approved Creative Versions' },
        { id: 'measurement-compliance', title: 'Measurement & Compliance Pins' },
        { id: 'accepted-artifacts', title: 'Accepted Artifact Versions' },
        { id: 'approvals-blockers', title: 'Approvals & Zero Blockers' },
      ],
      defaultDependencies: [
        'campaign-charter',
        'audience-strategy',
        'creative-production-plan',
        'media-budget-strategy',
        'measurement-plan',
        'compliance-register',
        'launch-readiness',
      ],
    },
  ],
});

export const TRIAL_REELS_TEMPLATE_ID = 'trial-reels' as const;

/**
 * A converging creative trial.
 *
 * Unlike Campaign Creation — where the artifact set IS the work and each artifact is
 * produced once — this template has one artifact that is written over and over: the round
 * ledger. Its work node stays alive across every round, parking between them while trials
 * are in market and waking on a timer once views have accumulated. Rounds are unbounded, so
 * they cannot be modelled as artifacts (a template's artifact list is fixed when it parses);
 * they live in the harness checkpoint instead.
 *
 * The human is in the loop at exactly two places, both of them approvals routed through the
 * capability owner's Slack/Teams: the variant slate for each round, and the graduation of a
 * winner to followers.
 */
export const trialReelsTemplate = goalTemplateSchema.parse({
  id: TRIAL_REELS_TEMPLATE_ID,
  version: 1,
  title: 'Trial Reels',
  description:
    'Find a winning creative angle, hook, and call to action by running rounds of Instagram trial reels against non-followers until the evidence names a winner or the trial runs out of road.',
  workstreams: [
    {
      id: 'trial-charter',
      title: 'Trial Charter',
      objective:
        'Fix the desired outcome, the metric the trial ranks on, the fence it may never exceed, and who approves each round.',
      requiredCapabilities: ['strategy'],
      artifactIds: ['trial-reels-charter'],
      dependencyIds: [],
    },
    {
      id: 'trial-hypothesis',
      title: 'Hypothesis Space',
      objective:
        'Enumerate the angles, hooks, calls to action, and opening frames worth testing, grounded in what the brand already knows — and record what is deliberately excluded.',
      requiredCapabilities: ['creative', 'strategy'],
      artifactIds: ['trial-hypothesis-ledger'],
      dependencyIds: ['trial-charter'],
    },
    {
      id: 'trial-execution',
      title: 'Trial Execution',
      objective:
        'Run rounds of trial reels against the hypothesis space, recording every variant observed — winners, laggards, and the ones that never got enough delivery to judge.',
      requiredCapabilities: ['creative', 'measurement'],
      artifactIds: ['trial-round-ledger'],
      dependencyIds: ['trial-hypothesis'],
    },
    {
      id: 'trial-verdict',
      title: 'Verdict',
      objective:
        'State what the trial proved, what it could not establish, and whether the winner graduates to followers and into a paid confirmation test.',
      requiredCapabilities: ['strategy', 'measurement'],
      artifactIds: ['trial-winner-report'],
      dependencyIds: ['trial-execution'],
    },
  ],
  artifacts: [
    {
      id: 'trial-reels-charter',
      title: 'Trial Charter',
      description:
        'The desired outcome, the primary metric, the arms in play, and the fence the loop may never exceed.',
      category: 'objective',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['strategy'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'outcome', title: 'Desired outcome' },
        { id: 'metric', title: 'Primary metric' },
        { id: 'fence', title: 'Fence' },
        { id: 'decision-rights', title: 'Decision rights' },
      ],
      defaultDependencies: [],
    },
    {
      id: 'trial-hypothesis-ledger',
      title: 'Hypothesis Ledger',
      description:
        'The creative space the trial will search, the prior beliefs behind it, and the options deliberately left untested.',
      category: 'creative',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['creative', 'strategy'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'space', title: 'Search space' },
        { id: 'priors', title: 'Prior beliefs' },
        { id: 'excluded', title: 'Deliberately excluded' },
      ],
      defaultDependencies: ['trial-reels-charter'],
    },
    {
      id: 'trial-round-ledger',
      title: 'Round Ledger',
      description:
        'Append-only record of every round and every variant observed. Recording only the winners would produce a selected sample, which is worse than no record at all because it looks like data.',
      category: 'measurement',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['measurement', 'creative'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'rounds', title: 'Rounds' },
        { id: 'decisions', title: 'Verdict per round' },
      ],
      defaultDependencies: ['trial-hypothesis-ledger'],
    },
    {
      id: 'trial-winner-report',
      title: 'Winner Report',
      description:
        'What the trial proved, what it could not establish, and the graduation and paid-confirmation handoff.',
      category: 'learning',
      format: 'json',
      requirement: 'core',
      activation: { kind: 'always' },
      ownerCapabilities: ['strategy', 'measurement'],
      approvalCapabilities: ['strategy'],
      requiredSections: [
        { id: 'outcome', title: 'Outcome' },
        { id: 'winner', title: 'Winning coordinate' },
        { id: 'not-learned', title: 'What this trial could not establish' },
        { id: 'graduation', title: 'Graduation' },
      ],
      defaultDependencies: ['trial-round-ledger'],
    },
  ],
  readiness: {
    requiredArtifactIds: [
      'trial-reels-charter',
      'trial-hypothesis-ledger',
      'trial-round-ledger',
      'trial-winner-report',
    ],
    requiredCapabilities: ['strategy', 'creative', 'measurement'],
    // Discovery runs on organic trial reels, which cost nothing. Budget authorization is
    // required only when the operator opts into the paid confirmation arm, and that is
    // gated separately by the paid scaffold's own approval gates.
    requiresBudgetAuthorization: false,
    requiresComplianceApproval: false,
    requiresMeasurementQa: true,
  },
});

export const goalTemplateRegistry: Readonly<Record<string, GoalTemplate>> = Object.freeze({
  [CAMPAIGN_CREATION_TEMPLATE_ID]: campaignCreationTemplate,
  [TRIAL_REELS_TEMPLATE_ID]: trialReelsTemplate,
});

/** @deprecated Use campaignCreationTemplate. */
export const campaignResearchTemplate = campaignCreationTemplate;

export const getGoalTemplate = (templateId: string): GoalTemplate | undefined =>
  goalTemplateRegistry[templateId];

export const listGoalTemplates = (): GoalTemplate[] => Object.values(goalTemplateRegistry);

/**
 * Core documents are always materialized. Conditional and optional documents
 * become durable Goal deliverables only when explicitly activated. Once
 * materialized, every document must be accepted or waived before completion.
 */
export const materializeGoalTemplateArtifacts = (
  template: GoalTemplate,
  activatedArtifactIds: readonly string[] = [],
): GoalArtifactDefinition[] => {
  const definitionsById = new Map(template.artifacts.map((artifact) => [artifact.id, artifact]));
  const selectedIds = new Set(
    template.artifacts
      .filter((artifact) => artifact.requirement === 'core')
      .map((artifact) => artifact.id),
  );

  for (const artifactId of activatedArtifactIds) {
    if (!definitionsById.has(artifactId)) {
      throw new Error(`Unknown activated artifact definition: ${artifactId}.`);
    }
    selectedIds.add(artifactId);
  }

  const pending = [...selectedIds];
  while (pending.length > 0) {
    const artifactId = pending.pop();
    if (!artifactId) continue;
    const artifact = definitionsById.get(artifactId);
    if (!artifact) continue;
    for (const dependencyId of artifact.defaultDependencies) {
      if (selectedIds.has(dependencyId)) continue;
      selectedIds.add(dependencyId);
      pending.push(dependencyId);
    }
  }

  const templateOrder = new Map(template.artifacts.map((artifact, index) => [artifact.id, index]));
  return template.artifacts
    .filter((artifact) => selectedIds.has(artifact.id))
    .sort((left, right) => {
      const requirementRank = (requirement: GoalArtifactDefinition['requirement']) =>
        requirement === 'core' ? 0 : requirement === 'conditional' ? 1 : 2;
      return (
        requirementRank(left.requirement) - requirementRank(right.requirement) ||
        (templateOrder.get(left.id) ?? 0) - (templateOrder.get(right.id) ?? 0)
      );
    });
};
