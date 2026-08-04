import { z } from 'zod';
import {
  trialArmSchema,
  trialDecisionSchema,
  trialDimensionKeySchema,
  trialFenceSchema,
  trialGraduationStrategySchema,
  trialMetricSchema,
  trialRoundSchema,
  trialVariantResultSchema,
} from '../trial-reels/index';
import {
  goalActorSchema,
  goalDecisionSchema,
  goalEvidenceSchema,
  goalExpectedResponseSchema,
  goalRequestSchema,
} from './domain';

const idSchema = z.string().trim().min(1).max(240);
const textSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });
const confidenceSchema = z.number().min(0).max(1);

export const CAMPAIGN_ARTIFACT_TYPES = [
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
  'offer-destination-brief',
  'lifecycle-journey-plan',
  'partnership-creator-brief',
  'localization-plan',
  'experiment-plan',
  // Trial reels. These live in the same registry as the campaign artifacts, rather than in
  // a parallel one, because `goalArtifactDefinitionSchema` resolves an artifact's content
  // schema and checklist FROM this enum — a Goal template cannot reference an artifact type
  // that is not a member. A second registry would mean a second template system.
  'trial-reels-charter',
  'trial-hypothesis-ledger',
  'trial-round-ledger',
  'trial-winner-report',
] as const;

export const campaignArtifactTypeSchema = z.enum(CAMPAIGN_ARTIFACT_TYPES);
export type CampaignArtifactType = z.infer<typeof campaignArtifactTypeSchema>;

export const campaignMoneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export type CampaignMoney = z.infer<typeof campaignMoneySchema>;

export const campaignFlightSchema = z
  .object({
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    timezone: textSchema.max(100),
  })
  .strict()
  .refine((flight) => Date.parse(flight.startsAt) < Date.parse(flight.endsAt), {
    path: ['endsAt'],
    message: 'A campaign flight must end after it starts.',
  });

export const campaignEvidenceBackedStatementSchema = z
  .object({
    statement: textSchema.max(8_000),
    evidenceIds: z.array(idSchema).min(1).max(100),
    confidence: confidenceSchema,
  })
  .strict();

export const campaignApprovalRefSchema = z
  .object({
    decisionId: idSchema,
    capability: idSchema,
    approvedBy: goalActorSchema,
    approvedAt: timestampSchema,
  })
  .strict();

export const campaignAssetVersionBindingSchema = z
  .object({
    assetId: idSchema,
    versionId: idSchema,
    role: textSchema.max(300),
    qaStatus: z.literal('approved'),
    rightsApproved: z.boolean(),
  })
  .strict()
  .refine((binding) => binding.rightsApproved, {
    path: ['rightsApproved'],
    message: 'Campaign creative rights must be approved.',
  });

const metricTargetSchema = z
  .object({
    id: idSchema,
    metric: textSchema.max(300),
    baseline: z.number().optional(),
    target: z.number(),
    unit: textSchema.max(80),
    guardrail: z.boolean().default(false),
  })
  .strict();

const decisionRightSchema = z
  .object({
    capability: idSchema,
    decisions: z.array(textSchema.max(500)).min(1).max(30),
    approverUserId: idSchema,
  })
  .strict();

export const campaignCharterDataSchema = z
  .object({
    objective: z
      .object({
        businessOutcome: textSchema.max(2_000),
        campaignObjective: textSchema.max(2_000),
      })
      .strict(),
    scopeAndOffer: z
      .object({
        offerName: textSchema.max(300),
        valueProposition: textSchema.max(2_000),
        destinationUrl: z.string().url(),
        includedMarkets: z.array(textSchema.max(120)).min(1).max(100),
        excludedMarkets: z.array(textSchema.max(120)).max(100),
      })
      .strict(),
    successCriteria: z.array(metricTargetSchema).min(1).max(50),
    budgetAndTiming: z
      .object({
        approvedBudget: campaignMoneySchema,
        flight: campaignFlightSchema,
      })
      .strict(),
    constraints: z.array(textSchema.max(1_000)).max(100),
    nonGoals: z.array(textSchema.max(1_000)).max(100),
    decisionRights: z.array(decisionRightSchema).min(1).max(50),
  })
  .strict();

const researchFindingSchema = z
  .object({
    id: idSchema,
    topic: textSchema.max(500),
    finding: campaignEvidenceBackedStatementSchema,
    implication: textSchema.max(2_000),
  })
  .strict();

export const researchDossierDataSchema = z
  .object({
    researchQuestions: z.array(textSchema.max(1_000)).min(1).max(50),
    marketAndCategoryFindings: z.array(researchFindingSchema).min(1).max(100),
    customerFindings: z.array(researchFindingSchema).min(1).max(100),
    competitorFindings: z.array(researchFindingSchema).min(1).max(100),
    unknowns: z
      .array(
        z
          .object({
            question: textSchema.max(1_000),
            impact: textSchema.max(1_000),
            ownerCapability: idSchema,
          })
          .strict(),
      )
      .max(100),
    strategicImplications: z.array(textSchema.max(2_000)).min(1).max(50),
  })
  .strict();

export const campaignStrategyDataSchema = z
  .object({
    strategicThesis: campaignEvidenceBackedStatementSchema,
    objectiveAndOffer: textSchema.max(4_000),
    journeyAndChannelRoles: z
      .array(
        z
          .object({
            stage: textSchema.max(200),
            channel: textSchema.max(120),
            role: textSchema.max(1_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    priorities: z.array(textSchema.max(1_000)).min(1).max(50),
    tradeoffs: z.array(textSchema.max(1_000)).min(1).max(50),
    assumptions: z.array(textSchema.max(1_000)).max(100),
    risks: z.array(textSchema.max(1_000)).max(100),
    decisionIds: z.array(idSchema).min(1).max(100),
  })
  .strict();

const audienceSegmentSchema = z
  .object({
    id: idSchema,
    name: textSchema.max(300),
    priority: z.enum(['primary', 'secondary', 'test']),
    definition: textSchema.max(2_000),
    jobs: z.array(textSchema.max(500)).min(1).max(30),
    pains: z.array(textSchema.max(500)).min(1).max(30),
    motivations: z.array(textSchema.max(500)).min(1).max(30),
    journeyMoments: z.array(textSchema.max(500)).min(1).max(30),
    targetingSignals: z.array(textSchema.max(500)).min(1).max(100),
    estimatedReach: z.number().int().nonnegative().optional(),
    evidenceIds: z.array(idSchema).min(1).max(100),
    confidence: confidenceSchema,
  })
  .strict();

export const audienceStrategyDataSchema = z
  .object({
    segments: z.array(audienceSegmentSchema).min(1).max(50),
    exclusions: z.array(textSchema.max(500)).min(1).max(100),
    overlapPolicy: textSchema.max(2_000),
    privacyConstraints: z.array(textSchema.max(1_000)).max(50),
  })
  .strict();

const claimSchema = z
  .object({
    id: idSchema,
    claim: textSchema.max(2_000),
    evidenceIds: z.array(idSchema).min(1).max(100),
    confidence: confidenceSchema,
    complianceStatus: z.enum(['pending', 'approved', 'rejected']),
  })
  .strict();

export const creativeStrategyDataSchema = z
  .object({
    angles: z
      .array(
        z
          .object({
            id: idSchema,
            name: textSchema.max(300),
            audienceInsight: campaignEvidenceBackedStatementSchema,
            promise: textSchema.max(1_000),
            reasonToBelieve: textSchema.max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    messageHierarchy: z.array(textSchema.max(1_000)).min(1).max(30),
    claims: z.array(claimSchema).min(1).max(100),
    cta: textSchema.max(300),
    destinationUrl: z.string().url(),
    concepts: z
      .array(
        z
          .object({
            id: idSchema,
            angleId: idSchema,
            name: textSchema.max(300),
            description: textSchema.max(2_000),
            requiredFormats: z.array(textSchema.max(120)).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    guardrails: z.array(textSchema.max(1_000)).min(1).max(100),
  })
  .strict();

const productionDeliverableSchema = z
  .object({
    id: idSchema,
    conceptId: idSchema,
    channel: textSchema.max(120),
    placement: textSchema.max(200),
    format: textSchema.max(120),
    dimensions: textSchema.max(120),
    durationSeconds: z.number().positive().optional(),
    variant: textSchema.max(300),
    ownerUserId: idSchema,
    dueAt: timestampSchema,
    dependencies: z.array(idSchema).max(50),
    sourceAssetIds: z.array(idSchema).max(100),
    accessibilityChecks: z.array(textSchema.max(500)).min(1).max(30),
    asset: campaignAssetVersionBindingSchema,
  })
  .strict();

export const creativeProductionPlanDataSchema = z
  .object({
    deliverables: z.array(productionDeliverableSchema).min(1).max(500),
    productionSchedule: z.array(textSchema.max(1_000)).min(1).max(100),
    reviewAndQaGates: z.array(textSchema.max(1_000)).min(1).max(100),
    rightsAndUsageNotes: z.array(textSchema.max(1_000)).min(1).max(100),
  })
  .strict();

const channelAllocationSchema = z
  .object({
    channel: textSchema.max(120),
    role: textSchema.max(1_000),
    budget: campaignMoneySchema,
    minimumSpend: campaignMoneySchema.optional(),
    maximumSpend: campaignMoneySchema.optional(),
    placements: z.array(textSchema.max(200)).min(1).max(50),
  })
  .strict();

export const mediaBudgetStrategyDataSchema = z
  .object({
    totalBudget: campaignMoneySchema,
    channelAllocations: z.array(channelAllocationSchema).min(1).max(30),
    flight: campaignFlightSchema,
    pacing: textSchema.max(2_000),
    targetingRules: z.array(textSchema.max(1_000)).min(1).max(100),
    scenarios: z
      .array(
        z
          .object({
            name: textSchema.max(200),
            budget: campaignMoneySchema,
            expectedOutcome: textSchema.max(1_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    optimizationRules: z.array(textSchema.max(1_000)).min(1).max(100),
    budgetAuthorizationDecisionId: idSchema,
  })
  .strict()
  .superRefine((strategy, context) => {
    const allocated = strategy.channelAllocations.reduce(
      (total, allocation) => total + allocation.budget.amountMinor,
      0,
    );
    if (
      strategy.channelAllocations.some(
        (allocation) => allocation.budget.currency !== strategy.totalBudget.currency,
      ) ||
      allocated !== strategy.totalBudget.amountMinor
    ) {
      context.addIssue({
        code: 'custom',
        path: ['channelAllocations'],
        message: 'Channel allocations must use the total-budget currency and reconcile exactly.',
      });
    }
  });

const metricDefinitionSchema = z
  .object({
    id: idSchema,
    name: textSchema.max(300),
    formula: textSchema.max(2_000),
    unit: textSchema.max(80),
    source: textSchema.max(500),
    ownerCapability: idSchema,
  })
  .strict();

export const measurementPlanDataSchema = z
  .object({
    kpiTree: z.array(metricTargetSchema).min(1).max(100),
    metricDefinitions: z.array(metricDefinitionSchema).min(1).max(100),
    sourceOfTruth: textSchema.max(1_000),
    namingConvention: textSchema.max(2_000),
    eventsAndConversions: z
      .array(
        z
          .object({
            id: idSchema,
            name: textSchema.max(300),
            trigger: textSchema.max(1_000),
            parameters: z.array(textSchema.max(300)).max(50),
            platformEventId: textSchema.max(300).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    attributionAndIncrementality: textSchema.max(4_000),
    reportingCadence: textSchema.max(1_000),
    qaApprovalDecisionId: idSchema,
  })
  .strict();

export const complianceRegisterDataSchema = z
  .object({
    claims: z.array(claimSchema.extend({ usageLocations: z.array(textSchema).min(1) })).min(1),
    brandAndLegalReviews: z.array(campaignApprovalRefSchema).min(1).max(50),
    platformPolicyReviews: z.array(campaignApprovalRefSchema).min(1).max(50),
    privacyAndConsent: z.array(textSchema.max(2_000)).min(1).max(50),
    accessibilityAndInclusion: z.array(textSchema.max(2_000)).min(1).max(50),
    exceptions: z
      .array(
        z
          .object({
            description: textSchema.max(2_000),
            ownerUserId: idSchema,
            approvalDecisionId: idSchema,
            expiresAt: timestampSchema.optional(),
          })
          .strict(),
      )
      .max(50),
    complianceApprovalDecisionId: idSchema,
  })
  .strict()
  .refine((register) => register.claims.every((claim) => claim.complianceStatus === 'approved'), {
    path: ['claims'],
    message: 'Every material campaign claim must be compliance-approved.',
  });

const versionPinSchema = z
  .object({
    artifactId: idSchema,
    versionId: idSchema,
  })
  .strict();

export const launchReadinessDataSchema = z
  .object({
    acceptedArtifactVersions: z.array(versionPinSchema).min(1).max(100),
    budgetAuthorizationDecisionId: idSchema,
    complianceApprovalDecisionId: idSchema,
    measurementQaDecisionId: idSchema,
    destinationQa: z.literal('passed'),
    operationalOwners: z.array(decisionRightSchema).min(1).max(50),
    goNoGoDecisionId: idSchema,
    rollbackOwnerUserId: idSchema,
    escalationOwnerUserId: idSchema,
  })
  .strict();

export const campaignExecutionPackageDataSchema = z
  .object({
    campaignName: textSchema.max(300),
    objective: textSchema.max(2_000),
    channels: z.array(textSchema.max(120)).min(1).max(30),
    budget: campaignMoneySchema,
    flight: campaignFlightSchema,
    audienceIds: z.array(idSchema).min(1).max(100),
    creativeAssets: z.array(campaignAssetVersionBindingSchema).min(1).max(500),
    measurementPlanVersionId: idSchema,
    complianceRegisterVersionId: idSchema,
    launchReadinessVersionId: idSchema,
    acceptedArtifactVersions: z.array(versionPinSchema).min(1).max(100),
    approvalDecisionIds: z.array(idSchema).min(1).max(100),
    unresolvedBlockers: z.array(textSchema.max(1_000)).max(0),
  })
  .strict();

export const offerDestinationBriefDataSchema = z
  .object({
    offer: textSchema.max(2_000),
    valueExchange: textSchema.max(2_000),
    destinationUrl: z.string().url(),
    conversionJourney: z.array(textSchema.max(1_000)).min(1).max(50),
    requirements: z.array(textSchema.max(1_000)).min(1).max(100),
    ownerUserIds: z.array(idSchema).min(1).max(50),
    contentAndMerchandising: z.array(textSchema.max(1_000)).min(1).max(100),
    trackingAndConsent: z.array(textSchema.max(1_000)).min(1).max(100),
    qaDecisionId: idSchema,
  })
  .strict();

export const lifecycleJourneyPlanDataSchema = z
  .object({
    entryCriteria: z.array(textSchema.max(1_000)).min(1).max(50),
    steps: z
      .array(
        z
          .object({
            id: idSchema,
            channel: textSchema.max(120),
            trigger: textSchema.max(500),
            delay: textSchema.max(200),
            message: textSchema.max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    segmentationAndSuppression: z.array(textSchema.max(1_000)).min(1).max(100),
    handoffs: z.array(textSchema.max(1_000)).min(1).max(100),
    automationRequirements: z.array(textSchema.max(1_000)).min(1).max(100),
    measurementAndQaDecisionId: idSchema,
  })
  .strict();

export const partnershipCreatorBriefDataSchema = z
  .object({
    partnerProfiles: z.array(textSchema.max(2_000)).min(1).max(100),
    deliverables: z.array(textSchema.max(1_000)).min(1).max(100),
    commercialTerms: z.array(textSchema.max(1_000)).min(1).max(100),
    rightsAndDisclosures: z.array(textSchema.max(1_000)).min(1).max(100),
    reviewAndPublishingWorkflow: z.array(textSchema.max(1_000)).min(1).max(100),
    trackingAndMeasurement: z.array(textSchema.max(1_000)).min(1).max(100),
    complianceApprovalDecisionId: idSchema,
  })
  .strict();

export const localizationPlanDataSchema = z
  .object({
    markets: z
      .array(
        z
          .object({
            market: textSchema.max(120),
            languages: z.array(textSchema.max(120)).min(1).max(20),
            priority: z.enum(['primary', 'secondary', 'test']),
            localOwnerUserId: idSchema,
          })
          .strict(),
      )
      .min(2)
      .max(100),
    culturalContext: z.array(campaignEvidenceBackedStatementSchema).min(1).max(100),
    offerAndMessageAdaptations: z.array(textSchema.max(2_000)).min(1).max(100),
    creativeLocalization: z.array(textSchema.max(2_000)).min(1).max(100),
    legalAndPolicyDifferences: z.array(textSchema.max(2_000)).min(1).max(100),
    qaDecisionIds: z.array(idSchema).min(1).max(100),
  })
  .strict();

export const experimentPlanDataSchema = z
  .object({
    decision: textSchema.max(2_000),
    hypothesis: textSchema.max(2_000),
    variants: z.array(textSchema.max(1_000)).min(2).max(20),
    control: textSchema.max(1_000),
    population: textSchema.max(2_000),
    allocation: z.array(z.number().min(0).max(1)).min(2).max(20),
    metrics: z.array(idSchema).min(1).max(50),
    guardrails: z.array(idSchema).max(50),
    durationDays: z.number().int().positive(),
    stoppingRules: z.array(textSchema.max(1_000)).min(1).max(20),
    analysisAndDecisionRule: textSchema.max(4_000),
  })
  .strict()
  .refine(
    (plan) => Math.abs(plan.allocation.reduce((sum, value) => sum + value, 0) - 1) < 0.000001,
    {
      path: ['allocation'],
      message: 'Experiment allocation must sum to 1.',
    },
  );

// --- trial reels -----------------------------------------------------------------------
// A trial reel goes only to non-followers, so the search for a winning angle/hook/CTA costs
// nothing. These four artifacts are the trial's paper trail: what winning means, what space
// we searched, everything we actually observed, and what we can and cannot claim at the end.

export const trialReelsCharterDataSchema = z
  .object({
    outcome: z
      .object({
        businessOutcome: textSchema.max(2_000),
        /** The sentence the trial has to be able to finish. Stated up front so a
         *  disappointing result cannot be re-narrated into a success afterwards. */
        whatWinningMeans: textSchema.max(2_000),
      })
      .strict(),
    primaryMetric: trialMetricSchema,
    arms: z
      .object({
        /** Discovery. Always on — it is the free half. */
        organicTrialReels: z.literal(true),
        /** Confirmation. Re-tests the surviving coordinate inside one paid ad set. */
        paidConfirmation: z.boolean(),
      })
      .strict(),
    fence: trialFenceSchema,
    graduationStrategy: trialGraduationStrategySchema,
    decisionRights: z.array(decisionRightSchema).min(1).max(20),
  })
  .strict();

export const trialHypothesisLedgerDataSchema = z
  .object({
    space: z
      .array(
        z
          .object({
            dimension: trialDimensionKeySchema,
            candidates: z
              .array(
                z
                  .object({
                    value: textSchema.max(120),
                    rationale: textSchema.max(2_000),
                    evidenceIds: z.array(idSchema).max(100).default([]),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    priorBeliefs: z.array(campaignEvidenceBackedStatementSchema).max(50).default([]),
    /** Deliberately not tested, and why. An untested option that nobody recorded as a
     *  choice reads later as an oversight. */
    excluded: z
      .array(z.object({ value: textSchema.max(120), reason: textSchema.max(1_000) }).strict())
      .max(100)
      .default([]),
  })
  .strict();

/**
 * Append-only. Every variant of every round is recorded here — winners, laggards, and the
 * ones that never accumulated enough exposure to judge.
 *
 * Recording only the winners would produce a selected sample, which is worse than no record
 * at all because it LOOKS like data. This is the same reason `strategy.match_proposals` logs
 * a slate at display time rather than on accept.
 */
export const trialRoundLedgerDataSchema = z
  .object({
    arm: trialArmSchema,
    metric: trialMetricSchema,
    fence: trialFenceSchema,
    rounds: z.array(trialRoundSchema).max(50),
    decisions: z.array(trialDecisionSchema).max(50).default([]),
    spentTotal: z.number().nonnegative().default(0),
  })
  .strict();

export const trialWinnerReportDataSchema = z
  .object({
    outcome: z.enum(['converged', 'exhausted']),
    decision: trialDecisionSchema,
    /** `null` on an exhausted trial that never found one. */
    winner: trialVariantResultSchema.nullable(),
    confirmingRounds: z.number().int().nonnegative(),
    /**
     * What this trial could NOT establish — required, never empty.
     *
     * A trial that ends without saying what it failed to learn reads as though it settled
     * everything it touched. Silence is the failure mode this field exists to prevent.
     */
    notLearned: z.array(textSchema.max(1_000)).min(1).max(50),
    graduation: z
      .object({
        graduated: z.boolean(),
        graduatedMediaId: idSchema.nullable().default(null),
        approvedBy: goalActorSchema.nullable().default(null),
      })
      .strict(),
    /** The handoff into the PAUSED-first paid scaffold, when a confirmation arm was run. */
    paidConfirmation: z
      .object({
        scaffoldId: idSchema.nullable().default(null),
        adsetId: idSchema.nullable().default(null),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .refine((report) => report.outcome !== 'converged' || report.winner !== null, {
    path: ['winner'],
    message: 'A converged trial must name the coordinate it converged on.',
  });

export const campaignArtifactSchemaRegistry = {
  'campaign-charter': campaignCharterDataSchema,
  'research-dossier': researchDossierDataSchema,
  'campaign-strategy': campaignStrategyDataSchema,
  'audience-strategy': audienceStrategyDataSchema,
  'creative-strategy': creativeStrategyDataSchema,
  'creative-production-plan': creativeProductionPlanDataSchema,
  'media-budget-strategy': mediaBudgetStrategyDataSchema,
  'measurement-plan': measurementPlanDataSchema,
  'compliance-register': complianceRegisterDataSchema,
  'launch-readiness': launchReadinessDataSchema,
  'campaign-execution-package': campaignExecutionPackageDataSchema,
  'offer-destination-brief': offerDestinationBriefDataSchema,
  'lifecycle-journey-plan': lifecycleJourneyPlanDataSchema,
  'partnership-creator-brief': partnershipCreatorBriefDataSchema,
  'localization-plan': localizationPlanDataSchema,
  'experiment-plan': experimentPlanDataSchema,
  'trial-reels-charter': trialReelsCharterDataSchema,
  'trial-hypothesis-ledger': trialHypothesisLedgerDataSchema,
  'trial-round-ledger': trialRoundLedgerDataSchema,
  'trial-winner-report': trialWinnerReportDataSchema,
} as const satisfies Record<CampaignArtifactType, z.ZodTypeAny>;

export const goalChecklistCollectionPolicySchema = z.enum([
  'stakeholder_required',
  'authoritative_system',
  'evidence_required',
  'tool_or_stakeholder',
  'derived',
  'approval_required',
]);
export type GoalChecklistCollectionPolicy = z.infer<typeof goalChecklistCollectionPolicySchema>;

export const goalChecklistRequirementDefinitionSchema = z
  .object({
    id: idSchema,
    sectionId: idSchema,
    path: z.string().trim().startsWith('/data/').max(1_000),
    label: textSchema.max(300),
    question: textSchema.max(2_000),
    ownerCapabilities: z.array(idSchema).min(1).max(20),
    approvalCapabilities: z.array(idSchema).max(20),
    collectionPolicy: goalChecklistCollectionPolicySchema,
    minimumConfidence: confidenceSchema.optional(),
    minimumEvidenceCount: z.number().int().nonnegative().default(0),
    expectedResponse: goalExpectedResponseSchema,
  })
  .strict()
  .superRefine((requirement, context) => {
    const confidenceRequired =
      requirement.collectionPolicy === 'evidence_required' ||
      requirement.collectionPolicy === 'tool_or_stakeholder';
    if (confidenceRequired && requirement.minimumConfidence === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['minimumConfidence'],
        message: 'Evidence-backed checklist requirements need a confidence threshold.',
      });
    }
    if (
      (requirement.collectionPolicy === 'stakeholder_required' ||
        requirement.collectionPolicy === 'approval_required') &&
      requirement.minimumConfidence !== undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['minimumConfidence'],
        message: 'Confidence cannot replace stakeholder authority.',
      });
    }
  });
export type GoalChecklistRequirementDefinition = z.infer<
  typeof goalChecklistRequirementDefinitionSchema
>;

type ChecklistSeed = {
  id: string;
  path: string;
  label: string;
  capability: string;
  policy: GoalChecklistCollectionPolicy;
  approvalCapability?: string;
  /** The noun the generated question refers to. Not every Goal template is a campaign — a
   *  trial reels Goal asking "…for this campaign" is asking about something that does not
   *  exist. */
  subject?: string;
};

const requirement = (seed: ChecklistSeed): GoalChecklistRequirementDefinition =>
  goalChecklistRequirementDefinitionSchema.parse({
    id: seed.id,
    sectionId: seed.id,
    path: seed.path,
    label: seed.label,
    question: `Provide or confirm ${seed.label.toLowerCase()} for this ${seed.subject ?? 'campaign'}.`,
    ownerCapabilities: [seed.capability],
    approvalCapabilities: seed.approvalCapability ? [seed.approvalCapability] : [],
    collectionPolicy: seed.policy,
    ...(seed.policy === 'evidence_required' || seed.policy === 'tool_or_stakeholder'
      ? { minimumConfidence: 0.8, minimumEvidenceCount: 1 }
      : {}),
    expectedResponse:
      seed.policy === 'approval_required'
        ? { kind: 'approval' as const }
        : { kind: 'text' as const },
  });

const requirements = (
  capability: string,
  entries: Array<[string, string, string, GoalChecklistCollectionPolicy]>,
  subject?: string,
): GoalChecklistRequirementDefinition[] =>
  entries.map(([id, path, label, policy]) =>
    requirement({ id, path, label, capability, policy, subject }),
  );

export const campaignChecklistRegistry: Readonly<
  Record<CampaignArtifactType, readonly GoalChecklistRequirementDefinition[]>
> = Object.freeze({
  'campaign-charter': requirements('strategy', [
    ['objective', '/data/objective', 'Business and campaign objective', 'stakeholder_required'],
    ['scope-offer', '/data/scopeAndOffer', 'Scope and offer', 'stakeholder_required'],
    [
      'success-criteria',
      '/data/successCriteria',
      'Measurable success criteria',
      'stakeholder_required',
    ],
    [
      'budget-timing',
      '/data/budgetAndTiming',
      'Approved budget and timing',
      'stakeholder_required',
    ],
    ['constraints', '/data/constraints', 'Campaign constraints', 'stakeholder_required'],
    ['non-goals', '/data/nonGoals', 'Explicit non-goals', 'stakeholder_required'],
    ['decision-rights', '/data/decisionRights', 'Decision rights', 'stakeholder_required'],
  ]),
  'research-dossier': requirements('research', [
    ['questions', '/data/researchQuestions', 'Research questions', 'stakeholder_required'],
    [
      'market',
      '/data/marketAndCategoryFindings',
      'Market and category findings',
      'evidence_required',
    ],
    ['customer', '/data/customerFindings', 'Customer findings', 'evidence_required'],
    ['competitor', '/data/competitorFindings', 'Competitor findings', 'evidence_required'],
    ['unknowns', '/data/unknowns', 'Material unknowns', 'tool_or_stakeholder'],
    [
      'implications',
      '/data/strategicImplications',
      'Strategic implications',
      'tool_or_stakeholder',
    ],
  ]),
  'campaign-strategy': requirements('strategy', [
    ['thesis', '/data/strategicThesis', 'Strategic thesis', 'evidence_required'],
    [
      'objective-offer',
      '/data/objectiveAndOffer',
      'Objective and offer interpretation',
      'tool_or_stakeholder',
    ],
    [
      'journey-channels',
      '/data/journeyAndChannelRoles',
      'Journey and channel roles',
      'tool_or_stakeholder',
    ],
    ['priorities', '/data/priorities', 'Strategic priorities', 'stakeholder_required'],
    ['tradeoffs', '/data/tradeoffs', 'Strategic tradeoffs', 'stakeholder_required'],
    ['assumptions', '/data/assumptions', 'Assumptions', 'tool_or_stakeholder'],
    ['risks', '/data/risks', 'Risks', 'tool_or_stakeholder'],
    ['decisions', '/data/decisionIds', 'Binding strategy decisions', 'stakeholder_required'],
  ]),
  'audience-strategy': requirements('research', [
    ['segments', '/data/segments', 'Priority audience segments', 'evidence_required'],
    ['exclusions', '/data/exclusions', 'Audience exclusions', 'stakeholder_required'],
    ['overlap', '/data/overlapPolicy', 'Audience overlap policy', 'tool_or_stakeholder'],
    ['privacy', '/data/privacyConstraints', 'Audience privacy constraints', 'approval_required'],
  ]),
  'creative-strategy': requirements('creative', [
    ['angles', '/data/angles', 'Creative angles', 'evidence_required'],
    ['hierarchy', '/data/messageHierarchy', 'Message hierarchy', 'stakeholder_required'],
    ['claims', '/data/claims', 'Substantiated claims', 'evidence_required'],
    ['cta', '/data/cta', 'Call to action', 'stakeholder_required'],
    ['destination', '/data/destinationUrl', 'Destination URL', 'authoritative_system'],
    ['concepts', '/data/concepts', 'Creative concepts', 'tool_or_stakeholder'],
    ['guardrails', '/data/guardrails', 'Creative guardrails', 'stakeholder_required'],
  ]),
  'creative-production-plan': requirements('creative', [
    [
      'deliverables',
      '/data/deliverables',
      'Approved creative asset versions',
      'authoritative_system',
    ],
    ['schedule', '/data/productionSchedule', 'Production schedule', 'stakeholder_required'],
    ['qa', '/data/reviewAndQaGates', 'Review and QA gates', 'approval_required'],
    ['rights', '/data/rightsAndUsageNotes', 'Rights and usage terms', 'approval_required'],
  ]),
  'media-budget-strategy': requirements('paid_media', [
    ['total-budget', '/data/totalBudget', 'Authorized total budget', 'stakeholder_required'],
    [
      'allocations',
      '/data/channelAllocations',
      'Channel budget allocation',
      'stakeholder_required',
    ],
    ['flight', '/data/flight', 'Media flight', 'stakeholder_required'],
    ['pacing', '/data/pacing', 'Pacing strategy', 'tool_or_stakeholder'],
    ['targeting', '/data/targetingRules', 'Targeting rules', 'tool_or_stakeholder'],
    ['scenarios', '/data/scenarios', 'Budget scenarios', 'tool_or_stakeholder'],
    ['optimization', '/data/optimizationRules', 'Optimization rules', 'stakeholder_required'],
    [
      'authorization',
      '/data/budgetAuthorizationDecisionId',
      'Budget authorization',
      'approval_required',
    ],
  ]),
  'measurement-plan': requirements('measurement', [
    ['kpis', '/data/kpiTree', 'KPI tree', 'stakeholder_required'],
    ['metrics', '/data/metricDefinitions', 'Metric definitions', 'stakeholder_required'],
    ['source', '/data/sourceOfTruth', 'Measurement source of truth', 'authoritative_system'],
    ['naming', '/data/namingConvention', 'Campaign naming convention', 'stakeholder_required'],
    ['events', '/data/eventsAndConversions', 'Events and conversions', 'authoritative_system'],
    [
      'attribution',
      '/data/attributionAndIncrementality',
      'Attribution approach',
      'stakeholder_required',
    ],
    ['reporting', '/data/reportingCadence', 'Reporting cadence', 'stakeholder_required'],
    ['qa', '/data/qaApprovalDecisionId', 'Measurement QA approval', 'approval_required'],
  ]),
  'compliance-register': requirements('compliance', [
    ['claims', '/data/claims', 'Approved claims register', 'approval_required'],
    ['legal', '/data/brandAndLegalReviews', 'Brand and legal reviews', 'approval_required'],
    ['platform', '/data/platformPolicyReviews', 'Platform policy reviews', 'approval_required'],
    ['privacy', '/data/privacyAndConsent', 'Privacy and consent controls', 'approval_required'],
    [
      'accessibility',
      '/data/accessibilityAndInclusion',
      'Accessibility checks',
      'approval_required',
    ],
    ['exceptions', '/data/exceptions', 'Approved compliance exceptions', 'approval_required'],
    [
      'approval',
      '/data/complianceApprovalDecisionId',
      'Final compliance approval',
      'approval_required',
    ],
  ]),
  'launch-readiness': requirements('operations', [
    ['versions', '/data/acceptedArtifactVersions', 'Accepted artifact versions', 'derived'],
    ['budget', '/data/budgetAuthorizationDecisionId', 'Budget authorization', 'approval_required'],
    [
      'compliance',
      '/data/complianceApprovalDecisionId',
      'Compliance approval',
      'approval_required',
    ],
    [
      'measurement',
      '/data/measurementQaDecisionId',
      'Measurement QA approval',
      'approval_required',
    ],
    ['destination', '/data/destinationQa', 'Destination QA result', 'authoritative_system'],
    ['owners', '/data/operationalOwners', 'Operational owners', 'stakeholder_required'],
    ['go-no-go', '/data/goNoGoDecisionId', 'Go or no-go decision', 'approval_required'],
    ['rollback', '/data/rollbackOwnerUserId', 'Rollback owner', 'stakeholder_required'],
    ['escalation', '/data/escalationOwnerUserId', 'Escalation owner', 'stakeholder_required'],
  ]),
  'campaign-execution-package': requirements('operations', [
    ['name', '/data/campaignName', 'Campaign name', 'derived'],
    ['objective', '/data/objective', 'Campaign objective', 'derived'],
    ['channels', '/data/channels', 'Executable channels', 'derived'],
    ['budget', '/data/budget', 'Executable budget', 'derived'],
    ['flight', '/data/flight', 'Executable flight', 'derived'],
    ['audiences', '/data/audienceIds', 'Executable audiences', 'derived'],
    ['creative', '/data/creativeAssets', 'Approved creative versions', 'derived'],
    ['measurement', '/data/measurementPlanVersionId', 'Measurement version pin', 'derived'],
    ['compliance', '/data/complianceRegisterVersionId', 'Compliance version pin', 'derived'],
    ['launch', '/data/launchReadinessVersionId', 'Launch-readiness version pin', 'derived'],
    ['artifacts', '/data/acceptedArtifactVersions', 'Accepted artifact version pins', 'derived'],
    ['approvals', '/data/approvalDecisionIds', 'Binding approval decisions', 'derived'],
    ['blockers', '/data/unresolvedBlockers', 'Zero unresolved blockers', 'derived'],
  ]),
  'offer-destination-brief': requirements('strategy', [
    ['offer', '/data/offer', 'Offer definition', 'stakeholder_required'],
    ['exchange', '/data/valueExchange', 'Value exchange', 'stakeholder_required'],
    ['destination', '/data/destinationUrl', 'Destination URL', 'authoritative_system'],
    ['journey', '/data/conversionJourney', 'Conversion journey', 'tool_or_stakeholder'],
    ['requirements', '/data/requirements', 'Destination requirements', 'stakeholder_required'],
    ['owners', '/data/ownerUserIds', 'Destination owners', 'stakeholder_required'],
    [
      'content',
      '/data/contentAndMerchandising',
      'Content and merchandising',
      'stakeholder_required',
    ],
    ['tracking', '/data/trackingAndConsent', 'Tracking and consent', 'approval_required'],
    ['qa', '/data/qaDecisionId', 'Destination QA approval', 'approval_required'],
  ]),
  'lifecycle-journey-plan': requirements('operations', [
    ['entry', '/data/entryCriteria', 'Lifecycle entry criteria', 'stakeholder_required'],
    ['steps', '/data/steps', 'Lifecycle message sequence', 'stakeholder_required'],
    [
      'suppression',
      '/data/segmentationAndSuppression',
      'Segmentation and suppression',
      'approval_required',
    ],
    ['handoffs', '/data/handoffs', 'Lifecycle handoffs', 'stakeholder_required'],
    [
      'automation',
      '/data/automationRequirements',
      'Automation requirements',
      'authoritative_system',
    ],
    ['qa', '/data/measurementAndQaDecisionId', 'Lifecycle measurement QA', 'approval_required'],
  ]),
  'partnership-creator-brief': requirements('creative', [
    ['partners', '/data/partnerProfiles', 'Partner profiles', 'stakeholder_required'],
    ['deliverables', '/data/deliverables', 'Partner deliverables', 'stakeholder_required'],
    ['terms', '/data/commercialTerms', 'Commercial terms', 'stakeholder_required'],
    ['rights', '/data/rightsAndDisclosures', 'Rights and disclosures', 'approval_required'],
    [
      'workflow',
      '/data/reviewAndPublishingWorkflow',
      'Review and publishing workflow',
      'stakeholder_required',
    ],
    ['tracking', '/data/trackingAndMeasurement', 'Partnership tracking', 'authoritative_system'],
    [
      'approval',
      '/data/complianceApprovalDecisionId',
      'Partnership compliance approval',
      'approval_required',
    ],
  ]),
  'localization-plan': requirements('strategy', [
    ['markets', '/data/markets', 'Market and language priorities', 'stakeholder_required'],
    ['context', '/data/culturalContext', 'Cultural context', 'evidence_required'],
    [
      'offer',
      '/data/offerAndMessageAdaptations',
      'Offer and message adaptations',
      'stakeholder_required',
    ],
    ['creative', '/data/creativeLocalization', 'Creative localization', 'stakeholder_required'],
    [
      'legal',
      '/data/legalAndPolicyDifferences',
      'Local legal and policy differences',
      'approval_required',
    ],
    ['qa', '/data/qaDecisionIds', 'Local market QA approvals', 'approval_required'],
  ]),
  'experiment-plan': requirements('measurement', [
    ['decision', '/data/decision', 'Experiment decision', 'stakeholder_required'],
    ['hypothesis', '/data/hypothesis', 'Falsifiable hypothesis', 'stakeholder_required'],
    ['variants', '/data/variants', 'Experiment variants', 'stakeholder_required'],
    ['control', '/data/control', 'Control definition', 'stakeholder_required'],
    ['population', '/data/population', 'Experiment population', 'stakeholder_required'],
    ['allocation', '/data/allocation', 'Experiment allocation', 'stakeholder_required'],
    ['metrics', '/data/metrics', 'Experiment metrics', 'stakeholder_required'],
    ['guardrails', '/data/guardrails', 'Experiment guardrails', 'stakeholder_required'],
    ['duration', '/data/durationDays', 'Experiment duration', 'stakeholder_required'],
    ['stopping', '/data/stoppingRules', 'Stopping rules', 'stakeholder_required'],
    [
      'analysis',
      '/data/analysisAndDecisionRule',
      'Analysis and decision rule',
      'stakeholder_required',
    ],
  ]),
  'trial-reels-charter': requirements(
    'strategy',
    [
      [
        'outcome',
        '/data/outcome',
        'Desired outcome and what winning means',
        'stakeholder_required',
      ],
      [
        'metric',
        '/data/primaryMetric',
        'Primary metric the trial ranks on',
        'stakeholder_required',
      ],
      ['arms', '/data/arms', 'Which arms run (organic, paid confirmation)', 'stakeholder_required'],
      [
        'fence',
        '/data/fence',
        'Trial fence (rounds, variants, floors, caps)',
        'stakeholder_required',
      ],
      [
        'graduation',
        '/data/graduationStrategy',
        'Graduation strategy for a winning reel',
        'stakeholder_required',
      ],
      [
        'decision-rights',
        '/data/decisionRights',
        'Who approves slates and graduation',
        'stakeholder_required',
      ],
    ],
    'trial',
  ),
  'trial-hypothesis-ledger': requirements(
    'creative',
    [
      ['space', '/data/space', 'The creative space to search', 'stakeholder_required'],
      ['priors', '/data/priorBeliefs', 'Evidence-backed prior beliefs', 'evidence_required'],
      ['excluded', '/data/excluded', 'Options deliberately not tested', 'stakeholder_required'],
    ],
    'trial',
  ),
  'trial-round-ledger': requirements(
    'measurement',
    [
      ['rounds', '/data/rounds', 'Every round and every variant observed', 'authoritative_system'],
      ['decisions', '/data/decisions', 'The engine verdict recorded per round', 'derived'],
    ],
    'trial',
  ),
  'trial-winner-report': requirements(
    'strategy',
    [
      ['outcome', '/data/outcome', 'Whether the trial converged or was exhausted', 'derived'],
      ['winner', '/data/winner', 'The winning coordinate, if one was proven', 'derived'],
      [
        'not-learned',
        '/data/notLearned',
        'What this trial could not establish',
        'stakeholder_required',
      ],
      [
        'graduation',
        '/data/graduation',
        'Graduation of the winner to followers',
        'approval_required',
      ],
    ],
    'trial',
  ),
});

export const campaignFieldProvenanceSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('request_response'), requestId: idSchema, responseId: idSchema })
    .strict(),
  z
    .object({ kind: z.literal('evidence'), evidenceIds: z.array(idSchema).min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal('tool'),
      toolName: idSchema,
      runId: idSchema,
      evidenceIds: z.array(idSchema).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('accepted_artifact'),
      artifactId: idSchema,
      versionId: idSchema,
    })
    .strict(),
  z.object({ kind: z.literal('derived'), derivation: textSchema.max(2_000) }).strict(),
]);

export const campaignFieldProvenanceSchema = z
  .object({
    path: z.string().trim().startsWith('/data/').max(1_000),
    source: campaignFieldProvenanceSourceSchema,
    confidence: confidenceSchema,
    rationale: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export type CampaignFieldProvenance = z.infer<typeof campaignFieldProvenanceSchema>;

export const campaignArtifactDraftDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    contentSchemaVersion: z.literal(1),
    artifactType: campaignArtifactTypeSchema,
    goalId: idSchema,
    artifactId: idSchema,
    templateId: idSchema,
    templateVersion: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    data: z.record(z.string(), z.unknown()),
    provenance: z.array(campaignFieldProvenanceSchema).max(1_000),
  })
  .strict();
export type CampaignArtifactDraftDocument = z.infer<typeof campaignArtifactDraftDocumentSchema>;

const artifactEnvelope = <Type extends CampaignArtifactType, Schema extends z.ZodTypeAny>(
  artifactType: Type,
  data: Schema,
) =>
  z
    .object({
      schemaVersion: z.literal(1),
      contentSchemaVersion: z.literal(1),
      artifactType: z.literal(artifactType),
      goalId: idSchema,
      artifactId: idSchema,
      templateId: idSchema,
      templateVersion: z.number().int().positive(),
      createdAt: timestampSchema,
      updatedAt: timestampSchema,
      data,
      provenance: z.array(campaignFieldProvenanceSchema).max(1_000),
    })
    .strict()
    .superRefine((document, context) => {
      const provenancePaths = new Set(document.provenance.map((entry) => entry.path));
      for (const requirement of campaignChecklistRegistry[artifactType]) {
        if (!provenancePaths.has(requirement.path)) {
          context.addIssue({
            code: 'custom',
            path: ['provenance'],
            message: `Missing field provenance for ${requirement.path}.`,
          });
        }
      }
    });

export const campaignArtifactDocumentSchema = z.discriminatedUnion('artifactType', [
  artifactEnvelope('campaign-charter', campaignCharterDataSchema),
  artifactEnvelope('research-dossier', researchDossierDataSchema),
  artifactEnvelope('campaign-strategy', campaignStrategyDataSchema),
  artifactEnvelope('audience-strategy', audienceStrategyDataSchema),
  artifactEnvelope('creative-strategy', creativeStrategyDataSchema),
  artifactEnvelope('creative-production-plan', creativeProductionPlanDataSchema),
  artifactEnvelope('media-budget-strategy', mediaBudgetStrategyDataSchema),
  artifactEnvelope('measurement-plan', measurementPlanDataSchema),
  artifactEnvelope('compliance-register', complianceRegisterDataSchema),
  artifactEnvelope('launch-readiness', launchReadinessDataSchema),
  artifactEnvelope('campaign-execution-package', campaignExecutionPackageDataSchema),
  artifactEnvelope('offer-destination-brief', offerDestinationBriefDataSchema),
  artifactEnvelope('lifecycle-journey-plan', lifecycleJourneyPlanDataSchema),
  artifactEnvelope('partnership-creator-brief', partnershipCreatorBriefDataSchema),
  artifactEnvelope('localization-plan', localizationPlanDataSchema),
  artifactEnvelope('experiment-plan', experimentPlanDataSchema),
]);
export type CampaignArtifactDocument = z.infer<typeof campaignArtifactDocumentSchema>;

export const goalChecklistItemStatusSchema = z.enum([
  'pending',
  'researching',
  'awaiting_input',
  'awaiting_approval',
  'resolved',
  'blocked',
  'waived',
  'stale',
]);
export type GoalChecklistItemStatus = z.infer<typeof goalChecklistItemStatusSchema>;

export const goalChecklistItemSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    artifactId: idSchema,
    definition: goalChecklistRequirementDefinitionSchema,
    status: goalChecklistItemStatusSchema,
    confidence: confidenceSchema.optional(),
    evidenceIds: z.array(idSchema).max(100),
    requestIds: z.array(idSchema).max(100),
    resolvedVersionId: idSchema.optional(),
    provenance: campaignFieldProvenanceSchema.optional(),
    blocker: z.string().trim().min(1).max(2_000).optional(),
    updatedAt: timestampSchema,
  })
  .strict();
export type GoalChecklistItem = z.infer<typeof goalChecklistItemSchema>;

const evidenceIdsForProvenance = (provenance: CampaignFieldProvenance): string[] => {
  if (provenance.source.kind === 'evidence' || provenance.source.kind === 'tool') {
    return provenance.source.evidenceIds;
  }
  return [];
};

const checklistProvenanceSatisfiesPolicy = (
  requirement: GoalChecklistRequirementDefinition,
  provenance: CampaignFieldProvenance,
): string | null => {
  const evidenceIds = evidenceIdsForProvenance(provenance);
  if (
    requirement.minimumConfidence !== undefined &&
    provenance.confidence < requirement.minimumConfidence
  ) {
    return `Confidence ${provenance.confidence.toFixed(2)} is below the required ${requirement.minimumConfidence.toFixed(2)}.`;
  }
  if (
    requirement.collectionPolicy === 'stakeholder_required' &&
    provenance.source.kind !== 'request_response'
  ) {
    return 'This value requires an attributable stakeholder response.';
  }
  if (
    requirement.collectionPolicy === 'approval_required' &&
    provenance.source.kind !== 'request_response'
  ) {
    return 'This value requires an attributable approval response.';
  }
  if (
    requirement.collectionPolicy === 'authoritative_system' &&
    provenance.source.kind !== 'tool' &&
    provenance.source.kind !== 'accepted_artifact'
  ) {
    return 'This value must come from an authoritative tool or accepted artifact version.';
  }
  if (
    requirement.collectionPolicy === 'evidence_required' &&
    evidenceIds.length < requirement.minimumEvidenceCount
  ) {
    return `This value requires at least ${requirement.minimumEvidenceCount} evidence source.`;
  }
  if (
    requirement.collectionPolicy === 'tool_or_stakeholder' &&
    provenance.source.kind === 'derived'
  ) {
    return 'This value requires a tool result, evidence, accepted artifact, or stakeholder response.';
  }
  if (provenance.source.kind === 'derived' && provenance.confidence > 0.7) {
    return 'Model-derived values cannot claim confidence above 0.70.';
  }
  return null;
};

export const evaluateCampaignArtifactChecklist = (input: {
  goalId: string;
  artifactId: string;
  versionId: string;
  document: CampaignArtifactDocument;
  now: string;
}): GoalChecklistItem[] => {
  const provenanceByPath = new Map(
    input.document.provenance.map((provenance) => [provenance.path, provenance]),
  );
  return campaignChecklistRegistry[input.document.artifactType].map((definition) => {
    const provenance = provenanceByPath.get(definition.path);
    const blocker = provenance
      ? checklistProvenanceSatisfiesPolicy(definition, provenance)
      : 'Required field provenance is missing.';
    const evidenceIds = provenance ? evidenceIdsForProvenance(provenance) : [];
    const requestIds =
      provenance?.source.kind === 'request_response' ? [provenance.source.requestId] : [];
    return goalChecklistItemSchema.parse({
      id: `${input.artifactId}:${definition.id}`,
      goalId: input.goalId,
      artifactId: input.artifactId,
      definition,
      status: blocker ? 'blocked' : 'resolved',
      ...(provenance ? { confidence: provenance.confidence, provenance } : {}),
      evidenceIds,
      requestIds,
      ...(blocker ? { blocker } : { resolvedVersionId: input.versionId }),
      updatedAt: input.now,
    });
  });
};

export const goalArtifactValidationSchema = z
  .object({
    artifactId: idSchema,
    versionId: idSchema,
    artifactType: campaignArtifactTypeSchema,
    contentSchemaVersion: z.literal(1),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    valid: z.boolean(),
    checklistItemIds: z.array(idSchema).max(1_000),
    errors: z.array(textSchema.max(2_000)).max(1_000),
    validatedAt: timestampSchema,
  })
  .strict();
export type GoalArtifactValidation = z.infer<typeof goalArtifactValidationSchema>;

export const goalPublicRationaleSchema = z
  .object({
    summary: textSchema.max(8_000),
    assumptions: z.array(textSchema.max(2_000)).max(100),
    tradeoffs: z.array(textSchema.max(2_000)).max(100),
    risks: z.array(textSchema.max(2_000)).max(100),
    unknowns: z.array(textSchema.max(2_000)).max(100),
    confidence: confidenceSchema,
  })
  .strict();
export type GoalPublicRationale = z.infer<typeof goalPublicRationaleSchema>;

export const goalWorkProductSchema = z
  .object({
    schemaVersion: z.literal(1),
    goalId: idSchema,
    workNodeId: idSchema,
    artifactId: idSchema,
    baseVersionId: idSchema.optional(),
    outcome: z.enum([
      'draft_ready',
      'needs_input',
      'needs_approval',
      'blocked',
      'no_change',
      'failed',
    ]),
    artifact: campaignArtifactDocumentSchema.optional(),
    evidence: z.array(goalEvidenceSchema).max(500),
    decisions: z.array(goalDecisionSchema).max(200),
    requests: z.array(goalRequestSchema).max(200),
    rationale: goalPublicRationaleSchema,
  })
  .strict()
  .superRefine((product, context) => {
    if (product.outcome === 'draft_ready' && !product.artifact) {
      context.addIssue({
        code: 'custom',
        path: ['artifact'],
        message: 'A draft-ready Goal work product must contain a typed artifact.',
      });
    }
    if (product.artifact && product.artifact.artifactId !== product.artifactId) {
      context.addIssue({
        code: 'custom',
        path: ['artifact', 'artifactId'],
        message: 'The work product artifact identity must match its target.',
      });
    }
    if (product.outcome === 'needs_input' && product.requests.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['requests'],
        message: 'A Goal work product waiting for input must create a precise request.',
      });
    }
  });
export type GoalWorkProduct = z.infer<typeof goalWorkProductSchema>;

export const goalWorkNodeResultRecordSchema = z
  .object({
    id: idSchema,
    goalId: idSchema,
    workNodeId: idSchema,
    childRunId: idSchema.optional(),
    artifactId: idSchema.optional(),
    outcome: z.enum([
      'draft_ready',
      'needs_input',
      'needs_approval',
      'blocked',
      'no_change',
      'failed',
      'invalid',
    ]),
    workProduct: goalWorkProductSchema.optional(),
    validationErrors: z.array(textSchema.max(2_000)).max(1_000),
    rationale: goalPublicRationaleSchema.optional(),
    createdAt: timestampSchema,
    processedAt: timestampSchema.optional(),
  })
  .strict();
export type GoalWorkNodeResultRecord = z.infer<typeof goalWorkNodeResultRecordSchema>;

export const parseCampaignArtifactDocument = (value: unknown): CampaignArtifactDocument =>
  campaignArtifactDocumentSchema.parse(value);

export const serializeCampaignArtifactDocument = (document: CampaignArtifactDocument): string =>
  `${JSON.stringify(campaignArtifactDocumentSchema.parse(document), null, 2)}\n`;

export const createCampaignArtifactDraftDocument = (input: {
  artifactType: CampaignArtifactType;
  goalId: string;
  artifactId: string;
  templateId: string;
  templateVersion: number;
  now: string;
}): CampaignArtifactDraftDocument =>
  campaignArtifactDraftDocumentSchema.parse({
    schemaVersion: 1,
    contentSchemaVersion: 1,
    artifactType: input.artifactType,
    goalId: input.goalId,
    artifactId: input.artifactId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    createdAt: input.now,
    updatedAt: input.now,
    data: {},
    provenance: [],
  });

export const serializeCampaignArtifactDraftDocument = (
  document: CampaignArtifactDraftDocument,
): string => `${JSON.stringify(campaignArtifactDraftDocumentSchema.parse(document), null, 2)}\n`;
