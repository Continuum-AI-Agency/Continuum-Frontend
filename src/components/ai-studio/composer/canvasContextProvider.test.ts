import { describe, expect, it } from 'bun:test';
import type { Skill } from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import {
  createCanvasComposerMentionProvider,
  skillToCanvasMentionSuggestion,
} from './canvasContextProvider';

const skill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'skill-1',
  brandId: 'brand-1',
  isTemplate: false,
  name: 'Bold product lighting',
  slug: 'bold-product-lighting',
  description: 'Hard light and crisp shadows.',
  kind: 'creative_direction',
  surface: 'visual',
  directives: 'Use hard light.',
  tags: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('canvas composer context provider', () => {
  it('maps a skill to a canvas-scoped reference without leaking directives', () => {
    const suggestion = skillToCanvasMentionSuggestion(skill());
    expect(suggestion.reference).toEqual({
      id: 'skill-1',
      type: 'skill',
      label: 'bold-product-lighting',
      source: 'canvas',
      metadata: { skillId: 'skill-1', kind: 'creative_direction', slug: 'bold-product-lighting' },
    });
    expect(JSON.stringify(suggestion)).not.toContain('Use hard light.');
  });

  it('advertises only Skills and Media library at the root', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [skill()],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
    });
    const suggestions = await provider.getSuggestions({ query: '' });
    expect(suggestions.map((item) => item.label)).toEqual(['Skills', 'Media library']);
  });

  it('filters archived, analytic, and copy-only skills', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [
        skill(),
        skill({ id: 'archived', status: 'archived' }),
        skill({ id: 'analytic', kind: 'analytic' }),
        skill({ id: 'copy', surface: 'copy' }),
      ],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
    });
    const root = await provider.getSuggestions({ query: '' });
    const skillFolders = await provider.getChildSuggestions?.(root[0], '');
    const brandSkills = await provider.getChildSuggestions?.(skillFolders?.[0]!, '');
    expect(brandSkills?.map((item) => item.reference?.id)).toEqual(['skill-1']);
  });

  it('returns only image/video canvas-scoped media results', async () => {
    const media: AgentMentionSuggestion[] = [
      {
        key: 'image',
        label: 'Hero',
        type: 'media_asset',
        source: 'canvas',
        reference: { id: 'image', type: 'media_asset', label: 'Hero', source: 'canvas' },
      },
      {
        key: 'file',
        label: 'After Effects file',
        type: 'media_asset',
        source: 'canvas',
        reference: {
          id: 'file',
          type: 'media_asset',
          label: 'After Effects file',
          source: 'canvas',
          metadata: { kind: 'file' },
        },
      },
    ];
    media[0].reference = { ...media[0].reference!, metadata: { kind: 'image' } };
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => media,
      fetchFolders: async () => [],
    });
    const suggestions = await provider.getSuggestions({ query: 'hero' });
    expect(suggestions.map((item) => item.key)).toEqual(['image']);
  });
});
