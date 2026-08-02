import { describe, expect, it } from 'bun:test';
import type { OrganicSession } from '@/lib/organic/agent-sessions';
import { presentSessionTitles, toShortSessionTitle } from './sessionTitles';

function session(
  sessionId: string,
  title: string | null,
  lastMessagePreview: string | null = null,
  preview: string | null = null,
): OrganicSession {
  return {
    sessionId,
    brandId: 'brand-1',
    title,
    lastMessageRole: 'assistant',
    lastMessagePreview,
    lastMessageAt: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    initiator: 'user',
    initiatorAgent: null,
    callerRunId: null,
    callerSessionId: null,
    tags: [],
    preview,
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

  // `preview` is stamped from the FIRST USER MESSAGE on session insert. The Backend
  // overwrites `lastMessagePreview` with the ASSISTANT turn when the run completes, so
  // reading that first made a title mutate from the question into the answer's first line.
  it('prefers the first-user-message preview over the last message preview', () => {
    expect(
      toShortSessionTitle(
        session(
          'one',
          null,
          'Here is a full plan for your summer campaign.',
          'How did last week perform on Instagram?',
        ),
      ),
    ).toBe('How did last week perform on Instagram');
  });

  it('still lets an explicit title win over both previews', () => {
    expect(
      toShortSessionTitle(session('one', 'Summer launch', 'assistant line', 'user question')),
    ).toBe('Summer launch');
  });

  it('falls back to the default when every source is empty', () => {
    expect(toShortSessionTitle(session('one', null, null, null))).toBe('New conversation');
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
