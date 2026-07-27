import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintSessionWithPassword } from './support/auth';

/**
 * Canonical Multiplayer Jaina Goal orchestrator bench.
 *
 * Real boundaries: browser -> Frontend -> Fastify -> Postgres -> bounded Jaina
 * child turns -> Postgres -> Frontend. The test owns and deliberately restarts
 * Fastify to prove the Goal/work-node/harness identity survives process and
 * conversation-session replacement.
 *
 * This bench is intentionally not a deterministic unit fixture. It exercises a
 * real model turn and fails if Jaina does not create two typed stakeholder waits
 * and one typed work product for the three-node tracer.
 */

const OWNER_EMAIL = 'local@continuum.test';
const OWNER_PASSWORD = 'localdev123';
const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const BACKEND_PORT = Number(process.env.GOALS_BENCH_BACKEND_PORT ?? 4401);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const GOAL_TITLE = `Goal orchestrator bench ${Date.now()}`;

type DbRecord = Record<string, unknown>;
type BenchState = {
  goalId: string;
  requestId: string;
  requestWorkNodeId: string;
  priorRunId: string;
  priorSessionId: string;
  completedArtifactTitle: string;
  rationaleSummary: string;
};

let backend: ChildProcess | null = null;
let firstContext: BrowserContext | null = null;
let secondContext: BrowserContext | null = null;
let state: BenchState | null = null;
let previousActiveBrandId: string | null = null;

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[goals:orchestrator:e2e:bench] Missing local Supabase env. Run bun run supabase:env:local.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function waitForBackend(): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${BACKEND_URL}/healthz`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 120_000, intervals: [250, 500, 1_000] },
    )
    .toBe(true);
}

async function startBackend(): Promise<void> {
  if (backend) throw new Error('Goal bench backend is already running.');
  backend = spawn('bun', ['--no-env-file', 'scripts/run-backend.ts', '--supabase=local'], {
    cwd: path.resolve(process.cwd(), '../Continuum-Backend'),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout?.on('data', (chunk) => process.stdout.write(`[goal-bench:be] ${String(chunk)}`));
  backend.stderr?.on('data', (chunk) => process.stderr.write(`[goal-bench:be] ${String(chunk)}`));
  await waitForBackend();
}

async function stopBackend(): Promise<void> {
  const processToStop = backend;
  backend = null;
  if (!processToStop || processToStop.exitCode !== null) return;
  processToStop.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      processToStop.kill('SIGKILL');
      resolve();
    }, 10_000);
    processToStop.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function newSignedInPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const auth = await mintSessionWithPassword(OWNER_EMAIL, OWNER_PASSWORD);
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await context.addCookies(auth.cookies);
  return { context, page: await context.newPage() };
}

function rows(value: unknown): DbRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is DbRecord =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

async function createGoalThroughJaina(page: Page): Promise<string> {
  await page.goto('/scale?tab=jaina');
  await expect(page.getByLabel('Jaina workspace view')).toBeVisible();
  await page.getByRole('radio', { name: 'Goals' }).click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByLabel('Campaign name').fill(GOAL_TITLE);
  await page
    .getByLabel('Business objective')
    .fill(
      'Create a Phoenix acquisition campaign with a grounded strategy, an explicitly authorized budget, and a measurable launch plan.',
    );
  await page
    .getByLabel('Definition of done')
    .fill(
      'A typed campaign artifact passes every required checklist\nBudget and strategy stakeholders provide explicit durable input\nJaina publishes assumptions, tradeoffs, risks, unknowns, and confidence',
    );
  await page.getByRole('button', { name: 'Create Goal' }).click();
  await expect(page).toHaveURL(/\/goals\/[^/?]+/, { timeout: 120_000 });
  const goalId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
  if (!goalId) throw new Error('Created Goal route did not expose a Goal ID.');
  await expect(page.getByRole('heading', { name: GOAL_TITLE })).toBeVisible();
  return decodeURIComponent(goalId);
}

async function shapeThreeNodeTracer(supabase: SupabaseClient, goalId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .schema('agent_workspace')
          .from('goal_work_nodes')
          .select('id,record,required_capability')
          .eq('goal_id', goalId);
        if (error) throw error;
        return rows(data).length;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThanOrEqual(3);

  await stopBackend();
  const { data, error } = await supabase
    .schema('agent_workspace')
    .from('goal_work_nodes')
    .select('id,record,required_capability')
    .eq('goal_id', goalId)
    .order('created_at');
  if (error) throw error;
  const nodeRows = rows(data);
  const selected = nodeRows.slice(0, 3);
  if (selected.length !== 3) throw new Error('The campaign template did not compile three nodes.');
  const selectedIds = selected.map((row) => String(row.id));

  await supabase.schema('jaina').from('jaina_conversation_runs').delete().eq('goal_id', goalId);
  await supabase.schema('agent_workspace').from('run_checkpoints').delete().eq('goal_id', goalId);
  await supabase.schema('agent_workspace').from('input_requests').delete().eq('goal_id', goalId);
  await supabase
    .schema('agent_workspace')
    .from('goal_work_node_dependencies')
    .delete()
    .in('work_node_id', selectedIds);
  await supabase
    .schema('agent_workspace')
    .from('goal_work_nodes')
    .update({ status: 'cancelled', lease_owner: null, lease_token: null, lease_expires_at: null })
    .eq('goal_id', goalId)
    .not('id', 'in', `(${selectedIds.join(',')})`);

  const objectives = [
    'Complete this artifact using the durable Goal evidence and exact typed artifact schema. Submit it only through goal_submit_work_product with a public rationale.',
    `Before drafting, call goal_request_input for a strategy choice from human ${OWNER_ID}. Use an exact choice response with two options and the checklist IDs for this artifact; then stop.`,
    `Before drafting, call goal_request_input for budget authorization from human ${OWNER_ID}. Use an exact USD money response and the checklist IDs for this artifact; then stop.`,
  ];
  for (const [index, row] of selected.entries()) {
    const record = {
      ...(row.record as DbRecord),
      status: 'pending',
      attempt: 0,
      objective: objectives[index],
      dependencyIds: [],
    };
    const { error: updateError } = await supabase
      .schema('agent_workspace')
      .from('goal_work_nodes')
      .update({
        status: 'pending',
        attempt: 0,
        retry_at: null,
        last_error: null,
        lease_owner: null,
        lease_token: null,
        lease_expires_at: null,
        record,
      })
      .eq('id', row.id);
    if (updateError) throw updateError;
  }

  const { error: wakeError } = await supabase
    .schema('agent_workspace')
    .rpc('wake_goal_supervisor', {
      p_goal_id: goalId,
      p_reason: 'orchestrator_e2e_three_node_tracer',
    });
  if (wakeError) throw wakeError;
  await startBackend();
}

async function observeTracerOutcome(supabase: SupabaseClient, goalId: string): Promise<BenchState> {
  await expect
    .poll(
      async () => {
        const [requests, results] = await Promise.all([
          supabase
            .schema('agent_workspace')
            .from('input_requests')
            .select('id')
            .eq('goal_id', goalId)
            .eq('status', 'open'),
          supabase
            .schema('agent_workspace')
            .from('goal_work_node_results')
            .select('id')
            .eq('goal_id', goalId)
            .eq('outcome', 'draft_ready'),
        ]);
        if (requests.error) throw requests.error;
        if (results.error) throw results.error;
        return { requests: rows(requests.data).length, results: rows(results.data).length };
      },
      { timeout: 12 * 60_000, intervals: [2_000, 5_000] },
    )
    .toEqual(expect.objectContaining({ requests: 2, results: 1 }));

  const [requestResult, resultResult] = await Promise.all([
    supabase
      .schema('agent_workspace')
      .from('input_requests')
      .select('id,prompt')
      .eq('goal_id', goalId)
      .eq('status', 'open')
      .order('created_at')
      .limit(1)
      .single(),
    supabase
      .schema('agent_workspace')
      .from('goal_work_node_results')
      .select('work_node_id,artifact_id,produced_version_id,rationale')
      .eq('goal_id', goalId)
      .eq('outcome', 'draft_ready')
      .order('created_at')
      .limit(1)
      .single(),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (resultResult.error) throw resultResult.error;

  const { data: checkpoint, error: checkpointError } = await supabase
    .schema('agent_workspace')
    .from('run_checkpoints')
    .select('work_node_id,last_child_run_id,jaina_session_id')
    .eq('goal_id', goalId)
    .eq('blocked_request_id', requestResult.data.id)
    .single();
  if (checkpointError) throw checkpointError;
  const { data: artifact, error: artifactError } = await supabase
    .schema('agent_workspace')
    .from('artifact_refs')
    .select('title')
    .eq('id', resultResult.data.artifact_id)
    .single();
  if (artifactError) throw artifactError;
  const rationale = resultResult.data.rationale as DbRecord | null;
  if (
    !checkpoint.work_node_id ||
    !checkpoint.last_child_run_id ||
    !checkpoint.jaina_session_id ||
    typeof rationale?.summary !== 'string'
  ) {
    throw new Error('Tracer outcome is missing Goal execution identity or public rationale.');
  }
  return {
    goalId,
    requestId: requestResult.data.id,
    requestWorkNodeId: checkpoint.work_node_id,
    priorRunId: checkpoint.last_child_run_id,
    priorSessionId: checkpoint.jaina_session_id,
    completedArtifactTitle: artifact.title,
    rationaleSummary: rationale.summary,
  };
}

async function respondFromSecondBrowser(page: Page, bench: BenchState): Promise<void> {
  await page.goto(`/goals/${encodeURIComponent(bench.goalId)}?focus=request:${bench.requestId}`);
  await page.getByRole('tab', { name: 'People & review' }).click();
  await page.getByRole('button', { name: 'Respond' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Respond to this Goal' });
  const textInput = dialog.getByLabel('Your input');
  if (await textInput.isVisible().catch(() => false)) {
    await textInput.fill('Phoenix is the approved first market.');
  } else if (
    await dialog
      .getByPlaceholder('0.00')
      .isVisible()
      .catch(() => false)
  ) {
    await dialog.getByPlaceholder('0.00').fill('5000.00');
  } else {
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();
  }
  await dialog.getByRole('button', { name: 'Share response' }).click();
  await expect(dialog).toBeHidden({ timeout: 120_000 });
}

async function verifyRotatedSessionAndRenderedRationale(
  supabase: SupabaseClient,
  page: Page,
  bench: BenchState,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .schema('jaina')
          .from('jaina_conversation_runs')
          .select('run_id,session_id,goal_id,goal_work_node_id,parent_run_id')
          .eq('goal_id', bench.goalId)
          .eq('goal_work_node_id', bench.requestWorkNodeId)
          .neq('run_id', bench.priorRunId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { timeout: 5 * 60_000, intervals: [1_000, 2_000] },
    )
    .toEqual(
      expect.objectContaining({
        goal_id: bench.goalId,
        goal_work_node_id: bench.requestWorkNodeId,
        parent_run_id: bench.priorRunId,
        session_id: expect.not.stringContaining(bench.priorSessionId),
      }),
    );

  await page.reload();
  await page.getByRole('button', { name: new RegExp(bench.completedArtifactTitle, 'i') }).click();
  await page.getByRole('tab', { name: 'Rationale' }).click();
  await expect(page.getByText(bench.rationaleSummary, { exact: true })).toBeVisible();
  await expect(page.getByText('Assumptions', { exact: true })).toBeVisible();
  await expect(page.getByText('Tradeoffs', { exact: true })).toBeVisible();
  await expect(page.getByText('Risks and unknowns', { exact: true })).toBeVisible();
}

async function cleanup(supabase: SupabaseClient): Promise<void> {
  if (state?.goalId) {
    const { data: artifacts } = await supabase
      .schema('agent_workspace')
      .from('artifact_refs')
      .select('library_asset_id')
      .eq('goal_id', state.goalId);
    const assetIds = rows(artifacts).map((artifact) => String(artifact.library_asset_id));
    await supabase.schema('agent_workspace').from('goals').delete().eq('id', state.goalId);
    if (assetIds.length > 0) {
      await supabase.schema('media').from('assets').delete().in('id', assetIds);
    }
  }
  if (previousActiveBrandId) {
    await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert(
        { user_id: OWNER_ID, active_brand_id: previousActiveBrandId },
        { onConflict: 'user_id' },
      );
  }
}

test.describe('Goal-owned Jaina orchestrator', () => {
  test.describe.configure({ mode: 'serial', timeout: 20 * 60_000 });

  test.beforeAll(async ({ browser }) => {
    const supabase = admin();
    const { data: preference } = await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .select('active_brand_id')
      .eq('user_id', OWNER_ID)
      .maybeSingle();
    previousActiveBrandId = preference?.active_brand_id ?? null;
    await supabase
      .schema('brand_profiles')
      .from('user_brand_preferences')
      .upsert({ user_id: OWNER_ID, active_brand_id: BRAND_ID }, { onConflict: 'user_id' });
    await startBackend();
    firstContext = (await newSignedInPage(browser)).context;
  });

  test('survives backend restart and rotates the child session without losing Goal identity', async ({
    browser,
  }) => {
    if (!firstContext) throw new Error('First browser context was not initialized.');
    const firstPage = firstContext.pages()[0] ?? (await firstContext.newPage());
    const goalId = await createGoalThroughJaina(firstPage);
    await shapeThreeNodeTracer(admin(), goalId);
    state = await observeTracerOutcome(admin(), goalId);

    await stopBackend();
    await startBackend();
    const second = await newSignedInPage(browser);
    secondContext = second.context;
    await respondFromSecondBrowser(second.page, state);
    await verifyRotatedSessionAndRenderedRationale(admin(), second.page, state);
  });

  test.afterAll(async () => {
    await firstContext?.close();
    await secondContext?.close();
    await cleanup(admin());
    await stopBackend();
  });
});
