// What a platform tab's figures are when the Optimizer has not read that platform itself: the
// platform's own live read. The Optimizer's reading starts when a portfolio holds the platform's
// campaigns, so the note offers the way to create one rather than leaving a dead end.

import { type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

export function platformReadingNoteText(platform: AdPlatform, where: 'above' | 'below'): string {
  const name = PLATFORM_NAMES[platform];
  const figures =
    where === 'below'
      ? `The live figures below come straight from ${name}.`
      : `These figures come straight from ${name}.`;
  return `${figures} The Optimizer's own reading of ${name} starts once a portfolio holds ${name} campaigns.`;
}

export function PlatformReadingNote({
  platform,
  where,
  onCreatePortfolio,
}: {
  platform: AdPlatform;
  /** Where the platform's own figures sit relative to the note. */
  where: 'above' | 'below';
  onCreatePortfolio?: () => void;
}) {
  return (
    <p className="px-1 text-muted-foreground text-xs" data-testid="platform-reading-note">
      {platformReadingNoteText(platform, where)}
      {onCreatePortfolio ? (
        <>
          {' '}
          <button
            className="text-primary hover:underline"
            onClick={onCreatePortfolio}
            type="button"
          >
            Create a portfolio
          </button>
        </>
      ) : null}
    </p>
  );
}
