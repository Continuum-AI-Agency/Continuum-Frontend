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

// PP-DT-C-jaina-search-wildcards-and-firewall-500: the term was SANITIZED — `%`, `_`, `'`, `"`,
// `(` and `\` replaced by spaces — so a search for "%" became no search at all and listed every
// conversation, and "50% off" searched for "50 off". A search matches the text typed: the value
// is quoted for PostgREST (prod PostgREST reads `"*\\%*"` as a literal percent: 0 rows, where
// the bare `*%*` lists all 247 sessions) and LIKE's own wildcards are escaped.
describe('buildAgentSessionSearchExpression', () => {
  it('builds a quoted ilike OR across the given columns', () => {
    expect(buildAgentSessionSearchExpression('launch', ['title', 'preview'])).toBe(
      'title.ilike."*launch*",preview.ilike."*launch*"',
    );
  });

  it('matches LIKE wildcards literally, never every session', () => {
    expect(buildAgentSessionSearchExpression('%', ['title'])).toBe('title.ilike."*\\\\%*"');
    expect(buildAgentSessionSearchExpression('_', ['title'])).toBe('title.ilike."*\\\\_*"');
    expect(buildAgentSessionSearchExpression('50% off', ['title'])).toBe(
      'title.ilike."*50\\\\% off*"',
    );
  });

  it("keeps PostgREST's reserved characters as text inside the quotes", () => {
    expect(buildAgentSessionSearchExpression('spend, roas.(x):', ['title'])).toBe(
      'title.ilike."*spend, roas.(x):*"',
    );
    expect(buildAgentSessionSearchExpression('say "hi"', ['title'])).toBe(
      'title.ilike."*say \\"hi\\"*"',
    );
    expect(buildAgentSessionSearchExpression('a\\b', ['title'])).toBe('title.ilike."*a\\\\\\\\b*"');
    expect(buildAgentSessionSearchExpression("it's", ['title'])).toBe('title.ilike."*it\'s*"');
  });

  it("drops PostgREST's own wildcard and searches nothing for a term of only that", () => {
    expect(buildAgentSessionSearchExpression('re*cap', ['title'])).toBe('title.ilike."*recap*"');
    expect(buildAgentSessionSearchExpression(' * ', ['title'])).toBe('');
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
      { op: 'or', expression: 'conversation_title.ilike."*launch*",preview.ilike."*launch*"' },
      { op: 'eq', column: 'initiator', value: 'agent' },
      { op: 'eq', column: 'initiator_agent', value: 'organic' },
      { op: 'contains', column: 'tags', value: ['q4', 'budget'] },
    ]);
  });

  it('searches a wildcard-only q literally instead of dropping the search', () => {
    expect(buildAgentSessionFilterSteps({ q: '%%' })).toEqual([
      { op: 'or', expression: 'title.ilike."*\\\\%\\\\%*",preview.ilike."*\\\\%\\\\%*"' },
    ]);
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
      'or:title.ilike."*launch*",preview.ilike."*launch*"',
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
