// The Ask Jaina band's questions on the TikTok tab. They exist only for a CONNECTED TikTok Ads
// advertiser: OptimizerOverview renders no band on a tab whose platform is not connected
// (PP-L1-tiktok-tab-ask-jaina-band-on-unconnected-tab), so these sit with the TikTok tab's other
// connected-only code rather than beside the prompts every account sees
// (PP-L1-copy-sells-tiktok-ads-in-seven-places).

import type { JainaAccountContext, JainaEntry } from '../jainaEntryModel';

/** TikTok: creative fatigue, the first two seconds, the learning budget, Spark Ads. */
export function jainaTikTokEntryPrompts(account: JainaAccountContext): JainaEntry[] {
  const who = `the TikTok Ads account of the brand behind ${account.accountLabel ? `"${account.accountLabel}"` : 'the active account'}`;
  return [
    {
      key: 'fatigue',
      label: 'Which video is fatiguing?',
      prompt: `For ${who}: which video is fatiguing? The videos whose CTR is falling while frequency rises, with CTR before and now, and the video that could replace each one.`,
    },
    {
      key: 'hook',
      label: 'Which opening loses viewers?',
      prompt: `For ${who}: which opening loses viewers? Each video's share of viewers who stay past 2 seconds against the account, and what to change in the first seconds.`,
    },
    {
      key: 'learning',
      label: 'Is any ad group stuck in learning?',
      prompt: `For ${who}: is any ad group stuck in learning? Each ad group's daily budget against the multiple of its cost per result TikTok documents for its goal, and the results it has so far.`,
    },
    {
      key: 'spark',
      label: 'Which post should be a Spark Ad?',
      prompt: `For ${who}: which organic post should be a Spark Ad? The posts with the most views and engagement that are not promoted, and the ad group each would run in.`,
    },
  ];
}
