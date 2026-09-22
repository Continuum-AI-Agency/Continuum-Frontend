// Published pipelines as Jaina context: a "Pipelines" family at the root of the @-picker,
// and matching pipelines leading a free-text search. Jaina only — Organic has no pipeline
// tools, so a pipeline tag there would ground a turn on something it cannot run.
//
// The tag is a pointer: the Backend re-reads the capability for the active brand, so the
// reference carries the id plus a description hint, never the contract itself.

import type { PipelineCapabilityV2 } from '@continuum/contracts';
import type { QueryClient } from '@tanstack/react-query';
import type { AgentMentionProvider, AgentMentionSuggestion } from '@/lib/agent-references';
import { fetchPipelineCapabilities, pipelineCapabilitiesQueryKey } from '@/lib/ai-studio/pipelines';

export const PIPELINES_MENTION_FOLDER_KEY = 'folder:pipelines';

/** Searched pipelines lead the list, but the picker keeps only 12 rows and campaigns still count. */
const SEARCH_LEAD_LIMIT = 4;

function pipelineMentionSuggestion(capability: PipelineCapabilityV2): AgentMentionSuggestion {
  return {
    key: `pipeline:${capability.pipeline_id}`,
    label: capability.name,
    type: 'pipeline',
    source: 'jaina',
    group: 'Pipelines',
    badge: 'pipeline',
    ...(capability.description ? { description: capability.description } : {}),
    reference: {
      id: capability.pipeline_id,
      type: 'pipeline',
      label: capability.name,
      source: 'jaina',
      ...(capability.description ? { metadata: { description: capability.description } } : {}),
    },
  };
}

const matching = (
  capabilities: PipelineCapabilityV2[],
  query: string,
): AgentMentionSuggestion[] => {
  const needle = query.trim().toLowerCase();
  return capabilities
    .filter(
      (capability) =>
        !needle ||
        [capability.name, capability.description].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
    )
    .map(pipelineMentionSuggestion);
};

export function withPipelineMentions(
  base: AgentMentionProvider,
  queryClient: QueryClient,
  brandProfileId: string,
): AgentMentionProvider {
  // Same key and fetcher as the Library's `usePipelineCapabilities`, so an open Library
  // panel and the picker share one cached catalog. A catalog failure costs the group, never
  // the campaigns beside it.
  const readCatalog = () =>
    queryClient
      .fetchQuery({
        queryKey: pipelineCapabilitiesQueryKey(brandProfileId),
        queryFn: () => fetchPipelineCapabilities(brandProfileId),
        staleTime: 60_000,
      })
      .catch(() => [] as PipelineCapabilityV2[]);

  return {
    getSuggestions: async (input) => {
      const [capabilities, rest] = await Promise.all([readCatalog(), base.getSuggestions(input)]);
      if (capabilities.length === 0) return rest;
      const lead = input.query
        ? matching(capabilities, input.query).slice(0, SEARCH_LEAD_LIMIT)
        : [
            {
              key: PIPELINES_MENTION_FOLDER_KEY,
              label: 'Pipelines',
              type: 'pipeline' as const,
              source: 'jaina' as const,
              group: 'Pipelines',
              childrenLabel: 'Published pipelines',
              isFolder: true,
            },
          ];
      return [...lead, ...rest];
    },
    getChildSuggestions: async (parent, query) => {
      if (parent.key === PIPELINES_MENTION_FOLDER_KEY) return matching(await readCatalog(), query);
      return (await base.getChildSuggestions?.(parent, query)) ?? [];
    },
  };
}
