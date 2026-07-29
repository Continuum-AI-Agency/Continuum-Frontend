import {
  AUTOMATION_NODE_LIFECYCLE,
  AUTOMATION_SOURCE_LIFECYCLE,
  type AutomationCapabilityLifecycle,
  type AutomationWorkflowNode,
} from '@continuum/contracts';
import type { LucideIcon } from 'lucide-react';
import {
  BellRing,
  Bot,
  Braces,
  CalendarClock,
  ChartNoAxesCombined,
  Clock3,
  Database,
  FileOutput,
  FileText,
  GitBranch,
  GitFork,
  Globe2,
  Images,
  Library,
  Mail,
  Merge,
  Play,
  Repeat2,
  Send,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';

export type AutomationNodeCategory = 'trigger' | 'context' | 'intelligence' | 'logic' | 'outcome';

export type AutomationNodeCatalogItem = {
  type: AutomationWorkflowNode['type'];
  label: string;
  description: string;
  category: AutomationNodeCategory;
  icon: LucideIcon;
};

export const AUTOMATION_NODE_CATALOG: ReadonlyArray<{
  category: AutomationNodeCategory;
  label: string;
  description: string;
  items: ReadonlyArray<AutomationNodeCatalogItem>;
}> = [
  {
    category: 'trigger',
    label: 'Start',
    description: 'Choose what wakes the workflow.',
    items: [
      {
        type: 'trigger.manual',
        label: 'Manual run',
        description: 'Start on demand from the workspace.',
        category: 'trigger',
        icon: Play,
      },
      {
        type: 'trigger.schedule',
        label: 'Schedule',
        description: 'Run on a recurring cadence.',
        category: 'trigger',
        icon: Clock3,
      },
      {
        type: 'trigger.event',
        label: 'Continuum event',
        description: 'React to activity in Library, Planner, Trends, or competitors.',
        category: 'trigger',
        icon: BellRing,
      },
      {
        type: 'trigger.metric',
        label: 'Metric threshold',
        description: 'Run when a tracked metric crosses a threshold.',
        category: 'trigger',
        icon: ChartNoAxesCombined,
      },
      {
        type: 'trigger.webhook',
        label: 'Inbound webhook',
        description: 'Accept a signed, typed request from another system.',
        category: 'trigger',
        icon: Globe2,
      },
    ],
  },
  {
    category: 'context',
    label: 'Ground',
    description: 'Bring trusted data and direction into the run.',
    items: [
      {
        type: 'source',
        label: 'Data source',
        description: 'Pull live or pinned context from Continuum and connected sources.',
        category: 'context',
        icon: Database,
      },
      {
        type: 'integration.query',
        label: 'Integration query',
        description: 'Run a deterministic read against a connected platform.',
        category: 'context',
        icon: Share2,
      },
      {
        type: 'mcp.read',
        label: 'MCP read',
        description: 'Call an approved read-only Continuum MCP tool.',
        category: 'context',
        icon: Globe2,
      },
      {
        type: 'instruction',
        label: 'Instructions',
        description: 'Add a reusable prompt or operating rule.',
        category: 'context',
        icon: Braces,
      },
    ],
  },
  {
    category: 'intelligence',
    label: 'Think',
    description: 'Analyze context and shape decision-ready output.',
    items: [
      {
        type: 'agent',
        label: 'Agent',
        description: 'Ask Jaina or the Organic agent to reason with the input.',
        category: 'intelligence',
        icon: Bot,
      },
      {
        type: 'output.formatter',
        label: 'Output formatter',
        description: 'Validate and fit labeled agent artifacts into a selected contract.',
        category: 'intelligence',
        icon: FileOutput,
      },
      {
        type: 'report',
        label: 'Report',
        description: 'Assemble a structured report with sections and front matter.',
        category: 'intelligence',
        icon: FileText,
      },
    ],
  },
  {
    category: 'logic',
    label: 'Orchestrate',
    description: 'Route, fan out, join, and bound repeated work.',
    items: [
      {
        type: 'logic.if',
        label: 'If / else',
        description: 'Choose between true and false paths.',
        category: 'logic',
        icon: GitBranch,
      },
      {
        type: 'logic.switch',
        label: 'Switch',
        description: 'Route values across named cases.',
        category: 'logic',
        icon: SlidersHorizontal,
      },
      {
        type: 'logic.parallel',
        label: 'Parallel',
        description: 'Fan one input into concurrent branches.',
        category: 'logic',
        icon: GitFork,
      },
      {
        type: 'logic.join',
        label: 'Join',
        description: 'Wait for all or any incoming branch.',
        category: 'logic',
        icon: Merge,
      },
      {
        type: 'logic.repeat_until',
        label: 'Repeat',
        description: 'Run a connected branch a fixed number of times.',
        category: 'logic',
        icon: Repeat2,
      },
    ],
  },
  {
    category: 'outcome',
    label: 'Act',
    description: 'Deliver, publish, save, or hand work to another Continuum surface.',
    items: [
      {
        type: 'action.email',
        label: 'Email',
        description: 'Send a report or text result to selected recipients.',
        category: 'outcome',
        icon: Mail,
      },
      {
        type: 'action.library_save',
        label: 'Save to Library',
        description: 'Persist generated media, records, or reports.',
        category: 'outcome',
        icon: Library,
      },
      {
        type: 'action.planner_upsert',
        label: 'Add to Planner',
        description: 'Create or update a scheduled content draft.',
        category: 'outcome',
        icon: CalendarClock,
      },
      {
        type: 'action.organic_publish',
        label: 'Publish organic',
        description: 'Publish approved content to a connected account.',
        category: 'outcome',
        icon: Send,
      },
      {
        type: 'action.ai_studio_generate',
        label: 'Generate in AI Studio',
        description: 'Open a creative generation job with workflow context.',
        category: 'outcome',
        icon: Images,
      },
      {
        type: 'action.paid_optimizer',
        label: 'Paid optimizer',
        description: 'Apply a bounded paid-media optimization action.',
        category: 'outcome',
        icon: ChartNoAxesCombined,
      },
      {
        type: 'action.outbound_webhook',
        label: 'Send webhook',
        description: 'Deliver the result to a signed destination in another system.',
        category: 'outcome',
        icon: Share2,
      },
    ],
  },
] as const;

const CATALOG_BY_TYPE = new Map(
  AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).map((item) => [item.type, item]),
);

export const getAutomationNodeCatalogItem = (
  type: AutomationWorkflowNode['type'],
): AutomationNodeCatalogItem =>
  CATALOG_BY_TYPE.get(type) ?? {
    type,
    label: type.replaceAll('.', ' '),
    description: 'Workflow step',
    category: 'context',
    icon: FileOutput,
  };

export const getAutomationNodeLifecycle = (
  node: AutomationWorkflowNode,
): AutomationCapabilityLifecycle =>
  node.type === 'source'
    ? AUTOMATION_SOURCE_LIFECYCLE[node.config.source]
    : AUTOMATION_NODE_LIFECYCLE[node.type];

/**
 * A node the graph accepts structurally but the runtime would refuse: the
 * managed webhook binding is minted by a separate flow (the Webhooks dialog),
 * so a freshly dropped webhook node is legal-but-inert until that binding
 * lands. Surfaced on the canvas and in the inspector so the gap is visible
 * before publishing rejects it.
 */
export const automationNodeNeedsBinding = (node: AutomationWorkflowNode): boolean => {
  if (node.type === 'trigger.webhook') return !node.config.endpointId;
  if (node.type === 'action.outbound_webhook') return !node.config.destinationId;
  return false;
};

const createNodeId = (type: AutomationWorkflowNode['type']) =>
  `${type.replaceAll('.', '-')}-${crypto.randomUUID().slice(0, 8)}`;

export function createAutomationWorkflowNode({
  type,
  position,
  id = createNodeId(type),
}: {
  type: AutomationWorkflowNode['type'];
  position: { x: number; y: number };
  id?: string;
}): AutomationWorkflowNode {
  const common = {
    id,
    type,
    position,
    disabled: AUTOMATION_NODE_LIFECYCLE[type] === 'preview',
    continueOnError: false,
  };

  switch (type) {
    case 'trigger.manual':
      return { ...common, type, label: 'Run manually', config: { inputSchema: {} } };
    case 'trigger.schedule':
      return {
        ...common,
        type,
        label: 'Every day',
        config: { schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' } },
      };
    case 'trigger.event':
      return {
        ...common,
        type,
        label: 'Library asset created',
        config: { eventType: 'library.asset.created', filters: {} },
      };
    case 'trigger.metric':
      return {
        ...common,
        type,
        label: 'Metric changed',
        config: {
          metric: 'organic.visibility_score',
          operator: 'changed_by',
          value: 10,
          window: '24h',
          cooldownMinutes: 60,
        },
      };
    case 'trigger.webhook':
      return { ...common, type, label: 'Inbound webhook', config: { payloadSchema: {} } };
    case 'source':
      return {
        ...common,
        type,
        label: 'Library context',
        config: { source: 'library', mode: 'live', query: {}, pinnedIds: [] },
      };
    case 'integration.query':
      return {
        ...common,
        type,
        label: 'Query Meta',
        config: {
          provider: 'meta',
          operation: 'analytics.performance',
          connectionId: 'select-connection',
          parameters: {},
          schemaHash: 'pending-schema-v1',
          timeoutSeconds: 60,
        },
      };
    case 'mcp.read':
      return {
        ...common,
        type,
        label: 'Read MCP tool',
        config: {
          toolName: 'analytics.query',
          arguments: {},
          schemaHash: 'pending-schema-v1',
          timeoutSeconds: 60,
        },
      };
    case 'instruction':
      return {
        ...common,
        type,
        label: 'Instructions',
        config: { text: 'Explain what the agent should accomplish with the incoming context.' },
      };
    case 'agent':
      return {
        ...common,
        type,
        label: 'Jaina',
        config: {
          agent: 'jaina',
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
      };
    case 'output.formatter':
      return {
        ...common,
        type,
        label: 'Format report',
        config: {
          contract: { kind: 'native', contractId: 'report.document', version: 1 },
          instructions: 'Synthesize only the supplied evidence into a concise final output.',
          timeoutSeconds: 180,
          maxAttempts: 2,
        },
      };
    case 'report':
      return {
        ...common,
        type,
        label: 'Decision report',
        config: {
          title: 'Automation report',
          objective: 'Turn the workflow result into a clear, decision-ready report.',
          audience: 'Brand stakeholders',
          templateId: 'continuum-report',
          sections: [
            {
              id: 'summary',
              heading: 'Summary',
              guidance: 'Lead with material findings and evidence.',
              required: true,
            },
          ],
          frontMatter: {},
        },
      };
    case 'logic.if':
      return {
        ...common,
        type,
        label: 'If / else',
        config: { condition: { path: 'ok', operator: 'eq', value: true } },
      };
    case 'logic.switch':
      return {
        ...common,
        type,
        label: 'Route by status',
        config: {
          path: 'status',
          cases: [{ id: 'matched', label: 'Matched', value: 'matched' }],
        },
      };
    case 'logic.parallel':
      return { ...common, type, label: 'Run in parallel', config: {} };
    case 'logic.join':
      return { ...common, type, label: 'Join branches', config: { mode: 'all' } };
    case 'logic.repeat_until':
      return {
        ...common,
        type,
        label: 'Repeat 3 times',
        config: { iterations: 3 },
      };
    case 'action.email':
      return {
        ...common,
        type,
        label: 'Email report',
        config: {
          recipients: { memberUserIds: [], externalEmails: [] },
          subject: 'Continuum automation report',
        },
      };
    case 'action.library_save':
      return {
        ...common,
        type,
        label: 'Save to Library',
        config: { folderId: null, titleTemplate: 'Automation output' },
      };
    case 'action.planner_upsert':
      return {
        ...common,
        type,
        label: 'Add to Planner',
        config: { platform: 'instagram', scheduledAtPath: 'scheduledAt' },
      };
    case 'action.organic_publish':
      return {
        ...common,
        type,
        label: 'Publish organic',
        config: { platform: 'instagram', accountId: 'select-connected-account' },
      };
    case 'action.ai_studio_generate':
      return {
        ...common,
        type,
        label: 'Generate in AI Studio',
        config: { roomId: null, instructions: 'Generate a creative from the workflow context.' },
      };
    case 'action.paid_optimizer':
      return {
        ...common,
        type,
        // Portfolio-addressed, not entity-addressed: the optimizer exposes no
        // status write, so this node cannot pause or resume anything. It drains
        // the recommendations a human already approved.
        label: 'Apply approved optimizer changes',
        config: {
          portfolioId: null,
          operation: 'apply_approved',
          maxBudgetDeltaPct: null,
        },
      };
    case 'action.outbound_webhook':
      return {
        ...common,
        type,
        label: 'Send webhook',
        config: {
          destinationId: undefined,
          method: 'POST',
          secretRef: null,
        },
      };
  }
}
