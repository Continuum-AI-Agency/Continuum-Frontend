// What the Creative Spotlight read (R3) adds to H09: per ad, its format, hook rate, frequency and
// share of spend, and a verdict that includes fatigue (`fading`, the Optimizer's F1 shape read per
// ad). There is no numeric fatigue score. Where the read does not know a figure it says why, and
// that is what is printed: never a zero, never a guess.

import type {
  HomeCreativeFormat,
  HomeCreativeSpotlightAd,
  HomeCreativeSpotlightData,
  HomeCreativeVerdict,
} from '@continuum/contracts';
import { formatMoney } from '@/lib/home/format';
import { goalDayLabel } from '../goals/goalModel';

const FORMAT_LABEL: Record<HomeCreativeFormat, string> = {
  image: 'Image',
  video: 'Video',
  carousel: 'Carousel',
  unknown: 'Format unknown',
};

export function spotlightFormatLabel(format: HomeCreativeFormat): string {
  return FORMAT_LABEL[format];
}

export const SPOTLIGHT_VERDICT_LABEL: Record<HomeCreativeVerdict, string> = {
  winner: 'Winner',
  fading: 'Fading',
  new: 'New',
  steady: 'Steady',
};

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

export function spotlightHookLine(
  ad: Pick<HomeCreativeSpotlightAd, 'hookRate' | 'hookRateUnavailable'>,
): string {
  if (ad.hookRate !== null) return `Hook rate ${percent(ad.hookRate)}`;
  return ad.hookRateUnavailable === 'not_video'
    ? 'No hook rate: not a video'
    : 'Hook rate not reported';
}

export function spotlightSpendLine(ad: Pick<HomeCreativeSpotlightAd, 'spendShare'>): string {
  return `${Math.round(ad.spendShare * 100)}% of spend`;
}

export function spotlightFrequencyLine(ad: Pick<HomeCreativeSpotlightAd, 'frequency'>): string {
  return ad.frequency === null ? 'Frequency not reported' : `Frequency ${ad.frequency.toFixed(2)}`;
}

export function spotlightCostLine(
  ad: Pick<HomeCreativeSpotlightAd, 'costPerResult'>,
  currency: string | null,
): string {
  const { value, label } = ad.costPerResult;
  return value === null ? 'No result yet' : `${formatMoney(value, currency)} ${label}`;
}

export function spotlightName(
  ad: Pick<HomeCreativeSpotlightAd, 'title' | 'adName' | 'adId'>,
): string {
  return ad.title ?? ad.adName ?? `Ad ${ad.adId}`;
}

const VERDICT_ORDER: [HomeCreativeVerdict, string][] = [
  ['fading', 'fading'],
  ['winner', 'winner'],
  ['new', 'new'],
  ['steady', 'steady'],
];

/** "2 fading · 1 winner": over the ads the read returned, the ones most worth a look first. */
export function spotlightVerdictLine(data: Pick<HomeCreativeSpotlightData, 'ads'>): string {
  return VERDICT_ORDER.flatMap(([verdict, words]) => {
    const count = data.ads.filter((ad) => ad.verdict === verdict).length;
    if (count === 0) return [];
    return [`${count} ${verdict === 'winner' && count > 1 ? 'winners' : words}`];
  }).join(' · ');
}

/** The windows are as of the latest sync: "As of Oct 14 · 21 days old" once that is old. */
export function spotlightAgeLine(
  data: Pick<HomeCreativeSpotlightData, 'asOf' | 'ageDays'>,
): string {
  const asOf = `As of ${goalDayLabel(data.asOf.slice(0, 10))}`;
  return data.ageDays >= 2 ? `${asOf} · ${data.ageDays} days old` : asOf;
}
