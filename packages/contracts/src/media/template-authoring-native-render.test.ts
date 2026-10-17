import { describe, expect, it } from 'bun:test';
import { templateAuthoringNativeRenderRequestSchema } from './template-authoring-native-render';

const pins = {
  expectedDraftRevision: 2,
  sourceChecksum: 'a'.repeat(64),
  commandDigest: 'b'.repeat(64),
  packageChecksum: 'c'.repeat(64),
};

describe('template authoring native render request', () => {
  it('accepts only bounded comp/frame/format selectors', () => {
    expect(templateAuthoringNativeRenderRequestSchema.safeParse({
      ...pins,
      frames: [{ compId: 12, frameIndices: [0, 14], formatId: 'Portrait' }],
    }).success).toBe(true);
  });

  it('rejects duplicate selections, excessive frames, URLs and caller supplied native identities', () => {
    const duplicate = templateAuthoringNativeRenderRequestSchema.safeParse({
      ...pins, frames: [{ compId: 12, frameIndices: [0, 0], formatId: 'Portrait' }],
    });
    const excessive = templateAuthoringNativeRenderRequestSchema.safeParse({
      ...pins, frames: [{ compId: 12, frameIndices: Array.from({ length: 17 }, (_, index) => index), formatId: 'Portrait' }],
    });
    const url = templateAuthoringNativeRenderRequestSchema.safeParse({
      ...pins, frames: [{ compId: 12, frameIndices: [0], formatId: 'Portrait' }], sourceUrl: 'https://example.invalid/source.aep',
    });
    const nativeId = templateAuthoringNativeRenderRequestSchema.safeParse({
      ...pins, frames: [{ compId: 12, frameIndices: [0], formatId: 'Portrait' }], nativeRunId: 'run-1',
    });
    expect(duplicate.success).toBe(false);
    expect(excessive.success).toBe(false);
    expect(url.success).toBe(false);
    expect(nativeId.success).toBe(false);
  });
});
