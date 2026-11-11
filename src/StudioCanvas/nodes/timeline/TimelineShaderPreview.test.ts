import { describe, expect, it } from 'bun:test';
import { latestWins, needsCanvasPreview, videoShaderScale } from './TimelineShaderPreview';

describe('needsCanvasPreview', () => {
  it('draws a filtered picture through the canvas, like the export decodes it', () => {
    // A <video> shows the browser's display decode; the export draws the Canvas/WebCodecs one.
    // On the recorded NASA interview they differ by 8–13 RGB and a filter's contrast widens it.
    expect(needsCanvasPreview({ filterPreset: 'vintage', filterStrength: 0.6 })).toBe(true);
    expect(needsCanvasPreview({ adjustments: { contrast: 1.2 } })).toBe(true);
  });

  it('leaves an untouched picture on the native video element', () => {
    expect(needsCanvasPreview(undefined)).toBe(false);
    expect(needsCanvasPreview({})).toBe(false);
    expect(needsCanvasPreview({ filterPreset: 'none' })).toBe(false);
  });
});

describe('latestWins', () => {
  it('runs one task at a time, keeps only the newest waiting, and finishes every task it starts', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const release: Array<() => void> = [];
    const schedule = latestWins();
    const task = (id: number) => () =>
      new Promise<void>((resolve) => {
        started.push(id);
        release.push(() => {
          finished.push(id);
          resolve();
        });
      });

    // A playhead tick per frame against a GPU that is still busy with the first one.
    for (const id of [1, 2, 3, 4]) schedule(task(id));
    expect(started).toEqual([1]);
    release.shift()?.();
    await Bun.sleep(0);
    expect(started).toEqual([1, 4]);
    release.shift()?.();
    await Bun.sleep(0);
    expect(finished).toEqual([1, 4]);
    // A failed render does not wedge the queue.
    schedule(() => Promise.reject(new Error('device lost')));
    schedule(task(5));
    await Bun.sleep(0);
    expect(started).toEqual([1, 4, 5]);
  });
});

describe('videoShaderScale', () => {
  it('shades a 1080x1920 clip at its displayed size, never past ~960 px on the long edge', () => {
    expect(videoShaderScale(1920, 700, 2)).toBe(0.5);
    expect(videoShaderScale(1920, 700, 1)).toBe(720 / 1920);
    // A source smaller than the display is never upscaled.
    expect(videoShaderScale(640, 700, 2)).toBe(1);
  });

  it('keeps one size across a small resize, since every new size rebuilds the GPU device', () => {
    expect(videoShaderScale(1920, 610, 1)).toBe(videoShaderScale(1920, 700, 1));
  });
});
