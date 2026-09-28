import { describe, expect, it } from 'bun:test';
import { activeStageVideo, registerStageVideo, videoStillFileName } from './videoPoster';

describe('videoStillFileName', () => {
  it('names the still by minutes, seconds and the frame inside that second', () => {
    expect(videoStillFileName('hero', 0, { num: 30, den: 1 })).toBe('hero-still-0-00-00.png');
    expect(videoStillFileName('hero', 61_500, { num: 24, den: 1 })).toBe('hero-still-1-01-12.png');
  });

  it('counts frames at the measured rate — 29.97 is not 30', () => {
    // 1.5 s at 30000/1001 is absolute frame 44; the second began at frame 29.
    expect(videoStillFileName('cut', 1_500, { num: 30_000, den: 1001 })).toBe(
      'cut-still-0-01-15.png',
    );
  });

  it('assumes 30 fps when the rate is unknown', () => {
    expect(videoStillFileName('cut', 2_500, null)).toBe('cut-still-0-02-15.png');
  });
});

describe('stage video registry', () => {
  it('holds the registered element until it is cleared', () => {
    const video = document.createElement('video');
    registerStageVideo(video, { num: 24, den: 1 });
    expect(activeStageVideo()).toBe(video);
    registerStageVideo(null);
    expect(activeStageVideo()).toBeNull();
  });
});
