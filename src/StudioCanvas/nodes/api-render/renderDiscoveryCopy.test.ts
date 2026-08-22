import { describe, expect, test } from 'bun:test';
import { describeRenderDiscoveryFailure } from '../ApiRenderBlock';

describe('render discovery copy', () => {
  test('an unbound brand gets a next step, not a server code', () => {
    const copy = describeRenderDiscoveryFailure('409 render_workspace_not_bound');
    expect(copy).not.toContain('render_workspace_not_bound');
    expect(copy).toContain('not connected to a render workspace');
  });

  test('an unmapped failure is passed through rather than swallowed', () => {
    expect(describeRenderDiscoveryFailure('boom')).toBe('boom');
    expect(describeRenderDiscoveryFailure('')).toBe('Render discovery failed');
  });
});
