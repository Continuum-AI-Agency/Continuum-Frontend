import { z } from 'zod';

// Watchman wire contracts (plans/074). A Watchman is a database row; a wake is a
// short job. Continuum decides WHEN (schedules, inbox, triage, wake rows) and
// signs a WakeRequest to the runtime. The runtime decides HOW: it reads its
// context, runs the model over the Continuum MCP, and closes the wake with
// watchman_manage action=turn_complete. Everything durable is written through
// that one MCP tool, so the runtime keeps no state and these shapes are the whole seam.

export const WATCHMAN_KINDS = ['organic', 'paid'] as const;
export type WatchmanKind = (typeof WATCHMAN_KINDS)[number];

/** worker = the cheap model every wake starts on; planner = reached only through escalate. */
export const WATCHMAN_TIERS = ['worker', 'planner'] as const;
export type WatchmanTier = (typeof WATCHMAN_TIERS)[number];

export const WATCHMAN_MESSAGE_KINDS = ['brief', 'proposal', 'question', 'alert'] as const;

/**
 * What a Watchman may do on its own, per class of spending action (plan 074 step 3). off: the
 * tools are not offered. approve: it proposes the exact call, a brand admin approves it, and only
 * that call runs. auto: it runs within its per-wake caps. Every class starts off.
 */
export const WATCHMAN_AUTONOMY_CLASSES = ['generate', 'render', 'publish'] as const;
export type WatchmanAutonomyClass = (typeof WATCHMAN_AUTONOMY_CLASSES)[number];
export const WATCHMAN_AUTONOMY_LEVELS = ['off', 'approve', 'auto'] as const;
export type WatchmanAutonomyLevel = (typeof WATCHMAN_AUTONOMY_LEVELS)[number];
export const watchmanAutonomySchema = z
  .object({
    generate: z.enum(WATCHMAN_AUTONOMY_LEVELS).optional(),
    render: z.enum(WATCHMAN_AUTONOMY_LEVELS).optional(),
    publish: z.enum(WATCHMAN_AUTONOMY_LEVELS).optional(),
  })
  .strict();
export type WatchmanAutonomy = z.infer<typeof watchmanAutonomySchema>;

/** A Watchman's proposal: the exact MCP call it wants to make, for a brand admin to decide. */
export const watchmanProposalInputSchema = z.object({
  kind: z.enum(WATCHMAN_AUTONOMY_CLASSES),
  tool: z.string().min(1).max(80),
  input: z.record(z.string(), z.unknown()),
  /** What it does and why, in the brand's language: what the admin reads before deciding. */
  summary: z.string().min(1).max(1_000),
});
export type WatchmanProposalInput = z.infer<typeof watchmanProposalInputSchema>;

export const WATCHMAN_PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'failed',
  'expired',
] as const;
export type WatchmanProposalStatus = (typeof WATCHMAN_PROPOSAL_STATUSES)[number];

/** An approved proposal the next wake may carry out: exactly this tool with exactly this input. */
export const watchmanApprovedProposalSchema = z
  .object({
    id: z.string(),
    kind: z.enum(WATCHMAN_AUTONOMY_CLASSES),
    tool: z.string(),
    input: z.record(z.string(), z.unknown()),
    summary: z.string(),
    note: z.string().nullable(),
  })
  .passthrough();
export type WatchmanApprovedProposal = z.infer<typeof watchmanApprovedProposalSchema>;

export const WATCHMAN_INBOX_SOURCES = [
  'event',
  'schedule',
  'message',
  'approval',
  'ask',
  'task',
  'feedback',
] as const;

/** Per-tier model choice. Empty = the runtime's Gemini defaults; a provider other than google is BYOK, later. */
export const watchmanModelChoiceSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});
export const watchmanModelsSchema = z
  .object({
    worker: watchmanModelChoiceSchema.optional(),
    planner: watchmanModelChoiceSchema.optional(),
  })
  .passthrough();
export type WatchmanModels = z.infer<typeof watchmanModelsSchema>;

/** The signed body Continuum POSTs to the runtime's /wake. The token is the bot's, for MCP only — never model context. */
export const watchmanWakeRequestSchema = z.object({
  wake_id: z.string().min(1),
  watchman_id: z.string().min(1),
  brand_id: z.string().min(1),
  mcp_url: z.string().url(),
  access_token: z.string().min(1),
  deadline_at: z.string().min(1),
});
export type WatchmanWakeRequest = z.infer<typeof watchmanWakeRequestSchema>;

export const watchmanInboxItemSchema = z
  .object({
    id: z.string(),
    source: z.enum(WATCHMAN_INBOX_SOURCES),
    event_type: z.string(),
    payload: z.record(z.string(), z.unknown()),
    must_wake: z.boolean(),
    triage: z.enum(['wake', 'later', 'drop']).nullable(),
    triage_reason: z.string().nullable(),
    created_at: z.string(),
  })
  .passthrough();
export type WatchmanInboxItem = z.infer<typeof watchmanInboxItemSchema>;

export const watchmanBudgetSchema = z.object({
  month_spend_usd: z.number(),
  budget_usd: z.number(),
  /** green < 70%, amber 70–100%, red > 100%. Continuum already enforced red when it opened the wake. */
  state: z.enum(['green', 'amber', 'red']),
});

// ── Tasks: standing jobs a person gives a Watchman, each bound to one condition ──
// The catalog is closed: every condition type has an evaluator in Continuum's
// sweep (watchman_eval_tasks), so a new type is new code, never model-defined.

export const WATCHMAN_CONDITION_TYPES = [
  'schedule',
  'posts_scheduled_below',
  'no_post_published',
  'trends_ready',
] as const;
export type WatchmanConditionType = (typeof WATCHMAN_CONDITION_TYPES)[number];

export const watchmanConditionSchema = z.discriminatedUnion('type', [
  /** Fires at every occurrence of a 5-field cron, in the Watchman's timezone. */
  z.object({ type: z.literal('schedule'), cron: z.string().min(9).max(100) }),
  /** Fewer than `count` approved or scheduled posts in the next `days`. */
  z.object({
    type: z.literal('posts_scheduled_below'),
    count: z.number().int().min(1).max(50),
    days: z.number().int().min(1).max(30),
  }),
  /** Nothing published in the last `days`. */
  z.object({ type: z.literal('no_post_published'), days: z.number().int().min(1).max(60) }),
  /** A trends generation finished since the task last fired. */
  z.object({ type: z.literal('trends_ready') }),
]);
export type WatchmanCondition = z.infer<typeof watchmanConditionSchema>;

/** Who a task's reports go to. Set by a person; the model can neither read the addresses nor change them. */
export const watchmanDeliverSchema = z.object({
  emails: z.array(z.string().email()).max(10).default([]),
  member_user_ids: z.array(z.string().uuid()).max(20).default([]),
});

export const watchmanTaskInputSchema = z.object({
  title: z.string().min(1).max(120),
  /** What to do when the condition fires, in plain words. */
  instruction: z.string().min(1).max(2_000),
  condition: watchmanConditionSchema,
  deliver: watchmanDeliverSchema.optional(),
  /** Default true: a report is held until a person releases it. */
  review: z.boolean().optional(),
  /** State conditions only: how often the sweep checks (default 60). */
  check_minutes: z.number().int().min(15).max(1_440).optional(),
  /** State conditions only: the least time between two fires (default 1440). */
  cooldown_minutes: z.number().int().min(60).max(43_200).optional(),
});
export type WatchmanTaskInput = z.infer<typeof watchmanTaskInputSchema>;

export const watchmanTaskPatchSchema = watchmanTaskInputSchema
  .partial()
  .extend({ active: z.boolean().optional() });

/** A task as the model sees it: no recipient addresses. */
export const watchmanTaskViewSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    instruction: z.string(),
    condition: watchmanConditionSchema,
    review: z.boolean(),
    has_recipients: z.boolean(),
    last_fired_at: z.string().nullable(),
  })
  .passthrough();

/** The bot's report for a task: emailed to the task's recipients, or held for review. */
export const watchmanReportInputSchema = z.object({
  task_id: z.string().uuid(),
  subject: z.string().min(1).max(200),
  body_md: z.string().min(1).max(20_000),
});

/** An FDM's settings for one Watchman. Every field optional; at least one must be given. */
export const watchmanConfigureInputSchema = z
  .object({
    status: z.enum(['active', 'paused']).optional(),
    name: z.string().min(1).max(80).optional(),
    instructions: z.string().max(8_000).optional(),
    timezone: z.string().min(1).max(64).optional(),
    budget_usd_month: z.number().min(0).max(1_000).optional(),
    home_destination_id: z.string().uuid().nullable().optional(),
    models: watchmanModelsSchema.optional(),
    /** Merged into the current levels: a class left out keeps its level. */
    autonomy: watchmanAutonomySchema.optional(),
  })
  .strict();
export type WatchmanConfigureInput = z.infer<typeof watchmanConfigureInputSchema>;

export const WATCHMAN_REPORT_STATUSES = ['held', 'sending', 'sent', 'partial', 'failed'] as const;

/** A person's feedback. It never wakes the Watchman; the next wake folds it into Lessons. */
export const watchmanFeedbackInputSchema = z.object({
  text: z.string().min(1).max(2_000),
  rating: z.enum(['up', 'down']).optional(),
  report_id: z.string().uuid().optional(),
});

/** watchman_manage action=context result: everything one wake needs, in one call. */
export const watchmanContextSchema = z
  .object({
    wake: z.object({
      id: z.string(),
      reason: z.string(),
      attempt: z.number(),
      deadline_at: z.string().nullable(),
    }),
    watchman: z.object({
      id: z.string(),
      brand_id: z.string(),
      name: z.string(),
      kind: z.enum(WATCHMAN_KINDS),
      instructions: z.string(),
      timezone: z.string(),
      models: watchmanModelsSchema,
      autonomy: watchmanAutonomySchema.default({}),
    }),
    memory: z.object({ text: z.string(), version: z.number().int() }),
    inbox: z.array(watchmanInboxItemSchema),
    watch_rules: z.array(z.record(z.string(), z.unknown())),
    schedules: z.array(z.record(z.string(), z.unknown())),
    tasks: z.array(watchmanTaskViewSchema).default([]),
    /** Approved, not yet carried out, not expired. */
    proposals: z.array(watchmanApprovedProposalSchema).default([]),
    budget: watchmanBudgetSchema,
    /** ISO time in the Watchman's timezone, so the model never guesses the clock. */
    now_local: z.string(),
  })
  .passthrough();
export type WatchmanContext = z.infer<typeof watchmanContextSchema>;

/** One model call's usage. Token fields the provider did not report stay undefined, never 0. */
export const watchmanModelUsageSchema = z.object({
  tier: z.enum(WATCHMAN_TIERS),
  provider: z.string(),
  model: z.string(),
  input_tokens: z.number().int().nonnegative().optional(),
  cached_input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  reasoning_tokens: z.number().int().nonnegative().optional(),
});
export type WatchmanModelUsage = z.infer<typeof watchmanModelUsageSchema>;

/** watchman_manage action=turn_complete `turn`: acks the wake's inbox, writes memory (compare-and-set), records usage. */
export const watchmanTurnCompleteInputSchema = z.object({
  wake_id: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  /** Full replacement memory text; omit to leave memory unchanged. */
  memory: z
    .object({ text: z.string().max(16_000), base_version: z.number().int().nonnegative() })
    .optional(),
  note_to_self: z.string().max(4_000).optional(),
  escalated: z.boolean().optional(),
  escalation_reason: z.string().max(1_000).optional(),
  usage: z.array(watchmanModelUsageSchema).max(200),
  error: z.string().max(4_000).optional(),
  /** Where the wake's time went: the whole run, and each model step. */
  timing: z
    .object({
      wall_ms: z.number().int().nonnegative(),
      step_ms: z.array(z.number().int().nonnegative()).max(200),
      prefetch_ms: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type WatchmanTurnCompleteInput = z.infer<typeof watchmanTurnCompleteInputSchema>;

export const watchmanMessageInputSchema = z.object({
  kind: z.enum(WATCHMAN_MESSAGE_KINDS),
  text: z.string().min(1).max(4_000),
  links: z
    .array(z.object({ label: z.string().min(1), url: z.string().url() }))
    .max(10)
    .optional(),
});

export const watchmanWatchRuleInputSchema = z.object({
  event_type: z.string().min(1),
  match: z.record(z.string(), z.unknown()).optional(),
  path: z.string().min(1).optional(),
  op: z.enum(['gt', 'gte', 'lt', 'lte']).optional(),
  value: z.number().optional(),
  note: z.string().max(500).optional(),
  cooldown_minutes: z.number().int().min(5).max(10_080).optional(),
});

export const watchmanAlarmInputSchema = z.object({
  run_at: z.string().min(1),
  note: z.string().min(1).max(500),
});

/** The bot actions a Watchman's model may call. The runtime itself makes context and turn_complete. */
export const WATCHMAN_MODEL_ACTIONS = [
  'message',
  'report',
  'watch_list',
  'watch_add',
  'watch_remove',
  'alarm_list',
  'alarm_add',
  'alarm_cancel',
  'propose',
] as const;

/** A person's actions on the active brand's Watchman, each needing brand admin. */
export const WATCHMAN_PERSON_ACTIONS = [
  'status',
  'configure',
  'report_list',
  'task_list',
  'task_add',
  'task_update',
  'task_remove',
  'report_release',
  'feedback',
  'wake',
  'proposal_list',
  'proposal_decide',
  'wake_list',
] as const;

/**
 * watchman_manage actions. A person's actions resolve the Watchman from the active brand; the
 * bot's resolve it from the caller. task_list serves both (the model reads its tasks in its
 * prompt instead). context and turn_complete are the
 * runtime's own.
 */
export const WATCHMAN_ACTIONS = [
  ...WATCHMAN_PERSON_ACTIONS,
  'context',
  'turn_complete',
  'proposal_done',
  ...WATCHMAN_MODEL_ACTIONS,
] as const;
export type WatchmanAction = (typeof WATCHMAN_ACTIONS)[number];

/** The model's view of watchman_manage: its own actions only. Each action reads only its own field. */
export const watchmanModelManageInputSchema = z.object({
  action: z.enum(WATCHMAN_MODEL_ACTIONS),
  message: watchmanMessageInputSchema.optional(),
  report: watchmanReportInputSchema.optional(),
  rule: watchmanWatchRuleInputSchema.optional(),
  rule_id: z.string().uuid().optional(),
  alarm: watchmanAlarmInputSchema.optional(),
  schedule_id: z.string().uuid().optional(),
  proposal: watchmanProposalInputSchema.optional(),
});

/** watchman_manage input: one tool, one action per call. */
export const watchmanManageInputSchema = watchmanModelManageInputSchema
  .extend({
    action: z.enum(WATCHMAN_ACTIONS),
    /** A person's actions: which of the brand's Watchmen, when it has more than one. */
    watchman_id: z.string().uuid().optional(),
    wake_id: z.string().min(1).optional(),
    turn: watchmanTurnCompleteInputSchema.optional(),
    task: watchmanTaskInputSchema.optional(),
    task_id: z.string().uuid().optional(),
    patch: watchmanTaskPatchSchema.optional(),
    report_id: z.string().uuid().optional(),
    feedback: watchmanFeedbackInputSchema.optional(),
    reason: z.string().min(1).max(500).optional(),
    configure: watchmanConfigureInputSchema.optional(),
    /** report_list: which reports (default held). */
    report_status: z.enum(WATCHMAN_REPORT_STATUSES).optional(),
    proposal_id: z.string().uuid().optional(),
    /** proposal_list: which proposals (default pending). */
    proposal_status: z.enum(WATCHMAN_PROPOSAL_STATUSES).optional(),
    /** proposal_decide: the admin's decision, and an optional note the Watchman reads. */
    decision: z.enum(['approve', 'reject']).optional(),
    note: z.string().max(1_000).optional(),
    /** proposal_done (the runtime's): how the approved call went. */
    outcome: z
      .object({ ok: z.boolean(), result: z.unknown().optional(), error: z.string().max(2_000).optional() })
      .optional(),
  })
  .strict();
export type WatchmanManageInput = z.infer<typeof watchmanManageInputSchema>;

// ── The app's operator page (plan 074 step 5) ───────────────────────────────

/** The Backend route the app calls for a person's watchman_manage actions (brand admin only). */
export const WATCHMAN_MANAGE_ROUTE = '/api/watchman/manage';

export const watchmanAppManageRequestSchema = z.object({
  brandId: z.string().uuid(),
  input: watchmanManageInputSchema.refine(
    (input) => (WATCHMAN_PERSON_ACTIONS as readonly string[]).includes(input.action),
    { message: "the app calls a person's actions only" },
  ),
});
export type WatchmanAppManageRequest = z.infer<typeof watchmanAppManageRequestSchema>;

/** A refusal: `needs_role` (not a brand admin) or a watchman_manage error code. */
export const watchmanAppManageErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

const budgetViewSchema = z.object({
  month_spend_usd: z.number(),
  budget_usd: z.number(),
  state: z.string(),
});

/** action=status: one of the brand's Watchmen. */
export const watchmanStatusViewSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(WATCHMAN_KINDS),
    status: z.enum(['active', 'paused']),
    timezone: z.string(),
    autonomy: watchmanAutonomySchema,
    budget: budgetViewSchema,
    held_reports: z.number(),
    active_tasks: z.number(),
    failures_24h: z.number(),
    unacked_inbox: z.record(z.string(), z.number()),
  })
  .passthrough();
export type WatchmanStatusView = z.infer<typeof watchmanStatusViewSchema>;

/** action=task_list for a person: the task with the addresses its reports go to. */
export const watchmanPersonTaskViewSchema = watchmanTaskViewSchema.extend({
  recipients: z.array(z.string()),
});
export type WatchmanPersonTaskView = z.infer<typeof watchmanPersonTaskViewSchema>;

/** action=report_list. */
export const watchmanReportViewSchema = z
  .object({
    id: z.string(),
    task_id: z.string().nullable(),
    task_title: z.string().nullable(),
    subject: z.string(),
    body_md: z.string(),
    status: z.enum(WATCHMAN_REPORT_STATUSES),
    created_at: z.string(),
    recipients: z.array(z.object({ email: z.string(), status: z.string() })),
  })
  .passthrough();
export type WatchmanReportView = z.infer<typeof watchmanReportViewSchema>;

/** action=proposal_list. */
export const watchmanProposalViewSchema = z
  .object({
    id: z.string(),
    kind: z.enum(WATCHMAN_AUTONOMY_CLASSES),
    tool: z.string(),
    input: z.record(z.string(), z.unknown()),
    summary: z.string(),
    status: z.enum(WATCHMAN_PROPOSAL_STATUSES),
    note: z.string().nullable(),
    decided_at: z.string().nullable(),
    executed_at: z.string().nullable(),
    outcome: z.unknown().nullable(),
    created_at: z.string(),
    expires_at: z.string(),
  })
  .passthrough();
export type WatchmanProposalView = z.infer<typeof watchmanProposalViewSchema>;

/** One MCP call the Watchman's bot made during a wake (umbrella tools log the umbrella name). */
export const watchmanToolCallViewSchema = z.object({
  tool: z.string(),
  status: z.string(),
  duration_ms: z.number().nullable(),
  error_code: z.string().nullable(),
  at: z.string(),
});

/** action=wake_list: the newest wakes, with their cost and the calls each made. */
export const watchmanWakeViewSchema = z.object({
  id: z.string(),
  reason: z.string(),
  status: z.string(),
  attempt: z.number(),
  cost_usd: z.number(),
  note_to_self: z.string().nullable(),
  error: z.string().nullable(),
  escalation_reason: z.string().nullable(),
  wall_ms: z.number().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  tool_calls: z.array(watchmanToolCallViewSchema),
});
export type WatchmanWakeView = z.infer<typeof watchmanWakeViewSchema>;
