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

// The unset-config sentinels and their walk moved to `@continuum/contracts` so
// the publish ROUTE rejects the same graph the browser does — the check was
// Frontend-only, which made it advisory against a direct API publish. Re-exported
// here because the palette, node card, inspector and publish dialog all reach
// for them through this module.
export {
  AUTOMATION_UNSET_CONFIG_SENTINELS,
  type AutomationUnsetConfigSentinel,
  findUnsetConfigFields,
  hasUnsetConfigField,
  type UnsetConfigField,
} from '@continuum/contracts';
