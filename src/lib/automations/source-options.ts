// Which data sources the builder offers, and what they are called.
//
// The list comes from the SERVER (`/capabilities`) rather than from the bundled
// `automationSourceKindSchema` enum. The two disagree during every rollout: the
// bundled enum is whatever the frontend deploy carries, while the server knows
// which kinds actually have a resolver behind them. Offering a kind the deployed
// backend cannot resolve produces a graph that saves, passes a test run, and
// then fails on its first real run.

import {
  AUTOMATION_SOURCE_LIFECYCLE,
  type AutomationCapabilitiesResponse,
  type AutomationSourceKind,
  automationSourceKindSchema,
} from '@continuum/contracts';

/**
 * Display names. Derived labels read badly for the compound kinds —
 * `source.replaceAll('_', ' ')` renders `whats_working` as "whats working" —
 * and this map is the single place those names are decided, shared with
 * `docs/automations-node-reference.md`.
 */
export const AUTOMATION_SOURCE_LABELS: Readonly<Record<string, string>> = {
  brand_knowledge: 'Brand knowledge',
  library: 'Library',
  saved_prompt: 'Saved prompt',
  saved_skill: 'Saved skill',
  paid_analytics: 'Paid analytics',
  organic_analytics: 'Organic analytics',
  planner: 'Planner',
  trends: 'Trends',
  previous_run: 'Previous run',
  competitors: 'Competitors',
  connected_platform: 'Connected platform',
  live_web: 'Live web',
  optimizer: 'Paid optimizer',
  whats_working: "What's working",
  audience: 'Audience',
};

/** Falls back to a humanized form so a kind shipped after this build still reads. */
export const automationSourceLabel = (source: string): string =>
  AUTOMATION_SOURCE_LABELS[source] ??
  source.replaceAll('_', ' ').replace(/^./, (char) => char.toUpperCase());

export type AutomationSourceOption = {
  value: string;
  label: string;
  disabled: boolean;
  preview: boolean;
  reason: string | null;
};

const bundledOption = (source: AutomationSourceKind): AutomationSourceOption => ({
  value: source,
  label: automationSourceLabel(source),
  disabled: false,
  preview: AUTOMATION_SOURCE_LIFECYCLE[source] === 'preview',
  reason: null,
});

export const buildAutomationSourceOptions = ({
  capabilities,
  selected,
}: {
  capabilities?: AutomationCapabilitiesResponse | null;
  /** The kind this node already stores. Always offered, see below. */
  selected?: string;
}): AutomationSourceOption[] => {
  const options: AutomationSourceOption[] =
    capabilities && capabilities.sources.length > 0
      ? capabilities.sources.map((capability) => ({
          value: capability.source,
          label: automationSourceLabel(capability.source),
          // Deliberately selectable even when unavailable. A preview source is a
          // legitimate disabled placeholder — server templates ship them, and the
          // palette already lets you drop one. Publish readiness is the real gate,
          // and it refuses with a specific reason; disabling the option here would
          // only make the graph harder to author without making it safer.
          disabled: false,
          preview: capability.lifecycle === 'preview',
          reason: capability.reason,
        }))
      : automationSourceKindSchema.options.map(bundledOption);

  // Never drop the stored value. If the server stops advertising a kind — rolled
  // back, or renamed — a node configured with it must stay editable rather than
  // silently re-pointing at whatever the Select falls back to.
  if (selected && !options.some((option) => option.value === selected)) {
    options.push({
      value: selected,
      label: `${automationSourceLabel(selected)} (unavailable)`,
      disabled: false,
      preview: false,
      reason: 'This source is not offered by the server right now.',
    });
  }

  return options;
};
