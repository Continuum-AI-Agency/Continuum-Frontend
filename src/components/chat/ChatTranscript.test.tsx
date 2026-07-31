import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import type { TranscriptAnchor } from './anchors';
import { ChatTranscript } from './ChatTranscript';

const anchor = (id: string): TranscriptAnchor => ({ id, kind: 'assistant' });

const contentOf = (container: HTMLElement): HTMLElement => {
  const content = container.querySelector('[data-slot="message-scroller-content"]');
  if (!content) throw new Error('transcript content not found');
  return content as HTMLElement;
};

// The right gutter exists solely to keep the minimap off the text. Reserving it when no
// minimap renders narrows every transcript for nothing — including the column that hosts the
// composer, which is what made the composer look like it overflowed its container.
describe('ChatTranscript minimap gutter', () => {
  afterEach(() => cleanup());

  it('reserves the gutter only when the minimap actually renders', () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('a'), anchor('b')]}>
        <p>turn</p>
      </ChatTranscript>,
    );

    expect(contentOf(container).className).toContain('pr-10');
  });

  it('drops the gutter when there are too few anchors to draw a minimap', () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('a')]}>
        <p>turn</p>
      </ChatTranscript>,
    );

    expect(contentOf(container).className).not.toContain('pr-10');
  });

  it('drops the gutter when the minimap is switched off entirely', () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('a'), anchor('b')]} showMinimap={false}>
        <p>turn</p>
      </ChatTranscript>,
    );

    expect(contentOf(container).className).not.toContain('pr-10');
  });
});
