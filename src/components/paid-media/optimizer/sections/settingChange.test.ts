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

  it('names the platform of a platform-scoped column in words', () => {
    expect(settingLabel('apply_enabled:google_ads')).toBe('Auto-apply on Google');
    expect(settingLabel('allowed_actions:tiktok_ads')).toBe('Allowed actions on TikTok');
    expect(settingLabel('host_account')).toBe('Host account');
  });

  it('keeps a colon that does not name a platform as part of the column', () => {
    expect(settingLabel('odd_knob:v2')).toBe('Odd knob:v2');
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

  it('reads a JSON list of action kinds as words, and an empty one as None', () => {
    expect(settingValue('["set_budget", "set_status"]')).toBe('Set budget, Set status');
    expect(settingValue('[]')).toBe('None');
    expect(settingValue('[1, 2]')).toBe('[1, 2]');
  });

  it('reads platform:account as the platform name and the account', () => {
    expect(settingValue('google_ads:5251780631')).toBe('Google 5251780631');
    expect(settingValue('12:30')).toBe('12:30');
  });

  it('humanizeSnakeCase', () => {
    expect(humanizeSnakeCase('target_metric')).toBe('Target metric');
  });
});
