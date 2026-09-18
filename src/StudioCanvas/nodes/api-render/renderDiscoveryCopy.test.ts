import { describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { describeRenderDiscoveryFailure } from '../ApiRenderBlock';

describe('render discovery copy', () => {
  test('an unbound brand gets a next step, not a server code', () => {
    const copy = describeRenderDiscoveryFailure('409 render_workspace_not_bound');
    expect(copy).not.toContain('render_workspace_not_bound');
    expect(copy).toContain('not connected to a render workspace');
  });

  test('delivery and snapshot refusals get a next step, from the error or its message', () => {
    for (const code of [
      'render_delivery_ad_not_found',
      'render_delivery_ad_changed',
      'render_set_row_snapshot_mismatch',
    ]) {
      const thrown = new ApiError(code, 409, undefined, { error: code, detail: code });
      expect(describeRenderDiscoveryFailure(thrown)).not.toContain(code);
      expect(describeRenderDiscoveryFailure(thrown)).toBe(describeRenderDiscoveryFailure(code));
    }
    expect(describeRenderDiscoveryFailure('409 render_delivery_ad_changed')).toContain(
      'Pick the ad again',
    );
  });

  test('an unmapped code shows the server’s detail when it is a sentence, never a bare code', () => {
    const detailed = new ApiError('render_something_new', 409, undefined, {
      error: 'render_something_new',
      detail: 'This brand’s render workspace changed. Prepare it again.',
    });
    expect(describeRenderDiscoveryFailure(detailed)).toBe(
      'This brand’s render workspace changed. Prepare it again.',
    );
    const bare = new ApiError('render_something_new', 409, undefined, {
      error: 'render_something_new',
      detail: 'render_something_new',
    });
    expect(describeRenderDiscoveryFailure(bare)).toBe('render_something_new');
  });

  test('the server’s bare catch-all 500 reads as a next step, not its code', () => {
    const thrown = new ApiError('api_render_failed', 500, undefined, {
      error: 'api_render_failed',
    });
    expect(describeRenderDiscoveryFailure(thrown)).toBe(
      'The render service hit an unexpected error. Try again; if it keeps failing, tell your Continuum contact.',
    );
  });

  test('an unmapped failure is passed through rather than swallowed', () => {
    expect(describeRenderDiscoveryFailure('boom')).toBe('boom');
    expect(describeRenderDiscoveryFailure('')).toBe('Render discovery failed');
  });
});
