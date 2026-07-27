import type { AutomationRecipients, AutomationSchedule } from './automation';
import type {
  AutomationSourceKind,
  AutomationWorkflowDefinition,
  AutomationWorkflowNode,
} from './workflow';

const position = (column: number, row = 0) => ({ x: column * 320, y: row * 180 });

const node = <T extends AutomationWorkflowNode>(
  value: Omit<T, 'position' | 'disabled' | 'continueOnError'> & {
    position?: T['position'];
    disabled?: boolean;
    continueOnError?: boolean;
  },
): T =>
  ({
    position: value.position ?? position(0),
    disabled: value.disabled ?? false,
    continueOnError: value.continueOnError ?? false,
    ...value,
  }) as T;

const edge = (source: string, target: string, sourceHandle = 'output', targetHandle = 'input') => ({
  id: `e:${source}:${sourceHandle}:${target}:${targetHandle}`,
  source,
  sourceHandle,
  target,
  targetHandle,
});

export function createLegacyAutomationWorkflow(input: {
  agent: 'jaina' | 'organic';
  prompt: string;
  schedule: AutomationSchedule;
  recipients: AutomationRecipients;
  name?: string;
}): AutomationWorkflowDefinition {
  return {
    schemaVersion: 3,
    execution: { maxRunSeconds: 900, maxParallelNodes: 4 },
    nodes: [
      node({
        id: 'schedule',
        type: 'trigger.schedule',
        label: 'Schedule',
        position: position(0),
        config: { schedule: input.schedule },
      }),
      node({
        id: 'instruction',
        type: 'instruction',
        label: 'Instructions',
        position: position(1),
        config: { text: input.prompt },
      }),
      node({
        id: 'agent',
        type: 'agent',
        label: input.agent === 'jaina' ? 'Jaina' : 'Organic agent',
        position: position(2),
        config: {
          agent: input.agent,
          instructions: '',
          outputFormat: 'text',
          timeoutSeconds: 300,
          policy: {
            capabilities: [],
            toolMode: 'auto',
            requiredTools: [],
            allowedTools: [],
            maxSteps: 8,
          },
          validation: {
            requireSchema: false,
            minimumEvidence: 0,
            requiredTools: [],
            requiredReportSections: [],
            requireActionReceipt: false,
          },
        },
      }),
      node({
        id: 'formatter',
        type: 'output.formatter',
        label: 'Format report',
        position: position(3),
        config: {
          contract: { kind: 'native', contractId: 'report.document', version: 1 },
          instructions: 'Synthesize the evidence into a concise, decision-ready report.',
          timeoutSeconds: 180,
          maxAttempts: 2,
        },
      }),
      node({
        id: 'report',
        type: 'report',
        label: 'Render report',
        position: position(4),
        config: {
          title: input.name ?? 'Automation report',
          objective: 'Turn the agent result into a clear, decision-ready report.',
          audience: 'Brand stakeholders',
          templateId: 'continuum-report',
          sections: [
            {
              id: 'summary',
              heading: 'Summary',
              guidance: 'Lead with the most important findings and outcomes.',
              required: true,
            },
            {
              id: 'actions',
              heading: 'Recommended actions',
              guidance: 'List concrete next steps with evidence.',
              required: true,
            },
          ],
          frontMatter: {},
        },
      }),
      node({
        id: 'email',
        type: 'action.email',
        label: 'Email report',
        position: position(5),
        config: {
          recipients: input.recipients,
          subject: input.name ?? 'Continuum automation report',
        },
      }),
    ],
    edges: [
      edge('schedule', 'instruction'),
      edge('instruction', 'agent'),
      edge('agent', 'formatter'),
      edge('formatter', 'report'),
      edge('report', 'email'),
    ],
    viewport: { x: 40, y: 120, zoom: 0.85 },
  };
}

function source(
  id: string,
  label: string,
  sourceKind: AutomationSourceKind,
  row: number,
): AutomationWorkflowNode {
  return node({
    id,
    type: 'source',
    label,
    position: position(1, row),
    config: { source: sourceKind, mode: 'live', query: {}, pinnedIds: [] },
  });
}

export const AUTOMATION_WORKFLOW_TEMPLATES: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  definition: AutomationWorkflowDefinition;
}> = [
  {
    id: 'performance-pulse',
    name: 'Paid + organic performance pulse',
    description: 'Parallel paid and organic analysis synthesized into one stakeholder report.',
    definition: {
      schemaVersion: 3,
      execution: { maxRunSeconds: 1_800, maxParallelNodes: 4 },
      nodes: [
        node({
          id: 'schedule',
          type: 'trigger.schedule',
          label: 'Every Monday',
          position: position(0, 1),
          config: {
            schedule: { kind: 'weekly', dayOfWeek: 1, time: '09:00', timezone: 'UTC' },
          },
        }),
        source('paid-data', 'Paid analytics', 'paid_analytics', 0),
        source('organic-data', 'Organic analytics', 'organic_analytics', 2),
        node({
          id: 'jaina',
          type: 'agent',
          label: 'Jaina',
          position: position(2, 0),
          config: {
            agent: 'jaina',
            instructions: 'Explain material paid-media changes and the actions they imply.',
            outputFormat: 'text',
            timeoutSeconds: 300,
            policy: {
              capabilities: ['paid.performance_overview', 'report.synthesis'],
              toolMode: 'auto',
              requiredTools: [],
              allowedTools: [],
              maxSteps: 8,
            },
            validation: {
              requireSchema: false,
              minimumEvidence: 1,
              requiredTools: [],
              requiredReportSections: [],
              requireActionReceipt: false,
            },
          },
        }),
        node({
          id: 'organic',
          type: 'agent',
          label: 'Organic agent',
          position: position(2, 2),
          config: {
            agent: 'organic',
            instructions: 'Explain material organic changes and the actions they imply.',
            outputFormat: 'text',
            timeoutSeconds: 300,
            policy: {
              capabilities: ['organic.performance_overview', 'report.synthesis'],
              toolMode: 'auto',
              requiredTools: [],
              allowedTools: [],
              maxSteps: 8,
            },
            validation: {
              requireSchema: false,
              minimumEvidence: 1,
              requiredTools: [],
              requiredReportSections: [],
              requireActionReceipt: false,
            },
          },
        }),
        node({
          id: 'join',
          type: 'logic.join',
          label: 'Combine findings',
          position: position(3, 1),
          config: { mode: 'all' },
        }),
        node({
          id: 'formatter',
          type: 'output.formatter',
          label: 'Synthesize report',
          position: position(4, 1),
          config: {
            contract: { kind: 'native', contractId: 'report.document', version: 1 },
            instructions:
              'Synthesize paid and organic findings into one evidence-led performance report.',
            timeoutSeconds: 180,
            maxAttempts: 2,
          },
        }),
        node({
          id: 'report',
          type: 'report',
          label: 'Render performance pulse',
          position: position(5, 1),
          config: {
            title: 'Weekly performance pulse',
            objective: 'Explain what changed, why it matters, and what to do next.',
            audience: 'Marketing leadership',
            templateId: 'continuum-report',
            sections: [
              {
                id: 'executive-summary',
                heading: 'Executive summary',
                guidance: 'Prioritize material movements.',
                required: true,
              },
              {
                id: 'paid',
                heading: 'Paid media',
                guidance: 'Include evidence and actions.',
                required: true,
              },
              {
                id: 'organic',
                heading: 'Organic',
                guidance: 'Include evidence and actions.',
                required: true,
              },
            ],
            frontMatter: { cadence: 'weekly' },
          },
        }),
        node({
          id: 'email',
          type: 'action.email',
          label: 'Email stakeholders',
          position: position(6, 1),
          config: {
            recipients: { memberUserIds: [], externalEmails: [] },
            subject: 'Weekly Continuum performance pulse',
          },
        }),
      ],
      edges: [
        edge('schedule', 'paid-data'),
        edge('schedule', 'organic-data'),
        edge('paid-data', 'jaina'),
        edge('organic-data', 'organic'),
        edge('jaina', 'join'),
        edge('organic', 'join'),
        edge('join', 'formatter'),
        edge('formatter', 'report'),
        edge('report', 'email'),
      ],
      viewport: { x: 30, y: 80, zoom: 0.75 },
    },
  },
];
