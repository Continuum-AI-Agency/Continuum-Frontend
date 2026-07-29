import { describe, expect, test } from 'bun:test';
import {
  automationWorkflowNodeSchema,
  resolveAutomationAiStudioGenerateConfig,
  resolveAutomationLibrarySaveConfig,
  resolveAutomationOrganicPublishConfig,
  resolveAutomationPaidOptimizerConfig,
  resolveAutomationPlannerUpsertConfig,
} from './workflow';
import {
  AUTOMATION_WORKFLOW_TEMPLATES,
  createLegacyAutomationWorkflow,
} from './workflow-templates';
import { validateAutomationWorkflow } from './workflow-validation';

const schedule = {
  kind: 'weekly' as const,
  dayOfWeek: 1,
  time: '09:00',
  timezone: 'America/Phoenix',
};

const recipients = {
  memberUserIds: [],
  externalEmails: ['owner@example.com'],
};

const templateDefinition = () => {
  const template = AUTOMATION_WORKFLOW_TEMPLATES.at(0);
  if (!template) throw new Error('workflow template fixture is missing');
  return structuredClone(template.definition);
};

describe('validateAutomationWorkflow', () => {
  test('normalizes legacy repeat drafts to a fixed iteration count', () => {
    const parsed = automationWorkflowNodeSchema.parse({
      id: 'repeat',
      type: 'logic.repeat_until',
      label: 'Legacy repeat',
      position: { x: 0, y: 0 },
      disabled: false,
      continueOnError: false,
      config: {
        condition: { path: 'complete', operator: 'eq', value: true },
        maxIterations: 4,
      },
    });

    expect(parsed).toMatchObject({ config: { iterations: 4 } });
  });

  test('does not accept the removed For each node type', () => {
    expect(
      automationWorkflowNodeSchema.safeParse({
        id: 'for-each',
        type: 'logic.for_each',
        label: 'For each',
        position: { x: 0, y: 0 },
        disabled: false,
        continueOnError: false,
        config: { itemsPath: 'items', maxItems: 20 },
      }).success,
    ).toBe(false);
  });

  test('accepts the performance pulse template', () => {
    const workflow = templateDefinition();

    const result = validateAutomationWorkflow(workflow);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.topologicalOrder[0]).toBe('schedule');
    expect(result.topologicalOrder).toContain('email');
  });

  test('accepts a migrated legacy automation', () => {
    const workflow = createLegacyAutomationWorkflow({
      agent: 'jaina',
      prompt: 'Summarize this week.',
      schedule,
      recipients,
    });

    expect(validateAutomationWorkflow(workflow).ok).toBe(true);
  });

  test('rejects cycles in the stored graph', () => {
    const workflow = templateDefinition();
    workflow.edges.push({
      id: 'cycle',
      source: 'email',
      sourceHandle: 'receipt',
      target: 'report',
      targetHandle: 'input',
    });

    const result = validateAutomationWorkflow(workflow);

    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.code === 'cycle')).toBe(true);
  });

  test('requires a reachable outcome node', () => {
    const workflow = templateDefinition();
    workflow.nodes = workflow.nodes.filter((node) => node.id !== 'email');
    workflow.edges = workflow.edges.filter(
      (edge) => edge.source !== 'email' && edge.target !== 'email',
    );

    const result = validateAutomationWorkflow(workflow);

    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.code === 'missing_outcome')).toBe(true);
  });

  test('rejects incompatible port connections', () => {
    const workflow = templateDefinition();
    workflow.edges.push({
      id: 'bad-port',
      source: 'paid-data',
      sourceHandle: 'output',
      target: 'jaina',
      targetHandle: 'missing',
    });

    const result = validateAutomationWorkflow(workflow);

    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.code === 'incompatible_ports')).toBe(true);
  });

  test('accepts a bounded fixed-count repeat body without introducing graph cycles', () => {
    const workflow = createLegacyAutomationWorkflow({
      agent: 'organic',
      prompt: 'Review the latest work.',
      schedule,
      recipients,
    });
    workflow.nodes.splice(3, 0, {
      id: 'review-loop',
      type: 'logic.repeat_until',
      label: 'Review up to three times',
      position: { x: 800, y: 180 },
      disabled: false,
      continueOnError: false,
      config: {
        iterations: 3,
      },
    });
    const agentFormatter = workflow.edges.find(
      (edge) => edge.source === 'agent' && edge.target === 'formatter',
    );
    const instructionAgent = workflow.edges.find(
      (edge) => edge.source === 'instruction' && edge.target === 'agent',
    );
    if (!agentFormatter) throw new Error('agent formatter fixture edge is missing');
    if (!instructionAgent) throw new Error('instruction agent fixture edge is missing');
    instructionAgent.target = 'review-loop';
    agentFormatter.source = 'review-loop';
    agentFormatter.sourceHandle = 'complete';
    workflow.edges.push({
      id: 'review-agent',
      source: 'review-loop',
      sourceHandle: 'repeat',
      target: 'agent',
      targetHandle: 'input',
    });

    expect(validateAutomationWorkflow(workflow).ok).toBe(true);
  });

  test('rejects repeat nodes without separate body and completion branches', () => {
    const workflow = createLegacyAutomationWorkflow({
      agent: 'organic',
      prompt: 'Review the latest work.',
      schedule,
      recipients,
    });
    workflow.nodes.splice(3, 0, {
      id: 'review-loop',
      type: 'logic.repeat_until',
      label: 'Review three times',
      position: { x: 800, y: 180 },
      disabled: false,
      continueOnError: false,
      config: { iterations: 3 },
    });
    const instructionAgent = workflow.edges.find(
      (edge) => edge.source === 'instruction' && edge.target === 'agent',
    );
    if (!instructionAgent) throw new Error('instruction agent fixture edge is missing');
    instructionAgent.target = 'review-loop';
    workflow.edges.push({
      id: 'review-agent',
      source: 'review-loop',
      sourceHandle: 'repeat',
      target: 'agent',
      targetHandle: 'input',
    });

    const result = validateAutomationWorkflow(workflow);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'invalid_branch_handle')).toBe(true);
  });
});

// Parsing is the compatibility boundary. A stored draft that stops parsing 404s
// GET /workflow and bricks the workspace, so every retired or renamed action
// config key has to keep round-tripping through the node schema — and resolve to
// the single normalized record its adapter acts on.
const actionNode = (type: string, config: unknown) =>
  automationWorkflowNodeSchema.parse({
    id: 'action',
    type,
    label: 'Action',
    position: { x: 0, y: 0 },
    disabled: false,
    continueOnError: false,
    config,
  });

describe('action config compatibility', () => {
  test('library save still parses the legacy folderId misnomer', () => {
    const node = actionNode('action.library_save', {
      folderId: 'collection-1',
      titleTemplate: 'Automation output',
    });
    if (node.type !== 'action.library_save') throw new Error('wrong node parsed');

    expect(resolveAutomationLibrarySaveConfig(node.config)).toEqual({
      collectionId: 'collection-1',
      titleTemplate: 'Automation output',
    });
  });

  test('library save reads a null legacy folderId as the library root', () => {
    const node = actionNode('action.library_save', { folderId: null, titleTemplate: 'Report' });
    if (node.type !== 'action.library_save') throw new Error('wrong node parsed');

    expect(resolveAutomationLibrarySaveConfig(node.config).collectionId).toBeNull();
  });

  test('library save prefers collectionId and rejects a disagreeing pair', () => {
    const node = actionNode('action.library_save', {
      collectionId: 'collection-1',
      folderId: 'collection-1',
      titleTemplate: 'Output',
    });
    if (node.type !== 'action.library_save') throw new Error('wrong node parsed');
    expect(resolveAutomationLibrarySaveConfig(node.config).collectionId).toBe('collection-1');

    expect(() =>
      actionNode('action.library_save', {
        collectionId: 'collection-1',
        folderId: 'collection-2',
        titleTemplate: 'Output',
      }),
    ).toThrow();
  });

  test('planner upsert still parses the retired scheduledAtPath and defaults the bounds', () => {
    const node = actionNode('action.planner_upsert', {
      platform: 'instagram',
      scheduledAtPath: 'scheduledAt',
    });
    if (node.type !== 'action.planner_upsert') throw new Error('wrong node parsed');

    expect(resolveAutomationPlannerUpsertConfig(node.config)).toEqual({
      platform: 'instagram',
      accountId: null,
      itemsPath: 'items',
      maxDrafts: 10,
    });
  });

  test('planner upsert carries an authored account, items path and draft cap', () => {
    const node = actionNode('action.planner_upsert', {
      platform: 'linkedin',
      accountId: 'li-account-1',
      itemsPath: 'plan.items',
      maxDrafts: 3,
    });
    if (node.type !== 'action.planner_upsert') throw new Error('wrong node parsed');

    expect(resolveAutomationPlannerUpsertConfig(node.config)).toEqual({
      platform: 'linkedin',
      accountId: 'li-account-1',
      itemsPath: 'plan.items',
      maxDrafts: 3,
    });
  });

  test('planner upsert refuses an unbounded draft cap', () => {
    expect(() =>
      actionNode('action.planner_upsert', {
        platform: 'instagram',
        accountId: 'ig-1',
        maxDrafts: 500,
      }),
    ).toThrow();
  });

  test('organic publish still parses the pre-selector config', () => {
    const node = actionNode('action.organic_publish', {
      platform: 'instagram',
      accountId: 'ig-account-1',
    });
    if (node.type !== 'action.organic_publish') throw new Error('wrong node parsed');

    expect(resolveAutomationOrganicPublishConfig(node.config)).toEqual({
      platform: 'instagram',
      accountId: 'ig-account-1',
      lookaheadHours: 24,
      maxPosts: 5,
    });
  });

  test('organic publish bounds its window and its post count', () => {
    expect(() =>
      actionNode('action.organic_publish', {
        platform: 'instagram',
        accountId: 'ig-1',
        lookaheadHours: 1_000,
      }),
    ).toThrow();
    expect(() =>
      actionNode('action.organic_publish', {
        platform: 'instagram',
        accountId: 'ig-1',
        maxPosts: 100,
      }),
    ).toThrow();
  });

  test('ai studio generate still parses the roomId + instructions config', () => {
    const node = actionNode('action.ai_studio_generate', {
      roomId: null,
      instructions: 'Generate a creative from the workflow context.',
    });
    if (node.type !== 'action.ai_studio_generate') throw new Error('wrong node parsed');

    expect(resolveAutomationAiStudioGenerateConfig(node.config)).toEqual({
      roomId: null,
      generator: 'image',
      instructions: 'Generate a creative from the workflow context.',
      maxOutputs: 1,
    });
  });

  test('ai studio generate only offers the two server-side generation families', () => {
    expect(() =>
      actionNode('action.ai_studio_generate', {
        roomId: null,
        generator: 'timelineEditor',
        instructions: 'Render the timeline.',
      }),
    ).toThrow();
  });

  test('paid optimizer normalizes every retired entity-addressed operation', () => {
    for (const operation of ['pause', 'resume', 'set_budget', 'replace_creative']) {
      const node = actionNode('action.paid_optimizer', {
        operation,
        targetType: 'adset',
        targetId: 'adset-1',
        maxBudgetDeltaPct: null,
      });
      if (node.type !== 'action.paid_optimizer') throw new Error('wrong node parsed');

      expect(resolveAutomationPaidOptimizerConfig(node.config)).toEqual({
        portfolioId: null,
        operation: 'apply_approved',
        maxBudgetDeltaPct: null,
      });
    }
  });

  test('paid optimizer keeps the portfolio-addressed operations it actually exposes', () => {
    for (const operation of ['apply_approved', 'run_cycle'] as const) {
      const node = actionNode('action.paid_optimizer', {
        portfolioId: '11111111-1111-4111-8111-111111111111',
        operation,
        maxBudgetDeltaPct: 20,
      });
      if (node.type !== 'action.paid_optimizer') throw new Error('wrong node parsed');

      expect(resolveAutomationPaidOptimizerConfig(node.config)).toEqual({
        portfolioId: '11111111-1111-4111-8111-111111111111',
        operation,
        maxBudgetDeltaPct: 20,
      });
    }
  });

  test('paid optimizer rejects an operation the optimizer has no write surface for', () => {
    expect(() =>
      actionNode('action.paid_optimizer', {
        portfolioId: '11111111-1111-4111-8111-111111111111',
        operation: 'delete_campaign',
      }),
    ).toThrow();
  });
});
