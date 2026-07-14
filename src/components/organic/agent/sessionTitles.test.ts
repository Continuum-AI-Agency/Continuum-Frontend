import { describe, expect, it } from 'bun:test';
import type { OrganicSession } from '@/lib/organic/agent-sessions';
import { presentSessionTitles, toShortSessionTitle } from './sessionTitles';

function session(
  sessionId: string,
  title: string | null,
  preview: string | null = null,
): OrganicSession {
  return {
    sessionId,
    brandId: 'brand-1',
    title,
    lastMessageRole: 'assistant',
    lastMessagePreview: preview,
    lastMessageAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

describe('organic session title presentation', () => {
  it('turns a long first-line fallback into a short title', () => {
    expect(
      toShortSessionTitle(
        session(
          'one',
          null,
          'Build a complete launch plan for our summer campaign with twelve different post concepts',
        ),
      ),
    ).toBe('Build a complete launch plan for our summer');
  });

  it('removes raw UUIDs from the visible title', () => {
    expect(
      toShortSessionTitle(
        session('one', 'Retry draft 68fe1000-1111-4111-8111-111111111111 tomorrow'),
      ),
    ).toBe('Retry draft draft tomorrow');
  });

  it('numbers duplicate titles so every row is distinguishable', () => {
    const titles = presentSessionTitles([
      session('one', 'Shared an update'),
      session('two', 'Shared an update'),
    ]);

    expect(titles.get('one')).toBe('Shared an update');
    expect(titles.get('two')).toBe('Shared an update (2)');
  });
});
