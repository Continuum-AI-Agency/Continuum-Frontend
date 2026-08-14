import { describe, expect, it } from 'bun:test';
import { isReelMissingVideo } from './DraftLifecycle';
import type { OrganicCalendarDraft } from './types';

/**
 * `deriveOrganicMediaStage` never looks at `mediaSuggestion.reel`, so a reel that lost its video
 * and a reel that simply has not been rendered yet are the same `storyboard_ready` to the ladder.
 * This helper is the only thing that separates them on the card.
 */
function reelDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    format: 'Reel',
    mediaStage: 'storyboard_ready',
    mediaSuggestion: { storyboard: [{ role: 'hook', storageUrl: 'https://x/1.jpg' }] },
    ...overrides,
  } as unknown as OrganicCalendarDraft;
}

describe('isReelMissingVideo', () => {
  it('flags a reel whose storyboard exists but whose reel asset does not', () => {
    expect(isReelMissingVideo(reelDraft())).toBe(true);
  });

  it('stays quiet once the reel asset lands — clips ready is not stuck', () => {
    expect(
      isReelMissingVideo(
        reelDraft({
          mediaSuggestion: {
            storyboard: [{ role: 'hook', storageUrl: 'https://x/1.jpg' }],
            reel: { scenes: [], generated: false },
          },
        } as unknown as Partial<OrganicCalendarDraft>),
      ),
    ).toBe(false);
  });

  it('does not flag a carousel — only a reel needs a video', () => {
    expect(isReelMissingVideo(reelDraft({ format: 'Carousel' }))).toBe(false);
  });

  it('does not flag a reel that has moved past the blueprint rung', () => {
    expect(isReelMissingVideo(reelDraft({ mediaStage: 'realized' }))).toBe(false);
    expect(isReelMissingVideo(reelDraft({ mediaStage: 'text_only' }))).toBe(false);
  });
});
