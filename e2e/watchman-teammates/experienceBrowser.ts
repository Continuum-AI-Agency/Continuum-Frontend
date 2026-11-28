/** Transparent browser admission and actual HTTP/store readback; never substitutes responses. */
import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import {
  goalSnapshotSchema,
  WATCHMAN_CONVERSATION_ROUTE,
  WATCHMAN_DASHBOARD_ROUTE,
  WATCHMAN_INTERACTION_ROUTE,
  WATCHMAN_MANAGE_ROUTE,
  type WatchmanDashboard,
  type WatchmanUiAction,
  watchmanConversationViewSchema,
  watchmanDashboardSchema,
  watchmanInteractionRequestSchema,
  watchmanUiMessageSchema,
} from '@continuum/contracts';
import { type Browser, expect, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import labels from '../../messages/automations/en.json';
import type { Database } from '../../src/lib/supabase/types';
import {
  assertExperienceNativeGoal,
  assertExperienceNativeOwner,
  EXPERIENCE_GAPS,
  type ExperienceMutationCase,
  type ExperiencePlan,
  experienceHash,
  redactExperienceError,
} from './experiencePlan';
import type { watchmanBrowserPreflight } from './preflight';

export type ExperienceConfig = ReturnType<typeof watchmanBrowserPreflight>;
export type ContextPin = { brand_id: string; human_id: string; storage_state: string };
const assert: (value: unknown, code: string) => asserts value = (value, code) => {
  if (!value) throw new Error(code);
};
const row = z.record(z.string(), z.unknown());
type Db = SupabaseClient<Database>;
async function rows(query: PromiseLike<{ data: unknown; error: unknown }>) {
  const result = await query;
  assert(!result.error, 'REAL_STORE_READ_FAILED');
  return z.array(row).max(100).parse(result.data);
}
export async function protectedExperienceHash(db: Db, plan: ExperiencePlan) {
  const p = plan.protected;
  const brands = new Set(p.brand_ids ?? [p.brand_id]);
  const queries = [
    [
      p.watchman_ids,
      db.schema('brand_profiles').from('watchmen').select('*').in('id', p.watchman_ids).order('id'),
    ],
    [
      p.watchman_ids,
      db
        .schema('brand_profiles')
        .from('watchman_setup_attempts')
        .select('request_id,brand_id,bot_user_id,input,first_assignment_receipt')
        .in('request_id', p.watchman_ids)
        .order('request_id'),
    ],
    [
      p.goal_ids,
      db.schema('agent_workspace').from('goals').select('*').in('id', p.goal_ids).order('id'),
    ],
    [
      p.artifact_ids,
      db
        .schema('agent_workspace')
        .from('artifact_refs')
        .select('*')
        .in('id', p.artifact_ids)
        .order('id'),
    ],
    [p.asset_ids, db.schema('media').from('assets').select('*').in('id', p.asset_ids).order('id')],
    [
      p.version_ids,
      db.schema('media').from('asset_versions').select('*').in('id', p.version_ids).order('id'),
    ],
  ] as const;
  const snapshot: unknown[] = [];
  for (const [ids, query] of queries) {
    const result = await rows(query);
    assert(result.length === new Set(ids).size, 'PROTECTED_FIXTURE_ROW_MISSING');
    assert(
      result.every((entry) => typeof entry.brand_id === 'string' && brands.has(entry.brand_id)),
      'PROTECTED_FIXTURE_BRAND_MISMATCH',
    );
    snapshot.push(result);
  }
  const coupled = [
    db
      .schema('agent_workspace')
      .from('goal_work_nodes')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('id')
      .limit(201),
    db
      .schema('agent_workspace')
      .from('run_checkpoints')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('id')
      .limit(201),
    db
      .schema('agent_workspace')
      .from('assignments')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('id')
      .limit(201),
    db
      .schema('agent_workspace')
      .from('goal_child_runs')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('child_run_id')
      .limit(201),
    db
      .schema('agent_workspace')
      .from('goal_run_wakeups')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('id')
      .limit(201),
    db
      .schema('agent_workspace')
      .from('goal_supervisor_queue')
      .select('*', { count: 'exact' })
      .in('goal_id', p.goal_ids)
      .order('goal_id')
      .limit(201),
    db
      .schema('brand_profiles')
      .from('watchman_inbox')
      .select('*', { count: 'exact' })
      .in('watchman_id', p.watchman_ids)
      .order('id')
      .limit(201),
    db
      .schema('brand_profiles')
      .from('watchman_wakes')
      .select('*', { count: 'exact' })
      .in('watchman_id', p.watchman_ids)
      .order('id')
      .limit(201),
  ];
  for (const query of coupled) snapshot.push(await boundedExperienceRows(query));
  return experienceHash(snapshot);
}
async function boundedExperienceRows(
  query: PromiseLike<{ data: unknown; error: unknown; count: number | null }>,
) {
  const result = await query;
  assert(!result.error, 'BOUNDED_PRESERVATION_READ_FAILED');
  const data = z.array(row).max(200).parse(result.data);
  assert(result.count === data.length, 'BLOCKED_INCOMPLETE_NATIVE_BASELINE');
  return data;
}
export type ExperienceOwnedRows = {
  watchmanId: string;
  goalId?: string;
  conversationId?: string;
  proposalId?: string;
  instruction?: string;
};
/** Baseline complete bounded decision/execution tables in admitted brands, including omitted older rows. */
async function foreignExperienceHash(
  database: Db,
  plan: ExperiencePlan,
  owned?: ExperienceOwnedRows,
) {
  const brands = [
    ...new Set([
      ...(plan.protected.brand_ids ?? [plan.protected.brand_id]),
      ...Object.values(plan.cases).map((fixture) => fixture.context.brand_id),
    ]),
  ];
  const profiles = await boundedExperienceRows(
    database
      .schema('brand_profiles')
      .from('watchmen')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
  );
  const ids = profiles.map((profile) => z.string().parse(profile.id));
  const snapshot: Record<string, Record<string, unknown>[]> = { watchmen: profiles };
  const queries = {
    setup: database
      .schema('brand_profiles')
      .from('watchman_setup_attempts')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('request_id')
      .limit(201),
    permissions: database
      .schema('brand_profiles')
      .from('permissions')
      .select('*', { count: 'exact' })
      .in('brand_profile_id', brands)
      .order('id')
      .limit(201),
    goals: database
      .schema('agent_workspace')
      .from('goals')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    nodes: database
      .schema('agent_workspace')
      .from('goal_work_nodes')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    checkpoints: database
      .schema('agent_workspace')
      .from('run_checkpoints')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    assignments: database
      .schema('agent_workspace')
      .from('assignments')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    child_runs: database
      .schema('agent_workspace')
      .from('goal_child_runs')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('child_run_id')
      .limit(201),
    wakeups: database
      .schema('agent_workspace')
      .from('goal_run_wakeups')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    supervisor: database
      .schema('agent_workspace')
      .from('goal_supervisor_queue')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('goal_id')
      .limit(201),
    requests: database
      .schema('agent_workspace')
      .from('input_requests')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    responses: database
      .schema('agent_workspace')
      .from('input_responses')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    events: database
      .schema('agent_workspace')
      .from('events')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    receipts: database
      .schema('agent_workspace')
      .from('command_receipts')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('goal_id')
      .order('command_id')
      .limit(201),
    artifacts: database
      .schema('agent_workspace')
      .from('artifact_refs')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    assets: database
      .schema('media')
      .from('assets')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    versions: database
      .schema('media')
      .from('asset_versions')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    conversations: database
      .schema('brand_profiles')
      .from('watchman_conversations')
      .select('*', { count: 'exact' })
      .in('brand_id', brands)
      .order('id')
      .limit(201),
    inbox: database
      .schema('brand_profiles')
      .from('watchman_inbox')
      .select('*', { count: 'exact' })
      .in('watchman_id', ids)
      .order('id')
      .limit(201),
    wakes: database
      .schema('brand_profiles')
      .from('watchman_wakes')
      .select('*', { count: 'exact' })
      .in('watchman_id', ids)
      .order('id')
      .limit(201),
    tasks: database
      .schema('brand_profiles')
      .from('watchman_tasks')
      .select('*', { count: 'exact' })
      .in('watchman_id', ids)
      .order('id')
      .limit(201),
    proposals: database
      .schema('brand_profiles')
      .from('watchman_proposals')
      .select('*', { count: 'exact' })
      .in('watchman_id', ids)
      .order('id')
      .limit(201),
  };
  for (const [name, query] of Object.entries(queries))
    snapshot[name] = await boundedExperienceRows(query);
  const threads = snapshot.conversations!.map((entry) => z.string().parse(entry.id));
  snapshot.conversation_events = await boundedExperienceRows(
    database
      .schema('brand_profiles')
      .from('watchman_conversation_events')
      .select('*', { count: 'exact' })
      .in('conversation_id', threads)
      .order('conversation_id')
      .order('sequence')
      .limit(201),
  );
  return experiencePreservationHash(snapshot, owned);
}
export function experiencePreservationHash(
  snapshot: Record<string, Record<string, unknown>[]>,
  owned?: ExperienceOwnedRows,
) {
  const preserved: typeof snapshot = {};
  const goalTables = new Set([
    'nodes',
    'checkpoints',
    'assignments',
    'child_runs',
    'wakeups',
    'supervisor',
    'requests',
    'responses',
    'events',
    'receipts',
  ]);
  for (const [name, data] of Object.entries(snapshot))
    preserved[name] = data.filter((entry) => {
      if (!owned) return true;
      if (name === 'goals') return entry.id !== owned.goalId;
      if (goalTables.has(name)) return entry.goal_id !== owned.goalId;
      if (name === 'conversations') return entry.id !== owned.conversationId;
      if (name === 'conversation_events') return entry.conversation_id !== owned.conversationId;
      if (name === 'proposals') return entry.id !== owned.proposalId;
      if (name === 'tasks')
        return !(entry.watchman_id === owned.watchmanId && entry.instruction === owned.instruction);
      if (name === 'inbox' || name === 'wakes') return entry.watchman_id !== owned.watchmanId;
      return true;
    });
  return experienceHash(preserved);
}
export async function requireExperienceMutationOwnership(
  database: Db,
  plan: ExperiencePlan,
  kind: ExperienceMutationCase,
): Promise<ExperienceOwnedRows> {
  const fixture = plan.cases[kind];
  assert(fixture, 'BLOCKED_MISSING_MUTATION_FIXTURE');
  const one = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const data = await rows(query);
    assert(data.length === 1, 'BLOCKED_SINGLE_NATIVE_PROVENANCE_REQUIRED');
    return data[0]!;
  };
  const profile = await one(
    database.schema('brand_profiles').from('watchmen').select('*').eq('id', fixture.watchman_id),
  );
  const setup = await one(
    database
      .schema('brand_profiles')
      .from('watchman_setup_attempts')
      .select('*')
      .eq('request_id', fixture.ownership.setup_request_id),
  );
  const bot = await database.auth.admin.getUserById(fixture.ownership.bot_user_id);
  assert(!bot.error && bot.data.user, 'BLOCKED_REAL_SETUP_BOT_REQUIRED');
  const memberships = await rows(
    database
      .schema('brand_profiles')
      .from('permissions')
      .select('*')
      .eq('brand_profile_id', fixture.context.brand_id)
      .in('user_id', [fixture.context.human_id, fixture.ownership.bot_user_id]),
  );
  assertExperienceNativeOwner(plan, fixture, {
    profile,
    setup,
    bot: { id: bot.data.user.id, app_metadata: bot.data.user.app_metadata },
    memberships,
  });
  const receipt = z
    .object({
      goal_id: z.string(),
      work_node_id: z.string(),
      execution: z.object({ harnessRunId: z.string() }).passthrough(),
    })
    .parse(setup.first_assignment_receipt);
  const initialGoal = await one(
    database
      .schema('agent_workspace')
      .from('goals')
      .select('id,brand_id,created_by,objective')
      .eq('id', receipt.goal_id),
  );
  assert(
    initialGoal.brand_id === fixture.context.brand_id &&
      experienceHash(initialGoal.created_by) ===
        experienceHash({ kind: 'human', userId: fixture.context.human_id }) &&
      typeof initialGoal.objective === 'string' &&
      initialGoal.objective.startsWith(`experience:${plan.run_id}:`),
    'BLOCKED_NATIVE_FIRST_ASSIGNMENT_REQUIRED',
  );
  const firstNode = await one(
    database
      .schema('agent_workspace')
      .from('goal_work_nodes')
      .select('id,goal_id,brand_id,executor')
      .eq('id', receipt.work_node_id),
  );
  const firstCheckpoint = await one(
    database
      .schema('agent_workspace')
      .from('run_checkpoints')
      .select('id,goal_id,brand_id,work_node_id,execution_user_id')
      .eq('id', receipt.execution.harnessRunId),
  );
  assert(
    firstNode.goal_id === initialGoal.id &&
      firstNode.brand_id === initialGoal.brand_id &&
      z
        .object({ agent: z.literal(`watchman:${fixture.watchman_id}`) })
        .safeParse(firstNode.executor).success &&
      firstCheckpoint.goal_id === initialGoal.id &&
      firstCheckpoint.brand_id === initialGoal.brand_id &&
      firstCheckpoint.work_node_id === firstNode.id &&
      firstCheckpoint.execution_user_id === fixture.context.human_id,
    'BLOCKED_NATIVE_FIRST_ASSIGNMENT_JOIN_REQUIRED',
  );
  if (!('execution' in fixture))
    return { watchmanId: fixture.watchman_id, instruction: fixture.instruction };
  const execution = fixture.execution;
  const goal = await one(
    database.schema('agent_workspace').from('goals').select('*').eq('id', execution.goalId),
  );
  const creation = await one(
    database
      .schema('agent_workspace')
      .from('events')
      .select('*')
      .eq('goal_id', execution.goalId)
      .eq('type', 'goal.created'),
  );
  const node = await one(
    database
      .schema('agent_workspace')
      .from('goal_work_nodes')
      .select('*')
      .eq('id', execution.workNodeId),
  );
  const checkpoint = await one(
    database
      .schema('agent_workspace')
      .from('run_checkpoints')
      .select('*')
      .eq('id', execution.harnessRunId),
  );
  const assignments = await rows(
    database
      .schema('agent_workspace')
      .from('assignments')
      .select('*')
      .eq('goal_id', execution.goalId),
  );
  const wake = await one(
    database
      .schema('brand_profiles')
      .from('watchman_wakes')
      .select('*')
      .eq('id', fixture.goal_origin.wake_id),
  );
  const inboxes = await rows(
    database
      .schema('brand_profiles')
      .from('watchman_inbox')
      .select('*')
      .eq('watchman_id', fixture.watchman_id)
      .eq('wake_id', fixture.goal_origin.wake_id)
      .in('event_type', ['goal.work.assigned', 'goal.work.message'])
      .limit(2),
  );
  assert(inboxes.length === 1, 'BLOCKED_SINGLE_ORIGINAL_INBOX_REQUIRED');
  const conversation = await one(
    database
      .schema('brand_profiles')
      .from('watchman_conversations')
      .select('*')
      .eq('id', fixture.conversation_id),
  );
  const request =
    fixture.block.type === 'question'
      ? await one(
          database
            .schema('agent_workspace')
            .from('input_requests')
            .select('*')
            .eq('id', fixture.block.request_id),
        )
      : undefined;
  const proposal =
    fixture.block.type === 'approval'
      ? await one(
          database
            .schema('brand_profiles')
            .from('watchman_proposals')
            .select('*')
            .eq('id', fixture.block.proposal_id),
        )
      : undefined;
  assertExperienceNativeGoal(plan, fixture, {
    goal,
    creation,
    node,
    checkpoint,
    assignments,
    wake,
    inbox: inboxes[0]!,
    conversation,
    request,
    proposal,
  });
  return {
    watchmanId: fixture.watchman_id,
    goalId: execution.goalId,
    conversationId: fixture.conversation_id,
    ...(proposal ? { proposalId: String(proposal.id) } : {}),
  };
}
export async function freshExperienceJson(
  page: Page,
  config: ExperienceConfig,
  pin: ContextPin,
  query: string,
  pathname: string,
  extra: Record<string, string> = {},
) {
  await page.goto('about:blank');
  const response = page
    .waitForResponse((value) => {
      const url = new URL(value.url());
      return (
        url.origin === config.apiOrigin &&
        url.pathname === pathname &&
        value.request().method() === 'GET' &&
        url.searchParams.get('brandId') === pin.brand_id &&
        Object.entries(extra).every(([key, expected]) => url.searchParams.get(key) === expected)
      );
    })
    .then(async (value) => {
      assert(value.status() === 200, `REAL_READ_HTTP_${value.status()}`);
      const authorization = value.request().headers().authorization;
      assert(authorization?.startsWith('Bearer '), 'REAL_BROWSER_AUTH_REQUIRED');
      return { body: (await value.json()) as unknown, authorization };
    });
  const [, body] = await Promise.all([
    page.goto(`${config.origin}/en/automations/watchman?${query}`),
    response,
  ]);
  return body;
}
export function experienceUrl(watchmanId?: string, conversationId?: string) {
  return new URLSearchParams({
    role: 'all',
    status: 'all',
    ...(watchmanId ? { teammate: watchmanId } : {}),
    ...(conversationId ? { conversation: conversationId } : {}),
  }).toString();
}
export async function withExperienceBrowser(
  input: {
    browser: Browser;
    info: TestInfo;
    config: ExperienceConfig;
    plan: ExperiencePlan;
    pin: ContextPin;
    allowedMutation?: (path: string, body: unknown) => boolean;
    mutationCase?: ExperienceMutationCase;
  },
  run: (session: {
    page: Page;
    database: Db;
    authorization: string;
    dashboard: WatchmanDashboard;
    read: (path: string) => Promise<unknown>;
  }) => Promise<void>,
) {
  const { browser, info, config, plan, pin } = input;
  assert(
    info.config.workers === 1 && info.retry === 0 && browser.browserType().name() === 'chromium',
    'ONE_CHROME_WORKER_ZERO_RETRY_REQUIRED',
  );
  const state = lstatSync(pin.storage_state);
  assert(
    state.isFile() && !state.isSymbolicLink() && (state.mode & 0o077) === 0,
    'PRIVATE_REAL_AUTH_STATE_REQUIRED',
  );
  const database = createClient<Database>(config.supabaseOrigin, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert(
    (await protectedExperienceHash(database, plan)) === plan.protected.sha256,
    'PROTECTED_BASELINE_MISMATCH',
  );
  assert(!input.allowedMutation || input.mutationCase, 'NATIVE_MUTATION_CASE_REQUIRED');
  const owned = input.mutationCase
    ? await requireExperienceMutationOwnership(database, plan, input.mutationCase)
    : undefined;
  const foreignBaseline = await foreignExperienceHash(database, plan, owned);
  const context = await browser.newContext({
    storageState: pin.storage_state,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  const failed: unknown[] = [];
  const secrets = [config.serviceKey];
  try {
    const page = await context.newPage();
    const refused: string[] = [];
    const origins = new Set([config.origin, config.apiOrigin, config.supabaseOrigin]);
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let allowed = origins.has(url.origin);
      let mutation = false;
      if (
        allowed &&
        url.origin === config.apiOrigin &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      ) {
        let body: unknown;
        try {
          body = request.postDataJSON();
        } catch {
          body = undefined;
        }
        const read = z
          .object({
            brandId: z.literal(pin.brand_id),
            input: z
              .object({
                action: z.enum([
                  'status',
                  'task_list',
                  'proposal_list',
                  'report_list',
                  'wake_list',
                ]),
              })
              .passthrough(),
          })
          .safeParse(body);
        mutation = input.allowedMutation?.(url.pathname, body) === true;
        allowed =
          request.method() === 'POST' &&
          ((url.pathname === WATCHMAN_MANAGE_ROUTE && read.success) || mutation);
      }
      if (
        allowed &&
        url.origin === config.supabaseOrigin &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      )
        allowed = false;
      if (allowed) {
        if (mutation) {
          try {
            assert(input.mutationCase, 'NATIVE_MUTATION_CASE_REQUIRED');
            await requireExperienceMutationOwnership(database, plan, input.mutationCase);
          } catch (error) {
            failed.push(redactExperienceError(error, secrets));
            refused.push('native-ownership-refused');
            await route.abort('blockedbyclient');
            return;
          }
        }
        await route.continue();
      } else {
        refused.push(
          `${request.method()} ${url.origin === config.apiOrigin ? url.pathname : 'unadmitted-origin'}`,
        );
        await route.abort('blockedbyclient');
      }
    });
    await page.routeWebSocket('**/*', async (socket) => {
      const url = new URL(socket.url());
      url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:';
      if (origins.has(url.origin)) socket.connectToServer();
      else {
        refused.push('unadmitted-websocket');
        await socket.close({ code: 1008, reason: 'Outside the local fixture scope.' });
      }
    });
    const identityResponse = await context.request.get(
      `${config.apiOrigin}/watchman-bench/identity`,
    );
    assert(identityResponse.status() === 200, 'REAL_SCOPED_SERVER_IDENTITY_REQUIRED');
    // Server identity binds the phase operator; each browser context proves its own real human below.
    const identity = z
      .object({
        run_id: z.literal(plan.run_id),
        brand_id: z.literal(plan.protected.brand_id),
        human_user_id: z.literal(plan.operator_human_id),
        supabase_origin: z.literal(config.supabaseOrigin),
        provider_calls: z.literal('closed'),
        external_effects: z.literal('closed'),
        worker_started: z.literal(false),
      })
      .parse(await identityResponse.json());
    assert(identity.run_id === config.runId, 'SERVER_RUN_MISMATCH');
    const result = await freshExperienceJson(
      page,
      config,
      pin,
      experienceUrl(),
      WATCHMAN_DASHBOARD_ROUTE,
    );
    const dashboard = watchmanDashboardSchema.parse(result.body);
    secrets.push(result.authorization, result.authorization.slice('Bearer '.length));
    assert(dashboard.brand_id === pin.brand_id, 'DASHBOARD_BRAND_MISMATCH');
    const user = await database.auth.getUser(result.authorization.slice('Bearer '.length));
    assert(
      !user.error &&
        user.data.user?.id === pin.human_id &&
        user.data.user.app_metadata.principal_type !== 'agent',
      'REAL_CURRENT_HUMAN_REQUIRED',
    );
    const read = async (path: string) => {
      assert(
        path.startsWith('/api/watchman/') || /^\/api\/goals\/[^/?]+$/.test(path),
        'UNADMITTED_READ_PATH',
      );
      const response = await context.request.get(`${config.apiOrigin}${path}`, {
        headers: { authorization: result.authorization },
      });
      assert(response.status() === 200, `REAL_READ_HTTP_${response.status()}`);
      return (await response.json()) as unknown;
    };
    await run({ page, database, authorization: result.authorization, dashboard, read });
    assert(refused.length === 0, `UNADMITTED_BROWSER_REQUESTS_${refused.length}`);
    info.annotations.push({
      type: 'boundary',
      description:
        'PARTIAL: real named Chrome/store subset only; no full U1/U2/U3/Q2 or provider/pilot acceptance.',
    });
    await info.attach('experience-coverage', {
      body: JSON.stringify({
        run_id: plan.run_id,
        prepared_cells: Object.keys(plan.cases),
        unrun: plan.unrun,
        gaps: EXPERIENCE_GAPS,
      }),
      contentType: 'application/json',
    });
  } catch (error) {
    failed.push(redactExperienceError(error, secrets));
  } finally {
    try {
      await context.close();
    } catch (error) {
      failed.push(redactExperienceError(error, secrets));
    }
    try {
      assert(
        (await protectedExperienceHash(database, plan)) === plan.protected.sha256,
        'PROTECTED_STATE_CHANGED',
      );
      assert(
        (await foreignExperienceHash(database, plan, owned)) === foreignBaseline,
        'FOREIGN_NATIVE_STATE_CHANGED',
      );
    } catch (error) {
      failed.push(redactExperienceError(error, secrets));
    }
  }
  if (failed.length)
    throw new AggregateError(failed, 'EXPERIENCE_TEST_CLOSE_OR_PRESERVATION_FAILED');
  await info.attach('experience-native-preservation', {
    body: JSON.stringify({
      run_id: plan.run_id,
      protected_sha256: plan.protected.sha256,
      foreign_before_and_after_sha256: foreignBaseline,
      positively_qualified_mutation: owned ?? null,
      after_context_closed: true,
    }),
    contentType: 'application/json',
  });
}
export function attentionControl(page: Page, title: string) {
  return page
    .locator('[data-watchman-pane="attention"] button[aria-expanded]')
    .filter({ has: page.getByText(title, { exact: true }) });
}
export async function submittedExperienceAction(
  page: Page,
  config: ExperienceConfig,
  act: () => Promise<unknown>,
) {
  const pending = page
    .waitForResponse(
      (response) =>
        new URL(response.url()).origin === config.apiOrigin &&
        new URL(response.url()).pathname === WATCHMAN_INTERACTION_ROUTE &&
        response.request().method() === 'POST',
    )
    .then(async (response) => ({
      status: response.status(),
      input: watchmanInteractionRequestSchema.parse(response.request().postDataJSON()),
      body: (await response.json()) as unknown,
    }));
  const [, result] = await Promise.all([act(), pending]);
  return result;
}
export async function persistedExperienceMessage(
  read: (path: string) => Promise<unknown>,
  brandId: string,
  watchmanId: string,
  conversationId: string,
  raw: unknown,
) {
  const message = watchmanUiMessageSchema.parse(raw);
  const history = watchmanConversationViewSchema.parse(
    await read(
      `${WATCHMAN_CONVERSATION_ROUTE}?${new URLSearchParams({ brandId, watchmanId, conversationId })}`,
    ),
  );
  assert(
    history.watchman_id === watchmanId &&
      history.conversation_id === conversationId &&
      history.messages.filter((item) => item.id === message.id).length === 1,
    'PERSISTED_MESSAGE_IDENTITY_MISSING',
  );
  assert(
    experienceHash(history.messages.find((item) => item.id === message.id)) ===
      experienceHash(message),
    'PERSISTED_MESSAGE_CHANGED',
  );
  return history;
}
export const readExperienceGoal = async (
  read: (path: string) => Promise<unknown>,
  goalId: string,
) => goalSnapshotSchema.parse(await read(`/api/goals/${encodeURIComponent(goalId)}`));
export const expectedQuestionAction = (
  requestId: string,
  version: number,
  answer: string,
): WatchmanUiAction => ({
  type: 'resolve_question',
  request_id: requestId,
  expected_version: version,
  value: answer,
});
export async function chooseQuestionAnswer(
  section: ReturnType<Page['locator']>,
  block: NonNullable<ExperiencePlan['cases']['question']>['block'],
  answer: string,
) {
  assert(block.type === 'question', 'QUESTION_REQUIRED');
  if (block.options.length) {
    const option = block.options.find((item) => item.value === answer);
    assert(option, 'EXACT_QUESTION_OPTION_REQUIRED');
    await section.getByRole('button', { name: option.label, exact: true }).click();
  } else {
    await section.getByLabel(labels.team.answer, { exact: true }).fill(answer);
    await section.getByRole('button', { name: labels.team.sendReply, exact: true }).click();
  }
}
export async function expectFreshHistory(
  page: Page,
  config: ExperienceConfig,
  pin: ContextPin,
  watchmanId: string,
  conversationId: string,
  messageId: string,
) {
  const restored = watchmanConversationViewSchema.parse(
    (
      await freshExperienceJson(
        page,
        config,
        pin,
        experienceUrl(watchmanId, conversationId),
        WATCHMAN_CONVERSATION_ROUTE,
        { watchmanId, conversationId },
      )
    ).body,
  );
  expect(restored.messages.filter((message) => message.id === messageId)).toHaveLength(1);
  const conversation = page.getByRole('region', { name: labels.team.conversation, exact: true });
  await expect(conversation).toBeVisible();
  for (const block of restored.messages.find((message) => message.id === messageId)?.blocks ?? []) {
    if (block.type === 'text')
      await expect(conversation.getByText(block.text, { exact: true }).first()).toBeVisible();
    if (block.type === 'work')
      await expect(
        conversation
          .getByRole('button')
          .filter({ has: page.getByText(block.work.title, { exact: true }) }),
      ).toBeVisible();
  }
}
export function rawExperienceChecksum(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
export async function readExperienceArtifact(url: URL, limit: number) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  assert(response.status === 200 && response.body, 'REAL_STORAGE_BYTES_REQUIRED');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      assert(size <= limit, 'IMMUTABLE_ARTIFACT_BYTE_BOUND');
      chunks.push(next.value);
    }
    assert(size === limit, 'IMMUTABLE_ARTIFACT_SIZE_MISMATCH');
    return new Uint8Array(Buffer.concat(chunks));
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
