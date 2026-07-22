import { describe, expect, it, mock } from 'bun:test';

const invokeMock = mock(async () => ({ data: { ok: true }, error: null }));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: { invoke: invokeMock },
  }),
}));

import { persistHyperframeMp4OnFirstRender } from './hyperframeMp4';

describe('persistHyperframeMp4OnFirstRender', () => {
  it('renders once and invokes the link edge function with mp4 base64', async () => {
    const renderMp4 = mock(
      async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
    );

    await persistHyperframeMp4OnFirstRender({
      compositionId: 'hf_once',
      brandId: 'brand_1',
      draftId: 'draft_1',
      durationSec: 15,
      renderMp4,
    });

    expect(renderMp4).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [fn, opts] = invokeMock.mock.calls[0] as unknown as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(fn).toBe('link-hyperframe-mp4');
    expect(opts.body.compositionId).toBe('hf_once');
    expect(opts.body.mimeType).toBe('video/mp4');
    expect(typeof opts.body.mp4Base64).toBe('string');
  });

  it('does not fire twice for the same composition (once-only guard)', async () => {
    invokeMock.mockClear();
    const renderMp4 = mock(async () => new Blob([new Uint8Array([9])], { type: 'video/mp4' }));

    await persistHyperframeMp4OnFirstRender({
      compositionId: 'hf_guard',
      brandId: 'brand_1',
      draftId: null,
      durationSec: 12,
      renderMp4,
    });
    await persistHyperframeMp4OnFirstRender({
      compositionId: 'hf_guard',
      brandId: 'brand_1',
      draftId: null,
      durationSec: 12,
      renderMp4,
    });

    expect(renderMp4).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
