// The placeholder ids `createAutomationWorkflowNode` ships so a freshly dropped
// node parses, and the shared walk that finds them again.
//
// Every sentinel satisfies `z.string().min(1)`, so a graph carrying one saves,
// validates and PUBLISHES, then fails at runtime against an id nobody chose.
// This lived in the Frontend only, which made the check advisory: the publish
// route accepts a definition over HTTP and the server had no idea these strings
// were special. It belongs here so the browser and the publish route reject the
// same graph for the same reason.
//
// Adding a sentinel to the node factory means adding it here, or the gate goes
// quiet for it — which is the failure mode this module exists to prevent.

import type { AutomationWorkflowNode } from './workflow';

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

export const isAutomationUnsetConfigSentinel = (
  value: string,
): value is AutomationUnsetConfigSentinel => SENTINELS.has(value);

const collectSentinels = (value: unknown, path: string, found: UnsetConfigField[]): void => {
  if (typeof value === 'string') {
    if (isAutomationUnsetConfigSentinel(value)) found.push({ path, sentinel: value });
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
