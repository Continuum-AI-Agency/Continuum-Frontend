import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Video } from './video';

afterEach(cleanup);

describe('Video', () => {
  it("holds Loomix's preload=auto on a paused player to metadata, so the film is not buffered before play", () => {
    const { container } = render(<Video src="https://storage.test/clip.mp4" />);
    const video = container.querySelector('video') as HTMLVideoElement;
    video.preload = 'auto';
    expect(video.getAttribute('preload')).toBe('metadata');
    video.preload = 'none';
    expect(video.getAttribute('preload')).toBe('none');
  });
});
