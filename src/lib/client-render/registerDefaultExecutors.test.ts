import { describe, expect, it } from 'bun:test';
import { clientRenderJobKindSchema } from '@continuum/contracts';
import { getClientRenderExecutor } from './executorRegistry';
import { registerDefaultClientRenderExecutors } from './registerDefaultExecutors';

describe('default client render executors', () => {
  // Read off the contract, never a second list. The hand-maintained copy this
  // replaces had already lost `timeline_editor`, so the guard was passing while a
  // kind the Backend could enqueue had no browser that could execute it — which is
  // precisely the failure it exists to catch.
  it('routes every shared render-job kind through the browser render lane', () => {
    registerDefaultClientRenderExecutors();
    // HyperFrames films render on the server now; the kind stays so its old rows still parse.
    const serverRendered = new Set(['hyperframes_agent']);
    const unregistered = clientRenderJobKindSchema.options.filter(
      (kind) => !serverRendered.has(kind) && getClientRenderExecutor(kind) === null,
    );

    expect(unregistered).toEqual([]);
  });
});
