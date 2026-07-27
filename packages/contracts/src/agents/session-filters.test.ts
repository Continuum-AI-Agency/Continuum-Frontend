import { describe, expect, it } from 'bun:test';
import { organicChatSessionDtoSchema } from '../organic/conversations';
import {
  AGENT_SESSION_MAX_TAGS,
  agentInitiatorLabel,
  agentSessionListFiltersSchema,
  applyAgentSessionFilterSteps,
  buildAgentSessionFilterSteps,
  buildAgentSessionSearchExpression,
  normalizeAgentSessionTags,
  parseAgentSessionTagsParam,
  sanitizeAgentSessionSearchTerm,
  updateAgentSessionTagsRequestSchema,
} from './cross-agent';

describe('normalizeAgentSessionTags', () => {
  it('trims, lowercases, collapses whitespace and dedupes', () => {
    expect(normalizeAgentSessionTags([' Q4  Launch ', 'q4 launch', 'Budget'])).toEqual([
      'q4 launch',
      'budget',
    ]);
  });

  it('drops empty tags', () => {
    expect(normalizeAgentSessionTags(['', '   ', 'kept'])).toEqual(['kept']);
  });

  it('caps the tag count', () => {
    const many = Array.from({ length: AGENT_SESSION_MAX_TAGS + 5 }, (_, index) => `tag-${index}`);
    expect(normalizeAgentSessionTags(many)).toHaveLength(AGENT_SESSION_MAX_TAGS);
  });

  it('truncates an over-long tag rather than dropping it', () => {
    const [tag] = normalizeAgentSessionTags(['x'.repeat(200)]);
    expect(tag).toHaveLength(32);
  });
});

describe('updateAgentSessionTagsRequestSchema', () => {
  it('normalizes the payload it accepts', () => {
    expect(updateAgentSessionTagsRequestSchema.parse({ tags: ['  A ', 'a', 'B'] }).tags).toEqual([
      'a',
      'b',
    ]);
  });

  it('accepts an empty list — clearing every tag is a valid update', () => {
    expect(updateAgentSessionTagsRequestSchema.parse({ tags: [] }).tags).toEqual([]);
  });

  it('rejects a non-array tags field', () => {
    expect(updateAgentSessionTagsRequestSchema.safeParse({ tags: 'a,b' }).success).toBe(false);
  });

  it('rejects an absurd number of raw tags instead of silently truncating', () => {
    const flood = Array.from({ length: 200 }, (_, index) => `tag-${index}`);
    expect(updateAgentSessionTagsRequestSchema.safeParse({ tags: flood }).success).toBe(false);
  });
});

describe('parseAgentSessionTagsParam', () => {
  it('splits a CSV query param', () => {
    expect(parseAgentSessionTagsParam('q4,Budget ')).toEqual(['q4', 'budget']);
  });

  it('accepts a repeated query param', () => {
    expect(parseAgentSessionTagsParam(['q4', 'budget'])).toEqual(['q4', 'budget']);
  });

  it('returns an empty list for a missing param', () => {
    expect(parseAgentSessionTagsParam(undefined)).toEqual([]);
  });
});

describe('sanitizeAgentSessionSearchTerm', () => {
  it('strips PostgREST and LIKE metacharacters', () => {
    expect(sanitizeAgentSessionSearchTerm('spend, roas.(x)%_*')).toBe('spend roas x');
  });

  it('collapses to empty when the term is only metacharacters', () => {
    expect(sanitizeAgentSessionSearchTerm('%%,,..')).toBe('');
  });
});

describe('buildAgentSessionSearchExpression', () => {
  it('builds an ilike OR across the given columns', () => {
    expect(buildAgentSessionSearchExpression('launch', ['title', 'preview'])).toBe(
      'title.ilike.*launch*,preview.ilike.*launch*',
    );
  });

  it('returns an empty expression when the term sanitizes away', () => {
    expect(buildAgentSessionSearchExpression('%,%', ['title', 'preview'])).toBe('');
  });
});

describe('buildAgentSessionFilterSteps', () => {
  it('returns no steps for an empty filter set', () => {
    expect(buildAgentSessionFilterSteps({})).toEqual([]);
  });

  it('builds search, initiator, agent and tag steps with agent-specific columns', () => {
    const steps = buildAgentSessionFilterSteps(
      { q: 'launch', initiator: 'agent', initiatorAgent: 'organic', tags: ['Q4', 'q4', 'budget'] },
      {
        title: 'conversation_title',
        preview: 'preview',
        initiator: 'initiator',
        initiatorAgent: 'initiator_agent',
        tags: 'tags',
      },
    );

    expect(steps).toEqual([
      { op: 'or', expression: 'conversation_title.ilike.*launch*,preview.ilike.*launch*' },
      { op: 'eq', column: 'initiator', value: 'agent' },
      { op: 'eq', column: 'initiator_agent', value: 'organic' },
      { op: 'contains', column: 'tags', value: ['q4', 'budget'] },
    ]);
  });

  it('omits the search step (rather than matching nothing) when q sanitizes away', () => {
    expect(buildAgentSessionFilterSteps({ q: '%%' })).toEqual([]);
  });

  it('omits the tag step when every tag normalizes away', () => {
    expect(buildAgentSessionFilterSteps({ tags: ['  ', ''] })).toEqual([]);
  });
});

describe('applyAgentSessionFilterSteps', () => {
  it('folds each step onto the query builder in order', () => {
    const calls: string[] = [];
    const query = {
      or(expression: string) {
        calls.push(`or:${expression}`);
        return query;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}=${value}`);
        return query;
      },
      contains(column: string, value: string[]) {
        calls.push(`contains:${column}=${value.join('|')}`);
        return query;
      },
    };

    applyAgentSessionFilterSteps(
      query,
      buildAgentSessionFilterSteps({ q: 'launch', initiator: 'user', tags: ['q4'] }),
    );

    expect(calls).toEqual([
      'or:title.ilike.*launch*,preview.ilike.*launch*',
      'eq:initiator=user',
      'contains:tags=q4',
    ]);
  });
});

describe('agentSessionListFiltersSchema', () => {
  it('rejects an unknown initiator', () => {
    expect(agentSessionListFiltersSchema.safeParse({ initiator: 'automation' }).success).toBe(
      false,
    );
  });

  it('trims q and drops it when blank', () => {
    expect(agentSessionListFiltersSchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(agentSessionListFiltersSchema.parse({ q: '  launch ' }).q).toBe('launch');
  });
});

describe('agentInitiatorLabel', () => {
  it('labels known agents', () => {
    expect(agentInitiatorLabel('organic')).toBe('AI · Organic');
    expect(agentInitiatorLabel('jaina')).toBe('AI · Jaina');
  });

  it('falls back for MCP clients and unknown ids', () => {
    expect(agentInitiatorLabel('mcp:claude')).toBe('AI · claude');
    expect(agentInitiatorLabel('somebot')).toBe('AI · somebot');
    expect(agentInitiatorLabel(null)).toBe('AI');
  });
});

describe('organicChatSessionDtoSchema provenance fields', () => {
  it('carries initiator, tags and preview through the wire DTO', () => {
    const dto = organicChatSessionDtoSchema.parse({
      sessionId: 's1',
      createdAt: new Date().toISOString(),
      initiator: 'agent',
      initiatorAgent: 'jaina',
      callerRunId: 'run_caller',
      callerSessionId: 'sess_caller',
      crossCallId: 'call-1',
      tags: ['q4'],
      preview: 'What is going on in organic?',
    });
    expect(dto.initiator).toBe('agent');
    expect(dto.tags).toEqual(['q4']);
  });

  it('still parses a legacy row without the provenance columns', () => {
    const dto = organicChatSessionDtoSchema.parse({
      sessionId: 's1',
      createdAt: new Date().toISOString(),
    });
    expect(dto.tags).toBeUndefined();
  });
});
