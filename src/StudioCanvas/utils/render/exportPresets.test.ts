import { describe, expect, it } from 'bun:test';
import { DEFAULT_EXPORT_PRESET_ID, EXPORT_PRESETS, resolveExportPreset } from './exportPresets';

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
