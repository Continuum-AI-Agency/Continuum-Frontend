import { randomUUID } from 'node:crypto';
import {
  WATCHMAN_DASHBOARD_ROUTE,
  WATCHMAN_INTERACTION_ROUTE,
  WATCHMAN_MANAGE_ROUTE,
  watchmanDashboardSchema,
  watchmanUiMessageSchema,
} from '@continuum/contracts';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import labels from '../../messages/automations/en.json';
import {
  attentionControl,
  chooseQuestionAnswer,
  expectedQuestionAction,
  expectFreshHistory,
  experienceUrl,
  freshExperienceJson,
  persistedExperienceMessage,
  rawExperienceChecksum,
  readExperienceArtifact,
  readExperienceGoal,
  requireExperienceMutationOwnership,
  submittedExperienceAction,
  withExperienceBrowser,
} from './experienceBrowser';
import {
  experienceActionAllowed,
  experienceHash,
  loadExperiencePlan,
  requireExperienceCase,
  requireExperienceScope,
} from './experiencePlan';
import { watchmanBrowserPreflight } from './preflight';

const config = watchmanBrowserPreflight();
const plan = loadExperiencePlan(config.runId, config.owner);
requireExperienceScope(plan, 'work');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe.configure({ mode: 'serial', retries: 0 });
const assert: (value: unknown, code: string) => asserts value = (value, code) => {
  if (!value) throw new Error(code);
};

test('trusted question gesture persists one exact human Goal response and restores its saved history', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const fixture = requireExperienceCase(plan, 'question');
  assert(fixture.block.type === 'question', 'NATIVE_QUESTION_REQUIRED');
  const block = fixture.block;
  const action = expectedQuestionAction(block.request_id, block.version, fixture.answer);
  await withExperienceBrowser(
    {
      browser,
      info,
      config,
      plan,
      pin: fixture.context,
      mutationCase: 'question',
      allowedMutation: (path, body) =>
        path === WATCHMAN_INTERACTION_ROUTE && experienceActionAllowed(body, fixture, action),
    },
    async ({ page, dashboard, read }) => {
      const attention = dashboard.needs_you.find((item) => item.id === fixture.attention_id);
      assert(
        attention?.watchman_id === fixture.watchman_id &&
          attention.conversation_id === fixture.conversation_id &&
          experienceHash(attention.block) === experienceHash(block),
        'REAL_NATIVE_QUESTION_PIN_MISMATCH',
      );
      const before = await readExperienceGoal(read, fixture.execution.goalId);
      assert(
        before.revision === block.version &&
          before.requests.some(
            (request) => request.id === block.request_id && request.status === 'open',
          ),
        'CURRENT_GOAL_REQUEST_REQUIRED',
      );
      const button = attentionControl(page, attention.title);
      await button.click();
      const section = button
        .locator('..')
        .getByRole('region', { name: labels.team.question, exact: true });
      const result = await submittedExperienceAction(page, config, () =>
        chooseQuestionAnswer(section, block, fixture.answer),
      );
      expect(result.status).toBe(200);
      assert(
        experienceActionAllowed(result.input, fixture, action),
        'EXACT_TYPED_QUESTION_INPUT_REQUIRED',
      );
      const message = watchmanUiMessageSchema.parse(result.body);
      await persistedExperienceMessage(
        read,
        fixture.context.brand_id,
        fixture.watchman_id,
        fixture.conversation_id,
        message,
      );
      const after = await readExperienceGoal(read, fixture.execution.goalId);
      const response = after.requests.find((request) => request.id === block.request_id);
      assert(
        after.revision > before.revision &&
          response?.responses.filter(
            (item) =>
              item.responder.kind === 'human' &&
              item.responder.userId === fixture.context.human_id &&
              item.response === fixture.answer,
          ).length === 1,
        'EXACT_PERSISTED_GOAL_ANSWER_REQUIRED',
      );
      const saved = experienceHash(after.requests);
      await expectFreshHistory(
        page,
        config,
        fixture.context,
        fixture.watchman_id,
        fixture.conversation_id,
        message.id,
      );
      expect(
        experienceHash((await readExperienceGoal(read, fixture.execution.goalId)).requests),
      ).toBe(saved);
    },
  );
});

for (const decision of ['reject', 'approve'] as const)
  test(`trusted ${decision} gesture persists the exact native proposal decision without claiming effect execution`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000);
    const fixture = requireExperienceCase(plan, decision);
    assert(fixture.block.type === 'approval', 'NATIVE_APPROVAL_REQUIRED');
    const block = fixture.block;
    const action = {
      type: 'decide_approval' as const,
      proposal_id: block.proposal_id,
      operation_id: block.operation_id,
      expected_version: block.version,
      decision,
    };
    await withExperienceBrowser(
      {
        browser,
        info,
        config,
        plan,
        pin: fixture.context,
        mutationCase: decision,
        allowedMutation: (path, body) =>
          path === WATCHMAN_INTERACTION_ROUTE && experienceActionAllowed(body, fixture, action),
      },
      async ({ page, database, dashboard, read }) => {
        const attention = dashboard.needs_you.find((item) => item.id === fixture.attention_id);
        assert(
          attention?.watchman_id === fixture.watchman_id &&
            attention.conversation_id === fixture.conversation_id &&
            experienceHash(attention.block) === experienceHash(block),
          'REAL_NATIVE_APPROVAL_PIN_MISMATCH',
        );
        const proposal = async () => {
          const result = await database
            .schema('brand_profiles')
            .from('watchman_proposals')
            .select(
              'id,watchman_id,wake_id,execution_ref,kind,tool,input,status,decided_by,decided_at,executed_at,outcome,expires_at',
            )
            .eq('id', block.proposal_id)
            .eq('watchman_id', fixture.watchman_id)
            .single();
          assert(!result.error, 'REAL_NATIVE_PROPOSAL_READ_FAILED');
          return z
            .object({
              id: z.string(),
              watchman_id: z.string(),
              wake_id: z.string().uuid(),
              execution_ref: z.unknown(),
              kind: z.string(),
              tool: z.string(),
              input: z.record(z.string(), z.unknown()),
              status: z.string(),
              decided_by: z.string().nullable(),
              decided_at: z.string().nullable(),
              executed_at: z.string().nullable(),
              outcome: z.unknown(),
              expires_at: z.string(),
            })
            .parse(result.data);
        };
        const before = await proposal();
        assert(
          before.status === 'pending' &&
            before.kind === fixture.kind &&
            before.tool === fixture.tool &&
            experienceHash(before.input) === fixture.input_sha256 &&
            experienceHash(before.execution_ref) === experienceHash(fixture.execution) &&
            Date.parse(before.expires_at) > Date.now() + 30_000,
          'CURRENT_EXACT_NATIVE_PROPOSAL_REQUIRED',
        );
        if (decision === 'approve') {
          const owner = await database
            .schema('brand_profiles')
            .from('watchmen')
            .select('status,autonomy')
            .eq('id', fixture.watchman_id)
            .eq('brand_id', fixture.context.brand_id)
            .single();
          assert(
            !owner.error &&
              owner.data?.status === 'paused' &&
              fixture.kind === 'generate' &&
              fixture.tool === 'pipeline_invoke' &&
              typeof before.input.max_usd === 'number' &&
              Number.isFinite(before.input.max_usd) &&
              before.input.max_usd > 0 &&
              z.object({ generate: z.literal('approve') }).safeParse(owner.data.autonomy).success,
            'PAUSED_DECISION_ONLY_GENERATION_FIXTURE_REQUIRED',
          );
        }
        const button = attentionControl(page, attention.title);
        await button.click();
        const control = button
          .locator('..')
          .getByRole('region', { name: labels.team.approval, exact: true })
          .getByRole('button', { name: labels.team[decision], exact: true });
        const result = await submittedExperienceAction(page, config, () => control.click());
        expect(result.status).toBe(200);
        assert(
          experienceActionAllowed(result.input, fixture, action),
          'EXACT_NATIVE_DECISION_INPUT_REQUIRED',
        );
        const after = await proposal();
        assert(
          after.status === (decision === 'approve' ? 'approved' : 'rejected') &&
            after.decided_by === fixture.context.human_id &&
            after.decided_at !== null &&
            after.executed_at === null &&
            experienceHash(after.input) === fixture.input_sha256,
          'PERSISTED_HUMAN_DECISION_REQUIRED',
        );
        await persistedExperienceMessage(
          read,
          fixture.context.brand_id,
          fixture.watchman_id,
          fixture.conversation_id,
          result.body,
        );
        await expectFreshHistory(
          page,
          config,
          fixture.context,
          fixture.watchman_id,
          fixture.conversation_id,
          watchmanUiMessageSchema.parse(result.body).id,
        );
        expect(experienceHash(await proposal())).toBe(experienceHash(after));
        info.annotations.push({
          type: 'coverage',
          description:
            'Version-zero native proposal input/Goal/decision persistence only; no general content-hash approval, publish/optimize or executed-effect claim.',
        });
      },
    );
  });

test('older persisted question control is disabled and actual stale API input cannot mutate its Goal', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const fixture = requireExperienceCase(plan, 'stale');
  assert(fixture.block.type === 'question', 'OLDER_NATIVE_QUESTION_REQUIRED');
  const block = fixture.block;
  await withExperienceBrowser(
    { browser, info, config, plan, pin: fixture.context, mutationCase: 'stale' },
    async ({ page, database, dashboard, authorization, read }) => {
      const live = dashboard.needs_you.find((item) => item.id === fixture.attention_id)?.block;
      assert(
        live?.type === 'question' &&
          live.request_id === block.request_id &&
          live.version === fixture.current_version,
        'GENUINE_NEWER_REQUEST_REQUIRED',
      );
      const before = await readExperienceGoal(read, fixture.execution.goalId);
      const history = (
        await freshExperienceJson(
          page,
          config,
          fixture.context,
          experienceUrl(fixture.watchman_id, fixture.conversation_id),
          '/api/watchman/conversation',
          { watchmanId: fixture.watchman_id, conversationId: fixture.conversation_id },
        )
      ).body;
      const parsed = z
        .object({ messages: z.array(z.object({ blocks: z.array(z.unknown()) }).passthrough()) })
        .passthrough()
        .parse(history);
      assert(
        parsed.messages
          .flatMap((message) => message.blocks)
          .filter((candidate) => experienceHash(candidate) === experienceHash(block)).length === 1,
        'ONE_GENUINE_STORED_OLDER_CARD_REQUIRED',
      );
      const section = page
        .getByRole('region', { name: labels.team.conversation, exact: true })
        .getByRole('region', { name: labels.team.question, exact: true })
        .filter({ hasText: block.question });
      await expect(section).toHaveCount(1);
      for (const button of await section.getByRole('button').all())
        await expect(button).toBeDisabled();
      await requireExperienceMutationOwnership(database, plan, 'stale');
      const stale = await page.request.post(`${config.apiOrigin}${WATCHMAN_INTERACTION_ROUTE}`, {
        headers: { authorization },
        data: {
          brand_id: fixture.context.brand_id,
          watchman_id: fixture.watchman_id,
          conversation_id: fixture.conversation_id,
          request_id: randomUUID(),
          action: expectedQuestionAction(block.request_id, block.version, fixture.answer),
        },
      });
      expect(stale.status()).toBe(409);
      const after = await readExperienceGoal(read, fixture.execution.goalId);
      expect(after.revision).toBe(before.revision);
      expect(experienceHash(after.requests)).toBe(experienceHash(before.requests));
      info.annotations.push({
        type: 'coverage',
        description:
          'Disabled stale Chrome control plus real authenticated stale API refusal; no forged DOM event or modified HTTP response.',
      });
    },
  );
});

test('weekly/daily UI responsibility persists once on a fresh paused profile and remains unfired', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const fixture = requireExperienceCase(plan, 'recurrence');
  const cron = fixture.timing === 'weekly' ? '0 9 * * 1' : '0 9 * * *';
  const expected = {
    brandId: fixture.context.brand_id,
    input: {
      action: 'task_add',
      watchman_id: fixture.watchman_id,
      task: {
        title: fixture.instruction.slice(0, 120),
        instruction: fixture.instruction,
        condition: { type: 'schedule', cron },
        deliver: { emails: [], member_user_ids: [] },
        review: true,
      },
    },
  };
  await withExperienceBrowser(
    {
      browser,
      info,
      config,
      plan,
      pin: fixture.context,
      mutationCase: 'recurrence',
      allowedMutation: (path, body) =>
        path === WATCHMAN_MANAGE_ROUTE && experienceHash(body) === experienceHash(expected),
    },
    async ({ page, database, read }) => {
      const owner = await database
        .schema('brand_profiles')
        .from('watchmen')
        .select('status,name,timezone')
        .eq('id', fixture.watchman_id)
        .eq('brand_id', fixture.context.brand_id)
        .single();
      assert(
        !owner.error && owner.data?.status === 'paused' && owner.data.timezone === fixture.timezone,
        'FRESH_PAUSED_RESPONSIBILITY_OWNER_REQUIRED',
      );
      const tasks = async () => {
        const result = await database
          .schema('brand_profiles')
          .from('watchman_tasks')
          .select('*')
          .eq('watchman_id', fixture.watchman_id)
          .eq('instruction', fixture.instruction)
          .order('id');
        assert(!result.error, 'REAL_TASK_READ_FAILED');
        return z.array(z.record(z.string(), z.unknown())).parse(result.data);
      };
      assert((await tasks()).length === 0, 'FRESH_RECURRENCE_REQUIRED');
      await freshExperienceJson(
        page,
        config,
        fixture.context,
        experienceUrl(fixture.watchman_id),
        WATCHMAN_DASHBOARD_ROUTE,
      );
      await page
        .locator('[data-watchman-pane="conversation"]')
        .getByRole('button', { name: labels.team.giveWork, exact: true })
        .click();
      await page.getByLabel(labels.team.whatToDo, { exact: true }).fill(fixture.instruction);
      await page.locator('#teammate-timing').click();
      await page
        .getByRole('option', {
          name: fixture.timing === 'weekly' ? labels.team.everyMonday : labels.team.everyDay,
          exact: true,
        })
        .click();
      await expect(page.getByText(labels.team.recurringNotice, { exact: true })).toBeVisible();
      const pending = page.waitForResponse(
        (response) =>
          new URL(response.url()).origin === config.apiOrigin &&
          new URL(response.url()).pathname === WATCHMAN_MANAGE_ROUTE &&
          response.request().method() === 'POST' &&
          experienceHash(response.request().postDataJSON()) === experienceHash(expected),
      );
      await page.getByRole('button', { name: labels.team.saveResponsibility, exact: true }).click();
      expect((await pending).status()).toBe(200);
      const stored = await tasks();
      assert(
        stored.length === 1 &&
          stored[0]?.review === true &&
          stored[0].active === true &&
          stored[0].last_fired_at === null &&
          experienceHash(stored[0].deliver) ===
            experienceHash({ emails: [], member_user_ids: [fixture.context.human_id] }) &&
          stored[0].created_by === 'person' &&
          stored[0].created_by_user === fixture.context.human_id &&
          experienceHash(stored[0].condition) === experienceHash({ type: 'schedule', cron }),
        'EXACT_UNFIRED_RESPONSIBILITY_REQUIRED',
      );
      const before = experienceHash(stored);
      await freshExperienceJson(
        page,
        config,
        fixture.context,
        experienceUrl(fixture.watchman_id),
        WATCHMAN_DASHBOARD_ROUTE,
      );
      await page.getByRole('button', { name: labels.team.settings, exact: true }).click();
      await expect(
        page.getByText(fixture.instruction.slice(0, 120), { exact: true }),
      ).toBeVisible();
      expect(experienceHash(await tasks())).toBe(before);
      const result = watchmanDashboardSchema.parse(
        await read(
          `${WATCHMAN_DASHBOARD_ROUTE}?${new URLSearchParams({ brandId: fixture.context.brand_id })}`,
        ),
      );
      expect(
        result.teammates.find((entry) => entry.profile.id === fixture.watchman_id)?.profile.status,
      ).toBe('paused');
      info.annotations.push({
        type: 'coverage',
        description:
          'Saved recurrence and reload only; firing, reporting, timezone transition and autonomous Goal completion remain UNRUN.',
      });
    },
  );
});

test('existing native attention link continues to its exact immutable Goal artifact and real Storage bytes', async ({
  browser,
}, info) => {
  test.setTimeout(120_000);
  const fixture = requireExperienceCase(plan, 'artifact');
  await withExperienceBrowser(
    { browser, info, config, plan, pin: fixture.context },
    async ({ page, dashboard, read }) => {
      const attention = dashboard.needs_you.find((item) => item.id === fixture.attention_id);
      assert(
        attention?.watchman_id === fixture.watchman_id && attention.href && !attention.block,
        'REAL_NATIVE_GOAL_LINK_REQUIRED',
      );
      const target = new URL(attention.href, config.origin);
      assert(
        target.origin === config.origin &&
          target.pathname === `/goals/${encodeURIComponent(fixture.goal_id)}`,
        'EXACT_GOAL_LINK_REQUIRED',
      );
      const snapshot = await readExperienceGoal(read, fixture.goal_id);
      const document = snapshot.artifactDocuments.find(
        (item) => item.artifactId === fixture.artifact_id,
      );
      assert(
        document?.libraryAssetId === fixture.asset_id &&
          document.versionId === fixture.version_id &&
          document.contentUrl,
        'EXACT_IMMUTABLE_ARTIFACT_REQUIRED',
      );
      const download = new URL(document.contentUrl);
      assert(
        download.origin === config.supabaseOrigin && download.pathname.startsWith('/storage/v1/'),
        'LOCAL_NATIVE_STORAGE_REQUIRED',
      );
      const button = attentionControl(page, attention.title);
      await button.click();
      await button
        .locator('..')
        .getByRole('link', { name: labels.team.openDetails, exact: true })
        .click();
      await expect(page).toHaveURL(target.toString());
      const artifact = page
        .getByRole('button')
        .filter({ has: page.getByText(fixture.title, { exact: true }) });
      await expect(artifact).toHaveCount(1);
      await artifact.click();
      await expect(artifact).toHaveAttribute('aria-current', 'true');
      await expect(page.getByRole('heading', { name: fixture.title, exact: true })).toBeVisible();
      await expect(page.getByText(fixture.excerpt, { exact: true }).first()).toBeVisible();
      expect(rawExperienceChecksum(await readExperienceArtifact(download, fixture.bytes))).toBe(
        fixture.sha256,
      );
      const after = await readExperienceGoal(read, fixture.goal_id);
      expect(after.revision).toBe(snapshot.revision);
      const version = after.artifactDocuments.find(
        (item) => item.artifactId === fixture.artifact_id,
      );
      expect(version?.versionId).toBe(fixture.version_id);
      info.annotations.push({
        type: 'coverage',
        description:
          'Existing Goal link, rendered artifact title and exact immutable bytes; artifact editing and provider production remain UNRUN.',
      });
    },
  );
});
