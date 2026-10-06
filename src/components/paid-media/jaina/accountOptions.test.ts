import { describe, expect, it } from 'bun:test';
import {
  type JainaAccountOption,
  jainaAccountForPlatform,
  jainaAccountOptions,
  jainaTurnAccounts,
} from './accountOptions';

const META: JainaAccountOption = { id: 'act_1', label: 'Easy Fit', platform: 'meta' };
const META_2: JainaAccountOption = { id: 'act_2', label: 'Easy Fit 2', platform: 'meta' };
const GOOGLE: JainaAccountOption = {
  id: '5251780631',
  label: 'Easy Fit 2026',
  platform: 'google_ads',
};
const TIKTOK: JainaAccountOption = {
  id: '7301234567890123456',
  label: 'Easy Fit TikTok',
  platform: 'tiktok_ads',
};
const OPTIONS = [META, META_2, GOOGLE];

const account = (over: {
  externalAccountId: string;
  name: string;
  type: string;
  alias?: string | null;
}) => ({
  integrationAccountId: `ia-${over.externalAccountId}`,
  alias: over.alias ?? null,
  ...over,
});

describe('jainaAccountOptions', () => {
  it("lists the brand's TikTok ad accounts beside Meta and Google", () => {
    const options = jainaAccountOptions('act_1', {
      facebook: {
        accounts: [
          account({ externalAccountId: 'act_1', name: 'Easy Fit', type: 'meta_ad_account' }),
        ],
      },
      googleAds: {
        accounts: [
          account({
            externalAccountId: '525-178-0631',
            name: 'Easy Fit 2026',
            type: 'google_ads_account',
          }),
        ],
      },
      tiktokAds: {
        accounts: [
          account({
            externalAccountId: '7301234567890123456',
            name: 'Easy Fit TikTok',
            type: 'tiktok_advertiser',
          }),
          account({
            externalAccountId: '7301234567890123456',
            name: 'Easy Fit TikTok (again)',
            type: 'tiktok_advertiser',
          }),
        ],
      },
    });
    expect(options.map((option) => [option.platform, option.id])).toEqual([
      ['meta', 'act_1'],
      ['google_ads', '525-178-0631'],
      ['tiktok_ads', '7301234567890123456'],
    ]);
    expect(options[2]?.label).toBe('Easy Fit TikTok');
  });

  it('never offers an organic TikTok profile as an ad account', () => {
    const options = jainaAccountOptions(null, {
      tiktokAds: {
        accounts: [
          account({ externalAccountId: 'creator_1', name: '@easyfit', type: 'tiktok_account' }),
        ],
      },
    });
    expect(options).toEqual([]);
  });
});

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

  it("says a TikTok account's platform even when it is the only one selected", () => {
    expect(jainaTurnAccounts([...OPTIONS, TIKTOK], ['7301234567890123456'])).toEqual([
      { platform: 'tiktok', accountId: '7301234567890123456' },
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

  it("points a TikTok deep link at the brand's TikTok account", () => {
    expect(jainaAccountForPlatform([...OPTIONS, TIKTOK], 'tiktok_ads')).toBe(TIKTOK);
  });

  it('leaves the primary alone for Meta, no platform, or a platform the brand has no account on', () => {
    expect(jainaAccountForPlatform(OPTIONS, 'meta')).toBeNull();
    expect(jainaAccountForPlatform(OPTIONS, null)).toBeNull();
    expect(jainaAccountForPlatform(OPTIONS, 'tiktok_ads')).toBeNull();
    expect(jainaAccountForPlatform([META], 'google_ads')).toBeNull();
  });
});
