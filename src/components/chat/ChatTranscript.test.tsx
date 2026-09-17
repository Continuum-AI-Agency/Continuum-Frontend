import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

import type { TranscriptAnchor } from './anchors';
import { ChatMarker } from './ChatMarker';
import { ChatMessage, type ChatRole } from './ChatMessage';
import { ChatTranscript } from './ChatTranscript';

const anchor = (id: string): TranscriptAnchor => ({ id, kind: 'assistant' });

const turn = (id: string, role: ChatRole, body: string) => (
  <ChatMessage id={id} key={id} role={role}>
    {body}
  </ChatMessage>
);

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

// The transcript follows the bottom. It used to park the newest anchored turn at the top of the
// viewport and inflate a spacer under it to hold it there, which read as an answer stranded above
// an empty screen and re-fired on every resize mid-stream. Nothing may be scroll-anchored: one
// anchored item is enough to bring the top-parking back, and it does so silently.
describe('ChatTranscript bottom-follow', () => {
  afterEach(() => cleanup());

  it('anchors no item to the top of the viewport', () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('u1'), anchor('a1')]}>
        {turn('u1', 'user', 'question')}
        <ChatMarker id="a1::plan" kind="milestone" label="Plan ready" />
        {turn('a1', 'assistant', 'answer')}
      </ChatTranscript>,
    );

    const items = container.querySelectorAll('[data-slot="message-scroller-item"]');
    expect(items.length).toBe(3);
    expect(container.querySelectorAll('[data-scroll-anchor="true"]').length).toBe(0);
  });

  it('keeps every turn and milestone addressable by the minimap', () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('u1'), anchor('a1')]}>
        {turn('u1', 'user', 'question')}
        <ChatMarker id="a1::plan" kind="milestone" label="Plan ready" />
      </ChatTranscript>,
    );

    const ids = Array.from(container.querySelectorAll('[data-message-id]')).map((node) =>
      node.getAttribute('data-message-id'),
    );
    expect(ids).toEqual(['u1', 'a1::plan']);
  });

  it('offers a jump-to-latest control', () => {
    const { getByRole } = render(
      <ChatTranscript anchors={[anchor('a'), anchor('b')]}>
        <p>turn</p>
      </ChatTranscript>,
    );

    expect(getByRole('button', { name: /jump to latest/i })).toBeTruthy();
  });
});

// The scroller re-enters follow mode whenever the viewport sits within its 8px edge threshold,
// and on a transcript shorter than the viewport scrollTop 0 is inside that threshold. Without the
// transcript owning the latch, a reader who scrolls up in the first moments of a turn has the
// gesture discarded and is pinned to the live edge for the rest of the run. jsdom reports 0 for
// every layout box, which IS that short-content case.
describe('ChatTranscript follow latch', () => {
  afterEach(() => cleanup());

  const mount = () => {
    const { container } = render(
      <ChatTranscript anchors={[anchor('a1')]}>{turn('a1', 'assistant', 'short')}</ChatTranscript>,
    );
    const scroller = container.querySelector('[data-slot="message-scroller"]');
    const viewport = container.querySelector('[data-slot="message-scroller-viewport"]');
    if (!scroller || !viewport) throw new Error('transcript scroller not found');
    return {
      viewport: viewport as HTMLElement,
      following: () => (scroller as HTMLElement).getAttribute('data-follow'),
    };
  };

  it('follows the live edge on arrival', () => {
    expect(mount().following()).toBe('true');
  });

  it('suspends follow on an upward wheel, and a scroll at the top does not undo it', () => {
    const { viewport, following } = mount();

    fireEvent.wheel(viewport, { deltaY: -240 });
    expect(following()).toBe('false');

    // Proximity alone must not resume: at scrollTop 0 on short content the reader is already
    // within the live-edge threshold, which is exactly how the scroller loses the gesture.
    fireEvent.scroll(viewport);
    expect(following()).toBe('false');
  });

  it('keeps following through a downward wheel', () => {
    const { viewport, following } = mount();

    fireEvent.wheel(viewport, { deltaY: 240 });
    expect(following()).toBe('true');
  });

  it('suspends on keys that travel up and not on keys that travel down', () => {
    for (const key of ['ArrowUp', 'PageUp', 'Home']) {
      const { viewport, following } = mount();
      fireEvent.keyDown(viewport, { key });
      expect(following()).toBe('false');
      cleanup();
    }

    for (const key of ['ArrowDown', 'PageDown', 'End']) {
      const { viewport, following } = mount();
      fireEvent.keyDown(viewport, { key });
      expect(following()).toBe('true');
      cleanup();
    }
  });

  it('resumes once the reader travels back down to the live edge', () => {
    const { viewport, following } = mount();

    fireEvent.wheel(viewport, { deltaY: -240 });
    expect(following()).toBe('false');

    viewport.scrollTop = 120;
    fireEvent.scroll(viewport);
    expect(following()).toBe('true');
  });
});
