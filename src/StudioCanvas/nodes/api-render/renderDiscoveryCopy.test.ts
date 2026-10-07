import { describe, expect, test } from 'bun:test';
import { templateRevisionErrorCodeSchema } from '@continuum/contracts';
import { ApiError } from '@/lib/api/errors';
import { describeRenderDiscoveryFailure } from '../ApiRenderBlock';
import { needsTemplateRepair } from './renderDiscoveryCopy';

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

  test('a template revision refusal names the revision step, never the raw code', () => {
    for (const code of [
      ...templateRevisionErrorCodeSchema.options.filter(
        (code) =>
          code !== 'template_revision_head_conflict' &&
          code !== 'template_revision_target_required',
      ),
      'render_set_template_revision_changed',
      'render_set_explicit_revision_change_required',
    ]) {
      const thrown = new ApiError(code, 409, undefined, { error: code, detail: code });
      expect(describeRenderDiscoveryFailure(thrown)).not.toContain(code);
      expect(describeRenderDiscoveryFailure(thrown)).toContain('revision');
    }
  });

  test('zero publications reads as unpublished, never as a choice between revisions', () => {
    const code = 'template_revision_unpublished';
    const copy = describeRenderDiscoveryFailure(
      new ApiError(code, 409, undefined, { error: code, detail: code }),
    );
    expect(copy).toContain('no published revision');
    expect(copy).not.toContain('more than one');
  });

  test('the exact server code wins over a shorter code it happens to contain', () => {
    const code = 'render_template_revision_source_changed';
    const thrown = new ApiError(code, 409, undefined, {
      error: code,
      detail: 'The pinned file changed before this render.',
    });
    expect(describeRenderDiscoveryFailure(thrown)).toBe(
      'The pinned file changed before this render.',
    );
  });

  test('only refusals fixed on the template offer to open it', () => {
    const failure = (code: string) => new ApiError(code, 409, undefined, { error: code });
    expect(needsTemplateRepair(failure('template_revision_unpublished'))).toBe(true);
    expect(needsTemplateRepair(failure('template_revision_source_changed'))).toBe(true);
    expect(needsTemplateRepair(failure('template_revision_head_conflict'))).toBe(false);
    expect(needsTemplateRepair(failure('render_set_revision_conflict'))).toBe(false);
    expect(needsTemplateRepair('template_revision_unpublished')).toBe(false);
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
