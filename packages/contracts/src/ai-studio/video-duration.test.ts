import { describe, expect, it } from 'bun:test';
import {
  coerceNodeConfig,
  coerceVideoGeneratorDuration,
  createNodeData,
  videoResolutionRequiresEightSeconds,
} from './workflow-graph';

// The bug: a canvas video node was born WITHOUT a durationSeconds, the block had no
// duration control at all, and buildNodePayload quietly filled 8 — so every clip was
// 8 seconds and the user could not change it (Airtable #252/#254). Veo also renders
// anything above 720p at 8s only, so the pair has to move together or Run 400s.

describe('video node duration', () => {
  it('is born at 8 seconds instead of being implied downstream', () => {
    for (const type of ['videoGen', 'veoDirector', 'veoFast'] as const) {
      expect(createNodeData(type).data.durationSeconds).toBe(8);
    }
  });

  it('keeps a legal 720p choice', () => {
    const result = coerceNodeConfig(
      'videoGen',
      { durationSeconds: 4 },
      { model: 'veo-3.1', resolution: '720p' },
    );

    expect(result.data.durationSeconds).toBe(4);
    expect(result.changes).toEqual([]);
  });

  it('forces 8s when the RESOLUTION moves up under an existing 4s duration', () => {
    const result = coerceNodeConfig(
      'veoDirector',
      { resolution: '1080p' },
      { model: 'veo-3.1', durationSeconds: 4 },
    );

    expect(result.data.durationSeconds).toBe(8);
    expect(result.changes.join(' ')).toContain('only at 8 seconds');
  });

  it('forces 8s when the DURATION moves down under a high resolution', () => {
    const result = coerceNodeConfig(
      'videoGen',
      { durationSeconds: 6 },
      { model: 'veo-3.1', resolution: '4k' },
    );

    expect(result.data.durationSeconds).toBe(8);
  });

  it('treats 4k and 4K as one tier', () => {
    expect(videoResolutionRequiresEightSeconds('veo-3.1', '4k')).toBe(true);
    expect(videoResolutionRequiresEightSeconds('veo-3.1', '4K')).toBe(true);
    expect(videoResolutionRequiresEightSeconds('veo-3.1', '720p')).toBe(false);
  });

  it('replaces a length Veo does not render', () => {
    const result = coerceNodeConfig(
      'videoGen',
      { durationSeconds: 5 },
      { model: 'veo-3.1-fast', resolution: '720p' },
    );

    expect(result.data.durationSeconds).toBe(8);
    expect(result.changes.join(' ')).toContain('not valid for veo-3.1-fast');
  });

  it('leaves the fal models alone — they take 3-15s, not Veo’s ladder', () => {
    const result = coerceNodeConfig(
      'videoGen',
      { durationSeconds: 12 },
      { model: 'kling-omni', resolution: '1080p' },
    );

    expect(result.data.durationSeconds).toBe(12);
    expect(coerceVideoGeneratorDuration('kling-omni', '1080p', 12)).toBeUndefined();
  });

  it('is patch-safe: a prompt-only update never injects a duration', () => {
    const result = coerceNodeConfig(
      'videoGen',
      { prompt: 'a dog running' },
      { model: 'veo-3.1', resolution: '1080p', durationSeconds: 4 },
    );

    expect(result.data).toEqual({ prompt: 'a dog running' });
  });
});
