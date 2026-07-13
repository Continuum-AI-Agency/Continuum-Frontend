'use client';

// Says out loud that the stage is not showing the current file. Without this the
// modal is a quiet liar: the media, the pins and the comment counts all change
// under the reviewer with nothing to explain why, and the header's editing
// actions would still act on the head. The banner names the version, names what
// a comment posted here pins to, and always offers the way back.

import { History } from 'lucide-react';
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
  const latest = headVersionNumber === null ? 'the latest version' : `v${headVersionNumber}`;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      <History className="size-3.5 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Viewing v{versionNumber}</span> — read-only. Editing actions
        apply to {latest}; comments you post here pin to v{versionNumber}.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 shrink-0 px-2 text-2xs"
        onClick={onBackToLatest}
      >
        Back to latest
      </Button>
    </div>
  );
}
