import { describe, expect, it } from 'vitest';
import { renderWorkspaceLabel, renderWorkspaceSchema } from './render-workspace';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  picinst: 'Continuum_app',
  environmentKey: 'prod',
  clientKey: 'vivo47',
  isDefault: true,
};

describe('renderWorkspaceLabel', () => {
  it('is just the sub-app when the environment is the ordinary one', () => {
    expect(renderWorkspaceLabel(renderWorkspaceSchema.parse(base))).toBe('Continuum_app');
  });

  it('names the environment when it is not — one sub-app may hold two of a brand\'s bindings', () => {
    // The uniqueness key is (brand_id, picinst, environment_key, client_key), so `picinst` alone
    // does NOT identify a binding and a picker showing it twice would be unusable.
    const staging = renderWorkspaceSchema.parse({ ...base, environmentKey: 'staging', isDefault: false });
    expect(renderWorkspaceLabel(staging)).toBe('Continuum_app · staging');
    expect(renderWorkspaceLabel(staging)).not.toBe(renderWorkspaceLabel(renderWorkspaceSchema.parse(base)));
  });

  it('stays strict — an unknown key is refused', () => {
    expect(renderWorkspaceSchema.safeParse({ ...base, rootTable: 't_x' }).success).toBe(false);
  });
});
