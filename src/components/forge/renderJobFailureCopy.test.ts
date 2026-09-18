import { describe, expect, test } from 'bun:test';
import { describeRenderJobFailure } from './renderJobFailureCopy';

describe('describeRenderJobFailure', () => {
  test('the legacy fleet literal reads as a sentence, never as the code', () => {
    expect(describeRenderJobFailure('render_error')).toBe(
      'The render farm reported an error and sent no file.',
    );
  });

  test('the backend sentence is shown whole', () => {
    const sentence =
      'The render farm stopped this render after 15 minutes without a file. Render it again; if it keeps timing out, the template may be too heavy for one pass.';
    expect(describeRenderJobFailure(sentence)).toBe(sentence);
  });

  test('no error is no sentence', () => {
    expect(describeRenderJobFailure(null)).toBeNull();
    expect(describeRenderJobFailure(undefined)).toBeNull();
    expect(describeRenderJobFailure('  ')).toBeNull();
  });
});
