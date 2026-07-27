import type { AgentInitiator, AgentSessionListFilters } from '@continuum/contracts';
import { normalizeAgentSessionTags } from '@continuum/contracts';

// The chat-history filter model shared by the Organic and Jaina sidebars. The
// state is UI-shaped ("All | Human | AI" is one control), the query is
// wire-shaped (`initiator` + `initiator_agent`), and this module is the single
// translation between the two so the two sidebars cannot drift.

export type SessionInitiatorFilter = 'all' | 'user' | 'agent';

export type SessionFilterState = {
  q: string;
  initiator: SessionInitiatorFilter;
  /** Only meaningful while `initiator === 'agent'`; '' means "any agent". */
  initiatorAgent: string;
  tags: string[];
};

export const EMPTY_SESSION_FILTERS: SessionFilterState = {
  q: '',
  initiator: 'all',
  initiatorAgent: '',
  tags: [],
};

/** True when the filters would narrow the list — i.e. a server query is warranted. */
export function isSessionFilterActive(state: SessionFilterState): boolean {
  return state.q.trim().length > 0 || state.initiator !== 'all' || state.tags.length > 0;
}

/** The contract-shaped filters for the list endpoints. Absent keys mean "no filter". */
export function toSessionListFilters(state: SessionFilterState): AgentSessionListFilters {
  const filters: AgentSessionListFilters = {};
  const q = state.q.trim();
  if (q) filters.q = q;
  if (state.initiator !== 'all') filters.initiator = state.initiator as AgentInitiator;
  // An agent picker only narrows an AI-initiated list; carrying it while
  // "Human" is selected would silently return nothing.
  if (state.initiator === 'agent' && state.initiatorAgent) {
    filters.initiatorAgent = state.initiatorAgent;
  }
  const tags = normalizeAgentSessionTags(state.tags);
  if (tags.length > 0) filters.tags = tags;
  return filters;
}

/** Query-param pairs for both agents' list endpoints (snake_case on the wire). */
export function toSessionFilterParams(state: SessionFilterState): Array<[string, string]> {
  const filters = toSessionListFilters(state);
  const params: Array<[string, string]> = [];
  if (filters.q) params.push(['q', filters.q]);
  if (filters.initiator) params.push(['initiator', filters.initiator]);
  if (filters.initiatorAgent) params.push(['initiator_agent', filters.initiatorAgent]);
  if (filters.tags && filters.tags.length > 0) params.push(['tags', filters.tags.join(',')]);
  return params;
}

/** Toggles one tag in the filter set, normalized so casing never splits a tag. */
export function toggleSessionTagFilter(state: SessionFilterState, tag: string): SessionFilterState {
  const [normalized] = normalizeAgentSessionTags([tag]);
  if (!normalized) return state;
  const has = state.tags.includes(normalized);
  return {
    ...state,
    tags: has ? state.tags.filter((item) => item !== normalized) : [...state.tags, normalized],
  };
}

/** Switching away from "AI" drops the agent picker — it cannot narrow a human list. */
export function setSessionInitiatorFilter(
  state: SessionFilterState,
  initiator: SessionInitiatorFilter,
): SessionFilterState {
  return {
    ...state,
    initiator,
    initiatorAgent: initiator === 'agent' ? state.initiatorAgent : '',
  };
}

/** Every distinct tag across a session list, for the tag-chip row. */
export function collectSessionTags(sessions: ReadonlyArray<{ tags?: string[] | null }>): string[] {
  const seen = new Set<string>();
  for (const session of sessions) {
    for (const tag of session.tags ?? []) {
      const [normalized] = normalizeAgentSessionTags([tag]);
      if (normalized) seen.add(normalized);
    }
  }
  return [...seen].sort();
}
