import { describe, expect, it } from 'bun:test';
import {
  availableExportCodecs,
  DEFAULT_EXPORT_PRESET_ID,
  EXPORT_PRESETS,
  EXPORT_QUALITIES,
  formatExportSelection,
  resolveExportCodec,
  resolveExportPreset,
  resolveExportQuality,
  videoBitrateFor,
} from './exportPresets';

describe('resolveExportPreset', () => {
  it('falls back to the source preset for unknown or absent ids', () => {
    expect(resolveExportPreset(undefined).id).toBe('source');
    expect(resolveExportPreset('does-not-exist').id).toBe('source');
    expect(resolveExportPreset(DEFAULT_EXPORT_PRESET_ID).width).toBeNull();
  });

  it('resolves a fixed-resolution preset with even dims and a bitrate', () => {
    const preset = resolveExportPreset('vertical-1080');
    expect(preset.width).toBe(1080);
    expect(preset.height).toBe(1920);
    expect(preset.videoBitrate).toBeGreaterThan(0);
  });

  it('has unique ids and even (avc-safe) dimensions on every preset', () => {
    const ids = EXPORT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of EXPORT_PRESETS) {
      if (preset.width !== null) expect(preset.width % 2).toBe(0);
      if (preset.height !== null) expect(preset.height % 2).toBe(0);
    }
  });
});

describe('the quality ladder', () => {
  it('scales the geometry preset bitrate', () => {
    const preset = resolveExportPreset('vertical-1080');
    const standard = videoBitrateFor(preset, resolveExportQuality('standard'));
    expect(standard).toBe(preset.videoBitrate);
    expect(videoBitrateFor(preset, resolveExportQuality('high'))).toBeGreaterThan(standard);
    expect(videoBitrateFor(preset, resolveExportQuality('compact'))).toBeLessThan(standard);
  });

  it('falls back to standard for unknown or absent ids', () => {
    expect(resolveExportQuality(undefined).id).toBe('standard');
    expect(resolveExportQuality('luxurious').id).toBe('standard');
  });

  it('has unique ids and positive multipliers', () => {
    const ids = EXPORT_QUALITIES.map((quality) => quality.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const quality of EXPORT_QUALITIES) expect(quality.bitrateMultiplier).toBeGreaterThan(0);
  });
});

describe('the shared preset@quality selection string', () => {
  it('leaves the default quality off, so ids stored before this change are unchanged', () => {
    expect(formatExportSelection('vertical-1080', 'standard')).toBe('vertical-1080');
    expect(formatExportSelection('vertical-1080', 'high')).toBe('vertical-1080@high');
  });

  it('round-trips both halves', () => {
    const id = formatExportSelection('square-1080', 'compact');
    expect(resolveExportPreset(id).id).toBe('square-1080');
    expect(resolveExportQuality(id).id).toBe('compact');
  });

  it('reads a legacy bare id as standard quality', () => {
    expect(resolveExportPreset('wide-1080').id).toBe('wide-1080');
    expect(resolveExportQuality('wide-1080').id).toBe('standard');
  });
});

describe('resolveExportCodec', () => {
  it('honours the request when the probe says the machine can encode it', () => {
    const resolved = resolveExportCodec('hevc', new Set(['hevc', 'avc']));
    expect(resolved).toEqual({ codec: 'hevc', container: 'mp4', fellBackFrom: null });
  });

  it('falls back to h264 when hevc is refused, and says what it fell back from', () => {
    const resolved = resolveExportCodec('hevc', new Set(['avc']));
    expect(resolved).toEqual({ codec: 'avc', container: 'mp4', fellBackFrom: 'hevc' });
  });

  it('falls back from vp9/webm to h264/mp4 — the container follows the codec', () => {
    expect(resolveExportCodec('vp9', new Set(['vp9', 'avc']))).toEqual({
      codec: 'vp9',
      container: 'webm',
      fellBackFrom: null,
    });
    expect(resolveExportCodec('vp9', new Set(['avc']))).toEqual({
      codec: 'avc',
      container: 'mp4',
      fellBackFrom: 'vp9',
    });
  });

  it('still returns avc when the probe reports nothing at all', () => {
    // A stubbed or absent WebCodecs must not stop a render outright.
    expect(resolveExportCodec('hevc', new Set())).toEqual({
      codec: 'avc',
      container: 'mp4',
      fellBackFrom: 'hevc',
    });
    expect(resolveExportCodec('avc', new Set()).fellBackFrom).toBeNull();
  });
});

describe('availableExportCodecs', () => {
  it('never offers a codec the probe refused', () => {
    expect(availableExportCodecs(new Set(['avc']))).toEqual(['avc']);
    expect(availableExportCodecs(new Set(['avc', 'hevc']))).toEqual(['avc', 'hevc']);
    expect(availableExportCodecs(new Set(['av1']))).toEqual([]);
  });
});
