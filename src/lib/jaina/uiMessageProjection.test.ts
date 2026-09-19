/**
 * Parts in, a whole `JainaChatMessage` out.
 *
 * This is the seam the whole AI SDK cutover rests on: if a field the transcript renders is not
 * derivable from `message.parts`, the 4,122-line reducer cannot die. So every field is asserted
 * with a POSITIVE observable — Frontend tests are excluded from typecheck (`tsconfig.json`
 * 151-162), so a renamed field reds nothing and "it did not throw" proves nothing.
 *
 * The approval gate carries real risk and gets its own block: a native SDK part state joined to
 * a preview that rides beside it.
 */

import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';

import { buildThinkingSegments } from '@/components/paid-media/jaina/components/thinkingUtils';
import {
  approvalsOf,
  canvasActionsOf,
  checkpointSummaryOf,
  delegationsOf,
  planOf,
  projectTranscriptMessage,
  reasoningEntriesOf,
  reportOf,
  type TranscriptProjectionInputs,
  textOf,
  toJainaChatMessage,
  toolsOf,
} from './uiMessageProjection';

type Part = Record<string, unknown>;

const uiMessage = (parts: Part[], overrides: Partial<JainaUIMessage> = {}): JainaUIMessage =>
  ({
    id: 'msg_1',
    role: 'assistant',
    parts,
    ...overrides,
  }) as unknown as JainaUIMessage;

const text = (value: string): Part => ({ type: 'text', text: value });
const reasoning = (value: string): Part => ({ type: 'reasoning', text: value });
const data = (type: string, id: string, payload: Record<string, unknown>): Part => ({
  type,
  id,
  data: payload,
});

/** A dynamic tool part in one of the SDK's eight states. */
const toolPart = (fields: Partial<Part> & { state: string; toolCallId: string }): Part => ({
  type: 'dynamic-tool',
  toolName: 'get_key_metrics',
  ...fields,
});

const reportBlock = (blockId: string, title: string): Part =>
  data(JAINA_UI_DATA_PART.reportBlock, `run_1:block:${blockId}`, {
    block_id: blockId,
    category: 'narrative',
    scope: 'account',
    title,
    body: `${title} is up 12% week on week.`,
  });

describe('text, reasoning and tools', () => {
  it('joins text parts in order and keeps reasoning out of the answer', () => {
    const message = uiMessage([
      reasoning('Checking spend'),
      text('Spend is '),
      text('up 12%.'),
      reasoning('Done.'),
    ]);

    expect(textOf(message)).toBe('Spend is up 12%.');
    expect(reasoningEntriesOf(message).map((entry) => entry.detail)).toEqual([
      'Checking spend',
      'Done.',
    ]);
  });

  it('turns each reasoning part into one progress entry the thinking window can render', () => {
    const entries = reasoningEntriesOf(uiMessage([reasoning('Checking spend'), reasoning('  ')]));

    expect(entries).toHaveLength(1);
    expect(entries[0].stage).toBe('thinking');
    expect(entries[0].detail).toBe('Checking spend');
  });

  it('reads dynamic tool parts and static tool parts alike', () => {
    const tools = toolsOf(
      uiMessage([
        toolPart({ state: 'output-available', toolCallId: 'call_1', input: { a: 1 }, output: 2 }),
        {
          type: 'tool-get_campaigns',
          state: 'output-error',
          toolCallId: 'call_2',
          toolName: 'get_campaigns',
          input: {},
          errorText: 'boom',
        },
      ]),
    );

    expect(tools.map((tool) => tool.toolCallId)).toEqual(['call_1', 'call_2']);
    expect(tools[1].error).toBe('boom');
  });
});

describe('toJainaChatMessage fills the whole render model', () => {
  const message = uiMessage(
    [
      reasoning('Planning the read'),
      text('Account spend is up 12%.'),
      reportBlock('b1', 'Spend'),
      data(JAINA_UI_DATA_PART.reportMeta, 'run_1:report', {
        language: 'en',
        executive_summary: 'Spend is up.',
        reasoning_trace: '',
        follow_up_questions: ['Which campaign drove it?'],
        media_map: {},
        handoff_trace: [],
        execution_objectives: [],
        cached_sources: [],
        _meta: {
          schema_version: '2',
          block_count: 1,
          has_charts: false,
          has_media: false,
          primary_scope: 'account',
        },
      }),
      data(JAINA_UI_DATA_PART.objective, 'run_1:objective:o1', {
        id: 'o1',
        title: 'Read account spend',
        status: 'completed',
      }),
      data(JAINA_UI_DATA_PART.delegation, 'run_1:delegation:d1', {
        callId: 'd1',
        callerAgent: 'jaina',
        calleeAgent: 'organic',
        query: 'summarise posts',
        status: 'completed',
        phase: 'complete',
      }),
      data(JAINA_UI_DATA_PART.artifact, 'run_1:artifact:a1', {
        creatives: [{ id: 'cr1', type: 'creative', url: 'https://example.com/a.jpg' }],
      }),
      data(JAINA_UI_DATA_PART.creativeRender, 'run_1:render:j1', {
        render_job_id: '11111111-1111-4111-8111-111111111111',
        brand_id: '22222222-2222-4222-8222-222222222222',
        draft_id: 'draft_1',
        clip_count: 3,
        state: 'awaiting_client_render',
      }),
      data(JAINA_UI_DATA_PART.reportArtifactJob, 'run_1:artifact-job', {
        item_id: 'item_1',
        part_id: 'part_1',
        job_id: 'job_1',
        status: 'queued',
        status_endpoint: '/status',
        file_url_endpoint: '/file',
      }),
      data(JAINA_UI_DATA_PART.checkpointSummary, 'run_1:checkpoint-summary', {
        summary: 'Spend rose on two campaigns.',
        source: 'synthesis',
      }),
      data(JAINA_UI_DATA_PART.scaffold, 'run_1:scaffold', {
        scaffoldId: '33333333-3333-4333-8333-333333333333',
        plan: { campaigns: [{ name: 'Summer' }] },
        summary: { campaigns: 1, adSets: 2, ads: 4 },
      }),
      data(JAINA_UI_DATA_PART.canvasActions, 'run_1:canvas', { actions: [{ kind: 'add_node' }] }),
      toolPart({
        state: 'output-available',
        toolCallId: 'call_1',
        input: { a: 1 },
        output: { b: 2 },
      }),
    ],
    { metadata: { runId: 'run_1', status: 'completed' } } as Partial<JainaUIMessage>,
  );

  const projected = toJainaChatMessage(message, { isStreaming: false, createdAt: '2026-09-17' });

  it('carries identity, run and terminal status off the metadata', () => {
    expect(projected.id).toBe('msg_1');
    expect(projected.role).toBe('assistant');
    expect(projected.runId).toBe('run_1');
    expect(projected.status).toBe('done');
    expect(projected.createdAt).toBe('2026-09-17');
  });

  it('reassembles the report from its blocks plus the meta part', () => {
    expect(projected.reportV2?.executive_summary).toBe('Spend is up.');
    expect(projected.reportV2?.follow_up_questions).toEqual(['Which campaign drove it?']);
    expect(projected.reportV2?.blocks).toHaveLength(1);
    expect(projected.reportV2?.blocks[0].title).toBe('Spend');
  });

  it('fills objectives, delegations, tools, artifacts and renders', () => {
    expect(projected.objectives?.map((objective) => objective.id)).toEqual(['o1']);
    expect(projected.delegations?.map((delegation) => delegation.callId)).toEqual(['d1']);
    expect(projected.toolCalls?.map((call) => call.id)).toEqual(['call_1']);
    expect(projected.toolResults?.[0]).toMatchObject({ id: 'call_1', ok: true, cached: false });
    expect(projected.artifacts?.creatives?.map((creative) => creative.id)).toEqual(['cr1']);
    expect(projected.paidCreativeRenders?.[0].draft_id).toBe('draft_1');
  });

  it('fills the scaffold, the artifact job and the checkpoint summary', () => {
    expect(projected.scaffold?.scaffoldId).toBe('33333333-3333-4333-8333-333333333333');
    expect(projected.scaffold?.summary).toMatchObject({ campaigns: 1, adSets: 2, ads: 4 });
    expect(projected.reportArtifactJob?.job_id).toBe('job_1');
    expect(projected.checkpointSummary).toEqual({
      summary: 'Spend rose on two campaigns.',
      source: 'synthesis',
    });
  });

  it('fills reasoning and prose content', () => {
    expect(projected.reasoning?.map((entry) => entry.detail)).toEqual(['Planning the read']);
    expect(projected.content).toBe('Account spend is up 12%.');
  });

  // A thought is not the answer. As the ladder's last rung it printed the planner's whole markdown
  // plan as the reply; the thinking window is where a thought belongs.
  it('never shows a thought as the answer, streaming or finished', () => {
    const thinking = uiMessage([reasoning('Checking spend by campaign.')]);

    expect(toJainaChatMessage(thinking, { isStreaming: true }).content).toBe('');
    expect(toJainaChatMessage(thinking, { isStreaming: false }).content).toBe('');
  });

  it('exposes canvas actions for the surface without putting them on the message', () => {
    expect(canvasActionsOf(message)).toHaveLength(1);
    expect('canvasActions' in projected).toBe(false);
  });

  it('marks a failed run as an error turn', () => {
    const failed = toJainaChatMessage(
      uiMessage([text('half an answer')], {
        metadata: { runId: 'run_1', status: 'failed' },
      } as Partial<JainaUIMessage>),
      { isStreaming: false },
    );

    expect(failed.status).toBe('error');
    expect(failed.title).toBe('Jaina error');
  });

  it('reports a live turn as streaming, and a user turn as bare text', () => {
    const live = toJainaChatMessage(uiMessage([text('typing')]), { isStreaming: true });
    expect(live.status).toBe('streaming');

    const user = toJainaChatMessage(
      uiMessage([text('how is spend?')], { role: 'user' } as Partial<JainaUIMessage>),
      { isStreaming: false },
    );
    expect(user.role).toBe('user');
    expect(user.content).toBe('how is spend?');
    expect(user.reasoning).toBeUndefined();
  });

  it('falls back to the checkpoint summary when a report turn produced no prose', () => {
    const silent = toJainaChatMessage(
      uiMessage([
        data(JAINA_UI_DATA_PART.checkpointSummary, 'run_1:checkpoint-summary', {
          summary: 'Spend rose on two campaigns.',
          source: 'tool_fallback',
        }),
      ]),
      { isStreaming: false },
    );

    expect(silent.content).toBe('Spend rose on two campaigns.');
  });

  it('does not read a checkpoint summary the Backend marked unavailable', () => {
    const unavailable = toJainaChatMessage(
      uiMessage([
        data(JAINA_UI_DATA_PART.checkpointSummary, 'run_1:checkpoint-summary', {
          summary: 'Synthesis summary unavailable',
          source: 'default_unavailable',
        }),
      ]),
      { isStreaming: false },
    );

    expect(unavailable.content).toBe('');
  });

  /**
   * `renderAsReport` is the LEGACY inline report's switch. A v2 report renders off `reportV2`
   * unconditionally, and the surface's rule has always left the flag false for one — so a v2 turn
   * asserting `true` here would be asserting a behaviour change nobody asked for.
   */
  it('renders a legacy report AS a report, and leaves the flag off for a v2 one', () => {
    expect(projected.reportV2).toBeDefined();
    expect(projected.renderAsReport).toBe(false);

    const legacy = toJainaChatMessage(
      uiMessage([
        data(JAINA_UI_DATA_PART.reportMeta, 'run_1:report', {
          report_title: 'Weekly account review',
          executive_summary: 'Spend is up.',
          sections: [{ heading: 'Spend', summary: 'Up 12% week on week.', highlights: [] }],
          strategic_recommendations: [{ title: 'Scale Summer', rationale: 'Best ROAS' }],
        }),
      ]),
      { isStreaming: false },
    );

    expect(legacy.report).toBeDefined();
    expect(legacy.reportV2).toBeUndefined();
    expect(legacy.renderAsReport).toBe(true);
  });

  it('does not render a prose-only turn as a report', () => {
    const prose = toJainaChatMessage(uiMessage([text('Spend is up 12%.')]), {
      isStreaming: false,
    });
    expect(prose.renderAsReport).toBe(false);
  });

  it('reads the clarification question and shows it as the turn s prose', () => {
    const asking = toJainaChatMessage(
      uiMessage([
        data(JAINA_UI_DATA_PART.clarification, 'run_1:clarification', {
          id: 'clar_1',
          question: 'Which ad account?',
        }),
      ]),
      { isStreaming: false },
    );

    expect(asking.pendingClarification).toEqual({ id: 'clar_1', question: 'Which ad account?' });
    expect(asking.content).toBe('Which ad account?');
    expect(asking.renderAsReport).toBe(false);
  });
});

describe('the approval gate', () => {
  const pendingParts = (preview?: Record<string, unknown>): Part[] => [
    toolPart({
      state: 'approval-requested',
      toolCallId: 'call_gate',
      toolName: 'pause_meta_entity',
      input: { entity_id: '1234', expected_status: 'ACTIVE' },
      approval: { id: 'appr_1' },
    }),
    ...(preview ? [data(JAINA_UI_DATA_PART.approval, 'run_1:approval:appr_1', preview)] : []),
  ];

  it('derives a pending approval from the native part state alone', () => {
    const { pending, resolved, denied } = approvalsOf(uiMessage(pendingParts()));

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      approvalId: 'appr_1',
      toolCallId: 'call_gate',
      toolName: 'pause_meta_entity',
    });
    expect(pending[0].input).toEqual({ entity_id: '1234', expected_status: 'ACTIVE' });
    expect(resolved).toEqual({});
    expect(denied).toEqual([]);
  });

  it('joins the before to after preview that rides beside the approval chunk', () => {
    const { pending } = approvalsOf(
      uiMessage(
        pendingParts({
          approvalId: 'appr_1',
          toolCallId: 'call_gate',
          toolName: 'pause_meta_entity',
          input: { entity_id: '1234', expected_status: 'ACTIVE' },
          expiresAt: '2099-01-01T00:00:00.000Z',
          preview: {
            subject: 'Ad set 1234 · Summer Sale',
            rows: [{ field: 'status', before: 'ACTIVE', after: 'PAUSED' }],
          },
        }),
      ),
    );

    // A uuid on a card is consent to nothing: the card must be able to show what changes.
    expect(pending[0].preview?.rows).toEqual([
      { field: 'status', before: 'ACTIVE', after: 'PAUSED' },
    ]);
    expect(pending[0].preview?.subject).toBe('Ad set 1234 · Summer Sale');
    expect(pending[0].expiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('leaves expiresAt unparseable rather than expiring a live gate that has no preview yet', () => {
    const { pending } = approvalsOf(uiMessage(pendingParts()));
    expect(Number.isNaN(Date.parse(pending[0].expiresAt))).toBe(true);
  });

  it('moves an answered approval out of pending and into resolved', () => {
    const { pending, resolved } = approvalsOf(
      uiMessage([
        toolPart({
          state: 'approval-responded',
          toolCallId: 'call_gate',
          toolName: 'pause_meta_entity',
          input: {},
          approval: { id: 'appr_1', approved: true },
        }),
      ]),
    );

    expect(pending).toEqual([]);
    expect(resolved.appr_1).toMatchObject({
      approvalId: 'appr_1',
      toolCallId: 'call_gate',
      decision: 'approved',
    });
  });

  it('records a denial as both a resolution and a denied output', () => {
    const { pending, resolved, denied } = approvalsOf(
      uiMessage([
        toolPart({
          state: 'output-denied',
          toolCallId: 'call_gate',
          toolName: 'paid_scaffold_build',
          input: {},
          approval: { id: 'appr_2', approved: false, reason: 'Not this week' },
        }),
      ]),
    );

    expect(pending).toEqual([]);
    expect(resolved.appr_2).toMatchObject({ decision: 'denied', reason: 'Not this week' });
    expect(denied).toEqual([
      {
        toolCallId: 'call_gate',
        toolName: 'paid_scaffold_build',
        approvalId: 'appr_2',
        reason: 'Not this week',
      },
    ]);
  });

  it('counts an approved call that then ran as resolved, not pending', () => {
    const { pending, resolved, denied } = approvalsOf(
      uiMessage([
        toolPart({
          state: 'output-available',
          toolCallId: 'call_gate',
          toolName: 'pause_meta_entity',
          input: {},
          output: { ok: true },
          approval: { id: 'appr_3', approved: true },
        }),
      ]),
    );

    expect(pending).toEqual([]);
    expect(resolved.appr_3.decision).toBe('approved');
    expect(denied).toEqual([]);
  });

  it('puts all three onto the projected message', () => {
    const projected = toJainaChatMessage(uiMessage(pendingParts()), { isStreaming: true });

    expect(projected.pendingToolApprovals?.map((entry) => entry.approvalId)).toEqual(['appr_1']);
    expect(projected.resolvedApprovals).toEqual({});
    expect(projected.deniedToolOutputs).toEqual([]);
  });
});

const planPart = (plan: Record<string, unknown>): Part =>
  data(JAINA_UI_DATA_PART.plan, 'run_1:plan', plan);

describe('the plan part', () => {
  const objectivePlan = {
    plan_id: 'plan_7',
    chat_title: 'Scale the winners',
    intent: 'analysis',
    scope_ceiling: null,
    objectives: [
      { objective_id: 'o1', task: 'Read account spend', description: '', success_criteria: 'KPIs' },
      { objective_id: 'o2', task: 'Find the winners', description: 'By ROAS' },
    ],
  };

  it('projects the planner plan into a plan with steps', () => {
    const plan = planOf(uiMessage([planPart(objectivePlan)]));

    expect(plan?.id).toBe('plan_7');
    expect(plan?.title).toBe('Scale the winners');
    expect(plan?.steps).toEqual([
      { title: 'Read account spend', description: 'KPIs', status: 'pending' },
      { title: 'Find the winners', description: 'By ROAS', status: 'pending' },
    ]);
  });

  it('leaves the plan absent on a turn with no plan part, whatever the reasoning says', () => {
    expect(planOf(uiMessage([reasoning('Plan: Scale the winners')]))).toBeUndefined();
    expect(
      toJainaChatMessage(uiMessage([text('hi')]), { isStreaming: false }).plan,
    ).toBeUndefined();
  });

  // The screenshot this pins: before the answer arrived, the last thought was the whole markdown
  // plan, and the content ladder printed it as the reply.
  it('headlines a streaming turn with the plan title, never a thought', () => {
    const projected = toJainaChatMessage(
      uiMessage([planPart(objectivePlan), reasoning('Reading the account now.')]),
      { isStreaming: true },
    );

    expect(projected.plan?.title).toBe('Scale the winners');
    expect(projected.content).toBe('Scale the winners');
  });
});

/**
 * The transcript re-projects on every streamed chunk. A message that did not change has to come
 * back as the SAME object, or `React.memo` on the transcript item never skips it and every chunk
 * re-renders the whole conversation. Equally, any input that changes what the item shows has to
 * produce a new object, or a finished turn keeps a stale status, title, plan or delivery source.
 */
describe('projectTranscriptMessage keeps identity until something it shows changes', () => {
  const plan = planPart({
    plan_id: 'plan_7',
    chat_title: 'Scale the winners',
    objectives: [{ task: 'Read account spend' }],
  });
  const inputs: TranscriptProjectionInputs = {
    isStreaming: false,
    optimisticPlanStatusById: {},
    deliverySource: 'live_render',
  };
  const answer = () => uiMessage([plan, text('Move spend to the winners.')]);

  it('returns the same object for the same message and inputs', () => {
    const cache = new WeakMap();
    const message = answer();
    const first = projectTranscriptMessage(cache, message, inputs);

    expect(projectTranscriptMessage(cache, message, { ...inputs })).toBe(first);
    expect(first.content).toContain('Move spend to the winners.');
    expect(first.deliverySource).toBe('live_render');
  });

  it('re-projects a new message object, which is what a chunk is', () => {
    const cache = new WeakMap();
    const first = projectTranscriptMessage(cache, answer(), inputs);
    const next = projectTranscriptMessage(
      cache,
      uiMessage([plan, text('Move spend to the winners today.')]),
      inputs,
    );

    expect(next).not.toBe(first);
    expect(next.content).toContain('today');
  });

  it('re-projects when the turn stops streaming', () => {
    const cache = new WeakMap();
    const message = answer();
    const streaming = projectTranscriptMessage(cache, message, { ...inputs, isStreaming: true });
    const done = projectTranscriptMessage(cache, message, inputs);

    expect(streaming.status).toBe('streaming');
    expect(done.status).toBe('done');
  });

  it('overlays an optimistic status on its own plan and ignores other plans', () => {
    const cache = new WeakMap();
    const message = answer();
    const before = projectTranscriptMessage(cache, message, inputs);
    const otherPlan = projectTranscriptMessage(cache, message, {
      ...inputs,
      optimisticPlanStatusById: { plan_other: 'approved' },
    });
    const approved = projectTranscriptMessage(cache, message, {
      ...inputs,
      optimisticPlanStatusById: { plan_7: 'approved' },
    });

    expect(otherPlan).toBe(before);
    expect(approved).not.toBe(before);
    expect(approved.plan?.status).toBe('approved');
  });

  it('re-projects when a message turns out to be history, and never marks a user turn', () => {
    const cache = new WeakMap();
    const message = answer();
    const live = projectTranscriptMessage(cache, message, inputs);
    const replay = projectTranscriptMessage(cache, message, {
      ...inputs,
      deliverySource: 'hydration_replay',
    });

    expect(replay).not.toBe(live);
    expect(replay.deliverySource).toBe('hydration_replay');
    expect(
      projectTranscriptMessage(cache, uiMessage([text('hi')], { role: 'user' }), inputs)
        .deliverySource,
    ).toBeUndefined();
  });
});

describe('the checkpoint summary part', () => {
  it('reads summary and provenance, and refuses an unknown provenance', () => {
    expect(
      checkpointSummaryOf(
        uiMessage([
          data(JAINA_UI_DATA_PART.checkpointSummary, 'run_1:checkpoint-summary', {
            summary: 'done',
            source: 'nonsense',
          }),
        ]),
      ),
    ).toEqual({ summary: 'done', source: 'default_unavailable' });
  });

  it('is absent when no part carried one', () => {
    expect(checkpointSummaryOf(uiMessage([text('hi')]))).toBeUndefined();
  });
});

/**
 * Seven Backend events share the `data-jaina-delegation` part type and only ONE of them is a
 * cross-agent card. The other two kinds lost their reader when the NDJSON wire went away — the
 * transcript rendered nothing for a turn that delegated five times — so both directions are
 * pinned here: the row reaches somewhere that renders, AND it stays out of the card that would
 * misdescribe it.
 *
 * The assertions run through `buildThinkingSegments` rather than stopping at the entry, because
 * a progress entry with the wrong `stage` or a payload the grouper cannot read is dropped without
 * a sound — which is exactly the failure being closed here.
 */
describe('sub-agent activity that is not a cross-agent call', () => {
  const delegationPart = (callId: string, payload: Record<string, unknown>): Part =>
    data(JAINA_UI_DATA_PART.delegation, `run_1:delegation:${callId}`, { callId, ...payload });

  const handoffStart = delegationPart('h1', {
    kind: 'handoff',
    phase: 'started',
    status: 'running',
    label: 'Ad Set Scope',
    query: 'rebalance the budgets',
    from_scope: 'core',
    to_scope: 'adset',
    objective: 'rebalance the budgets',
    display_name: 'Ad Set Scope',
  });

  it('renders a handoff row as a handoff step in the thinking window', () => {
    const entries = reasoningEntriesOf(uiMessage([handoffStart]));
    expect(entries.map((entry) => entry.stage)).toEqual(['handoff_start']);

    const segments = buildThinkingSegments(entries, []);
    const handoff = segments.find((segment) => segment.kind === 'handoff');
    expect(handoff?.kind === 'handoff' ? handoff.to : null).toBe('Ad Set Scope');
    expect(handoff?.kind === 'handoff' ? handoff.objective : null).toBe('rebalance the budgets');
    expect(handoff?.kind === 'handoff' ? handoff.status : null).toBe('started');
  });

  it('keeps a handoff row OUT of delegations, which renders "X asked Y"', () => {
    const projected = toJainaChatMessage(uiMessage([handoffStart]), { isStreaming: false });

    expect(projected.delegations).toBeUndefined();
    expect(projected.reasoning?.map((entry) => entry.stage)).toEqual(['handoff_start']);
  });

  it('renders a finished worker as a delegated-agent row carrying its duration', () => {
    const entries = reasoningEntriesOf(
      uiMessage([
        delegationPart('w1', {
          kind: 'worker',
          phase: 'complete',
          agent_id: 'w1',
          display_name: 'Campaign scope',
          label: 'Campaign scope',
          status: 'completed',
          duration_ms: 4200,
        }),
      ]),
    );
    expect(entries.map((entry) => entry.stage)).toEqual(['agent_complete']);

    const lifecycle = buildThinkingSegments(entries, []).find(
      (segment) => segment.kind === 'agent_lifecycle',
    );
    expect(lifecycle?.kind === 'agent_lifecycle' ? lifecycle.agentLabel : null).toBe(
      'Campaign scope',
    );
    expect(lifecycle?.kind === 'agent_lifecycle' ? lifecycle.completeStatus : null).toBe(
      'completed',
    );
    expect(lifecycle?.kind === 'agent_lifecycle' ? lifecycle.durationMs : null).toBe(4200);
  });

  it("puts a worker's narration lines in the trace as readable thoughts", () => {
    const entries = reasoningEntriesOf(
      uiMessage([
        delegationPart('w2', {
          kind: 'worker',
          phase: 'progress',
          agent_id: 'w2',
          label: 'Campaign scope',
          status: 'running',
          lines: [
            { field: 'findings', text: 'Spend is up 22% week over week' },
            { field: 'insights', text: 'Retargeting is carrying the account' },
          ],
        }),
      ]),
    );
    expect(entries.map((entry) => entry.stage)).toEqual(['agent_narration', 'agent_narration']);

    const thought = buildThinkingSegments(entries, []).find(
      (segment) => segment.kind === 'thought',
    );
    expect(thought?.kind === 'thought' ? thought.entries.map((entry) => entry.detail) : []).toEqual(
      ['Spend is up 22% week over week', 'Retargeting is carrying the account'],
    );
  });

  it('reads an agent.envelope row off its own `event`, not off the phase', () => {
    const entries = reasoningEntriesOf(
      uiMessage([
        delegationPart('c1', {
          kind: 'handoff',
          phase: 'progress',
          event: 'complete',
          scope: 'analysis',
          display_name: 'Analysis',
          status: 'completed',
        }),
      ]),
    );
    expect(entries.map((entry) => entry.stage)).toEqual(['handoff_complete']);

    const handoff = buildThinkingSegments(entries, []).find(
      (segment) => segment.kind === 'handoff',
    );
    expect(handoff?.kind === 'handoff' ? handoff.status : null).toBe('completed');
  });

  it('leaves a cross-agent call to the delegation card and out of the trace', () => {
    const crossAgent = uiMessage([
      delegationPart('d9', {
        kind: 'cross_agent',
        phase: 'progress',
        callerAgent: 'jaina',
        calleeAgent: 'organic',
        query: 'summarise posts',
        status: 'completed',
        label: 'organic',
      }),
    ]);

    expect(delegationsOf(crossAgent).map((delegation) => delegation.callId)).toEqual(['d9']);
    expect(reasoningEntriesOf(crossAgent)).toEqual([]);
  });

  it('keeps thinking and sub-agent rows in the order their parts arrived', () => {
    const entries = reasoningEntriesOf(
      uiMessage([reasoning('Budgets look lopsided'), handoffStart, reasoning('Waiting on adset')]),
    );

    expect(entries.map((entry) => entry.stage)).toEqual(['thinking', 'handoff_start', 'thinking']);
  });
});

describe('report blocks once the final report lands', () => {
  const block = (id: string) => ({
    type: JAINA_UI_DATA_PART.reportBlock,
    id: `run_1:block:${id}`,
    data: { block_id: id, category: 'narrative', title: id, summary: id },
  });
  const meta = (order?: string[]) => ({
    type: JAINA_UI_DATA_PART.reportMeta,
    id: 'run_1:report',
    data: { executive_summary: 'Summary', ...(order ? { block_order: order } : {}) },
  });
  const blockIds = (message: JainaUIMessage) =>
    ((reportOf(message)?.blocks ?? []) as { block_id: string }[]).map((b) => b.block_id);

  it('shows streamed blocks in arrival order while the turn is still writing', () => {
    expect(blockIds(uiMessage([block('draft-b'), block('draft-a')]))).toEqual([
      'draft-b',
      'draft-a',
    ]);
  });

  // With no meta yet, the streamed blocks used to fail the V2 schema and fall to the v1 inline
  // report, which labels them "Checkpoint Blocks".
  it('renders streamed blocks as a V2 report before the final report lands', () => {
    const projected = toJainaChatMessage(
      uiMessage([reportBlock('draft-b', 'Spend'), reportBlock('draft-a', 'ROAS')]),
      { isStreaming: true },
    );

    expect(projected.report).toBeUndefined();
    expect(projected.reportV2?.blocks.map((b) => b.block_id)).toEqual(['draft-b', 'draft-a']);
  });

  it('drops a streamed block the final report re-composed away', () => {
    // Measured on real runs: the final checkpoint re-ids its blocks, a part is never removed, and
    // the reader saw 4 blocks for a 2-block report until they reloaded.
    const message = uiMessage([
      block('draft-1'),
      block('kpi'),
      block('narrative'),
      meta(['kpi', 'narrative']),
    ]);
    expect(blockIds(message)).toEqual(['kpi', 'narrative']);
  });

  it('renders the final report in ITS order, not the order blocks first arrived', () => {
    const message = uiMessage([block('narrative'), block('kpi'), meta(['kpi', 'narrative'])]);
    expect(blockIds(message)).toEqual(['kpi', 'narrative']);
  });

  it('keeps the streamed blocks when the final report is an empty shell', () => {
    // No order means the report named no blocks. The reader keeps what they were shown rather
    // than watching a filled report collapse to nothing at the last frame.
    const message = uiMessage([block('metric'), meta()]);
    expect(blockIds(message)).toEqual(['metric']);
  });

  it('never leaks the ordering hint into the report the renderer receives', () => {
    const message = uiMessage([block('kpi'), meta(['kpi'])]);
    expect(reportOf(message)).not.toHaveProperty('block_order');
  });
});
