import { z } from 'zod';
import { agentDelegatedFrameSchema } from '../agents/cross-agent';
import { aeoSnapshotCardSchema } from '../organic/aeo';
import {
  uiBrandBookAppliedFrameSchema,
  uiBrandBookFrameSchema,
  uiBrandBookProposalFrameSchema,
  uiReadinessScorecardFrameSchema,
} from './brand-report-craft';
import { mediaSearchResultsFrameSchema } from './media';
import { type OrganicMediaStage, organicMediaStageSchema } from './organic-pipeline';

/**
 * Canonical lifecycle status of a single content generation job
 * (organic.post_generation_jobs.status). This is THE status every surface reads —
 * agent inline card, generations ticker, calendar — so one job is never described
 * with three vocabularies ("Queued" vs "Working" vs "Copy in progress"). Pair with
 * resolveOrganicGenerationDisplay for the human label + tone.
 */
export const organicGenerationStatusEnum = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type OrganicGenerationStatus = z.infer<typeof organicGenerationStatusEnum>;

const jobEventDataSchema = z
  .object({
    jobId: z.string().min(1),
    brandId: z.string().min(1),
    // The pre-minted organic_calendar_drafts row id. Present from job.enqueued /
    // ui.post_enqueued onward (and on draft.text_ready / draft.ready) so the FE can
    // render the real, durable calendar row immediately and reconcile the stream
    // card, refetch, and Realtime to the SAME id — no duplicate/ghost cards.
    draftId: z.string().optional(),
    // YYYY-MM-DD slot the draft belongs to (= scheduledAt date), so the calendar can
    // place the card and navigate to its week without parsing scheduledAt.
    dayId: z.string().optional(),
    scheduledAt: z.string().optional(),
    platform: z.string().optional(),
    // Concept identity so a ticker/calendar row reads as the concept title (e.g.
    // "World Cup kickoff…") instead of a bare "Instagram · Working". Sourced from the
    // plan item title / draft topic.
    title: z.string().optional(),
    planItemId: z.string().optional(),
    // AI SDK tool-call id of the agent tool that dispatched this job (e.g.
    // generatePosts), so the FE chat can attach the frame's card inline under
    // that tool call instead of rendering it in a separate track.
    toolCallId: z.string().nullable().optional(),
    // Canonical job status + media-enrichment stage so the FE derives one label via
    // resolveOrganicGenerationDisplay rather than inferring it from the frame type.
    status: organicGenerationStatusEnum.optional(),
    mediaStage: organicMediaStageSchema.optional(),
  })
  .loose();

const uiCardDataSchema = z.record(z.string(), z.unknown());

/**
 * Canonical user-selectable post formats. HyperFrame is intentionally absent: it
 * is a video-production METHOD whose rendered MP4 publishes as a reel, not a post
 * type the user picks.
 */
export const organicPostFormatEnum = z.enum(['reel', 'post', 'carousel', 'story']);
export type OrganicPostFormat = z.infer<typeof organicPostFormatEnum>;

/**
 * Plans/drafts persisted before HyperFrame was demoted stored "hyperframe" as a
 * format. Normalize it to "reel" on read so legacy rows keep parsing. Used as a
 * `z.preprocess` so the visible union no longer advertises hyperframe.
 */
export const coerceLegacyHyperframeFormat = (value: unknown): unknown =>
  value === 'hyperframe' ? 'reel' : value;

/**
 * Canonical ordered content-creation pipeline timeline. The backend content
 * runner's raw stages collapse onto these steps; the Frontend renders one
 * timeline node per member, in this order. `blueprint` is the Stage-2 creative
 * expansion (creative direction + storyboard + 512px scene frames) that runs
 * after the text draft and before the gated media realization (`assets`).
 */
export const pipelineStageEnum = z.enum([
  'strategist',
  'concept',
  'draft',
  'blueprint',
  'assets',
  'quality',
  'merge',
]);

export type PipelineStage = z.infer<typeof pipelineStageEnum>;

// --- ONE lifecycle vocabulary ----------------------------------------------
// Three vocabularies used to describe one object and none mapped onto another:
//
//   job / chat        queued | running | completed | failed | cancelled
//   plan item         pending | executing | completed | failed | cancelled
//   planner draft     draft | placeholder | streaming | scheduled | published | failed
//
// The collision that reached users: `completed` is NOT `published`. The chat said
// "Ready" while the planner said "Draft" for the same row, so "Ready" read as "done
// and posted" — it is neither. The chat had no word at all for a seeded slot or a
// scheduled post; the planner had none for queued or cancelled. Four different
// in-progress labels and three tone tables were live at once.
//
// So: ONE phase vocabulary below, ONE explicit map per input vocabulary onto it,
// ONE label table, ONE tone table. A surface picks `label` (prose) or `pill` (dense
// badge) — never a word of its own.

export const organicLifecyclePhaseEnum = z.enum([
  'concept', // planned, never dispatched
  'seeded', // a calendar slot exists; nothing generated yet
  'queued', // accepted, not started
  'working', // generating — refined by pipeline stage
  'blind', // running, but no stage frame has ever arrived (NOT healthy progress)
  'draft_ready', // content exists and is NOT approved. Where `completed` lands.
  'scheduled', // approved; will post at its time
  'published', // live on the platform
  'media_failed', // copy survived, the media job did not
  'failed',
  'cancelled',
]);
export type OrganicLifecyclePhase = z.infer<typeof organicLifecyclePhaseEnum>;

/** The one tone table. Every surface maps THESE to its own colors, never a status. */
export type OrganicStatusTone =
  | 'neutral'
  | 'pending'
  | 'active'
  | 'ready'
  | 'scheduled'
  | 'live'
  | 'error';

export type OrganicPhasePresentation = {
  /** Prose — chat, cards, anywhere there is room for a sentence's worth of word. */
  label: string;
  /** Dense badge/pill. Same meaning, fewer characters. Never a different claim. */
  pill: string;
  /** What the phase means, in words: the tooltip / accessible name. */
  hint: string;
  tone: OrganicStatusTone;
};

export const ORGANIC_PHASE_PRESENTATION: Record<OrganicLifecyclePhase, OrganicPhasePresentation> = {
  concept: {
    label: 'Concept',
    pill: 'Concept',
    hint: 'A planned idea — nothing has been generated yet',
    tone: 'neutral',
  },
  seeded: {
    label: 'Seeded',
    pill: 'Seeded',
    hint: 'Slot created — awaiting generation',
    tone: 'pending',
  },
  queued: {
    label: 'Queued',
    pill: 'Queued',
    hint: 'Waiting for a generation slot',
    tone: 'pending',
  },
  working: {
    label: 'Generating',
    pill: 'Generating',
    hint: 'Generating right now',
    tone: 'active',
  },
  // Deliberately blunt, and deliberately NOT `active`: a running row that has never
  // sent a stage frame is a job we have lost sight of, and an amber pulse would sell
  // that as progress.
  blind: {
    label: 'Running · no updates yet',
    pill: 'Working',
    hint: 'Running, but the pipeline has sent no stage update',
    tone: 'neutral',
  },
  // The fix for "Ready" reading as "posted": a finished generation is a DRAFT.
  draft_ready: {
    label: 'Draft ready',
    pill: 'Draft',
    hint: 'Written — not yet approved for posting',
    tone: 'ready',
  },
  scheduled: {
    label: 'Scheduled',
    pill: 'Scheduled',
    hint: 'Approved — will post at the scheduled time',
    tone: 'scheduled',
  },
  published: {
    label: 'Published',
    pill: 'Published',
    hint: 'Published — live on the platform',
    tone: 'live',
  },
  media_failed: {
    label: 'Media didn’t render',
    pill: 'Media failed',
    hint: 'Copy is saved; the media job failed',
    tone: 'error',
  },
  failed: {
    label: 'Failed',
    pill: 'Failed',
    hint: 'Failed — generation or publish did not complete',
    tone: 'error',
  },
  cancelled: {
    label: 'Cancelled',
    pill: 'Cancelled',
    hint: 'Stopped before it finished',
    tone: 'neutral',
  },
};

/** Planner draft lifecycle — the `organic.organic_calendar_drafts.status` column. */
export const organicDraftStatusEnum = z.enum([
  'draft',
  'placeholder',
  'streaming',
  'scheduled',
  'published',
  'failed',
]);
export type OrganicDraftStatus = z.infer<typeof organicDraftStatusEnum>;

// The three maps. Written out rather than inferred so a reader can check the claim
// `completed !== published` by looking, and so adding a member to any input
// vocabulary fails the build until someone decides what it means.
export const ORGANIC_JOB_STATUS_PHASE: Record<OrganicGenerationStatus, OrganicLifecyclePhase> = {
  queued: 'queued',
  running: 'working',
  completed: 'draft_ready',
  failed: 'failed',
  cancelled: 'cancelled',
};

// `PlanItemStatus` is declared further down this file with the plan schemas — used
// here as a type only, so there is exactly one plan-item vocabulary, not two.
export const ORGANIC_PLAN_ITEM_STATUS_PHASE: Record<PlanItemStatus, OrganicLifecyclePhase> = {
  pending: 'concept',
  executing: 'working',
  completed: 'draft_ready',
  failed: 'failed',
  cancelled: 'cancelled',
};

export const ORGANIC_DRAFT_STATUS_PHASE: Record<OrganicDraftStatus, OrganicLifecyclePhase> = {
  draft: 'draft_ready',
  placeholder: 'seeded',
  streaming: 'working',
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed',
};

// --- Canonical generation display + summary --------------------------------

/**
 * Legacy tone view. `resolveOrganicGenerationDisplay` predates the phase table and
 * several surfaces still switch on these five; they are a coarsening of
 * `OrganicStatusTone`, never a second opinion.
 */
export type OrganicGenerationTone = 'pending' | 'active' | 'success' | 'error' | 'neutral';

const LEGACY_TONE: Record<OrganicStatusTone, OrganicGenerationTone> = {
  neutral: 'neutral',
  pending: 'pending',
  active: 'active',
  ready: 'success',
  scheduled: 'success',
  live: 'success',
  error: 'error',
};

export type OrganicGenerationDisplay = {
  label: string;
  tone: OrganicGenerationTone;
};

const RUNNING_STAGE_LABELS: Record<PipelineStage, string> = {
  strategist: 'Planning',
  concept: 'Conceptualizing',
  draft: 'Writing copy',
  blueprint: 'Designing',
  assets: 'Generating media',
  quality: 'Reviewing',
  merge: 'Finalizing',
};

/**
 * A media stage IS a pipeline position — it is just the only signal some rows carry.
 * Collapsing it onto the stage enum is what lets one label table serve both, instead
 * of the two near-identical tables that drifted ("Generating media" vs "Rendering…").
 */
const MEDIA_STAGE_AS_PIPELINE_STAGE: Record<Exclude<OrganicMediaStage, 'failed'>, PipelineStage> = {
  text_only: 'draft',
  storyboard_ready: 'blueprint',
  realizing: 'assets',
  realized: 'merge',
};

/**
 * How far the media ladder got, as a noun. One table for BOTH the concept card's
 * checkpoint ladder and the generations ticker's enrichment suffix — which used to
 * describe the same four states with two different sets of words.
 */
export const ORGANIC_MEDIA_STAGE_LABELS: Record<OrganicMediaStage, string> = {
  text_only: 'Copy ready',
  storyboard_ready: 'Preview ready',
  realizing: 'Fleshing out',
  realized: 'Fully fleshed out',
  failed: 'Media didn’t render',
};

export type OrganicLifecycleDisplay = OrganicPhasePresentation & {
  phase: OrganicLifecyclePhase;
  /** Engineer-facing detail for `title=`. Null when the label already says it all. */
  diagnostic: string | null;
  /** Work is genuinely advancing — the only case that earns an animated bar. */
  advancing: boolean;
};

/**
 * THE resolver. Every organic surface reads a phase from here and renders its own
 * pixels; none of them invents a word or a tone.
 *
 * `status` is a job status; pass `planItemStatus` instead for a plan row, or
 * `draftStatus` for a planner card. Whichever arrives, it lands on one phase.
 * For a running job the pipeline `stage` (preferred) then `mediaStage` refine the
 * label — and a running row with NEITHER is `blind`, not healthy progress.
 */
export function resolveOrganicLifecycle(input: {
  status?: OrganicGenerationStatus | null;
  planItemStatus?: PlanItemStatus | null;
  draftStatus?: OrganicDraftStatus | null;
  stage?: PipelineStage | null;
  mediaStage?: OrganicMediaStage | null;
}): OrganicLifecycleDisplay {
  const phase = resolveOrganicPhase(input);
  const base = ORGANIC_PHASE_PRESENTATION[phase];

  if (phase === 'working') {
    const stage =
      input.stage ??
      (input.mediaStage && input.mediaStage !== 'failed'
        ? MEDIA_STAGE_AS_PIPELINE_STAGE[input.mediaStage]
        : null);
    if (!stage) {
      const blind = ORGANIC_PHASE_PRESENTATION.blind;
      return {
        ...blind,
        phase: 'blind',
        diagnostic: 'No pipeline.stage frame has arrived for this run.',
        advancing: false,
      };
    }
    return {
      ...base,
      label: RUNNING_STAGE_LABELS[stage],
      phase,
      diagnostic: null,
      advancing: true,
    };
  }

  // A finished job whose media never caught up: say how far it got rather than
  // letting "Draft ready" imply the pixels exist.
  if (phase === 'draft_ready' && input.mediaStage && input.mediaStage !== 'failed') {
    return {
      ...base,
      label: ORGANIC_MEDIA_STAGE_LABELS[input.mediaStage],
      phase,
      diagnostic: null,
      advancing: input.mediaStage === 'realizing',
    };
  }

  return {
    ...base,
    phase,
    diagnostic: phase === 'media_failed' ? 'Copy is saved; the media job failed.' : null,
    advancing: false,
  };
}

/** The mapping alone, for callers that only need the phase. */
export function resolveOrganicPhase(input: {
  status?: OrganicGenerationStatus | null;
  planItemStatus?: PlanItemStatus | null;
  draftStatus?: OrganicDraftStatus | null;
  mediaStage?: OrganicMediaStage | null;
}): OrganicLifecyclePhase {
  // A media failure outranks the row's own status: it is the one thing that is true
  // whether the job "completed" or "failed", and it is what the user has to act on.
  if (input.mediaStage === 'failed') return 'media_failed';
  if (input.draftStatus) return ORGANIC_DRAFT_STATUS_PHASE[input.draftStatus];
  if (input.status) return ORGANIC_JOB_STATUS_PHASE[input.status];
  if (input.planItemStatus) return ORGANIC_PLAN_ITEM_STATUS_PHASE[input.planItemStatus];
  return 'blind';
}

/**
 * Compact `{label, tone}` view of the resolver above, kept for the surfaces that
 * already speak the legacy tone union. New code should call `resolveOrganicLifecycle`
 * and read `phase` / `pill` / `hint` / `diagnostic` — this one throws all of that away.
 */
export function resolveOrganicGenerationDisplay(input: {
  status: OrganicGenerationStatus;
  stage?: PipelineStage | null;
  mediaStage?: OrganicMediaStage | null;
}): OrganicGenerationDisplay {
  const resolved = resolveOrganicLifecycle(input);
  return { label: resolved.label, tone: LEGACY_TONE[resolved.tone] };
}

// Clean, front-end-readable role label for the agent currently working a stage.
// The Backend emits internal agent names (snake_case roles like `copywriting_technical`,
// or the merged `technical_agents` blueprint pass); this is the SINGLE place they become
// human labels, so the inline pipeline card and the generations widget render the same
// "who is working" text. Unknown names humanize gracefully (snake_case -> Title Case).
const AGENT_LABELS: Record<string, string> = {
  platform_strategist: 'Strategist',
  angle_hook_architect: 'Strategist',
  strategist: 'Strategist',
  creative_orchestrator: 'Creative',
  creative: 'Creative',
  copywriting_technical: 'Copywriter',
  hashtag_technical: 'Hashtags',
  audio_technical: 'Audio',
  visual_technical: 'Visual',
  technical_agents: 'Visual',
  asset_producer: 'Designer',
  quality_reviewer: 'Editor',
  placement_reviser: 'Reviser',
  reviser: 'Reviser',
  editorial_proposer: 'Editor',
  editorial_synthesizer: 'Editor',
  editorial_board: 'Editor',
  merge: 'Finalizing',
};

export function resolveOrganicAgentLabel(agentName: string | null | undefined): string | null {
  if (!agentName) return null;
  const known = AGENT_LABELS[agentName];
  if (known) return known;
  return agentName
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Identity + state of one generation for the ticker / cross-surface reads — built
 * by the Backend from a post_generation_jobs row joined to its draft. Loose: the
 * Backend assembles it from unknown DB JSON, so the FE narrows on read.
 */
export const organicGenerationSummarySchema = z
  .object({
    jobId: z.string().min(1),
    brandId: z.string().min(1),
    draftId: z.string().nullable().optional(),
    status: organicGenerationStatusEnum,
    stage: pipelineStageEnum.nullable().optional(),
    // Live pipeline position for a running job, surfaced from the durable job row's
    // `progress` jsonb so the widget shows the same stage/agent/percent as the chat card.
    agentName: z.string().nullable().optional(),
    pct: z.number().nullable().optional(),
    mediaStage: organicMediaStageSchema.nullable().optional(),
    platform: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    dayId: z.string().nullable().optional(),
    scheduledAt: z.string().nullable().optional(),
    planId: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
    // AI SDK tool-call id of the dispatching agent tool — lets an open chat converge
    // durable rows onto the inline card under that tool call (see the job-frame twin above).
    toolCallId: z.string().nullable().optional(),
    enqueuedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    error: z.object({ code: z.string().optional(), message: z.string() }).nullable().optional(),
  })
  .loose();
export type OrganicGenerationSummary = z.infer<typeof organicGenerationSummarySchema>;

/**
 * Rolling-window counts for the ticker header. `made` = enqueued within the window,
 * `completed` = completed within the window, `running` = currently in flight (point
 * in time). Drives the "N generations · M running" + last-hour context.
 */
export const organicGenerationWindowStatsSchema = z
  .object({
    windowMinutes: z.number().int().positive(),
    made: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
  })
  .loose();
export type OrganicGenerationWindowStats = z.infer<typeof organicGenerationWindowStatsSchema>;

/**
 * Per-plan-item creative brief the planner attaches so a content job can skip
 * the strategist stage. Canonical shape shared by the Backend content runner and
 * the Frontend response interpreter. Not strict: unknown keys are stripped (not
 * rejected) so a rolling deploy that adds a field never breaks an older peer.
 */
export const creativeBriefSchema = z.object({
  contentObjective: z.string(),
  targetAudience: z.string(),
  angle: z.string(),
  // Optional locked hook (e.g. a winning hook chosen from creative_strategy). When
  // present it rides through placement metadata and the generation engine uses it
  // as the authoritative opening hook (skipping hook re-derivation), the same way
  // `angle` locks the strategic angle. Optional so older peers keep parsing.
  hook: z.string().nullable().optional(),
  trendIntegration: z.string().nullable(),
  toneAndVoice: z.string(),
  // Optional funnel stage the upstream agent can delegate. When present the
  // generation engine builds the placement brief deterministically (and skips
  // platform_strategist); when absent it defaults. Kept optional so older peers
  // and plan items without it keep parsing under a rolling deploy.
  funnelStage: z.enum(['top', 'middle', 'bottom', 'retention']).optional(),
  formatSuggestion: z.preprocess(coerceLegacyHyperframeFormat, organicPostFormatEnum),
  productionNotes: z.array(z.string()),
});
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;

// --- Canonical agent plan schemas ------------------------------------------
// Moved here from Backend App/organic/agent/src/agents/planSchema.ts so the
// Frontend response interpreter validates plan cards against the same source
// instead of hand-parsing. The Backend re-exports these (PascalCase aliases).
export const planItemStatusSchema = z.enum([
  'pending',
  'executing',
  'completed',
  'failed',
  'cancelled',
]);
export type PlanItemStatus = z.infer<typeof planItemStatusSchema>;

export const planItemSchema = z.object({
  itemId: z.string().describe('uuid; agent-generated'),
  kind: z.enum(['create_post', 'create_draft', 'edit_draft', 'publish_draft']),
  platform: z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube']),
  scheduledAt: z.string().describe('ISO datetime'),
  format: z.preprocess(coerceLegacyHyperframeFormat, organicPostFormatEnum.nullable()),
  // trend_id is a uuid FK column. The planner sometimes emits a slug derived
  // from the trend title; coerce anything that isn't a real uuid to null.
  trendId: z.string().uuid().nullable().catch(null),
  trendTitle: z.string().nullable(),
  angle: z.string().describe('1-line creative direction'),
  objective: z.enum(['follow', 'save', 'click', 'comment', 'dm', 'share']),
  audienceSegment: z.string(),
  rationale: z.string().describe('Why this item, evidence-cited'),
  guidancePrompt: z.string().nullable(),
  draftId: z.string().nullable().describe('For edit_draft / publish_draft, or once executed'),
  jobId: z.string().nullable().default(null).describe('Filled after createPost fires'),
  dependsOn: z.array(z.string()).default([]).describe('itemId references'),
  status: planItemStatusSchema.default('pending'),
  creativeBrief: creativeBriefSchema
    .nullable()
    .default(null)
    .describe(
      'Pre-resolved creative brief for this item. When present, the content job skips the strategist stage.',
    ),
  // Per-item job payload the proposer resolved before the human saw the plan
  // (trendIds, conversation language, a ugc spec, @-mentioned creatives). It has
  // to live ON the item, not in the proposer's closure: the plan is now proposed
  // in one turn and enqueued in another, so anything a closure held would be gone
  // by the time the user approves. Loose by design — this is a payload passthrough,
  // and the job schema is the thing that narrows it.
  payloadExtras: z.record(z.string(), z.unknown()).nullish(),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planEvidenceSchema = z.object({
  kind: z.enum(['trend', 'metric', 'competitor', 'past_draft', 'brand_doc']),
  refId: z.string().nullable(),
  summary: z.string(),
});
export type PlanEvidence = z.infer<typeof planEvidenceSchema>;

// --- Data-awareness: angle evidence + numeric-claim provenance --------------
// The content machine is "data-aware": angles are grounded in REAL analytics
// (measured lift, hook rate, top-post metrics) and every numeric/proof claim in
// copy must trace back to one of those evidence items. `refId` is a single
// shared namespace across planEvidence, angleEvidenceItem, and numericClaim so
// provenance is traceable end-to-end: plan card -> placement -> copy claim.

export const angleEvidenceSourceEnum = z.enum([
  'correlateTrendsToPosts',
  'analyzeHookRate',
  'getTopPosts',
  'listTrends',
  'competitorSpy',
  // First-party winning-angle/hook insights derived by the creative_strategy
  // pipeline from the brand's own top-performing posts and ads.
  'creativeStrategy',
  // Follower age/gender demographics + follower-vs-non-follower reach split from
  // the organic analytics pipeline, so an angle can be anchored to who the brand
  // actually reaches.
  'audienceDemographics',
]);
export type AngleEvidenceSource = z.infer<typeof angleEvidenceSourceEnum>;

export const angleEvidenceMetricUnitEnum = z.enum(['pct', 'count', 'rate', 'ratio']);
export type AngleEvidenceMetricUnit = z.infer<typeof angleEvidenceMetricUnitEnum>;

export const angleEvidenceItemSchema = z.object({
  kind: z.enum(['trend_lift', 'hook_rate', 'top_post', 'trend', 'competitor', 'demographic']),
  refId: z.string().nullable().describe('trendId / mediaId / competitor handle'),
  label: z.string().describe('Human-readable, e.g. "Trend: cold brew hacks"'),
  metric: z
    .object({
      name: z.string(),
      value: z.number(),
      unit: angleEvidenceMetricUnitEnum,
    })
    .nullable()
    .default(null),
  source: angleEvidenceSourceEnum,
  capturedAt: z.string().describe('ISO; provenance freshness'),
});
export type AngleEvidenceItem = z.infer<typeof angleEvidenceItemSchema>;

export const angleEvidencePackSchema = z.object({
  brandId: z.string(),
  windowDays: z.number().int().positive(),
  accountMedianEngagementRate: z.number().nullable().default(null),
  items: z.array(angleEvidenceItemSchema).default([]),
});
export type AngleEvidencePack = z.infer<typeof angleEvidencePackSchema>;

// Numeric-claim provenance schemas live in organic-pipeline.ts (they ride the
// placement copy block); re-exported here so existing import sites are stable.
export {
  type ClaimEvidenceKind,
  claimEvidenceKindEnum,
  type NumericClaim,
  type NumericClaimType,
  numericClaimSchema,
  numericClaimTypeEnum,
} from './organic-pipeline';

export const planStatusSchema = z.enum([
  'proposed',
  'approved',
  'edited',
  'rejected',
  'executing',
  'completed',
  'failed',
  'cancelled',
]);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const proposedPlanSchema = z.object({
  planId: z.string().describe('uuid'),
  sessionId: z.string(),
  brandId: z.string(),
  userId: z.string(),
  weekStart: z.string().describe('YYYY-MM-DD'),
  title: z.string().describe('e.g. "Back-to-school week — IG focus"'),
  summary: z.string().describe('2-3 line overview'),
  items: z.array(planItemSchema).min(1).max(12).describe('Soft cap 12 items per plan'),
  evidence: z.array(planEvidenceSchema).default([]),
  estimatedDurationSeconds: z.number().int().nonnegative(),
  status: planStatusSchema.default('proposed'),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

// --- Typed ui.* card frame payloads -----------------------------------------
// These card frames carry structured payloads built by typed Backend builders
// (cards/postCard.ts, cards/trendChart.ts) and tools. Typing the `data` here —
// instead of leaving it a loose Record — makes the contract the single source of
// truth so the Frontend consumes the typed payload instead of re-deriving it
// field-by-field. (ui.plan_card stays loose at the union level: its payload is a
// ProposedPlan | BulkContentPlan and binding bulkContentPlanSchema here would
// create an organic<->bulk import cycle — the Frontend validates it via those
// schemas at the parse site instead.)

export const organicTrendChartSeriesLabelEnum = z.enum(['Trends', 'Events', 'Questions']);

export const organicTrendChartDataSchema = z.object({
  chartType: z.literal('bar'),
  title: z.string(),
  windows: z.array(z.number()),
  series: z.array(
    z.object({
      label: organicTrendChartSeriesLabelEnum,
      data: z.array(z.object({ window: z.number(), value: z.number() })),
    }),
  ),
  topSignals: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      type: z.enum(['trend', 'event', 'question']),
      confidence: z.number().nullable(),
      platform: z.string().nullable(),
      windowDays: z.number(),
    }),
  ),
});
export type OrganicTrendChartData = z.infer<typeof organicTrendChartDataSchema>;

export const organicPostCardDataSchema = z.object({
  draftId: z.string(),
  jobId: z.string(),
  brandId: z.string(),
  platform: z.string(),
  scheduledAt: z.string(),
  caption: z.string().nullable(),
  hashtags: z.array(z.string()),
  imageUrl: z.string().nullable(),
  format: z.string().nullable(),
  topic: z.string().nullable(),
  quality: z.object({ score: z.number(), passed: z.boolean() }).nullable(),
  trendId: z.string().nullable(),
});
export type OrganicPostCardData = z.infer<typeof organicPostCardDataSchema>;

// plan_status carries per-item progress. jobId/brandId are present only when the
// worker emits it (the planExecution path omits them); error only on failed,
// draftId only on completed — hence optional. .loose() keeps forward-compat.
export const organicPlanStatusDataSchema = z
  .object({
    jobId: z.string().optional(),
    brandId: z.string().optional(),
    planId: z.string().nullable().optional(),
    itemId: z.string(),
    status: planItemStatusSchema,
    draftId: z.string().optional(),
    error: z.object({ code: z.string().optional(), message: z.string() }).optional(),
    /**
     * Why a TERMINAL status stopped: the item is parked on a human, not finished.
     *
     * `organic_agent_runs.status` is CHECK-constrained to
     * queued|running|completed|failed|cancelled, and a run parked on a person
     * still has to reach a terminal — a non-terminal run is the forever-spinner
     * this contract exists to prevent, and nothing will emit on it again. So the
     * run says `completed` and this says WHY it stopped. Absent = genuinely done.
     */
    awaiting: z.literal('creative_approval').optional(),
  })
  .loose();
export type OrganicPlanStatusData = z.infer<typeof organicPlanStatusDataSchema>;

export const organicPostEnqueuedDataSchema = z
  .object({
    jobId: z.string(),
    platform: z.string(),
    scheduledAt: z.string(),
    trendId: z.string().nullable(),
    draftId: z.string().optional(),
    dayId: z.string().optional(),
    planItemId: z.string().optional(),
  })
  .loose();
export type OrganicPostEnqueuedData = z.infer<typeof organicPostEnqueuedDataSchema>;

const responseCreatedSchema = z.object({
  type: z.literal('response.created'),
  data: z.object({ responseId: z.string().optional() }).loose(),
});

const responseOutputTextDeltaSchema = z.object({
  type: z.literal('response.output_text.delta'),
  data: z.object({ delta: z.string() }).loose(),
});

const responseOutputTextDoneSchema = z.object({
  type: z.literal('response.output_text.done'),
  data: z.record(z.string(), z.unknown()),
});

const responseDoneSchema = z.object({
  type: z.literal('response.done'),
  data: z.record(z.string(), z.unknown()).optional(),
});

// The user stopped the run: it ended, but it did not fail. The Backend emits this
// (agents/agent.ts) and the FE parser terminal-maps it; it was missing from this
// union, so every user cancellation logged a schema warning.
const responseCancelledSchema = z.object({
  type: z.literal('response.cancelled'),
  data: z
    .object({
      message: z.string().optional(),
    })
    .loose()
    .optional(),
});

const responseErrorSchema = z.object({
  type: z.literal('response.error'),
  data: z
    .object({
      message: z.string(),
      // Optional retry metadata (chat retry R1): a stable machine-readable
      // failure code and whether the failure is transient (retryable). Additive
      // only — older peers that omit them keep parsing.
      code: z.string().optional(),
      transient: z.boolean().optional(),
    })
    .loose(),
});

// Emitted when the chat runner retries a transient response failure (chat
// retry R1) before surfacing a terminal response.error. `attempt` is the
// retry attempt number; `reason` optionally carries the machine cause.
const responseRetryingSchema = z.object({
  type: z.literal('response.retrying'),
  data: z
    .object({
      attempt: z.number(),
      reason: z.string().optional(),
    })
    .loose(),
});

const responseSourceSchema = z.object({
  type: z.literal('response.source'),
  data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Which lane the runtime routed this turn into. Emitted once per turn, before the
 * model runs, because the lane decides which tools are mounted at all — an ANSWER
 * turn cannot reach generation. Without this frame the narrowing is invisible and
 * a misclassification looks like the agent simply refusing to act.
 */
export const organicRequestLaneEnum = z.enum(['answer', 'ideate', 'execute']);
export type OrganicRequestLane = z.infer<typeof organicRequestLaneEnum>;

const responseLaneSchema = z.object({
  type: z.literal('response.lane'),
  data: z.object({ lane: organicRequestLaneEnum }).loose(),
});

const toolCallSchema = z.object({
  type: z.literal('tool.call'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      args: z.unknown(),
    })
    .loose(),
});

const toolResultSchema = z.object({
  type: z.literal('tool.result'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      // `ok` is derived from the tool envelope status on the Backend (see
      // organic agent.ts) — a tool that returns an `error` envelope without
      // throwing now reports ok:false here instead of a hardcoded success.
      ok: z.boolean(),
      status: z.enum(['success', 'warning', 'error']).optional(),
      code: z.string().optional(),
      reason: z.string().optional(),
      result: z.unknown().optional(),
      error: z.unknown().optional(),
    })
    .loose(),
});

const toolApprovalRequiredSchema = z.object({
  type: z.literal('tool.approval_required'),
  data: z
    .object({
      approvalId: z.string().min(1),
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      input: z.unknown(),
    })
    .loose(),
});

const toolErrorSchema = z.object({
  type: z.literal('tool.error'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
      error: z.string(),
    })
    .loose(),
});

const toolOutputDeniedSchema = z.object({
  type: z.literal('tool.output_denied'),
  data: z
    .object({
      toolCallId: z.string().min(1),
      toolName: z.string().min(1),
    })
    .loose(),
});

const uiTrendChartSchema = z.object({
  type: z.literal('ui.trend_chart'),
  data: organicTrendChartDataSchema,
});

// ui.plan_card data is a ProposedPlan or BulkContentPlan (discriminated by
// data.kind === "bulk"); left loose here to avoid an organic<->bulk import cycle.
// The Frontend parser validates it via proposedPlanSchema / bulkContentPlanSchema.
const uiPlanCardSchema = z.object({
  type: z.literal('ui.plan_card'),
  data: uiCardDataSchema,
});

const uiPostCardSchema = z.object({
  type: z.literal('ui.post_card'),
  data: organicPostCardDataSchema,
});

const uiPostEnqueuedSchema = z.object({
  type: z.literal('ui.post_enqueued'),
  data: organicPostEnqueuedDataSchema,
});

const uiPlanStatusSchema = z.object({
  type: z.literal('ui.plan_status'),
  data: organicPlanStatusDataSchema,
});

/**
 * Emitted when the agent proposes saving a reusable brand skill (propose_skill
 * tool). The FE renders a confirm/edit card; persistence is user-gated (Save ->
 * POST /api/organic/skills). The agent does not persist.
 */
const uiSkillProposalSchema = z.object({
  type: z.literal('ui.skill_proposal'),
  data: z
    .object({
      proposalId: z.string().min(1),
      brandId: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(['creative_direction', 'analytic']),
      description: z.string().nullable().optional(),
      directives: z.string().min(1),
      tags: z.array(z.string()).default([]),
    })
    .loose(),
});

/**
 * Emitted when an approved BULK plan kicks off its single background `runV2`
 * batch run. Carries the runId the FE BulkRunPanel uses to stream aggregate
 * progress from the batch run-events replay endpoint (the bulk run does NOT
 * pipe its v2 envelopes through this chat stream). `total` is the placement
 * count for the run.
 */
const uiBulkRunSchema = z.object({
  type: z.literal('ui.bulk_run'),
  data: z
    .object({
      runId: z.string().min(1),
      planId: z.string().min(1),
      brandId: z.string().min(1),
      total: z.number().int().min(0),
    })
    .loose(),
});

const uiAeoSnapshotCardSchema = z.object({
  type: z.literal('ui.aeo_snapshot_card'),
  data: aeoSnapshotCardSchema,
});

const agentRunStartedSchema = z.object({
  type: z.literal('agent.run_started'),
  data: z
    .object({
      runId: z.string().min(1),
      jobId: z.string().optional(),
    })
    .loose(),
});

/**
 * Emitted as the first frame of an Organic chat stream. Carries the runId
 * the FE needs to reconnect via GET /api/organic/agent/runs/:runId/events
 * after a transport interruption. Distinct from agent.run_started, which
 * carries a per-tool jobId mid-stream.
 */
const agentChatStartedSchema = z.object({
  type: z.literal('agent.chat_started'),
  data: z
    .object({
      runId: z.string().min(1),
      sessionId: z.string().min(1),
    })
    .loose(),
});

const jobEnqueuedSchema = z.object({
  type: z.literal('job.enqueued'),
  data: jobEventDataSchema,
});

const jobProgressSchema = z.object({
  type: z.literal('job.progress'),
  data: jobEventDataSchema,
});

const jobCompletedSchema = z.object({
  type: z.literal('job.completed'),
  data: jobEventDataSchema,
});

const jobFailedSchema = z.object({
  type: z.literal('job.failed'),
  data: jobEventDataSchema,
});

const jobCancelledSchema = z.object({
  type: z.literal('job.cancelled'),
  data: jobEventDataSchema,
});

const draftReadySchema = z.object({
  type: z.literal('draft.ready'),
  data: jobEventDataSchema,
});

// Step-1 checkpoint of the three-step pipeline: the post's caption/text is
// persisted as a draft (status placeholder) BEFORE the creative director
// (blueprint) and the opt-in headless media generation. Carries the draftId so
// the FE can surface a real, placeable draft mid-run.
const draftTextReadySchema = z.object({
  type: z.literal('draft.text_ready'),
  data: jobEventDataSchema,
});

// Step-2 checkpoint of the three-step pipeline: the creative director has
// produced the blueprint (creative direction + storyboard + 512px scene frames)
// and persisted it onto the draft (blueprintReady=true, mediaStatus still
// pending). Carries the draftId so the FE can surface the storyboard / preview
// frames mid-run, before the gated media realization (Stage 3).
// Transient preview frame for a single 512px storyboard image. Carries a signed
// URL for instant in-stream display only — the durable, re-signable copy is
// persisted on the draft as `mediaSuggestion.storyboard` (organic-pipeline.ts).
const draftStoryboardPreviewFrameSchema = z
  .object({
    role: z.string(),
    signedUrl: z.string(),
    format: z.string().nullable().optional(),
  })
  .loose();

// `previewRevision` is the media-approval TOKEN, not a rendering detail: the realize
// path re-reads the draft's stamped revision and refuses a mismatch
// (approvePreviewOrThrow -> preview_approval_required / preview_changed). It is
// therefore REQUIRED here and independent of `previews`, which is optional because
// preview signing can fail while the blueprint itself succeeded. A consumer must never
// treat `previews` as the carrier for the token and drop the frame when it is empty —
// that is what strands a draft on "awaiting media choice" with nothing to click.
const draftBlueprintReadySchema = z.object({
  type: z.literal('draft.blueprint_ready'),
  data: jobEventDataSchema.extend({
    draftId: z.string().min(1),
    previewRevision: z.string().min(1),
    previews: z.array(draftStoryboardPreviewFrameSchema).optional(),
  }),
});

const pipelineStageSchema = z.object({
  type: z.literal('pipeline.stage'),
  data: z
    .object({
      jobId: z.string().min(1),
      brandId: z.string().min(1),
      planId: z.string().nullable().optional(),
      planItemId: z.string().nullable().optional(),
      stage: pipelineStageEnum,
      agentName: z.string().optional(),
      pct: z.number().min(0).max(100).optional(),
      status: z.enum(['active', 'done', 'failed']).optional(),
    })
    .loose(),
});

/**
 * The quality reviewer's verdict as it crosses the wire, defined ONCE for both sides.
 *
 * `blockingIssues` and `requiredFixes` are the WHY behind the score. The worker already
 * ships the whole `quality` object; omitting them here left the Frontend holding a bare
 * percentage with nothing to tell the user about — a flagged draft the user cannot act on
 * is the same as a silently dropped one.
 */
export const pipelineQualitySchema = z
  .object({
    passed: z.boolean(),
    overallScore: z.number(),
    brandFitScore: z.number().optional(),
    platformFitScore: z.number().optional(),
    noveltyScore: z.number().optional(),
    complianceScore: z.number().optional(),
    blockingIssues: z.array(z.string()).optional(),
    requiredFixes: z.array(z.string()).optional(),
    summary: z.string().optional(),
  })
  .loose();
export type PipelineQuality = z.infer<typeof pipelineQualitySchema>;

/**
 * Three-step checkpoint state for the run-progress steppers: step 1 (text) =
 * textReady, step 2 (creative director / blueprint) = blueprintReady, step 3
 * (headless media generation) = mediaStatus. `awaitingMediaChoice` is true once
 * text+blueprint are done and the token-heavy generation is opt-in.
 *
 * ONE named shape, because both the live `ui.pipeline_card` frame and the FE's
 * restored/durable-hydrated card state carry it — a second hand-rolled copy is how
 * `previewRevision` came to exist on one side and not the other.
 *
 * INVARIANT: `awaitingMediaChoice: true` is a promise that the user has an action to
 * take, and `previewRevision` is the token that action needs. It is optional here
 * (the checkpoint exists before the blueprint does), so a consumer that renders the
 * awaiting state MUST use `hasApprovablePreview` to decide whether to offer approval
 * or the re-expand recovery — never assume the token is present.
 */
export const organicMediaCheckpointSchema = z
  .object({
    textReady: z.boolean().optional(),
    blueprintReady: z.boolean().optional(),
    mediaStatus: z.enum(['pending', 'generating', 'ready', 'user_supplied', 'skipped']).optional(),
    awaitingMediaChoice: z.boolean().optional(),
    previewRevision: z.string().min(1).optional(),
  })
  .loose();

export type OrganicMediaCheckpoint = z.infer<typeof organicMediaCheckpointSchema>;

/**
 * Whether a checkpoint carries the approval token the realize path requires. The
 * single canonical gate for "can this card offer Generate media?" — the Backend
 * rejects a realize whose revision is absent or stale, so a button rendered without
 * this returns preview_approval_required / preview_changed instead of media.
 */
export const hasApprovablePreview = (
  checkpoint: { previewRevision?: string | null } | null | undefined,
): boolean =>
  typeof checkpoint?.previewRevision === 'string' && checkpoint.previewRevision.length > 0;

const uiPipelineCardSchema = z.object({
  type: z.literal('ui.pipeline_card'),
  data: z
    .object({
      jobId: z.string().min(1),
      brandId: z.string().min(1),
      planId: z.string().nullable().optional(),
      planItemId: z.string().nullable().optional(),
      platform: z.string().optional(),
      status: z.enum(['running', 'completed', 'failed', 'cancelled']),
      currentStage: pipelineStageEnum.optional(),
      preview: z
        .object({
          caption: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
          images: z.array(z.string()).optional(),
          format: z.string().nullable().optional(),
        })
        .loose()
        .optional(),
      quality: pipelineQualitySchema.nullable().optional(),
      draftId: z.string().nullable().optional(),
      checkpoint: organicMediaCheckpointSchema.optional(),
    })
    .loose(),
});

/**
 * Non-fatal report of how the user's @-mention "context grabber" references
 * resolved for a turn. Emitted once after media resolution when at least one
 * reference was grabbed. This is the LOUD-failure channel: an asset that could
 * not become model-visible content (storage miss, unreachable canvas preview,
 * unanalyzed video) is reported under `failed` and surfaced to the user instead
 * of being silently dropped. The turn never throws on a grab miss.
 */
const contextMediaResolutionSchema = z.object({
  type: z.literal('context.media_resolution'),
  data: z
    .object({
      requested: z.number().int().nonnegative(),
      resolvedImages: z.number().int().nonnegative(),
      resolvedVideos: z.number().int().nonnegative(),
      textOnly: z.number().int().nonnegative(),
      failed: z
        .array(
          z.object({
            refId: z.string(),
            type: z.string(),
            reason: z.string(),
          }),
        )
        .default([]),
    })
    .loose(),
});

export const organicStreamFrameSchema = z.discriminatedUnion('type', [
  responseCreatedSchema,
  responseOutputTextDeltaSchema,
  responseOutputTextDoneSchema,
  responseDoneSchema,
  responseCancelledSchema,
  responseErrorSchema,
  responseRetryingSchema,
  responseSourceSchema,
  responseLaneSchema,
  toolCallSchema,
  toolResultSchema,
  toolApprovalRequiredSchema,
  toolErrorSchema,
  toolOutputDeniedSchema,
  uiTrendChartSchema,
  uiPlanCardSchema,
  uiPostCardSchema,
  uiPostEnqueuedSchema,
  uiPlanStatusSchema,
  uiSkillProposalSchema,
  uiBulkRunSchema,
  uiAeoSnapshotCardSchema,
  agentRunStartedSchema,
  agentChatStartedSchema,
  agentDelegatedFrameSchema,
  jobEnqueuedSchema,
  jobProgressSchema,
  jobCompletedSchema,
  jobFailedSchema,
  jobCancelledSchema,
  draftReadySchema,
  draftTextReadySchema,
  draftBlueprintReadySchema,
  pipelineStageSchema,
  uiPipelineCardSchema,
  mediaSearchResultsFrameSchema,
  contextMediaResolutionSchema,
  uiBrandBookFrameSchema,
  uiReadinessScorecardFrameSchema,
  uiBrandBookProposalFrameSchema,
  uiBrandBookAppliedFrameSchema,
]);

export type OrganicStreamFrame = z.infer<typeof organicStreamFrameSchema>;

export type OrganicContextMediaResolutionFrame = z.infer<typeof contextMediaResolutionSchema>;

export type OrganicJobEventData = z.infer<typeof jobEventDataSchema>;

export type OrganicFrameType = OrganicStreamFrame['type'];

export type OrganicPipelineStage = z.infer<typeof pipelineStageEnum>;

export type OrganicPipelineStageFrame = z.infer<typeof pipelineStageSchema>;

export type OrganicUiPipelineCardFrame = z.infer<typeof uiPipelineCardSchema>;

export type OrganicCreativeBrief = z.infer<typeof creativeBriefSchema>;

export type OrganicUiBulkRunFrame = z.infer<typeof uiBulkRunSchema>;

export type OrganicUiAeoSnapshotCardFrame = z.infer<typeof uiAeoSnapshotCardSchema>;

export type OrganicResponseRetryingFrame = z.infer<typeof responseRetryingSchema>;

export type OrganicResponseErrorFrame = z.infer<typeof responseErrorSchema>;

export type OrganicResponseLaneFrame = z.infer<typeof responseLaneSchema>;

/**
 * Normalized display shape for a post fetched by any of the organic agent's
 * content-retrieval tools (listDrafts, getTopPosts, listOwnInstagramMedia,
 * getCalendarPostedContent). Consumed by PostContentCard.
 */
export type UiFetchedPost = {
  /** Composite renderer identity; platform/source prevents cross-feed post-id collisions. */
  contentKey: string;
  postId: string;
  source: 'draft' | 'instagram' | 'facebook' | 'tiktok';
  platform: string | null;
  caption: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  postedAt: string | null;
  scheduledAt: string | null;
  format: string | null;
  status: string | null;
  topic: string | null;
  metrics: Record<string, number | null> | null;
  rank: number | null;
  quality: { passed: boolean; score?: number } | null;
};

export const organicFetchedPostContentKey = (
  source: UiFetchedPost['source'],
  platform: string | null,
  postId: string,
): string => `${source}:${platform ?? 'unknown'}:${postId}`;

export const POST_FETCHING_TOOL_NAMES = [
  'listDrafts',
  'getTopPosts',
  'listOwnInstagramMedia',
  'getCalendarPostedContent',
  'getCompetitorInstagramTopPosts',
] as const;

export type PostFetchingToolName = (typeof POST_FETCHING_TOOL_NAMES)[number];
