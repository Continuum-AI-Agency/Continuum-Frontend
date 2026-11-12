'use client';

// Says out loud that the stage is not showing the current file. Without this the
// modal is a quiet liar: the media, the pins and the comment counts all change
// under the reviewer with nothing to explain why, and the header's editing
// actions would still act on the head. The banner names the version, names what
// a comment posted here pins to, and always offers the way back.

import { History } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export type ViewingVersionBannerProps = {
  versionNumber: number;
  /** The version the editing actions and the grid still act on; null if unknown. */
  headVersionNumber: number | null;
  onBackToLatest: () => void;
};

export function ViewingVersionBanner({
  versionNumber,
  headVersionNumber,
  onBackToLatest,
}: ViewingVersionBannerProps) {
  const translateUi = useUiTranslations('library');

  const latest =
    headVersionNumber === null ? translateUi('latestVersionFallback') : `v${headVersionNumber}`;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      <History className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">
          {translateUi('viewing_v_0647e172')}
          {versionNumber}
        </span>{' '}
        {translateUi('read_only_editing_actions_apply_to_861d42de')} {latest}
        {translateUi('comments_you_post_here_pin_to_v_6ce6fe2b')}
        {versionNumber}.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 shrink-0 px-2 text-2xs"
        onClick={onBackToLatest}
      >
        {' '}
        {translateUi('back_to_latest_86cf0aef')}{' '}
      </Button>
    </div>
  );
}
