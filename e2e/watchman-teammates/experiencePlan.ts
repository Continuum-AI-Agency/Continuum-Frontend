/** Real prepared fixtures only. Missing cells block their named test; no fixture is created here. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import {
  goalExecutionRefSchema,
  type WatchmanDashboard,
  type WatchmanInteractionRequest,
  watchmanCreateInputSchema,
  watchmanInteractionRequestSchema,
  watchmanRoleSchema,
  watchmanUiBlockSchema,
} from '@continuum/contracts';
import { z } from 'zod';

const uuid = z.string().uuid();
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(1000);
const privatePath = z
  .string()
  .startsWith('/')
  .refine((value) => !/[\u0000-\u001f\u007f?#]/.test(value));
const context = z.object({ brand_id: uuid, human_id: uuid, storage_state: privatePath }).strict();
const roster = z
  .object({
    context,
    teammates: z
      .array(
        z
          .object({
            id: uuid,
            name: text,
            role: watchmanRoleSchema,
            lifecycle: z.enum(['ready', 'working', 'waiting', 'blocked', 'paused', 'failed']),
            active_work_count: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(4)
      .max(30),
    attention_count: z.number().int().nonnegative(),
  })
  .strict();
const ownership = z
  .object({
    setup_request_id: uuid,
    bot_user_id: uuid,
    setup_input_sha256: sha,
  })
  .strict();
const goalOrigin = z
  .object({
    assignment_request_id: text,
    wake_id: uuid,
    inbox_id: uuid,
    attempt: z.number().int().positive(),
  })
  .strict();
const card = z
  .object({
    context,
    watchman_id: uuid,
    conversation_id: text,
    attention_id: text,
    execution: goalExecutionRefSchema,
    ownership,
    goal_origin: goalOrigin,
    block: watchmanUiBlockSchema,
  })
  .strict();
const question = card
  .extend({ answer: text })
  .refine((value) => value.block.type === 'question', 'Native question card required.');
const approval = card
  .extend({
    input_sha256: sha,
    kind: z.enum(['generate', 'render', 'publish', 'optimize']),
    tool: text,
  })
  .refine(
    (value) =>
      value.block.type === 'approval' &&
      value.block.version === 0 &&
      value.block.operation_id === value.block.proposal_id,
    'Current native version-zero proposal card required.',
  );
export const experiencePlanSchema = z
  .object({
    run_id: uuid,
    prepared_after: z.iso.datetime(),
    owner: text,
    operator_human_id: uuid,
    gcs_prefix: z.string(),
    origin: z.literal('NATIVE_PREPARED_LOCAL_FIXTURES'),
    protected: z
      .object({
        brand_id: uuid,
        brand_ids: z
          .array(
            z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i),
          )
          .min(1)
          .max(4)
          .optional(),
        watchman_ids: z.array(uuid).min(4).max(10),
        goal_ids: z.array(text).min(4).max(20),
        artifact_ids: z.array(text).min(4).max(30),
        asset_ids: z.array(uuid).min(4).max(30),
        version_ids: z.array(uuid).min(4).max(30),
        sha256: sha,
      })
      .strict(),
    cases: z
      .object({
        dashboard: roster.optional(),
        empty: z.object({ context, can_manage: z.boolean() }).strict().optional(),
        partial: roster
          .extend({ issues: z.array(z.object({ source: text, message: text }).strict()).min(1) })
          .optional(),
        question: question.optional(),
        reject: approval.optional(),
        approve: approval.optional(),
        stale: card
          .extend({ current_version: z.number().int().positive(), answer: text })
          .refine(
            (value) =>
              value.block.type === 'question' && value.current_version > value.block.version,
            'An actual older stored card and a newer current request revision are required.',
          )
          .optional(),
        recurrence: z
          .object({
            context,
            watchman_id: uuid,
            ownership,
            instruction: text,
            timing: z.enum(['daily', 'weekly']),
            timezone: z.string().min(1).max(64),
          })
          .strict()
          .optional(),
        artifact: z
          .object({
            context,
            watchman_id: uuid,
            attention_id: text,
            goal_id: text,
            artifact_id: text,
            asset_id: uuid,
            version_id: uuid,
            sha256: sha,
            bytes: z
              .number()
              .int()
              .min(1)
              .max(256 * 1024),
            title: text,
            excerpt: text,
          })
          .strict()
          .optional(),
      })
      .strict(),
    unrun: z.record(z.string(), text),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.protected.brand_ids && !plan.protected.brand_ids.includes(plan.protected.brand_id))
      ctx.addIssue({
        code: 'custom',
        message: 'Protected historical brand scope must include the primary brand.',
      });
    if (
      plan.gcs_prefix !==
      `gs://continuum-production-477821-creative-benchmarks/watchman-experience/${plan.run_id}/`
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Exact approved experience GCS run prefix required.',
      });
    const identities = plan.cases.dashboard?.teammates ?? [];
    if (
      new Set(identities.map((row) => row.id)).size !== identities.length ||
      new Set(identities.map((row) => row.name)).size !== identities.length
    )
      ctx.addIssue({ code: 'custom', message: 'Roster identities and names must be unique.' });
    if (
      plan.cases.approve &&
      (plan.cases.approve.kind !== 'generate' ||
        plan.cases.approve.tool !== 'pipeline_invoke' ||
        plan.protected.watchman_ids.includes(plan.cases.approve.watchman_id))
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Positive decision-only approval requires a fresh paused generation profile; publish/optimize execution is outside this scope.',
      });
    const recurring = plan.cases.recurrence;
    if (
      recurring &&
      (plan.protected.watchman_ids.includes(recurring.watchman_id) ||
        !recurring.instruction.startsWith(`experience:${plan.run_id}:`))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Recurrence must belong to a fresh run-owned profile and instruction.',
      });
    for (const value of [
      plan.cases.question,
      plan.cases.reject,
      plan.cases.approve,
      plan.cases.stale,
    ])
      if (value && plan.protected.goal_ids.includes(value.execution.goalId))
        ctx.addIssue({
          code: 'custom',
          message:
            'Decision fixtures must use fresh Goals, preserving original setup and accepted A2A work.',
        });
    for (const fixture of [
      plan.cases.question,
      plan.cases.reject,
      plan.cases.approve,
      plan.cases.stale,
      plan.cases.recurrence,
    ]) {
      if (!fixture) continue;
      if (
        fixture.ownership.setup_request_id !== fixture.watchman_id ||
        plan.protected.watchman_ids.includes(fixture.watchman_id)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Every mutation requires a separately run-owned native setup profile.',
        });
      if (
        'goal_origin' in fixture &&
        !fixture.goal_origin.assignment_request_id.startsWith(`experience:${plan.run_id}:`)
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Every mutation Goal requires this exact run assignment request marker.',
        });
    }
    for (const key of Object.keys(plan.cases))
      if (plan.unrun[key])
        ctx.addIssue({ code: 'custom', message: 'A cell cannot be both prepared and UNRUN.' });
    for (const ids of [
      plan.protected.watchman_ids,
      plan.protected.goal_ids,
      plan.protected.artifact_ids,
      plan.protected.asset_ids,
      plan.protected.version_ids,
    ])
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({ code: 'custom', message: 'Protected row identities must be unique.' });
  });
export type ExperiencePlan = z.infer<typeof experiencePlanSchema>;
export type ExperienceCase = keyof ExperiencePlan['cases'];
export type ExperienceMutationCase = 'question' | 'reject' | 'approve' | 'stale' | 'recurrence';
export type ExperienceMutation = NonNullable<ExperiencePlan['cases'][ExperienceMutationCase]>;
type NativeRow = Record<string, unknown>;
const record = (value: unknown): NativeRow => z.record(z.string(), z.unknown()).parse(value);
const requireNative: (value: unknown, code: string) => asserts value = (value, code) => {
  if (!value) throw new Error(code);
};
const withinRun = (value: unknown, plan: ExperiencePlan) =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) >= Date.parse(plan.prepared_after) &&
  Date.parse(value) <= Date.now();
export function assertExperienceNativeOwner(
  plan: ExperiencePlan,
  fixture: ExperienceMutation,
  native: {
    profile: NativeRow;
    setup: NativeRow;
    bot: NativeRow;
    memberships: NativeRow[];
  },
) {
  const { profile, setup, bot, memberships } = native;
  const pin = fixture.ownership;
  const input = watchmanCreateInputSchema.parse(setup.input);
  const marker = `experience:${plan.run_id}:`;
  const stages = setup.completed_stages;
  requireNative(
    profile.id === fixture.watchman_id &&
      profile.id === pin.setup_request_id &&
      profile.brand_id === fixture.context.brand_id &&
      profile.bot_user_id === pin.bot_user_id &&
      profile.created_by === fixture.context.human_id &&
      profile.status === 'paused' &&
      withinRun(profile.created_at, plan) &&
      setup.request_id === profile.id &&
      setup.watchman_id === profile.id &&
      setup.bot_user_id === profile.bot_user_id &&
      setup.created_by === profile.created_by &&
      setup.brand_id === profile.brand_id &&
      withinRun(setup.created_at, plan) &&
      setup.status !== 'failed' &&
      Array.isArray(stages) &&
      ['principal', 'teammate', 'credential', 'responsibilities'].every((stage) =>
        stages.includes(stage),
      ) &&
      experienceHash(input) === pin.setup_input_sha256 &&
      input.request_id === profile.id &&
      input.instructions.startsWith(marker) &&
      input.first_assignment?.startsWith(marker) &&
      input.name === profile.name &&
      input.instructions === profile.instructions &&
      input.kind === profile.kind &&
      (input.role ?? (input.kind === 'paid' ? 'performance' : 'content')) === profile.role &&
      bot.id === profile.bot_user_id &&
      record(bot.app_metadata).principal_type === 'agent' &&
      record(bot.app_metadata).watchman_setup_request_id === profile.id,
    'BLOCKED_NATIVE_RUN_OWNERSHIP_REQUIRED',
  );
  const receipt = record(setup.first_assignment_receipt);
  requireNative(
    typeof receipt.goal_id === 'string' &&
      typeof receipt.work_node_id === 'string' &&
      record(receipt.execution).goalId === receipt.goal_id &&
      record(receipt.execution).workNodeId === receipt.work_node_id &&
      typeof record(receipt.execution).harnessRunId === 'string',
    'BLOCKED_NATIVE_SETUP_RECEIPT_REQUIRED',
  );
  requireNative(
    [fixture.context.human_id, pin.bot_user_id].every((id) =>
      memberships.some(
        (entry) =>
          entry.brand_profile_id === fixture.context.brand_id &&
          entry.user_id === id &&
          ['owner', 'admin', 'operator'].includes(String(entry.role)),
      ),
    ),
    'BLOCKED_NATIVE_MEMBERSHIP_REQUIRED',
  );
}
/** Native assignment identity is derived by the existing server from creator + exact request. */
export function experienceAssignmentGoalId(
  brandId: string,
  humanId: string,
  watchmanId: string,
  requestId: string,
) {
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return `watchman_goal_${digest([brandId, humanId, `wm:${digest([watchmanId, requestId])}`]).slice(0, 40)}`;
}
export function assertExperienceNativeGoal(
  plan: ExperiencePlan,
  fixture: Exclude<ExperienceMutation, NonNullable<ExperiencePlan['cases']['recurrence']>>,
  native: {
    goal: NativeRow;
    creation: NativeRow;
    node: NativeRow;
    checkpoint: NativeRow;
    assignments: NativeRow[];
    wake: NativeRow;
    inbox: NativeRow;
    conversation: NativeRow;
    request?: NativeRow;
    proposal?: NativeRow;
  },
) {
  const { goal, creation, node, checkpoint, assignments, wake, inbox, conversation } = native;
  const execution = fixture.execution;
  const origin = fixture.goal_origin;
  const marker = `experience:${plan.run_id}:`;
  const initial = record(record(creation.data).goal);
  const actor = { kind: 'human', userId: fixture.context.human_id };
  requireNative(
    origin.assignment_request_id.startsWith(marker) &&
      execution.goalId ===
        experienceAssignmentGoalId(
          fixture.context.brand_id,
          fixture.context.human_id,
          fixture.watchman_id,
          origin.assignment_request_id,
        ) &&
      goal.id === execution.goalId &&
      goal.brand_id === fixture.context.brand_id &&
      goal.kind === 'watchman-assignment' &&
      withinRun(goal.created_at, plan) &&
      experienceHash(goal.created_by) === experienceHash(actor) &&
      typeof goal.objective === 'string' &&
      goal.objective.startsWith(marker) &&
      creation.goal_id === goal.id &&
      creation.brand_id === goal.brand_id &&
      creation.type === 'goal.created' &&
      withinRun(creation.created_at, plan) &&
      experienceHash(creation.actor) === experienceHash(actor) &&
      initial.id === goal.id &&
      initial.brandId === goal.brand_id &&
      initial.objective === goal.objective &&
      experienceHash(initial.createdBy) === experienceHash(actor) &&
      typeof creation.command_id === 'string' &&
      creation.command_id.startsWith(`create:${goal.id}:`),
    'BLOCKED_NATIVE_RUN_GOAL_REQUIRED',
  );
  requireNative(
    node.id === execution.workNodeId &&
      node.goal_id === goal.id &&
      node.brand_id === goal.brand_id &&
      record(node.executor).kind === 'specialist' &&
      record(node.executor).agent === `watchman:${fixture.watchman_id}` &&
      checkpoint.id === execution.harnessRunId &&
      checkpoint.goal_id === goal.id &&
      checkpoint.brand_id === goal.brand_id &&
      checkpoint.work_node_id === node.id &&
      checkpoint.harness_key === `work-node:${node.id}` &&
      checkpoint.execution_user_id === fixture.context.human_id &&
      record(checkpoint.checkpoint).watchman_id === fixture.watchman_id &&
      experienceHash(record(checkpoint.checkpoint).execution_ref) === experienceHash(execution) &&
      checkpoint.last_child_run_id === origin.inbox_id &&
      assignments.some(
        (entry) =>
          entry.goal_id === goal.id &&
          entry.brand_id === goal.brand_id &&
          entry.workstream_id === node.workstream_id &&
          entry.status === 'active' &&
          record(entry.assignee).kind === 'agent' &&
          record(entry.assignee).agent === `watchman:${fixture.watchman_id}` &&
          (checkpoint.assignment_id === null || checkpoint.assignment_id === entry.id),
      ),
    'BLOCKED_NATIVE_EXECUTION_JOIN_REQUIRED',
  );
  requireNative(
    wake.id === origin.wake_id &&
      wake.watchman_id === fixture.watchman_id &&
      wake.attempt === origin.attempt &&
      wake.status === 'completed' &&
      wake.error === null &&
      withinRun(wake.created_at, plan) &&
      inbox.id === origin.inbox_id &&
      inbox.wake_id === wake.id &&
      inbox.watchman_id === fixture.watchman_id &&
      ['goal.work.assigned', 'goal.work.message'].includes(String(inbox.event_type)) &&
      experienceHash(record(inbox.payload).execution) === experienceHash(execution) &&
      record(inbox.payload).watchman_id === fixture.watchman_id,
    'BLOCKED_NATIVE_WAKE_JOIN_REQUIRED',
  );
  requireNative(
    conversation.id === fixture.conversation_id &&
      conversation.brand_id === goal.brand_id &&
      conversation.watchman_id === fixture.watchman_id &&
      conversation.created_by === fixture.context.human_id &&
      withinRun(conversation.created_at, plan) &&
      experienceHash(conversation.execution) === experienceHash(execution),
    'BLOCKED_NATIVE_CONVERSATION_JOIN_REQUIRED',
  );
  if (fixture.block.type === 'question') {
    const request = native.request;
    requireNative(
      request &&
        request.id === fixture.block.request_id &&
        request.goal_id === goal.id &&
        request.brand_id === goal.brand_id &&
        withinRun(request.created_at, plan) &&
        typeof request.prompt === 'string' &&
        request.prompt.startsWith(marker) &&
        request.id.startsWith(marker) &&
        record(record(request.record).requestedBy).kind === 'agent' &&
        record(record(request.record).requestedBy).agent === `watchman:${fixture.watchman_id}` &&
        record(record(request.record).requestedBy).runId === inbox.id &&
        Array.isArray(request.blocked_node_refs) &&
        request.blocked_node_refs.some(
          (value) => record(value).kind === 'work_node' && record(value).id === node.id,
        ),
      'BLOCKED_NATIVE_REQUEST_ORIGIN_REQUIRED',
    );
  } else {
    const proposal = native.proposal;
    requireNative(
      fixture.block.type === 'approval' &&
        proposal &&
        proposal.id === fixture.block.proposal_id &&
        proposal.watchman_id === fixture.watchman_id &&
        proposal.wake_id === wake.id &&
        withinRun(proposal.created_at, plan) &&
        experienceHash(proposal.execution_ref) === experienceHash(execution),
      'BLOCKED_NATIVE_PROPOSAL_ORIGIN_REQUIRED',
    );
  }
}
export const EXPERIENCE_SCOPE_CASES = {
  dashboard: ['dashboard', 'empty', 'partial'],
  work: ['question', 'reject', 'approve', 'stale', 'recurrence', 'artifact'],
} as const;
export function requireExperienceScope(
  plan: ExperiencePlan,
  scope: keyof typeof EXPERIENCE_SCOPE_CASES,
) {
  for (const key of EXPERIENCE_SCOPE_CASES[scope]) requireExperienceCase(plan, key);
}
export const EXPERIENCE_GAPS = [
  'human first-time usability',
  'OAuth/provider execution',
  'publishing/optimization effect acceptance',
  'general approval content-hash binding beyond existing native contracts',
  'recurrence firing/autonomous completion',
  'literal browser reload and server restart',
  'ES/PT/full accessibility/visual sign-off',
  'supervised external pilot',
] as const;
export function redactExperienceError(value: unknown, secrets: readonly string[] = []): Error {
  const redact = (text: string) =>
    secrets
      .filter(Boolean)
      .reduce((out, secret) => out.split(secret).join('[redacted]'), text)
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
      .replace(/https?:\/\/[^\s"'<>]+/g, (address) => {
        try {
          const url = new URL(address);
          url.username = '';
          url.password = '';
          url.search = '';
          url.hash = '';
          return url.toString();
        } catch {
          return '[redacted-url]';
        }
      });
  const original = value instanceof Error ? value : new Error(String(value));
  const safe =
    original instanceof AggregateError
      ? new AggregateError(
          original.errors.map((error: unknown) => redactExperienceError(error, secrets)),
          redact(original.message),
        )
      : new Error(redact(original.message));
  safe.name = original.name;
  if (original.cause instanceof Error && original.cause !== original)
    safe.cause = redactExperienceError(original.cause, secrets);
  if (original.stack) safe.stack = redact(original.stack);
  return safe;
}
export function requireExperienceCase<K extends ExperienceCase>(
  plan: ExperiencePlan,
  key: K,
): NonNullable<ExperiencePlan['cases'][K]> {
  const fixture = plan.cases[key];
  if (!fixture) throw new Error(`BLOCKED_MISSING_NATIVE_FIXTURE_${key.toUpperCase()}`);
  return fixture;
}
export const experienceHash = (value: unknown): string =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item: unknown) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
          : item,
      ),
    )
    .digest('hex');
export function assertExperienceRoster(
  dashboard: WatchmanDashboard,
  pin: z.infer<typeof roster>,
  partial = false,
) {
  const rows = dashboard.teammates
    .map((row) => ({
      id: row.profile.id,
      name: row.profile.name,
      role: row.profile.role,
      lifecycle: row.lifecycle,
      active_work_count: row.active_work_count,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    dashboard.brand_id !== pin.context.brand_id ||
    dashboard.partial !== partial ||
    dashboard.needs_you.length !== pin.attention_count ||
    experienceHash(rows) !==
      experienceHash([...pin.teammates].sort((a, b) => a.id.localeCompare(b.id)))
  )
    throw new Error('REAL_DASHBOARD_FIXTURE_MISMATCH');
}
export function experienceActionAllowed(
  input: unknown,
  pin: z.infer<typeof card>,
  action: WatchmanInteractionRequest['action'],
): boolean {
  const parsed = watchmanInteractionRequestSchema.safeParse(input);
  return (
    parsed.success &&
    parsed.data.brand_id === pin.context.brand_id &&
    parsed.data.watchman_id === pin.watchman_id &&
    parsed.data.conversation_id === pin.conversation_id &&
    parsed.data.message === undefined &&
    experienceHash(parsed.data.action) === experienceHash(action)
  );
}
export function loadExperiencePlan(runId: string, owner: string) {
  if (process.env.WATCHMAN_LOCAL_EXPERIENCE_BENCH !== 'authorized-native-fixtures')
    throw new Error('BLOCKED_EXPERIENCE_SCOPE');
  const path = process.env.WATCHMAN_EXPERIENCE_PLAN_FILE;
  if (!path) throw new Error('BLOCKED_PRIVATE_EXPERIENCE_PLAN');
  const metadata = lstatSync(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size > 32 * 1024 ||
    (metadata.mode & 0o077) !== 0
  )
    throw new Error('BLOCKED_PRIVATE_EXPERIENCE_PLAN');
  const plan = experiencePlanSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (plan.run_id !== runId || plan.owner !== owner)
    throw new Error('EXPERIENCE_OWNER_RUN_MISMATCH');
  return plan;
}
