import { describe, expect, it } from 'bun:test';
import {
  collectSessionTags,
  EMPTY_SESSION_FILTERS,
  isSessionFilterActive,
  setSessionInitiatorFilter,
  toggleSessionTagFilter,
  toSessionFilterParams,
  toSessionListFilters,
} from './session-filters';

describe('isSessionFilterActive', () => {
  it('is false for the empty state', () => {
    expect(isSessionFilterActive(EMPTY_SESSION_FILTERS)).toBe(false);
  });

  it('is false for a whitespace-only query', () => {
    expect(isSessionFilterActive({ ...EMPTY_SESSION_FILTERS, q: '   ' })).toBe(false);
  });

  it('is true once any facet is set', () => {
    expect(isSessionFilterActive({ ...EMPTY_SESSION_FILTERS, q: 'launch' })).toBe(true);
    expect(isSessionFilterActive({ ...EMPTY_SESSION_FILTERS, initiator: 'agent' })).toBe(true);
    expect(isSessionFilterActive({ ...EMPTY_SESSION_FILTERS, tags: ['q4'] })).toBe(true);
  });
});

describe('toSessionListFilters', () => {
  it('omits every unset facet', () => {
    expect(toSessionListFilters(EMPTY_SESSION_FILTERS)).toEqual({});
  });

  it('trims q and normalizes tags', () => {
    expect(
      toSessionListFilters({ ...EMPTY_SESSION_FILTERS, q: '  launch ', tags: ['Q4', 'q4'] }),
    ).toEqual({ q: 'launch', tags: ['q4'] });
  });

  it('carries the agent picker only for AI-initiated lists', () => {
    expect(
      toSessionListFilters({
        ...EMPTY_SESSION_FILTERS,
        initiator: 'agent',
        initiatorAgent: 'organic',
      }),
    ).toEqual({ initiator: 'agent', initiatorAgent: 'organic' });

    expect(
      toSessionListFilters({
        ...EMPTY_SESSION_FILTERS,
        initiator: 'user',
        initiatorAgent: 'organic',
      }),
    ).toEqual({ initiator: 'user' });
  });
});

describe('toSessionFilterParams', () => {
  it('builds the wire params for a fully specified filter', () => {
    expect(
      toSessionFilterParams({
        q: 'launch',
        initiator: 'agent',
        initiatorAgent: 'jaina',
        tags: ['q4', 'budget'],
      }),
    ).toEqual([
      ['q', 'launch'],
      ['initiator', 'agent'],
      ['initiator_agent', 'jaina'],
      ['tags', 'q4,budget'],
    ]);
  });

  it('emits nothing for the empty state', () => {
    expect(toSessionFilterParams(EMPTY_SESSION_FILTERS)).toEqual([]);
  });
});

describe('toggleSessionTagFilter', () => {
  it('adds then removes a tag, normalized', () => {
    const added = toggleSessionTagFilter(EMPTY_SESSION_FILTERS, ' Q4 ');
    expect(added.tags).toEqual(['q4']);
    expect(toggleSessionTagFilter(added, 'Q4').tags).toEqual([]);
  });

  it('ignores a blank tag', () => {
    expect(toggleSessionTagFilter(EMPTY_SESSION_FILTERS, '  ')).toBe(EMPTY_SESSION_FILTERS);
  });
});

describe('setSessionInitiatorFilter', () => {
  it('drops the agent picker when leaving the AI facet', () => {
    const ai = { ...EMPTY_SESSION_FILTERS, initiator: 'agent' as const, initiatorAgent: 'organic' };
    expect(setSessionInitiatorFilter(ai, 'user')).toEqual({
      ...EMPTY_SESSION_FILTERS,
      initiator: 'user',
      initiatorAgent: '',
    });
  });

  it('keeps the agent picker while staying on AI', () => {
    const ai = { ...EMPTY_SESSION_FILTERS, initiator: 'agent' as const, initiatorAgent: 'organic' };
    expect(setSessionInitiatorFilter(ai, 'agent').initiatorAgent).toBe('organic');
  });
});

describe('collectSessionTags', () => {
  it('dedupes, normalizes and sorts tags across sessions', () => {
    expect(
      collectSessionTags([{ tags: ['Q4', 'budget'] }, { tags: ['q4'] }, { tags: null }, {}]),
    ).toEqual(['budget', 'q4']);
  });
});
