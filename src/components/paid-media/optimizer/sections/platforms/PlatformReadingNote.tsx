import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import { useTranslations } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// What a platform tab's figures are when the Optimizer has not read that platform itself: the
// platform's own live read. The Optimizer's reading starts when a portfolio holds the platform's
// campaigns; the tab's portfolio rows, below, offer the way to create one.

import { type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

export function platformReadingNoteText(
  platform: AdPlatform,
  where: 'above' | 'below',
  uiTranslate?: ScaleCopy,
): string {
  const name = PLATFORM_NAMES[platform];
  const figures =
    where === 'below'
      ? `The live figures below come straight from ${name}.`
      : `These figures come straight from ${name}.`;
  return uiTranslate
    ? uiTranslate('helper_59ece050d39d', { v0: figures, v1: name, v2: name })
    : `${figures} The Optimizer's own reading of ${name} starts once a portfolio holds ${name} campaigns.`;
}

export function PlatformReadingNote({
  platform,
  where,
}: {
  platform: AdPlatform;
  /** Where the platform's own figures sit relative to the note. */
  where: 'above' | 'below';
}) {
  const uiText = useTranslations('scale');
  return (
    <p className="px-1 text-muted-foreground text-xs" data-testid="platform-reading-note">
      {platformReadingNoteText(platform, where, uiText)}
    </p>
  );
}
