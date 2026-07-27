import { describe, expect, it } from 'bun:test';
import type { ClientRenderJobKind } from '@continuum/contracts';
import { getClientRenderExecutor } from './executorRegistry';
import { registerDefaultClientRenderExecutors } from './registerDefaultExecutors';

describe('default client render executors', () => {
  it('routes every shared render-job kind through the browser render lane', () => {
    registerDefaultClientRenderExecutors();
    const kinds: ClientRenderJobKind[] = [
      'hyperframes_agent',
      'organic_hyperframe',
      'planner_reel',
      'mcp_clip_batch',
    ];

    expect(kinds.every((kind) => getClientRenderExecutor(kind) !== null)).toBe(true);
  });
});
