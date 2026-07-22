import { describe, expect, it } from 'bun:test';

import { buildSourceMetadataPatch } from './sourceMetadata';

describe('buildSourceMetadataPatch', () => {
  it('maps a full metadata read onto snake_case columns', () => {
    expect(buildSourceMetadataPatch({ width: 1080, height: 1920, durationMs: 14200 })).toEqual({
      width: 1080,
      height: 1920,
      duration_ms: 14200,
    });
  });

  it('drops columns whose header read came back null', () => {
    expect(buildSourceMetadataPatch({ width: 1080, height: null, durationMs: null })).toEqual({
      width: 1080,
    });
  });

  it('is empty when nothing was readable — the caller then skips the write entirely', () => {
    expect(buildSourceMetadataPatch({ width: null, height: null, durationMs: null })).toEqual({});
  });

  it('rejects non-positive dimensions (a zero-width decode is not a real dimension)', () => {
    expect(buildSourceMetadataPatch({ width: 0, height: -5, durationMs: 1000 })).toEqual({
      duration_ms: 1000,
    });
  });

  it('keeps a zero duration (a still-frame clip is legitimately 0ms) but rejects a negative one', () => {
    expect(buildSourceMetadataPatch({ width: 100, height: 100, durationMs: 0 })).toEqual({
      width: 100,
      height: 100,
      duration_ms: 0,
    });
    expect(buildSourceMetadataPatch({ width: 100, height: 100, durationMs: -1 })).toEqual({
      width: 100,
      height: 100,
    });
  });
});
