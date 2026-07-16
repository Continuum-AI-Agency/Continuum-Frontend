import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatMediaThumb } from './ChatMedia';
import type { ChatMedia } from './media';

const imageMedia = (url: string): ChatMedia => ({
  id: 'm1',
  url,
  kind: 'image',
  name: 'Winning creative',
});

describe('ChatMediaThumb error fallback', () => {
  afterEach(() => {
    cleanup();
  });

  it('degrades a failed image to the branded letter tile and fires onRecover exactly once per URL', () => {
    const onRecover = mock();
    const { container } = render(
      <ChatMediaThumb media={imageMedia('https://cdn/expired.jpg')} onRecover={onRecover} />,
    );

    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(onRecover).toHaveBeenCalledTimes(1);
    // The letter tile replaces the broken image.
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('W');
  });

  it('retries automatically when recovery delivers a fresh URL', () => {
    const onRecover = mock();
    const { container, rerender } = render(
      <ChatMediaThumb media={imageMedia('https://cdn/expired.jpg')} onRecover={onRecover} />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(container.querySelector('img')).toBeNull();

    rerender(<ChatMediaThumb media={imageMedia('https://cdn/fresh.jpg')} onRecover={onRecover} />);
    // Failure was keyed to the old URL, so the fresh one renders again.
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://cdn/fresh.jpg');
  });

  it('degrades a failed video to its poster image before the letter tile', () => {
    const media: ChatMedia = {
      id: 'v1',
      url: 'https://cdn/video.mp4',
      thumbnailUrl: 'https://cdn/poster.jpg',
      kind: 'video',
      name: 'Reel',
    };
    const { container } = render(<ChatMediaThumb media={media} />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    if (video) fireEvent.error(video);

    // Poster renders as a plain image after the video source dies.
    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://cdn/poster.jpg');

    // And when the poster dies too, the letter tile takes over.
    fireEvent.error(screen.getByRole('img'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('R');
  });

  it('uses the explicit fallbackSeed over media names', () => {
    const { container } = render(
      <ChatMediaThumb media={imageMedia('https://cdn/x.jpg')} fallbackSeed="Zeta" />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(container.textContent).toContain('Z');
  });
});
