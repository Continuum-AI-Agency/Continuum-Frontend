import { describe, expect, it } from 'bun:test';
import {
  isDraftTemplateName,
  workspaceTemplateDiscoveryResponseSchema,
  workspaceTemplateLabel,
  workspaceTemplateSchema,
} from './workspace-template';

describe('workspaceTemplateSchema', () => {
  it('keys on the string template id every other store joins on', () => {
    const parsed = workspaceTemplateSchema.parse({
      templateKey: '133',
      templateId: 133,
      bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
      name: 'forge_bench_starcraft',
      rootTable: 'tpl_starcraft_forge_bench_starcraft_root',
      updatedAt: null,
      granted: true,
      sourceAssetId: null,
      draft: false,
    });
    expect(parsed.templateKey).toBe('133');
    expect(typeof parsed.templateKey).toBe('string');
  });

  it('stays strict — an unknown key is refused', () => {
    expect(
      workspaceTemplateSchema.safeParse({
        templateKey: '1',
        templateId: 1,
        bindingId: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
        name: 'x',
        granted: false,
        draft: false,
        contract: {},
      }).success,
    ).toBe(false);
  });
});

describe('workspaceTemplateDiscoveryResponseSchema', () => {
  const workspace = {
    id: '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    picinst: 'Continuum_app',
    environmentKey: 'prod',
    clientKey: 'client',
    isDefault: true,
  };

  it('defaults missing failures to empty for older backend responses', () => {
    expect(
      workspaceTemplateDiscoveryResponseSchema.parse({ workspace, items: [] }).failures,
    ).toEqual([]);
  });

  it('preserves safe workspace failures, including an all-failed empty result', () => {
    const parsed = workspaceTemplateDiscoveryResponseSchema.parse({
      workspace,
      items: [],
      failures: [
        {
          bindingId: workspace.id,
          code: 'workspace_discovery_failed',
        },
      ],
    });
    expect(parsed.items).toEqual([]);
    expect(parsed.failures).toEqual([
      { bindingId: workspace.id, code: 'workspace_discovery_failed' },
    ]);
  });

  it('rejects unsafe or unknown failure details', () => {
    expect(
      workspaceTemplateDiscoveryResponseSchema.safeParse({
        workspace,
        items: [],
        failures: [{ bindingId: workspace.id, code: 'permission denied: secret host' }],
      }).success,
    ).toBe(false);
  });
});

describe('draft naming', () => {
  it('recognises the forge prefix and strips it for display', () => {
    expect(isDraftTemplateName('[DRAFT/agent] forge_bench_starcraft')).toBe(true);
    expect(workspaceTemplateLabel('[DRAFT/agent] forge_bench_starcraft')).toBe(
      'forge_bench_starcraft',
    );
  });

  it('leaves a promoted name alone', () => {
    expect(isDraftTemplateName('forge_bench_starcraft')).toBe(false);
    expect(workspaceTemplateLabel('forge_bench_starcraft')).toBe('forge_bench_starcraft');
  });

  it('never returns an empty label', () => {
    // A template named only by the marker would otherwise render as a blank row.
    expect(workspaceTemplateLabel('[DRAFT/agent]')).toBe('[DRAFT/agent]');
  });
});
