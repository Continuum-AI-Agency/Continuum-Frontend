import { describe, expect, it } from 'vitest';
import {
  isDraftTemplateName,
  workspaceTemplateLabel,
  workspaceTemplateSchema,
} from './workspace-template';

describe('workspaceTemplateSchema', () => {
  it('keys on the string template id every other store joins on', () => {
    const parsed = workspaceTemplateSchema.parse({
      templateKey: '133', templateId: 133, name: 'forge_bench_starcraft',
      rootTable: 'tpl_starcraft_forge_bench_starcraft_root', updatedAt: null,
      granted: true, sourceAssetId: null, draft: false,
    });
    expect(parsed.templateKey).toBe('133');
    expect(typeof parsed.templateKey).toBe('string');
  });

  it('stays strict — an unknown key is refused', () => {
    expect(
      workspaceTemplateSchema.safeParse({
        templateKey: '1', templateId: 1, name: 'x', granted: false, draft: false, contract: {},
      }).success,
    ).toBe(false);
  });
});

describe('draft naming', () => {
  it('recognises the forge prefix and strips it for display', () => {
    expect(isDraftTemplateName('[DRAFT/agent] forge_bench_starcraft')).toBe(true);
    expect(workspaceTemplateLabel('[DRAFT/agent] forge_bench_starcraft')).toBe('forge_bench_starcraft');
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
