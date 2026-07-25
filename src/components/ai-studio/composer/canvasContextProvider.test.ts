import { describe, expect, it } from 'bun:test';
import type { Skill } from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import {
  type CanvasSignalCatalog,
  createCanvasComposerMentionProvider,
  eventToCanvasMentionSuggestion,
  questionToCanvasMentionSuggestion,
  skillToCanvasMentionSuggestion,
  trendToCanvasMentionSuggestion,
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

const noSignals: CanvasSignalCatalog = { trends: [], events: [], questions: [] };

const signalCatalog = (): CanvasSignalCatalog => ({
  trends: [
    trendToCanvasMentionSuggestion({
      id: 'trend-1',
      title: 'Quiet luxury interiors',
      isSelected: false,
      timesUsed: 0,
    }),
  ],
  events: [
    eventToCanvasMentionSuggestion({
      id: 'event-1',
      title: 'Black Friday',
      isSelected: false,
      timesUsed: 0,
    }),
  ],
  questions: [
    questionToCanvasMentionSuggestion({
      id: 'question-1',
      question: 'How do I price a co-working desk?',
      isSelected: false,
      timesUsed: 0,
    }),
  ],
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

  it('advertises Skills, Media library and Signals at the root', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [skill()],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
      fetchSignals: async () => noSignals,
    });
    const suggestions = await provider.getSuggestions({ query: '' });
    expect(suggestions.map((item) => item.label)).toEqual(['Skills', 'Media library', 'Signals']);
  });

  it('drills Signals into Trends, Events and Questions', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
      fetchSignals: async () => signalCatalog(),
    });
    const root = await provider.getSuggestions({ query: '' });
    const signals = root.find((item) => item.label === 'Signals');
    const folders = await provider.getChildSuggestions?.(signals!, '');
    expect(folders?.map((item) => item.label)).toEqual(['Trends', 'Events', 'Questions']);

    const [trends, events, questions] = await Promise.all(
      folders!.map((folder) => provider.getChildSuggestions?.(folder, '')),
    );
    expect(trends?.[0]?.reference).toEqual({
      id: 'trend-1',
      type: 'trend',
      label: 'Quiet luxury interiors',
      source: 'canvas',
      metadata: { source: undefined, relevanceToBrand: undefined },
    });
    expect(events?.[0]?.reference?.type).toBe('event');
    expect(questions?.[0]?.reference?.type).toBe('question');
  });

  it('reads this week’s signals once no matter how many folders are opened', async () => {
    let reads = 0;
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
      fetchSignals: async () => {
        reads += 1;
        return signalCatalog();
      },
    });
    const root = await provider.getSuggestions({ query: '' });
    const folders = await provider.getChildSuggestions?.(
      root.find((item) => item.label === 'Signals')!,
      '',
    );
    for (const folder of folders ?? []) await provider.getChildSuggestions?.(folder, '');
    expect(reads).toBe(1);
  });

  it('keeps the mention menu alive when the signals read fails', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
      fetchSignals: async () => {
        throw new Error('trends unreachable');
      },
    });
    const root = await provider.getSuggestions({ query: '' });
    const folders = await provider.getChildSuggestions?.(
      root.find((item) => item.label === 'Signals')!,
      '',
    );
    expect(await provider.getChildSuggestions?.(folders![0], '')).toEqual([]);
  });

  it('matches signals in free-text search alongside skills and media', async () => {
    const provider = createCanvasComposerMentionProvider({
      brandId: 'brand-1',
      skills: [],
      fetchAssets: async () => [],
      fetchFolders: async () => [],
      fetchSignals: async () => signalCatalog(),
    });
    const results = await provider.getSuggestions({ query: 'quiet' });
    expect(results.map((item) => item.reference?.id)).toEqual(['trend-1']);
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
      fetchSignals: async () => noSignals,
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
      fetchSignals: async () => noSignals,
    });
    const suggestions = await provider.getSuggestions({ query: 'hero' });
    expect(suggestions.map((item) => item.key)).toEqual(['image']);
  });
});
