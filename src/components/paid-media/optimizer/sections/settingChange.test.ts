import { describe, expect, it } from 'bun:test';
import { humanizeSnakeCase, settingLabel, settingSentence, settingValue } from './settingChange';

describe('settingLabel names the audited column in English', () => {
  it('maps the known columns', () => {
    expect(settingLabel('creative_analysis')).toBe('Creative analysis');
    expect(settingLabel('max_change_pct_per_cycle')).toBe('Max change per cycle');
    expect(settingLabel('apply_mode')).toBe('Mode');
  });

  it('humanizes a column it has never heard of instead of printing it raw', () => {
    expect(settingLabel('brand_new_knob')).toBe('Brand new knob');
  });

  it('says Setting when the row names no column', () => {
    expect(settingLabel(null)).toBe('Setting');
    expect(settingLabel('')).toBe('Setting');
  });
});

describe('settingSentence reads a flipped switch as one sentence', () => {
  it('creative analysis off → on', () => {
    expect(settingSentence('creative_analysis', 'on')).toBe('Creative analysis turned on');
    expect(settingSentence('creative_analysis', 'off')).toBe('Creative analysis turned off');
  });

  it('autopilot_paused reads inverted: false is the autopilot resuming', () => {
    expect(settingSentence('autopilot_paused', 'false')).toBe('Autopilot resumed');
    expect(settingSentence('autopilot_paused', 'true')).toBe('Autopilot paused');
  });

  it('an unknown boolean column still reads as a sentence', () => {
    expect(settingSentence('some_flag', 'true')).toBe('Some flag turned on');
  });

  it('is null for a value that is not a switch', () => {
    expect(settingSentence('daily_total', '4200')).toBeNull();
    expect(settingSentence('apply_mode', 'autopilot')).toBeNull();
    expect(settingSentence('creative_analysis', null)).toBeNull();
  });
});

describe('settingValue', () => {
  it('capitalises enum words and leaves numbers and dates alone', () => {
    expect(settingValue('recommend')).toBe('Recommend');
    expect(settingValue('observe')).toBe('Observe only');
    expect(settingValue('3500')).toBe('3500');
    expect(settingValue('2026-10-01')).toBe('2026-10-01');
    expect(settingValue(null)).toBeNull();
  });

  it('humanizeSnakeCase', () => {
    expect(humanizeSnakeCase('target_metric')).toBe('Target metric');
  });
});
