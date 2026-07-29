// Server-first capability resolution for automation workflow nodes.
//
// `AUTOMATION_NODE_LIFECYCLE` / `AUTOMATION_SOURCE_LIFECYCLE` are constants
// compiled into the bundle, so every surface that read them directly was
// working from a build-time snapshot that drifts from the deployed backend.
// `GET /api/automations/capabilities` now ships the truth on `sources` and
// `actions`; this module is the single lookup the palette, node card,
// inspector and publish dialog share. The bundled constant stays as the
// fallback because `capabilities.actions` is optional on the wire — its
// absence is normal, not an error.

import {
  AUTOMATION_NODE_LIFECYCLE,
  AUTOMATION_SOURCE_LIFECYCLE,
  type AutomationCapabilitiesResponse,
  type AutomationCapabilityAvailability,
  type AutomationCapabilityLifecycle,
  type AutomationWorkflowNode,
  type AutomationWorkflowNodeType,
} from '@continuum/contracts';

/** Where the resolved answer came from. `bundled` means the server said nothing. */
export type AutomationCapabilityOrigin = 'server' | 'bundled';

export type ResolvedNodeCapability = {
  lifecycle: AutomationCapabilityLifecycle;
  availability: AutomationCapabilityAvailability;
  /** The server's explanation for a non-`ready` availability, when it gave one. */
  reason: string | null;
  origin: AutomationCapabilityOrigin;
};

export type NodeCapabilityQuery = {
  node: AutomationWorkflowNode;
  capabilities?: AutomationCapabilitiesResponse | null;
};

const isActionNodeType = (type: AutomationWorkflowNodeType): boolean => type.startsWith('action.');

const bundledCapability = (node: AutomationWorkflowNode): ResolvedNodeCapability => ({
  lifecycle:
    node.type === 'source'
      ? AUTOMATION_SOURCE_LIFECYCLE[node.config.source]
      : AUTOMATION_NODE_LIFECYCLE[node.type],
  availability: 'ready',
  reason: null,
  origin: 'bundled',
});

/**
 * Precedence: the matching `capabilities.actions` entry for an `action.*` node,
 * then the matching `capabilities.sources` entry for a `source` node, then the
 * bundled lifecycle constant with a `ready` availability.
 */
export function resolveNodeLifecycle({
  node,
  capabilities,
}: NodeCapabilityQuery): ResolvedNodeCapability {
  if (isActionNodeType(node.type)) {
    const action = capabilities?.actions?.find((entry) => entry.type === node.type);
    if (action) {
      return {
        lifecycle: action.lifecycle,
        availability: action.availability,
        reason: action.reason,
        origin: 'server',
      };
    }
  }

  if (node.type === 'source') {
    const source = capabilities?.sources.find((entry) => entry.source === node.config.source);
    if (source) {
      return {
        lifecycle: source.lifecycle,
        availability: source.availability,
        reason: source.reason,
        origin: 'server',
      };
    }
  }

  return bundledCapability(node);
}

/**
 * Placeholder strings `createAutomationWorkflowNode` ships so a freshly dropped
 * node parses. Every one of them satisfies `z.string().min(1)`, so the node
 * saves, validates and publishes — and then fails at runtime against an id that
 * was never chosen. Treated as "unset" rather than "configured".
 */
export const AUTOMATION_UNSET_CONFIG_SENTINELS = [
  'select-connection',
  'pending-schema-v1',
  'select-connected-account',
  'select-paid-target',
] as const;

export type AutomationUnsetConfigSentinel = (typeof AUTOMATION_UNSET_CONFIG_SENTINELS)[number];

export type UnsetConfigField = {
  /** Dotted path into `node.config`, e.g. `connectionId` or `targets.0.id`. */
  path: string;
  sentinel: AutomationUnsetConfigSentinel;
};

const SENTINELS = new Set<string>(AUTOMATION_UNSET_CONFIG_SENTINELS);

const isSentinel = (value: string): value is AutomationUnsetConfigSentinel => SENTINELS.has(value);

const collectSentinels = (value: unknown, path: string, found: UnsetConfigField[]): void => {
  if (typeof value === 'string') {
    if (isSentinel(value)) found.push({ path, sentinel: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectSentinels(entry, path ? `${path}.${index}` : String(index), found);
    });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectSentinels(entry, path ? `${path}.${key}` : key, found);
    }
  }
};

/** Every placeholder value still sitting in a node's config, deeply. */
export function findUnsetConfigFields(node: AutomationWorkflowNode): UnsetConfigField[] {
  const found: UnsetConfigField[] = [];
  collectSentinels(node.config, '', found);
  return found;
}

export const hasUnsetConfigField = (node: AutomationWorkflowNode): boolean =>
  findUnsetConfigFields(node).length > 0;
