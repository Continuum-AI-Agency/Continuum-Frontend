/**
 * Parts in, a whole `JainaChatMessage` out.
 *
 * This is the seam the whole AI SDK cutover rests on: if a field the transcript renders is not
 * derivable from `message.parts`, the 4,122-line reducer cannot die. So every field is asserted
 * with a POSITIVE observable — Frontend tests are excluded from typecheck (`tsconfig.json`
 * 151-162), so a renamed field reds nothing and "it did not throw" proves nothing.
 *
 * The two joins that carry real risk get their own blocks: the approval gate, which is a native
 * SDK part state joined to a preview that rides beside it, and the plan card, which has no wire
 * part at all and is inferred from the planner's own narration.
 */

import { describe, expect, it } from 'bun:test';
import { JAINA_UI_DATA_PART, type JainaUIMessage } from '@continuum/contracts';

import { buildThinkingSegments } from '@/components/paid-media/jaina/components/thinkingUtils';
import {
  approvalsOf,
  canvasActionsOf,
  delegationsOf,
  checkpointSummaryOf,
  looksLikePlanDelta,
  planOf,
  reasoningEntriesOf,
  reasoningOf,
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
    expect(reasoningOf(message)).toBe('Checking spendDone.');
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

  it('fills reasoning, final thought and prose content', () => {
    expect(projected.reasoning?.map((entry) => entry.detail)).toEqual(['Planning the read']);
    expect(projected.finalThought).toBe('Planning the read');
    expect(projected.content).toBe('Account spend is up 12%.');
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
      { isStreaming: false, sessionTitle: 'Weekly review' },
    );

    expect(unavailable.content).toBe('Weekly review');
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

describe('the plan card, which has no wire part', () => {
  const planJson = JSON.stringify({
    plan_id: 'plan_7',
    chat_title: 'Scale the winners',
    description: 'Three steps to more spend on what works.',
    steps: [
      { title: 'Read account spend', status: 'completed' },
      { title: 'Find the winners', description: 'By ROAS', status: 'in_progress' },
    ],
  });

  it('recognises planner narration and ignores ordinary thinking', () => {
    expect(looksLikePlanDelta(planJson)).toBe(true);
    expect(looksLikePlanDelta('Reading the account now.')).toBe(false);
  });

  it('infers the plan from the reasoning parts', () => {
    const plan = planOf(uiMessage([reasoning(planJson)]));

    expect(plan?.id).toBe('plan_7');
    expect(plan?.title).toBe('Scale the winners');
    expect(plan?.steps.map((step) => step.title)).toEqual([
      'Read account spend',
      'Find the winners',
    ]);
    expect(plan?.steps[1].status).toBe('in_progress');
  });

  it('infers it across split reasoning parts, because deltas arrive in pieces', () => {
    const half = Math.floor(planJson.length / 2);
    const plan = planOf(
      uiMessage([reasoning(planJson.slice(0, half)), reasoning(planJson.slice(half))]),
    );

    expect(plan?.title).toBe('Scale the winners');
  });

  it('leaves the plan absent on a turn that narrated none', () => {
    expect(planOf(uiMessage([reasoning('Reading the account now.')]))).toBeUndefined();
    expect(
      toJainaChatMessage(uiMessage([text('hi')]), { isStreaming: false }).plan,
    ).toBeUndefined();
  });

  it('puts the inferred plan on the projected message', () => {
    const projected = toJainaChatMessage(uiMessage([reasoning(planJson)]), { isStreaming: true });
    expect(projected.plan?.title).toBe('Scale the winners');
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

  it("reads an agent.envelope row off its own `event`, not off the phase", () => {
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

    expect(entries.map((entry) => entry.stage)).toEqual([
      'thinking',
      'handoff_start',
      'thinking',
    ]);
  });
});
