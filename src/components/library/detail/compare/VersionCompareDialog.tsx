'use client';

// Compare two versions of one stack: every version is a side option, the head
// staged exactly as the detail view stages it. The viewer itself is CompareDialog.

import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { resolveStageMedia } from '../stageMedia';
import { CompareDialog, type CompareOption } from './CompareDialog';

export function versionCompareOption(
  asset: MediaAsset,
  version: MediaAssetVersion,
  namePrefix = '',
): CompareOption {
  const label = `v${version.versionNumber}`;
  return {
    id: version.id,
    label: `${namePrefix}${label}`,
    optionLabel: `${namePrefix}${label}${version.isHead ? ' · current' : ''}`,
    caption: `${namePrefix}${label}${version.isHead ? ' · Current' : ''} · ${formatRelativeTime(version.createdAt)}`,
    media: version.isHead
      ? resolveStageMedia({ asset, viewedVersion: null, headVersion: version })
      : resolveStageMedia({ asset, viewedVersion: version }),
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: MediaAsset;
  /** Every version of the stack, newest first. */
  versions: MediaAssetVersion[];
  initialAId: string;
  initialBId: string;
};

export function VersionCompareDialog({
  open,
  onOpenChange,
  asset,
  versions,
  initialAId,
  initialBId,
}: Props) {
  return (
    <CompareDialog
      open={open}
      onOpenChange={onOpenChange}
      options={versions.map((version) => versionCompareOption(asset, version))}
      initialAId={initialAId}
      initialBId={initialBId}
    />
  );
}
