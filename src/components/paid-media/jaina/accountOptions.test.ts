import { describe, expect, it } from 'bun:test';
import {
  type JainaAccountOption,
  jainaAccountForPlatform,
  jainaTurnAccounts,
} from './accountOptions';

const META: JainaAccountOption = { id: 'act_1', label: 'Easy Fit', platform: 'meta' };
const META_2: JainaAccountOption = { id: 'act_2', label: 'Easy Fit 2', platform: 'meta' };
const GOOGLE: JainaAccountOption = {
  id: '5251780631',
  label: 'Easy Fit 2026',
  platform: 'google_ads',
};
const OPTIONS = [META, META_2, GOOGLE];

describe('jainaTurnAccounts', () => {
  it('keeps the legacy request for one Meta account', () => {
    expect(jainaTurnAccounts(OPTIONS, ['act_1'])).toBeNull();
    expect(jainaTurnAccounts(OPTIONS, [])).toBeNull();
  });

  it("says a Google account's platform even when it is the only one selected", () => {
    expect(jainaTurnAccounts(OPTIONS, ['5251780631'])).toEqual([
      { platform: 'google_ads', accountId: '5251780631' },
    ]);
  });

  it('says every platform when more than one account is selected', () => {
    expect(jainaTurnAccounts(OPTIONS, ['act_1', 'act_2'])).toEqual([
      { platform: 'meta', accountId: 'act_1' },
      { platform: 'meta', accountId: 'act_2' },
    ]);
  });
});

describe('jainaAccountForPlatform', () => {
  it("points a Google deep link at the brand's Google account", () => {
    expect(jainaAccountForPlatform(OPTIONS, 'google_ads')).toBe(GOOGLE);
  });

  it('leaves the primary alone for Meta, no platform, or a platform the brand has no account on', () => {
    expect(jainaAccountForPlatform(OPTIONS, 'meta')).toBeNull();
    expect(jainaAccountForPlatform(OPTIONS, null)).toBeNull();
    expect(jainaAccountForPlatform(OPTIONS, 'tiktok_ads')).toBeNull();
    expect(jainaAccountForPlatform([META], 'google_ads')).toBeNull();
  });
});
