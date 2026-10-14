'use client';

import type { BlendOutput, ScenePreview } from '@continuum/contracts';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  FormatPreview,
  type PreviewFormat,
  previewFormats,
} from '@/components/forge/FormatPreview';
import { sceneProblem } from '@/lib/library/sceneTemplates';

// The draft of the picked output, at that output's own shape. The output chips ARE the output
// picker. The previous draft stays up while the next is drawn — a blank well between every edit
// would hide exactly the change a person is judging.

/**
 * A draft only LOWERS the samples the file stores. A file that stores none renders at Cycles' own
 * default, so its drafts are as slow as a final render.
 */
export const SAMPLES_HINT = 'Set render samples in Blender to make previews fast';

/** Each output as a Forge format: its camera stands in for the comp, so twins read by name. */
export function sceneFormats(outputs: readonly BlendOutput[]): PreviewFormat[] {
  return previewFormats({
    outputs: outputs.map((output) => ({
      id: output.id,
      label: output.label,
      ratio: output.ratio,
      mediaType: output.mediaType,
      comp: { name: output.camera, width: output.width, height: output.height },
    })),
  });
}

export function ScenePreviewStage({
  outputs,
  outputId,
  onOutputChange,
  preview,
  wellClassName = 'h-[min(70vh,48rem)]',
}: {
  outputs: readonly BlendOutput[];
  outputId: string | null;
  onOutputChange: (outputId: string) => void;
  preview: {
    data: ScenePreview | undefined;
    error: unknown;
    updating: boolean;
    refetch: () => unknown;
  };
  wellClassName?: string;
}) {
  const formats = useMemo(() => sceneFormats(outputs), [outputs]);
  if (!formats.length || !outputId) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        This file has no camera that renders: add a camera to a scene in Blender.
      </p>
    );
  }
  const output = outputs.find((candidate) => candidate.id === outputId);
  const draft = preview.data;
  const problem = preview.error ? sceneProblem(preview.error).message : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
      <FormatPreview
        label="Scene preview"
        formats={formats}
        value={outputId}
        onValueChange={onOutputChange}
        wellClassName={wellClassName}
        warning={(format) =>
          outputs.find((candidate) => candidate.id === format.id)?.samples === null
            ? SAMPLES_HINT
            : null
        }
        frame={() =>
          draft
            ? {
                mode: 'preview',
                at: null,
                basedOn: null,
                pending: preview.updating,
                badge: preview.updating
                  ? 'Draft · updating…'
                  : `Draft · ${draft.width}×${draft.height}${draft.cached ? ' · cached' : ''}`,
                caption:
                  output?.mediaType === 'video'
                    ? `Preview of frame ${draft.frame}`
                    : `Draft of ${output?.label ?? outputId}; Render final draws it at full quality.`,
                node: (
                  // biome-ignore lint/performance/noImgElement: a short-lived signed PNG the image optimizer cannot cache
                  <img
                    src={draft.url}
                    alt={`Draft preview of ${output?.label ?? outputId}`}
                    className="size-full object-contain"
                    data-cached={draft.cached || undefined}
                  />
                ),
              }
            : {
                mode: 'none',
                message: problem ?? (preview.updating ? 'Drawing a draft…' : 'No draft yet'),
              }
        }
      />
      {problem ? (
        <p role="alert" className="m-0 flex items-center gap-2 text-xs text-destructive">
          {draft ? problem : null}
          <Button type="button" size="xs" variant="outline" onClick={() => void preview.refetch()}>
            Try the draft again
          </Button>
        </p>
      ) : null}
    </div>
  );
}
