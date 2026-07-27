import { describe, expect, test } from 'bun:test';
import { automationWorkflowNodeSchema } from './workflow';
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
