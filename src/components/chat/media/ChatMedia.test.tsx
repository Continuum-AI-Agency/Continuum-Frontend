import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChatMediaCarousel, ChatMediaThumb } from './ChatMedia';
import type { ChatMedia } from './media';

// embla (the carousel engine) reaches for observers happy-dom does not expose. Inert
// stubs are what we want: these tests assert the src/preload contract and the slide
// wiring, not layout measurement.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const testGlobals = globalThis as unknown as Record<string, unknown>;
const testWindow = global.window as unknown as Record<string, unknown>;
testGlobals.ResizeObserver ??= ObserverStub;
testGlobals.IntersectionObserver ??= ObserverStub;
testGlobals.MutationObserver ??= testWindow.MutationObserver ?? ObserverStub;

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

  // #255: paging a carousel quickly showed "the same image" twice. Mutating `src` on
  // a live element leaves the previous decode painted until the new URL loads (and a
  // <video> does not reload at all without .load()), so both elements are keyed by URL.
  it('remounts the image element when the URL changes instead of mutating src in place', () => {
    const { rerender } = render(<ChatMediaThumb media={imageMedia('https://cdn/one.jpg')} />);
    const first = screen.getByRole('img');

    rerender(<ChatMediaThumb media={imageMedia('https://cdn/two.jpg')} />);
    const second = screen.getByRole('img');

    expect(second.getAttribute('src')).toBe('https://cdn/two.jpg');
    expect(second).not.toBe(first);
  });

  it('remounts the video element when the URL changes', () => {
    const clip = (url: string): ChatMedia => ({ id: 'v1', url, kind: 'video', name: 'Reel' });
    const { container, rerender } = render(<ChatMediaThumb media={clip('https://cdn/a.mp4')} />);
    const first = container.querySelector('video');

    rerender(<ChatMediaThumb media={clip('https://cdn/b.mp4')} />);
    const second = container.querySelector('video');

    expect(second?.getAttribute('src')).toBe('https://cdn/b.mp4');
    expect(second).not.toBe(first);
  });

  it('uses the explicit fallbackSeed over media names', () => {
    const { container } = render(
      <ChatMediaThumb media={imageMedia('https://cdn/x.jpg')} fallbackSeed="Zeta" />,
    );
    fireEvent.error(screen.getByRole('img'));
    expect(container.textContent).toContain('Z');
  });
});

const videoMedia = (overrides: Partial<ChatMedia> = {}): ChatMedia => ({
  id: 'v1',
  url: 'https://cdn/clip.mp4',
  thumbnailUrl: 'https://cdn/poster.jpg',
  kind: 'video',
  name: 'Reel creative',
  ...overrides,
});

describe('ChatMediaThumb hover-play', () => {
  afterEach(() => {
    cleanup();
  });

  it('downloads zero video bytes until the pointer arrives', () => {
    const { container } = render(<ChatMediaThumb hoverPlay media={videoMedia()} />);
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toBeNull();
    expect(video.getAttribute('poster')).toBe('https://cdn/poster.jpg');
  });

  it('mounts the source and plays on pointer enter, pausing on leave', () => {
    const play = mock(() => Promise.resolve());
    const pause = mock();
    const { container } = render(<ChatMediaThumb hoverPlay media={videoMedia()} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    video.play = play as unknown as HTMLVideoElement['play'];
    video.pause = pause as unknown as HTMLVideoElement['pause'];

    fireEvent.pointerEnter(video);
    expect(video.getAttribute('src')).toBe('https://cdn/clip.mp4');
    // The source only just mounted, so playback starts from onLoadedData.
    fireEvent.loadedData(video);
    expect(play).toHaveBeenCalled();

    fireEvent.pointerLeave(video);
    expect(pause).toHaveBeenCalledTimes(1);
    // The bytes stay mounted, but the play mark comes back for the next hover.
    expect(video.getAttribute('src')).toBe('https://cdn/clip.mp4');
    expect(container.querySelector('span.opacity-0')).toBeNull();
  });

  it('asks for the bytes only once hovered: preload flips from none to auto', () => {
    const { container } = render(<ChatMediaThumb hoverPlay media={videoMedia()} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    video.play = mock(() => Promise.resolve()) as unknown as HTMLVideoElement['play'];

    fireEvent.pointerEnter(video);
    // A src mounting under preload="none" would sit idle and never fire loadeddata.
    expect(video.getAttribute('preload')).toBe('auto');
  });

  it('a non-hover tile keeps its src but preloads nothing', () => {
    const { container } = render(<ChatMediaThumb media={videoMedia()} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toBe('https://cdn/clip.mp4');
  });

  it('a poster-less tile is a neutral tile: no src, no first-frame seek, a play mark', () => {
    const { container } = render(
      <ChatMediaThumb hoverPlay media={videoMedia({ thumbnailUrl: undefined })} />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    // The old `#t=0.01` + preload="metadata" fetched bytes per tile just to paint a still.
    expect(video.getAttribute('preload')).toBe('none');
    expect(video.getAttribute('src')).toBeNull();
    expect(video.getAttribute('poster')).toBeNull();
    expect(container.querySelector('svg.lucide-play')).not.toBeNull();
  });

  it('never seeks for a first frame, with or without hover', () => {
    const { container } = render(
      <ChatMediaThumb media={videoMedia({ thumbnailUrl: undefined })} />,
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://cdn/clip.mp4');
    expect(video.getAttribute('preload')).toBe('none');
  });
});

describe('ChatMediaThumb recovery', () => {
  afterEach(() => {
    cleanup();
  });

  it('asks for a fresh URL once when a video fails, and retries when one arrives', () => {
    const onRecover = mock();
    const clip = (url: string): ChatMedia => ({ id: 'v1', url, kind: 'video', name: 'Reel' });
    const { container, rerender } = render(
      <ChatMediaThumb media={clip('https://cdn/expired.mp4')} onRecover={onRecover} />,
    );
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    expect(onRecover).toHaveBeenCalledTimes(1);
    expect(container.querySelector('video')).toBeNull();

    rerender(<ChatMediaThumb media={clip('https://cdn/fresh.mp4')} onRecover={onRecover} />);
    // Failure is keyed to the dead URL, so the fresh one mounts a live <video> again.
    expect(container.querySelector('video')?.getAttribute('src')).toBe('https://cdn/fresh.mp4');
  });

  it('does not re-ask for a URL it already asked about', () => {
    const onRecover = mock();
    const { rerender } = render(
      <ChatMediaThumb media={imageMedia('https://cdn/a.jpg')} onRecover={onRecover} />,
    );
    fireEvent.error(screen.getByRole('img'));
    rerender(<ChatMediaThumb media={imageMedia('https://cdn/b.jpg')} onRecover={onRecover} />);
    rerender(<ChatMediaThumb media={imageMedia('https://cdn/a.jpg')} onRecover={onRecover} />);
    expect(onRecover).toHaveBeenCalledTimes(1);
  });
});

describe('ChatMediaThumb accessible name', () => {
  afterEach(() => {
    cleanup();
  });

  it('never ships an empty alt for a creative', () => {
    render(<ChatMediaThumb media={{ id: 'x', url: 'https://cdn/x.jpg', kind: 'image' }} />);
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Image');
  });
});

describe('ChatMediaCarousel', () => {
  afterEach(() => {
    cleanup();
  });

  const slides: ChatMedia[] = [
    { id: 's0', url: 'https://cdn/1.jpg', kind: 'image', name: 'Slide one' },
    { id: 's1', url: 'https://cdn/2.jpg', kind: 'image', name: 'Slide two' },
    { id: 's2', url: 'https://cdn/3.jpg', kind: 'image', name: 'Slide three' },
  ];

  it('renders every slide with a position counter and paging controls', () => {
    const { container } = render(<ChatMediaCarousel items={slides} />);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(container.textContent).toContain('1/3');
    expect(screen.getByRole('button', { name: /previous/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /next/i })).toBeDefined();
  });

  it('renders a single item bare, with no carousel chrome', () => {
    const only = slides[0] as ChatMedia;
    const { container } = render(<ChatMediaCarousel items={[only]} />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.textContent).not.toContain('1/1');
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
  });

  it('reports the activated slide index through onOpen', () => {
    const onOpen = mock();
    render(<ChatMediaCarousel items={slides} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Open Slide two/i }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('renders nothing for an empty list rather than an empty frame', () => {
    const { container } = render(<ChatMediaCarousel items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
