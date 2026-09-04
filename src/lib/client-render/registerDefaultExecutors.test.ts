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
    const unregistered = clientRenderJobKindSchema.options.filter(
      (kind) => getClientRenderExecutor(kind) === null,
    );

    expect(unregistered).toEqual([]);
  });
});
