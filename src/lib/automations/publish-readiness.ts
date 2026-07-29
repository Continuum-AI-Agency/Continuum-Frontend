// Pure pre-publish readiness check for an automation workflow definition.
//
// Publishing locks the graph and activates the schedule, so the checks here are
// deliberately about what would FAIL AT RUNTIME rather than about what the
// structural validator already rejects. Three classes of that failure exist and
// none of them are visible in the graph today:
//
//  1. a capability the deployed server reports as unavailable or unwired,
//     which the bundled lifecycle constant claims is production;
//  2. a placeholder id the node factory ships (`select-connection`, …) that
//     satisfies `z.string().min(1)`, so it saves, validates and publishes;
//  3. a webhook node whose managed binding was never minted — the runtime
//     throws without `endpointId` / `destinationId`.
//
// A DISABLED node is never a blocker: it does not run. That is also the escape
// hatch (`disableBlockingNodes`) — flipping the offending nodes off leaves the
// graph intact rather than forcing a delete.
//
// Deliberately NOT a blocker: a preview-lifecycle node on the canvas. Preview
// nodes are legitimate in a draft, the catalog already creates them disabled,
// and server templates may contain them. Only an ENABLED action node resolves
// its preview lifecycle into a blocker, and a `source` node blocks only when
// the SERVER explicitly calls it unavailable — a bundled preview source
// (competitors, live web, connected platform) stays publishable.

import type {
  AutomationCapabilitiesResponse,
  AutomationWorkflowDefinition,
  AutomationWorkflowNode,
  AutomationWorkflowNodeType,
  TestAutomationWorkflowResponse,
} from '@continuum/contracts';
import { automationNodeNeedsBinding } from '@/components/automations/workspace/automationNodeCatalog';
import { findUnsetConfigFields, resolveNodeLifecycle } from './capability-lifecycle';

export type PublishBlockerCode =
  | 'capability_unavailable'
  | 'capability_preview'
  | 'unset_configuration'
  | 'missing_webhook_binding';

export type PublishBlocker = {
  nodeId: string;
  nodeType: AutomationWorkflowNodeType;
  nodeLabel: string;
  code: PublishBlockerCode;
  /** One sentence naming what is wrong, written for the person publishing. */
  message: string;
  /** What to do about it, or the server's own reason when it gave one. */
  detail: string;
};

export type PublishWarning = {
  nodeId: string;
  nodeType: AutomationWorkflowNodeType;
  nodeLabel: string;
  code: 'needs_connection';
  message: string;
  detail: string;
};

export type PublishReadiness = {
  blockers: PublishBlocker[];
  warnings: PublishWarning[];
  /** Distinct ids of every node carrying at least one blocker, in graph order. */
  blockingNodeIds: string[];
  isClean: boolean;
};

export type PublishReadinessQuery = {
  definition: AutomationWorkflowDefinition | null | undefined;
  capabilities?: AutomationCapabilitiesResponse | null;
};

const EMPTY_READINESS: PublishReadiness = {
  blockers: [],
  warnings: [],
  blockingNodeIds: [],
  isClean: true,
};

const isActionNode = (node: AutomationWorkflowNode): boolean => node.type.startsWith('action.');

const bindingDetail = (node: AutomationWorkflowNode): string =>
  node.type === 'trigger.webhook'
    ? 'Create the inbound endpoint in Webhooks so this trigger has a signed URL to receive on.'
    : 'Pick a signed destination in Webhooks so this step has somewhere to deliver.';

const describeNode = (node: AutomationWorkflowNode) => ({
  nodeId: node.id,
  nodeType: node.type,
  nodeLabel: node.label,
});

const collectNodeBlockers = (
  node: AutomationWorkflowNode,
  capabilities: AutomationCapabilitiesResponse | null | undefined,
): PublishBlocker[] => {
  const blockers: PublishBlocker[] = [];
  const capability = resolveNodeLifecycle({ node, capabilities });
  const base = describeNode(node);

  // Only the server ever reports `unavailable`; the bundled fallback is always
  // `ready`. So this branch is by construction a server statement about a
  // source or an action, whatever the node type.
  if (capability.availability === 'unavailable') {
    blockers.push({
      ...base,
      code: 'capability_unavailable',
      message: `${node.label} is unavailable on this brand.`,
      detail: capability.reason ?? 'The server reports this capability as unavailable.',
    });
  } else if (isActionNode(node) && capability.lifecycle === 'preview') {
    blockers.push({
      ...base,
      code: 'capability_preview',
      message: `${node.label} is still in preview and cannot run live.`,
      detail:
        capability.reason ??
        'Disable this step or swap it for a production action before publishing.',
    });
  }

  for (const field of findUnsetConfigFields(node)) {
    blockers.push({
      ...base,
      code: 'unset_configuration',
      message: `${node.label} still has a placeholder in ${field.path}.`,
      detail: `"${field.sentinel}" is the value the node ships with. Choose a real one in the inspector.`,
    });
  }

  if (automationNodeNeedsBinding(node)) {
    blockers.push({
      ...base,
      code: 'missing_webhook_binding',
      message: `${node.label} has no managed webhook binding.`,
      detail: bindingDetail(node),
    });
  }

  return blockers;
};

const collectNodeWarnings = (
  node: AutomationWorkflowNode,
  capabilities: AutomationCapabilitiesResponse | null | undefined,
): PublishWarning[] => {
  const capability = resolveNodeLifecycle({ node, capabilities });
  if (capability.availability !== 'needs_connection') return [];

  return [
    {
      ...describeNode(node),
      code: 'needs_connection',
      message: `${node.label} needs a connection before it can do anything.`,
      detail: capability.reason ?? 'Connect the platform this step reads from.',
    },
  ];
};

/** Everything that would stop — or quietly hollow out — a live run of this graph. */
export function collectPublishBlockers({
  definition,
  capabilities,
}: PublishReadinessQuery): PublishReadiness {
  if (!definition) return EMPTY_READINESS;

  const enabled = definition.nodes.filter((node) => !node.disabled);
  const blockers = enabled.flatMap((node) => collectNodeBlockers(node, capabilities));
  const warnings = enabled.flatMap((node) => collectNodeWarnings(node, capabilities));
  const blockingNodeIds = [...new Set(blockers.map((blocker) => blocker.nodeId))];

  return {
    blockers,
    warnings,
    blockingNodeIds,
    isClean: blockers.length === 0 && warnings.length === 0,
  };
}

/**
 * The escape hatch's patch: flip `disabled` on every blocking node and leave
 * the rest of the graph — nodes, edges, execution policy, viewport — untouched.
 * Returns the same definition object when nothing would change, so a caller can
 * skip a pointless save.
 */
export function disableBlockingNodes({
  definition,
  blockingNodeIds,
}: {
  definition: AutomationWorkflowDefinition;
  blockingNodeIds: readonly string[];
}): AutomationWorkflowDefinition {
  const targets = new Set(blockingNodeIds);
  if (targets.size === 0) return definition;

  let changed = false;
  const nodes = definition.nodes.map((node) => {
    if (!targets.has(node.id) || node.disabled) return node;
    changed = true;
    return { ...node, disabled: true };
  });

  return changed ? { ...definition, nodes } : definition;
}

export type TestFreshnessState = 'unknown' | 'passing' | 'failing';

export type TestFreshness = {
  state: TestFreshnessState;
  message: string;
};

/**
 * What this session knows about the server-side test, which is not the whole
 * truth: publishing requires a green server test for the exact definition hash,
 * and the server answers 422 `validation_stale` when it does not have one. A
 * page reload drops the local result while the server's test still stands, so
 * `unknown` is an invitation to run one — never a reason to block Publish.
 */
export function summarizeTestFreshness(
  testResult: TestAutomationWorkflowResponse | null | undefined,
): TestFreshness {
  if (!testResult) {
    return {
      state: 'unknown',
      message:
        'No test run in this session. Publishing needs a passing server test for this exact graph — run one if publishing is refused as stale.',
    };
  }

  const failed = testResult.nodeExecutions.filter(
    (execution) => execution.status === 'failed',
  ).length;

  if (failed > 0) {
    return {
      state: 'failing',
      message: `The last test failed on ${failed} node${failed === 1 ? '' : 's'}. Fix those before publishing.`,
    };
  }

  return {
    state: 'passing',
    message: `Last test passed ${testResult.nodeExecutions.length} node${
      testResult.nodeExecutions.length === 1 ? '' : 's'
    }.`,
  };
}
