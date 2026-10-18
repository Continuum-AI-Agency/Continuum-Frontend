import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { AgentMentionReference, AgentMentionSuggestion } from '@/lib/agent-references';
import { MentionifiedText } from './mentionified-text';
import { SessionContentTray } from './SessionContentTray';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// Mention chips and the session tray sit in every reloaded thread. Neither may ask for a video's
// bytes just to paint itself: the user has neither hovered nor pressed play.

const videoMention = (metadata: Record<string, unknown>): AgentMentionReference =>
  ({
    id: 'asset-1',
    type: 'media_asset',
    label: 'Launch reel',
    source: 'organic',
    metadata: { kind: 'video', signedUrl: 'https://cdn.test/reel.mp4', ...metadata },
  }) as AgentMentionReference;

afterEach(() => cleanup());

describe('mention chips in history', () => {
  it('a video chip shows its poster, never a <video>', () => {
    const { container } = render(
      <MentionifiedText
        text="Use @Launch reel here"
        references={[videoMention({ thumbnailUrl: 'https://cdn.test/reel-poster.jpg' })]}
      />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://cdn.test/reel-poster.jpg',
    );
  });

  it('a video chip with no poster is the video glyph, not the file', () => {
    const { container } = render(
      <MentionifiedText
        text="Use @Launch reel here"
        references={[videoMention({ thumbnailUrl: 'https://cdn.test/reel.mp4' })]}
      />,
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('session tray', () => {
  const video: AgentMentionSuggestion = {
    key: 'asset:1',
    label: 'Reel',
    type: 'media_asset',
    source: 'organic',
    preview: { url: 'https://cdn.test/reel.mp4', kind: 'video' },
  };

  it('opening the tray fetches no video: a video tile is a glyph', () => {
    const { getByRole } = render(<SessionContentTray items={[video]} onInsert={() => {}} />);
    fireEvent.click(getByRole('button', { name: 'Content generated in this session' }));
    expect(document.querySelector('video')).toBeNull();
    expect(document.body.textContent).toContain('Reel');
  });

  it("a caller's still replaces the item's own preview", () => {
    const { getByRole } = render(
      <SessionContentTray
        items={[video]}
        onInsert={() => {}}
        renderPreview={() => <span data-testid="draft-still" />}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Content generated in this session' }));
    expect(document.querySelector('[data-testid="draft-still"]')).not.toBeNull();
  });
});
