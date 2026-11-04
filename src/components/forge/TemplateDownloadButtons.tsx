'use client';

import type { TemplateAuthoringArtifact } from '@continuum/contracts';
import { Download, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { downloadLibraryAsset } from '@/lib/library/assetDownload';
import { fetchTemplateAuthoringArtifactPackage } from '@/lib/library/templateSources';

export type TemplateOriginalFile = { assetId: string; versionId?: string; fileName: string };

/** "<template> (edited r<N>).<ext>": says what it is, which draft revision, and keeps the format. */
export function editedTemplateFileName(templateName: string, revision: number, packageFilename: string) {
  const dot = packageFilename.lastIndexOf('.');
  const extension = dot > 0 ? packageFilename.slice(dot) : '';
  const stem = templateName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'template';
  return `${stem} (edited r${revision})${extension}`;
}

/**
 * The two files a person may want out of the editor. Both are reads: the original is the stored
 * upload, and the edited file is the private package compiled for exactly this draft revision —
 * never an older one, so a stale package is never handed out as the current edit.
 */
export function TemplateDownloadButtons({
  brandId,
  templateName,
  original,
  edited,
  hasEdits,
  paused = false,
}: {
  brandId: string;
  templateName: string;
  original: TemplateOriginalFile | null;
  edited: TemplateAuthoringArtifact | null;
  hasEdits: boolean;
  /** Preparation stopped and needs the person (see the editor's next step). */
  paused?: boolean;
}) {
  const hintId = useId();
  const [busy, setBusy] = useState<'original' | 'edited' | null>(null);
  const failed = (reason: unknown, fallback: string) =>
    toast.error(reason instanceof Error ? reason.message : fallback);

  const downloadOriginal = async () => {
    if (!original) return;
    setBusy('original');
    try {
      await downloadLibraryAsset({ brandId, ...original });
    } catch (reason) {
      failed(reason, 'Could not download the original file.');
    } finally {
      setBusy(null);
    }
  };
  const downloadEdited = async () => {
    if (!edited) return;
    setBusy('edited');
    try {
      const blob = await fetchTemplateAuthoringArtifactPackage(edited.scope.assetId, edited, edited.scope);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = editedTemplateFileName(templateName, edited.draftRevision, edited.filename);
      anchor.rel = 'noopener';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      failed(reason, 'Could not download the edited file.');
    } finally {
      setBusy(null);
    }
  };

  const hint = edited
    ? null
    : !hasEdits
      ? 'Make an edit to download it'
      : paused
        ? 'Preparing edited file is paused: see the next step below'
        : 'Preparing edited file…';
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={!original || busy !== null}
        title={original?.fileName}
        onClick={() => void downloadOriginal()}
      >
        {busy === 'original' ? (
          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Download data-icon="inline-start" aria-hidden />
        )}
        Download original
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!edited || busy !== null}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => void downloadEdited()}
      >
        {busy === 'edited' ? (
          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Download data-icon="inline-start" aria-hidden />
        )}
        Download edited
      </Button>
      {hint ? (
        <span id={hintId} className="whitespace-nowrap text-2xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
