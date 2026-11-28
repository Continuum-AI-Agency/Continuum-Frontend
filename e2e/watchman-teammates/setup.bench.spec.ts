import { randomUUID } from 'node:crypto';
import {
  goalExecutionRefSchema,
  WATCHMAN_CONVERSATION_ROUTE,
  WATCHMAN_DASHBOARD_ROUTE,
  WATCHMAN_INTERACTION_ROUTE,
  WATCHMAN_MANAGE_ROUTE,
  WATCHMAN_SETUP_ROUTE,
  watchmanConversationViewSchema,
  watchmanCreateResultSchema,
  watchmanDashboardSchema,
  watchmanSetupViewSchema,
  watchmanUiMessageSchema,
} from '@continuum/contracts';
import { expect, type Page, type Response, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import labels from '../../messages/automations/en.json';
import { watchmanBrowserPreflight } from './preflight';

// Run preflight.ts before Playwright so its existing webServer cannot start below admission.
const config = watchmanBrowserPreflight();
test.use({ storageState: config.statePath, trace: 'off', screenshot: 'off', video: 'off' });
test.describe.configure({ mode: 'serial' });
const pathname = (response: Response) => new URL(response.url()).pathname;
const db = () =>
  createClient(config.supabaseOrigin, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function readFreshDocumentJson(
  page: Page,
  url: string,
  matches: (response: Response) => boolean,
): Promise<unknown> {
  // Retire polling requests from the old document before arming its replacement.
  await page.goto('about:blank');
  const body = page
    .waitForResponse((response) => {
      const target = new URL(response.url());
      return (
        target.origin === config.apiOrigin &&
        target.searchParams.get('brandId') === config.brandId &&
        response.request().method() === 'GET' &&
        matches(response)
      );
    })
    .then(async (response) => {
      expect(response.status()).toBe(200);
      return (await response.json()) as unknown;
    });
  const [, result] = await Promise.all([page.goto(url), body]);
  return result;
}

async function submitSetup(page: Page) {
  const sent = page.waitForResponse(
    (response) =>
      pathname(response) === WATCHMAN_MANAGE_ROUTE && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: labels.team.createTeammate, exact: true }).click();
  const response = await sent;
  expect(response.status()).toBe(200);
  const input = response.request().postDataJSON() as {
    brandId: string;
    input: { action: string; create: { request_id: string } };
  };
  expect(input).toMatchObject({
    brandId: config.brandId,
    input: { action: 'create', create: { request_id: config.input.request_id } },
  });
  return z
    .object({ status: z.literal('ok'), result: watchmanCreateResultSchema })
    .parse(await response.json()).result;
}

test('real local setup recovers identity, retains paused work and renders persisted bounded cards', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const allowedOrigins = new Set([config.origin, config.apiOrigin, config.supabaseOrigin]);
  // Admission only: real local responses pass unchanged; external requests receive no substitute.
  await page.route('**/*', async (route) => {
    if (allowedOrigins.has(new URL(route.request().url()).origin)) await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.routeWebSocket('**/*', async (socket) => {
    const target = new URL(socket.url());
    target.protocol = target.protocol === 'ws:' ? 'http:' : 'https:';
    if (allowedOrigins.has(target.origin)) socket.connectToServer();
    else
      await socket.close({ code: 1008, reason: 'External connections are closed for this bench.' });
  });
  const identityResponse = await request.get(`${config.apiOrigin}/watchman-bench/identity`);
  expect(identityResponse.ok()).toBe(true);
  const identity = z
    .object({
      run_id: z.string().uuid(),
      brand_id: z.string().uuid(),
      human_user_id: z.string().uuid(),
      supabase_origin: z.string(),
      allowed_setup_ids: z.array(z.string().uuid()),
      provider_calls: z.literal('closed'),
      external_effects: z.literal('closed'),
      worker_started: z.literal(false),
    })
    .parse(await identityResponse.json());
  expect(identity).toMatchObject({
    run_id: config.runId,
    brand_id: config.brandId,
    supabase_origin: config.supabaseOrigin,
  });
  expect(identity.allowed_setup_ids).toContain(config.input.request_id);

  const dashboardRead = page.waitForResponse(
    (response) => pathname(response) === WATCHMAN_DASHBOARD_ROUTE,
  );
  const setupUrl = `${config.origin}/en/automations/watchman?${new URLSearchParams({ setupRequest: config.input.request_id })}`;
  await page.goto(setupUrl);
  const dashboardResponse = await dashboardRead;
  expect(new URL(dashboardResponse.url()).origin).toBe(config.apiOrigin);
  expect(watchmanDashboardSchema.parse(await dashboardResponse.json()).brand_id).toBe(
    config.brandId,
  );
  const authorization = dashboardResponse.request().headers().authorization;
  if (!authorization?.startsWith('Bearer '))
    throw new Error('The real browser dashboard read did not use its authenticated session.');
  const database = db();
  const human = await database.auth.getUser(authorization.slice('Bearer '.length));
  expect(human.error).toBeNull();
  expect(human.data.user?.id).toBe(identity.human_user_id);
  expect(human.data.user?.app_metadata?.principal_type).not.toBe('agent');

  const role = config.input.role ?? (config.input.kind === 'paid' ? 'performance' : 'content');
  const names = {
    content: labels.team.contentRole,
    performance: labels.team.performanceRole,
    gtm: labels.team.gtmRole,
    lead: labels.team.leadRole,
  };
  await expect(
    page.locator('#teammate-name').or(page.getByText(labels.team.chooseRole, { exact: true })),
  ).toBeVisible();
  if (await page.getByText(labels.team.chooseRole, { exact: true }).isVisible()) {
    await page
      .getByRole('button')
      .filter({ has: page.getByText(names[role], { exact: true }) })
      .click();
    await page.getByRole('button', { name: labels.team.continue, exact: true }).click();
  }
  const name = page.locator('#teammate-name');
  if (!(await name.evaluate((element) => (element as HTMLInputElement).readOnly))) {
    await name.fill(config.input.name);
    await page.locator('#teammate-brief').fill(config.input.instructions);
    await page.locator('#teammate-first-work').fill(config.input.first_assignment ?? '');
    await page.getByText(labels.team.moreOptions, { exact: true }).click();
    await page.locator('#teammate-timezone').fill(config.input.timezone);
    await page.locator('#teammate-budget').fill(String(config.input.budget_usd_month));
  }
  await expect(name).toHaveValue(config.input.name);
  await expect(page.locator('#teammate-brief')).toHaveValue(config.input.instructions);
  await expect(page.locator('#teammate-first-work')).toHaveValue(
    config.input.first_assignment ?? '',
  );
  const first = await submitSetup(page);
  expect(first.watchman_id).toBe(config.input.request_id);
  expect(first.status).toBe('paused');
  expect(first.setup.completed_stages).toHaveLength(4);
  expect(first.setup.readiness?.checks.find((check) => check.key === 'credential')?.status).toBe(
    'ready',
  );

  const readReceipt = async () => {
    const result = await database
      .schema('brand_profiles')
      .from('watchman_setup_attempts')
      .select('bot_user_id,first_assignment_receipt')
      .eq('request_id', config.input.request_id)
      .eq('brand_id', config.brandId)
      .single();
    expect(result.error).toBeNull();
    return z
      .object({
        bot_user_id: z.string().uuid(),
        first_assignment_receipt: z
          .object({
            goal_id: z.string(),
            work_node_id: z.string(),
            execution: goalExecutionRefSchema,
            status: z.literal('pending'),
          })
          .passthrough(),
      })
      .parse(result.data);
  };
  const persisted = await readReceipt();
  const bot = await database.auth.admin.getUserById(persisted.bot_user_id);
  expect(bot.error).toBeNull();
  expect(bot.data.user?.app_metadata).toMatchObject({
    principal_type: 'agent',
    watchman_setup_request_id: config.input.request_id,
  });
  const restored = watchmanSetupViewSchema.parse(
    await readFreshDocumentJson(
      page,
      setupUrl,
      (response) =>
        pathname(response) === WATCHMAN_SETUP_ROUTE &&
        new URL(response.url()).searchParams.get('requestId') === config.input.request_id,
    ),
  );
  expect(restored.input).toMatchObject(config.input);
  await expect(page.locator('#teammate-name')).toHaveAttribute('readonly', '');
  expect((await submitSetup(page)).watchman_id).toBe(first.watchman_id);
  expect(await readReceipt()).toEqual(persisted);

  const headers = { authorization };
  const dashboard = watchmanDashboardSchema.parse(
    await (
      await request.get(
        `${config.apiOrigin}${WATCHMAN_DASHBOARD_ROUTE}?${new URLSearchParams({ brandId: config.brandId })}`,
        { headers },
      )
    ).json(),
  );
  expect(
    dashboard.teammates.find((teammate) => teammate.profile.id === first.watchman_id)?.profile
      .status,
  ).toBe('paused');
  const work = dashboard.work.find(
    (item) => item.execution.workNodeId === persisted.first_assignment_receipt.work_node_id,
  );
  expect(work?.owner_watchman_id).toBe(first.watchman_id);
  if (!work) throw new Error('The real dashboard did not expose the persisted first assignment.');
  expect(work.execution).toEqual(persisted.first_assignment_receipt.execution);
  const conversationId = `browser-setup:${config.input.request_id}`;
  const open = await request.post(`${config.apiOrigin}${WATCHMAN_INTERACTION_ROUTE}`, {
    headers,
    data: {
      brand_id: config.brandId,
      watchman_id: first.watchman_id,
      conversation_id: conversationId,
      request_id: randomUUID(),
      action: { type: 'open_work', execution: work.execution },
    },
  });
  expect(open.status()).toBe(200);
  const opened = watchmanUiMessageSchema.parse(await open.json());
  expect(opened.blocks.length).toBeLessThanOrEqual(20);
  expect(opened.blocks.every((block) => block.type === 'text' || block.type === 'work')).toBe(true);
  const viewUrl = `${config.origin}/en/automations/watchman?${new URLSearchParams({ teammate: first.watchman_id, conversation: conversationId })}`;
  const history = watchmanConversationViewSchema.parse(
    await readFreshDocumentJson(
      page,
      viewUrl,
      (response) =>
        pathname(response) === WATCHMAN_CONVERSATION_ROUTE &&
        new URL(response.url()).searchParams.get('watchmanId') === first.watchman_id &&
        new URL(response.url()).searchParams.get('conversationId') === conversationId,
    ),
  );
  expect(history.messages.some((message) => message.id === opened.id)).toBe(true);
  const conversation = page.getByRole('region', { name: labels.team.conversation, exact: true });
  await expect(conversation).toBeVisible();
  await expect(
    conversation.getByText(labels.team.actionOpenedWork, { exact: true }).first(),
  ).toBeVisible();
  await expect(conversation).not.toContainText('"harnessRunId"');
  await expect(page.getByRole('combobox', { name: labels.team.filterRole })).toContainText(
    labels.team.allRoles,
  );
  await expect(page.getByRole('combobox', { name: labels.team.filterStatus })).toContainText(
    labels.team.allStates,
  );
  const teammateRegion = page.getByRole('region', { name: config.input.name, exact: true });
  await expect(teammateRegion).toContainText(labels.team.lifecycle.paused);
  await expect(teammateRegion).toContainText(labels.team.setupBlocked);
  const workCard = conversation.getByRole('button').filter({ hasText: work.title }).first();
  await expect(workCard).toBeVisible();
  await expect(conversation.locator('script, iframe, object, embed')).toHaveCount(0);
  const cardAction = page.waitForResponse(
    (response) =>
      pathname(response) === WATCHMAN_INTERACTION_ROUTE && response.request().method() === 'POST',
  );
  await workCard.click();
  const cardResponse = await cardAction;
  expect(cardResponse.status()).toBe(200);
  const clicked = watchmanUiMessageSchema.parse(await cardResponse.json());
  expect(clicked.blocks.length).toBeLessThanOrEqual(20);
  expect(cardResponse.request().postDataJSON()).toMatchObject({
    action: { type: 'open_work', execution: work.execution },
  });
  const reloadedHistory = await readFreshDocumentJson(
    page,
    viewUrl,
    (response) =>
      pathname(response) === WATCHMAN_CONVERSATION_ROUTE &&
      new URL(response.url()).searchParams.get('watchmanId') === first.watchman_id &&
      new URL(response.url()).searchParams.get('conversationId') === conversationId,
  );
  expect(
    watchmanConversationViewSchema
      .parse(reloadedHistory)
      .messages.some((message) => message.id === clicked.id),
  ).toBe(true);
  await expect(
    page
      .getByRole('region', { name: labels.team.conversation, exact: true })
      .getByRole('button')
      .filter({ hasText: work.title })
      .first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const panes = await page.locator('[data-watchman-pane]').evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
        }),
      );
      return (
        panes.length === 3 &&
        panes.every((pane, index) => {
          const previous = panes[index - 1];
          return (
            pane.left >= 0 &&
            pane.right <= 390 &&
            (index === 0 || (previous !== undefined && pane.top >= previous.bottom - 1))
          );
        })
      );
    })
    .toBe(true);
  await page
    .locator('[data-watchman-pane="attention"]')
    .getByRole('button')
    .filter({ hasText: work.title })
    .last()
    .click();
  await expect(page.locator('[data-watchman-pane="conversation"]')).toBeFocused();
  await expect(
    page
      .getByRole('region', { name: labels.team.conversation, exact: true })
      .getByRole('textbox', { name: labels.team.replyLabel }),
  ).toBeEditable();
  console.log(
    JSON.stringify({
      owner: config.owner,
      run_id: config.runId,
      capture_budget_bytes: 0,
      error_output_reservation_bytes: 2 * 1024 * 1024,
      output_supervision:
        'External owner must bound the fresh Playwright output and Next cache; this reservation is not a quota.',
      bucket: 'gs://continuum-production-477821-creative-benchmarks',
      prefix: `watchman-setup/${config.runId}/`,
      watchman_id: first.watchman_id,
      execution: work.execution,
      conversation_id: conversationId,
      status: 'real_setup_recovery_and_bounded_card_dom_verified',
      fixtures: 'retained',
      unexercised: [
        'interactive AI SDK provider turn',
        'autonomous Goal execution',
        'publishing, ad changes and external delivery',
      ],
    }),
  );
});
