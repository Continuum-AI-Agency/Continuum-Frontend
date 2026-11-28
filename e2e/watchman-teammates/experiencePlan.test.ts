import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { watchmanDashboardSchema } from '@continuum/contracts';
import { experiencePreservationHash } from './experienceBrowser';
import {
  assertExperienceNativeGoal,
  assertExperienceNativeOwner,
  assertExperienceRoster,
  EXPERIENCE_GAPS,
  experienceActionAllowed,
  experienceAssignmentGoalId,
  experienceHash,
  experiencePlanSchema,
  redactExperienceError,
  requireExperienceCase,
  requireExperienceScope,
} from './experiencePlan';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = {
  brand_id: id(1),
  human_id: id(2),
  storage_state: '/unit-only/real-auth-required.json',
};
const block = {
  id: 'unit-question',
  type: 'question' as const,
  request_id: `experience:${id(3)}:native-question`,
  version: 3,
  question: 'Unit fixture only',
  options: [],
};
const marker = `experience:${id(3)}:`;
const setupInput = () => ({
  request_id: id(30),
  kind: 'organic' as const,
  role: 'content' as const,
  name: 'Native owned fixture',
  instructions: `${marker}owned setup`,
  first_assignment: `${marker}first assignment`,
  timezone: 'UTC',
  budget_usd_month: 1,
});
const ownership = () => ({
  setup_request_id: id(30),
  bot_user_id: id(31),
  setup_input_sha256: experienceHash(setupInput()),
});
const origin = () => ({
  assignment_request_id: `${marker}question`,
  wake_id: id(32),
  inbox_id: id(33),
  attempt: 1,
});
const goalId = () =>
  experienceAssignmentGoalId(
    context.brand_id,
    context.human_id,
    id(30),
    origin().assignment_request_id,
  );
const card = () => ({
  context,
  watchman_id: id(30),
  conversation_id: 'unit-conversation',
  attention_id: 'unit-attention',
  ownership: ownership(),
  goal_origin: origin(),
  execution: {
    goalId: goalId(),
    workNodeId: 'fresh-node',
    harnessRunId: 'fresh-harness',
  },
  block,
});
const plan = () => ({
  run_id: id(3),
  prepared_after: '2026-11-27T00:00:00.000Z',
  owner: 'source units only',
  operator_human_id: context.human_id,
  gcs_prefix: `gs://continuum-production-477821-creative-benchmarks/watchman-experience/${id(3)}/`,
  origin: 'NATIVE_PREPARED_LOCAL_FIXTURES' as const,
  protected: {
    brand_id: context.brand_id,
    watchman_ids: [id(4), id(5), id(6), id(7)],
    goal_ids: ['original0', 'original1', 'original2', 'original3'],
    artifact_ids: ['artifact0', 'artifact1', 'artifact2', 'artifact3'],
    asset_ids: [id(8), id(9), id(10), id(11)],
    version_ids: [id(12), id(13), id(14), id(15)],
    sha256: 'a'.repeat(64),
  },
  cases: { question: { ...card(), answer: 'Unit answer' } },
  unrun: { approve: 'Native pending fixture not prepared.' },
});
const approval = () => ({
  ...card(),
  block: {
    id: 'unit-approval',
    type: 'approval' as const,
    proposal_id: id(40),
    operation_id: id(40),
    version: 0,
    summary: 'Unit decision fixture',
    facts: [{ label: 'Scope', value: 'Unit only' }],
    expires_at: '2099-01-01T00:00:00Z',
  },
  input_sha256: 'b'.repeat(64),
  kind: 'generate' as const,
  tool: 'pipeline_invoke',
});
const dashboard = () =>
  watchmanDashboardSchema.parse({
    brand_id: context.brand_id,
    generated_at: '2026-11-27T00:00:00Z',
    can_manage: true,
    partial: false,
    issues: [],
    work: [],
    needs_you: [],
    teammates: ['content', 'performance', 'gtm', 'lead'].map((role, i) => ({
      profile: {
        id: id(4 + i),
        brand_id: context.brand_id,
        name: `Native ${role}`,
        role,
        execution_lane: role === 'performance' ? 'paid' : 'organic',
        instructions: 'unit source only',
        timezone: 'UTC',
        status: 'paused',
      },
      lifecycle: 'paused',
      readiness: null,
      budget: null,
      active_work_count: 0,
      waiting_count: 0,
      last_activity_at: null,
    })),
  });

const nativeOwner = () => {
  const created_at = '2026-11-27T00:01:00.000Z';
  return {
    profile: {
      ...setupInput(),
      id: id(30),
      brand_id: context.brand_id,
      bot_user_id: id(31),
      created_by: context.human_id,
      created_at,
      status: 'paused',
    },
    setup: {
      request_id: id(30),
      watchman_id: id(30),
      brand_id: context.brand_id,
      bot_user_id: id(31),
      created_by: context.human_id,
      created_at,
      status: 'ready',
      completed_stages: ['principal', 'teammate', 'credential', 'responsibilities'],
      input: setupInput(),
      first_assignment_receipt: {
        goal_id: 'first-goal',
        work_node_id: 'first-node',
        execution: {
          goalId: 'first-goal',
          workNodeId: 'first-node',
          harnessRunId: 'first-harness',
        },
      },
    },
    bot: {
      id: id(31),
      app_metadata: { principal_type: 'agent', watchman_setup_request_id: id(30) },
    },
    memberships: [context.human_id, id(31)].map((user_id) => ({
      user_id,
      brand_profile_id: context.brand_id,
      role: 'admin',
    })),
  };
};
const nativeGoal = () => {
  const execution = card().execution;
  const created_at = '2026-11-27T00:02:00.000Z';
  const actor = { kind: 'human', userId: context.human_id };
  const objective = `${marker}owned question assignment`;
  return {
    goal: {
      id: execution.goalId,
      brand_id: context.brand_id,
      kind: 'watchman-assignment',
      created_at,
      created_by: actor,
      objective,
    },
    creation: {
      goal_id: execution.goalId,
      brand_id: context.brand_id,
      created_at,
      type: 'goal.created',
      actor,
      command_id: `create:${execution.goalId}:${'b'.repeat(64)}`,
      data: {
        goal: { id: execution.goalId, brandId: context.brand_id, objective, createdBy: actor },
      },
    },
    node: {
      id: execution.workNodeId,
      brand_id: context.brand_id,
      goal_id: execution.goalId,
      workstream_id: 'stream',
      executor: { kind: 'specialist', agent: `watchman:${id(30)}` },
    },
    checkpoint: {
      id: execution.harnessRunId,
      brand_id: context.brand_id,
      goal_id: execution.goalId,
      work_node_id: execution.workNodeId,
      harness_key: `work-node:${execution.workNodeId}`,
      execution_user_id: context.human_id,
      assignment_id: null,
      last_child_run_id: id(33),
      checkpoint: { watchman_id: id(30), execution_ref: execution },
    },
    assignments: [
      {
        id: 'assignment',
        goal_id: execution.goalId,
        brand_id: context.brand_id,
        workstream_id: 'stream',
        status: 'active',
        assignee: { kind: 'agent', agent: `watchman:${id(30)}` },
      },
    ],
    wake: {
      id: id(32),
      watchman_id: id(30),
      attempt: 1,
      status: 'completed',
      error: null,
      created_at,
    },
    inbox: {
      id: id(33),
      wake_id: id(32),
      watchman_id: id(30),
      event_type: 'goal.work.assigned',
      payload: { watchman_id: id(30), execution },
    },
    conversation: {
      id: card().conversation_id,
      brand_id: context.brand_id,
      watchman_id: id(30),
      created_by: context.human_id,
      created_at,
      execution,
    },
    request: {
      id: `${marker}native-question`,
      goal_id: execution.goalId,
      brand_id: context.brand_id,
      created_at,
      prompt: `${marker}question`,
      blocked_node_refs: [{ kind: 'work_node', id: execution.workNodeId }],
      record: { requestedBy: { kind: 'agent', agent: `watchman:${id(30)}`, runId: id(33) } },
    },
    proposal: {
      id: id(40),
      watchman_id: id(30),
      wake_id: id(32),
      created_at,
      execution_ref: execution,
    },
  };
};
describe('experience source admission only; no browser/Auth/store/model acceptance', () => {
  test('an omitted older same-brand profile cannot acquire run ownership from supplied IDs or its actual hash', () => {
    const parsed = experiencePlanSchema.parse(plan());
    const fixture = parsed.cases.question!;
    expect(parsed.protected.watchman_ids).not.toContain(fixture.watchman_id);
    expect(() => assertExperienceNativeOwner(parsed, fixture, nativeOwner())).not.toThrow();
    const old = nativeOwner();
    const oldInput = {
      ...setupInput(),
      instructions: 'Older unrelated setup',
      first_assignment: 'Older Goal',
    };
    old.profile.instructions = oldInput.instructions;
    old.setup.input = oldInput;
    expect(() =>
      assertExperienceNativeOwner(
        parsed,
        { ...fixture, ownership: { ...ownership(), setup_input_sha256: experienceHash(oldInput) } },
        old,
      ),
    ).toThrow('RUN_OWNERSHIP');
    for (const altered of [
      { ...nativeOwner(), profile: { ...nativeOwner().profile, created_by: id(99) } },
      {
        ...nativeOwner(),
        bot: {
          ...nativeOwner().bot,
          app_metadata: { principal_type: 'agent', watchman_setup_request_id: id(99) },
        },
      },
      { ...nativeOwner(), memberships: nativeOwner().memberships.slice(0, 1) },
      { ...nativeOwner(), setup: { ...nativeOwner().setup, created_at: '2026-11-26T00:00:00Z' } },
    ])
      expect(() => assertExperienceNativeOwner(parsed, fixture, altered)).toThrow('BLOCKED_NATIVE');
  });
  test('older omitted Goals and forged execution pins fail native creation, inbox, node and checkpoint joins', () => {
    const parsed = experiencePlanSchema.parse(plan());
    const fixture = parsed.cases.question!;
    expect(parsed.protected.goal_ids).not.toContain(fixture.execution.goalId);
    expect(() => assertExperienceNativeGoal(parsed, fixture, nativeGoal())).not.toThrow();
    const old = nativeGoal();
    old.goal.objective = 'Existing unrelated Goal';
    old.creation.data.goal.objective = old.goal.objective;
    expect(() => assertExperienceNativeGoal(parsed, fixture, old)).toThrow('RUN_GOAL');
    for (const altered of [
      {
        ...nativeGoal(),
        node: { ...nativeGoal().node, executor: { kind: 'specialist', agent: `watchman:${id(99)}` } },
      },
      {
        ...nativeGoal(),
        node: { ...nativeGoal().node, executor: { kind: 'agent', agent: `watchman:${id(30)}` } },
      },
      { ...nativeGoal(), checkpoint: { ...nativeGoal().checkpoint, work_node_id: 'other-node' } },
      {
        ...nativeGoal(),
        inbox: {
          ...nativeGoal().inbox,
          payload: {
            ...nativeGoal().inbox.payload,
            execution: { ...fixture.execution, goalId: 'foreign' },
          },
        },
      },
      {
        ...nativeGoal(),
        request: {
          ...nativeGoal().request,
          record: { requestedBy: { kind: 'agent', agent: `watchman:${id(30)}`, runId: id(99) } },
        },
      },
    ])
      expect(() => assertExperienceNativeGoal(parsed, fixture, altered)).toThrow('BLOCKED_NATIVE');
    const proposalFixture = experiencePlanSchema.parse({
      ...plan(),
      cases: { reject: approval() },
      unrun: {},
    }).cases.reject!;
    expect(() => assertExperienceNativeGoal(parsed, proposalFixture, nativeGoal())).not.toThrow();
    const forged = {
      ...proposalFixture,
      execution: { ...proposalFixture.execution, goalId: 'omitted-older-goal' },
    };
    expect(() =>
      assertExperienceNativeGoal(parsed, forged, {
        ...nativeGoal(),
        proposal: { ...nativeGoal().proposal, execution_ref: forged.execution },
      }),
    ).toThrow('RUN_GOAL');
    // Matching printed execution_ref alone does not establish the actual proposal's wake ownership.
    expect(() =>
      assertExperienceNativeGoal(parsed, proposalFixture, {
        ...nativeGoal(),
        proposal: { ...nativeGoal().proposal, wake_id: id(99) },
      }),
    ).toThrow('PROPOSAL_ORIGIN');
  });
  test('complete foreign baseline protects omitted profiles/Goals and native A2 execution queues', () => {
    const owned = { watchmanId: id(30), goalId: goalId(), conversationId: 'new-thread' };
    const snapshot = {
      watchmen: [
        { id: id(99), status: 'paused' },
        { id: id(30), status: 'paused' },
      ],
      goals: [
        { id: 'omitted-old-goal', revision: 1 },
        { id: goalId(), revision: 2 },
      ],
      checkpoints: [{ goal_id: 'omitted-old-goal', checkpoint: { accepted: true } }],
      assignments: [{ goal_id: 'omitted-old-goal', status: 'active' }],
      nodes: [{ goal_id: 'omitted-old-goal', status: 'completed' }],
      inbox: [{ watchman_id: id(99), acked_at: null }],
      wakes: [{ watchman_id: id(99), status: 'completed' }],
    };
    const before = experiencePreservationHash(snapshot, owned);
    for (const [name, data] of Object.entries(snapshot)) {
      const changed = {
        ...snapshot,
        [name]: data.map((entry, i) => (i === 0 ? { ...entry, changed: true } : entry)),
      };
      expect(experiencePreservationHash(changed, owned)).not.toBe(before);
    }
    expect(
      experiencePreservationHash(
        { ...snapshot, goals: [...snapshot.goals.slice(0, 1), { id: goalId(), revision: 3 }] },
        owned,
      ),
    ).toBe(before);
    expect(experiencePreservationHash(snapshot)).not.toBe(before);
  });
  test('error masking preserves cause details and source frames while removing credential/query bytes', () => {
    const error = new Error(
      'Storage ECONNRESET at http://user:password@127.0.0.1:54321/storage/v1/object?token=private-value with Bearer secret-jwt and service-value',
    );
    error.stack = `${error.message}\n at actualSource.ts:42:7`;
    const safe = redactExperienceError(error, ['service-value']);
    expect(safe.message).toContain('ECONNRESET');
    expect(safe.message).toContain('/storage/v1/object');
    expect(safe.stack).toContain('actualSource.ts:42:7');
    for (const secret of ['password', 'private-value', 'secret-jwt', 'service-value'])
      expect(safe.message).not.toContain(secret);
  });
  test('missing native fixture is BLOCKED instead of a skipped or fabricated successful case', () => {
    const parsed = experiencePlanSchema.parse(plan());
    expect(requireExperienceCase(parsed, 'question').answer).toBe('Unit answer');
    expect(() => requireExperienceCase(parsed, 'approve')).toThrow(
      'BLOCKED_MISSING_NATIVE_FIXTURE_APPROVE',
    );
    expect(() => requireExperienceCase(parsed, 'dashboard')).toThrow('BLOCKED');
    expect(() => requireExperienceScope(parsed, 'work')).toThrow('BLOCKED');
    expect(() => requireExperienceScope(parsed, 'dashboard')).toThrow('BLOCKED');
  });
  test('prepared cells cannot erase an explicit UNRUN or use another GCS run prefix', () => {
    expect(() =>
      experiencePlanSchema.parse({ ...plan(), unrun: { question: 'Actually unrun' } }),
    ).toThrow();
    expect(() =>
      experiencePlanSchema.parse({ ...plan(), gcs_prefix: 'gs://foreign/run/' }),
    ).toThrow();
    expect(() => experiencePlanSchema.parse({ ...plan(), origin: 'SYNTHETIC_HTTP' })).toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        protected: { ...plan().protected, watchman_ids: [] },
      }),
    ).toThrow();
  });
  test('original and accepted Goals cannot be decision fixtures and protected identities cannot repeat', () => {
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: {
          question: {
            ...card(),
            execution: { ...card().execution, goalId: 'original0' },
            answer: 'No write',
          },
        },
      }),
    ).toThrow('preserving original');
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        protected: { ...plan().protected, version_ids: [id(12), id(12), id(14), id(15)] },
      }),
    ).toThrow('unique');
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        protected: {
          ...plan().protected,
          brand_ids: [context.brand_id, '00000000-0000-0000-0000-000000000001'],
        },
      }),
    ).not.toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        protected: { ...plan().protected, brand_ids: [id(99)] },
      }),
    ).toThrow('primary brand');
  });
  test('positive approval scope refuses publish/optimize/render and protected profile reuse', () => {
    const base = { ...plan(), cases: { approve: approval() }, unrun: {} };
    expect(() => experiencePlanSchema.parse(base)).not.toThrow();
    for (const kind of ['publish', 'optimize', 'render'])
      expect(() =>
        experiencePlanSchema.parse({ ...base, cases: { approve: { ...approval(), kind } } }),
      ).toThrow('decision-only');
    expect(() =>
      experiencePlanSchema.parse({
        ...base,
        cases: { approve: { ...approval(), watchman_id: id(4) } },
      }),
    ).toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...base,
        cases: { approve: { ...approval(), block: { ...approval().block, version: 1 } } },
      }),
    ).toThrow('version-zero');
    expect(() =>
      experiencePlanSchema.parse({
        ...base,
        cases: {
          approve: {
            ...approval(),
            block: { ...approval().block, operation_id: 'foreign-operation' },
          },
        },
      }),
    ).toThrow();
  });
  test('recurrence requires a run marker on a fresh owned profile; no original config mutation', () => {
    const fresh = {
      context,
      watchman_id: id(30),
      ownership: ownership(),
      instruction: `experience:${id(3)}:source only`,
      timing: 'weekly',
      timezone: 'UTC',
    };
    expect(() =>
      experiencePlanSchema.parse({ ...plan(), cases: { recurrence: fresh } }),
    ).not.toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: { recurrence: { ...fresh, watchman_id: id(4) } },
      }),
    ).toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: { recurrence: { ...fresh, instruction: 'unowned' } },
      }),
    ).toThrow();
  });
  test('a stale case requires a genuinely older stored question rather than a made-up approval revision', () => {
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: { stale: { ...card(), current_version: 4, answer: 'unit' } },
      }),
    ).not.toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: { stale: { ...card(), current_version: 3, answer: 'unit' } },
      }),
    ).toThrow();
    expect(() =>
      experiencePlanSchema.parse({
        ...plan(),
        cases: { stale: { ...approval(), current_version: 4, answer: 'unit' } },
      }),
    ).toThrow();
  });
  test('admission binds exact authenticated brand/owner/thread/action/version/value and excludes prose model turns', () => {
    const pin = experiencePlanSchema.parse(plan()).cases.question!;
    const action = {
      type: 'resolve_question' as const,
      request_id: block.request_id,
      expected_version: block.version,
      value: 'Unit answer',
    };
    const input = {
      brand_id: context.brand_id,
      watchman_id: pin.watchman_id,
      conversation_id: pin.conversation_id,
      request_id: id(50),
      action,
    };
    expect(experienceActionAllowed(input, pin, action)).toBe(true);
    for (const altered of [
      { ...input, brand_id: id(99) },
      { ...input, watchman_id: id(99) },
      { ...input, conversation_id: 'foreign' },
      { ...input, action: { ...action, expected_version: 4 } },
      { ...input, action: { ...action, value: 'changed' } },
      { ...input, action: undefined, message: 'Start a model turn' },
    ])
      expect(experienceActionAllowed(altered, pin, action)).toBe(false);
  });
  test('real roster guard rejects missing teammates, changed counts, foreign binding and false healthy state', () => {
    const data = dashboard();
    const fixture = {
      context,
      teammates: data.teammates.map((entry) => ({
        id: entry.profile.id,
        name: entry.profile.name,
        role: entry.profile.role,
        lifecycle: entry.lifecycle,
        active_work_count: entry.active_work_count,
      })),
      attention_count: 0,
    };
    expect(() => assertExperienceRoster(data, fixture)).not.toThrow();
    expect(() =>
      assertExperienceRoster({ ...data, teammates: data.teammates.slice(1) }, fixture),
    ).toThrow('MISMATCH');
    expect(() => assertExperienceRoster({ ...data, brand_id: id(99) }, fixture)).toThrow();
    expect(() => assertExperienceRoster({ ...data, partial: true }, fixture)).toThrow();
    expect(() => assertExperienceRoster(data, { ...fixture, attention_count: 1 })).toThrow();
    expect(experienceHash({ a: 1, b: 2 })).toBe(experienceHash({ b: 2, a: 1 }));
  });
  test('fixed specs retain real responses, no fixtures hidden behind mocks, and explicit provider/human gaps', async () => {
    for (const file of ['dashboard.bench.spec.ts', 'daily-work.bench.spec.ts']) {
      const source = await readFile(`${import.meta.dir}/${file}`, 'utf8');
      expect(source).toContain("screenshot: 'off'");
      expect(source).toContain("video: 'off'");
      expect(source).toContain('retries: 0');
      expect(source).not.toContain('route.fulfill');
      expect(source).not.toContain('test.skip');
      expect(source).not.toContain('mock.');
    }
    expect(EXPERIENCE_GAPS).toContain('human first-time usability');
    expect(EXPERIENCE_GAPS).toContain('supervised external pilot');
    const helper = await readFile(`${import.meta.dir}/experienceBrowser.ts`, 'utf8');
    expect(helper).toContain('await route.continue()');
    expect(helper).toContain('protectedExperienceHash(database, plan)');
    expect(helper).not.toContain('.delete(');
    expect(helper).not.toContain('.insert(');
    expect(helper).not.toContain('setContent(');
  });
});
