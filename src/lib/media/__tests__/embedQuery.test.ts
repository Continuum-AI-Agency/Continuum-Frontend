// The Frontend holds no model API key (it deploys to Vercel). The query
// embedding is minted by the JWT-gated `embed-search-query` edge function, and
// every failure mode must degrade to keyword search rather than throw.

import { describe, expect, it } from 'bun:test';
import { TEXT_EMBEDDING_DIM } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { embedSearchQuery } from '../embedQuery.server';

type InvokeArgs = { name: string; body: unknown };

function stubClient(result: { data?: unknown; error?: { message: string } | null } | 'throws'): {
  client: SupabaseClient;
  calls: InvokeArgs[];
} {
  const calls: InvokeArgs[] = [];
  const client = {
    functions: {
      invoke: async (name: string, opts: { body: unknown }) => {
        calls.push({ name, body: opts.body });
        if (result === 'throws') throw new Error('network down');
        return { data: result.data ?? null, error: result.error ?? null };
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const goodVector = Array.from({ length: TEXT_EMBEDDING_DIM }, (_, i) => i / TEXT_EMBEDDING_DIM);

describe('embedSearchQuery', () => {
  it('invokes the edge function with the trimmed query and returns the vector', async () => {
    const { client, calls } = stubClient({ data: { embedding: goodVector } });
    const result = await embedSearchQuery(client, '  a cooking video  ');
    expect(result).toHaveLength(TEXT_EMBEDDING_DIM);
    expect(calls).toEqual([{ name: 'embed-search-query', body: { query: 'a cooking video' } }]);
  });

  it('never calls the function for a blank query', async () => {
    const { client, calls } = stubClient({ data: { embedding: goodVector } });
    expect(await embedSearchQuery(client, '   ')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('returns null when the function errors (caller falls back to keyword)', async () => {
    const { client } = stubClient({ error: { message: 'Embedding unavailable' } });
    expect(await embedSearchQuery(client, 'olive oil')).toBeNull();
  });

  it('returns null when the function throws', async () => {
    const { client } = stubClient('throws');
    expect(await embedSearchQuery(client, 'olive oil')).toBeNull();
  });

  it('rejects a wrong-width vector rather than comparing two vector spaces', async () => {
    const { client } = stubClient({ data: { embedding: Array(3072).fill(0.1) } });
    expect(await embedSearchQuery(client, 'olive oil')).toBeNull();
  });

  it('rejects an empty or non-numeric embedding', async () => {
    expect(await embedSearchQuery(stubClient({ data: { embedding: [] } }).client, 'q')).toBeNull();
    const bad = Array(TEXT_EMBEDDING_DIM).fill(0.1);
    bad[7] = 'nope';
    expect(await embedSearchQuery(stubClient({ data: { embedding: bad } }).client, 'q')).toBeNull();
  });
});
