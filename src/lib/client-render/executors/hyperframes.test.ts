import { describe, expect, it } from 'bun:test';
import { runHyperframesStage } from './hyperframes';

describe('runHyperframesStage', () => {
  it('retries a transient failure within the declared bound', async () => {
    let calls = 0;
    let rebuilds = 0;
    const result = await runHyperframesStage(
      'Loading the composition',
      2,
      new AbortController().signal,
      async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return 'ready';
      },
      () => {
        rebuilds += 1;
      },
    );

    expect(result).toBe('ready');
    expect(calls).toBe(2);
    expect(rebuilds).toBe(1);
  });

  it('preserves the stage and cause after retries are exhausted', async () => {
    expect(
      runHyperframesStage('Uploading review frame 2', 1, new AbortController().signal, async () => {
        throw new Error('HTTP 503');
      }),
    ).rejects.toThrow('Uploading review frame 2 failed after 1 attempts: HTTP 503');
  });
});
