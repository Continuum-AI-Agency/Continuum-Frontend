'use client';

// Stage for a superseded version of a kind === 'file' asset. FilePreviewStage
// cannot serve here: it names the head file and signs a download by assetId,
// which always mints the CURRENT bytes — so pointing it at an older version
// would show the reviewer one version's card and hand them another version's
// file. The version row already carries its own signed URL, so this panel links
// straight to the bytes on the card.

import type { MediaAssetVersion } from '@continuum/contracts';
import { Download, FileIcon } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { withForcedDownload } from '@/lib/media/downloadUrl';
import { fileExtension, formatBytes } from './assetFileMeta';

export type OlderFileStageProps = {
  version: MediaAssetVersion;
};

export function OlderFileStage({ version }: OlderFileStageProps) {
  const translateUi = useUiTranslations('library');

  const ext = fileExtension(version.fileName);
  return (
    <div className="flex size-full flex-col items-center justify-center gap-4 p-8">
      <div className="relative">
        <FileIcon className="size-16 text-muted-foreground/40" strokeWidth={1.25} />
        {ext && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-2xs font-semibold tracking-wide text-muted-foreground">
            {ext}
          </span>
        )}
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="max-w-md truncate text-sm font-medium">{version.fileName}</p>
        <p className="text-xs text-muted-foreground">
          v{version.versionNumber} · {version.mimeType} · {formatBytes(version.sizeBytes ?? 0)}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {' '}
          {translateUi('source_file_no_preview_download_to__80791377')}{' '}
        </p>
      </div>

      {version.signedUrl ? (
        <a
          href={withForcedDownload(version.signedUrl, version.fileName)}
          download={version.fileName}
          rel="noopener"
          className={buttonVariants({ size: 'sm' })}
        >
          <Download className="size-4" /> {translateUi('download_v_4a1ecd49')}
          {version.versionNumber}
        </a>
      ) : (
        <p className="text-xs text-destructive">
          {translateUi('this_version_has_no_downloadable_fi_19ed9e20')}
        </p>
      )}
    </div>
  );
}
