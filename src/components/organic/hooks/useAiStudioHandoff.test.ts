import { describe, expect, it, mock } from 'bun:test';
import { renderHook, waitFor } from '@testing-library/react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import {
  buildAiStudioStorageKey,
  plannerAiStudioHandoffSchema,
} from '@/lib/organic/ai-studio-bridge';

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: mock(() => {}) }),
}));
mock.module('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: mock(() => {}) }),
}));

const { useAiStudioHandoff, withPlannerHandoffParams } = await import('./useAiStudioHandoff');

// An agent-generated carousel: ten realized slides, each with its own blueprint
// prompt, and NO `slideCount` — that column is only ever restored from a
// persisted browser snapshot, which the agent path never writes.
const agentCarouselDraft = (
  overrides: Partial<OrganicCalendarDraft> = {},
): OrganicCalendarDraft => ({
  id: 'draft-1',
  title: 'Inefficient booking costs time',
  summary: 'Ten reasons manual booking bleeds hours',
  timeLabel: '5:03 PM',
  dateLabel: 'Thu, Aug 6',
  status: 'draft',
  platforms: ['instagram'],
  format: 'Carousel',
  objective: 'Awareness',
  captionPreview: 'Stop losing 15 hours a week',
  tags: [],
  mediaCount: 1,
  publishingAssets: Array.from({ length: 10 }, (_, index) => ({
    role: `slide_${index + 1}`,
    kind: 'image' as const,
    slideIndex: index,
    storagePath: `brand/slide-${index + 1}.png`,
    storageUrl: `https://example.com/slide-${index + 1}.png`,
  })),
  mediaSuggestion: {
    assets: Array.from({ length: 10 }, (_, index) => ({
      role: `slide_${index + 1}`,
      order: index + 1,
      prompt: `Slide ${index + 1} visual direction`,
    })),
  },
  ...overrides,
});

const readPersistedHandoff = (draftId: string) => {
  const raw = window.localStorage.getItem(buildAiStudioStorageKey(draftId));
  expect(raw).not.toBeNull();
  return plannerAiStudioHandoffSchema.parse(JSON.parse(raw as string));
};

const renderHandoff = (draft: OrganicCalendarDraft) =>
  renderHook(() =>
    useAiStudioHandoff({
      brandProfileId: 'brand-1',
      weekStartId: '2026-08-03',
      selectedDraft: draft,
      updateDraftById: () => {},
      setSelectedDraftId: () => {},
      isCalendarHydrated: false,
    }),
  );

describe('useAiStudioHandoff — carousel handoff', () => {
  it('counts the realized slides instead of collapsing an agent carousel to one', async () => {
    window.localStorage.clear();
    renderHandoff(agentCarouselDraft());

    await waitFor(() => {
      expect(readPersistedHandoff('draft-1').authoritativeCount).toBe(10);
    });
  });

  // A slide now carries its REALIZED image alongside its direction (#307). The
  // headless realize writes every slide into publishingAssets and mirrors only the
  // primary onto mediaSuggestion.assetUrl, so a carousel used to open in AI Studio
  // with ten empty generators and slide 1's picture wired to all of them as a shared
  // reference — nothing to "continue from the base" with, per slide.
  it('carries each slide its own direction AND its own realized image', async () => {
    window.localStorage.clear();
    renderHandoff(agentCarouselDraft({ id: 'draft-2' }));

    await waitFor(() => {
      const handoff = readPersistedHandoff('draft-2');
      expect(handoff.slides).toHaveLength(10);
      expect(handoff.slides?.[0]).toEqual({
        index: 0,
        prompt: 'Slide 1 visual direction',
        assetUrl: 'https://example.com/slide-1.png',
      });
      expect(handoff.slides?.[9]).toEqual({
        index: 9,
        prompt: 'Slide 10 visual direction',
        assetUrl: 'https://example.com/slide-10.png',
      });
    });
  });

  it('leaves a single-image post at one output and no per-slide direction', async () => {
    window.localStorage.clear();
    renderHandoff(
      agentCarouselDraft({
        id: 'draft-3',
        format: 'Post',
        publishingAssets: undefined,
        mediaSuggestion: undefined,
      }),
    );

    await waitFor(() => {
      const handoff = readPersistedHandoff('draft-3');
      expect(handoff.postType).toBe('post');
      expect(handoff.authoritativeCount).toBe(1);
      expect(handoff.slides).toBeUndefined();
    });
  });
});

// The Apply Back to Planner bug. A reel whose clips are generated carries a
// `composition.openHref` — a bare `?roomId=&focusNodeId=` timeline link with no handoff
// identity on it. openDraft pushed that href verbatim, so `source`/`draftId` never
// reached AIStudioClient, the planner seed stayed null, and the canvas header rendered
// no Apply Back block at all. The control was absent, not disabled, which is exactly
// what "the replace button does nothing" looks like from the outside.
describe('withPlannerHandoffParams', () => {
  it('stamps the planner identity onto a composition link that has its own query', () => {
    const href = withPlannerHandoffParams(
      '/ai-studio?roomId=room-1&focusNodeId=timeline-1',
      'draft-9',
    );
    const params = new URLSearchParams(href.split('?')[1]);

    expect(params.get('roomId')).toBe('room-1');
    expect(params.get('focusNodeId')).toBe('timeline-1');
    expect(params.get('source')).toBe('organic-planner');
    expect(params.get('draftId')).toBe('draft-9');
  });

  it('falls back to the canvas route when there is no composition yet', () => {
    const href = withPlannerHandoffParams(undefined, 'draft-9');
    const params = new URLSearchParams(href.split('?')[1]);

    expect(href.startsWith('/ai-studio')).toBe(true);
    expect(params.get('mode')).toBe('canvas');
    expect(params.get('source')).toBe('organic-planner');
    expect(params.get('draftId')).toBe('draft-9');
  });

  it('keeps the path relative — never leaks the parse base into the pushed route', () => {
    expect(withPlannerHandoffParams('/ai-studio?roomId=r', 'd')).not.toContain('local.invalid');
  });
});
