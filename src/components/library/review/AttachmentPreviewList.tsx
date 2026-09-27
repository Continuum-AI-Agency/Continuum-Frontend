// A comment's attachments, previewed in place: an image as a thumbnail, a video
// and an audio clip in their native players, a PDF in the browser's own viewer,
// anything else as a named file link. Presentational and hook-free, so the
// Library sidebar and the server-rendered share page render the same thing.

import { FileText } from 'lucide-react';

export type AttachmentPreviewItem = {
  assetId: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  name: string;
  mimeType: string | null;
  url: string | null;
  thumbnailUrl: string | null;
};

function Preview({ preview }: { preview: AttachmentPreviewItem }) {
  if (preview.kind === 'image' && preview.url) {
    return (
      <a href={preview.url} target="_blank" rel="noreferrer" title={preview.name}>
        {/* biome-ignore lint/performance/noImgElement: signed storage URL preview */}
        <img src={preview.url} alt={preview.name} className="h-16 w-28 object-cover" />
      </a>
    );
  }
  if (preview.kind === 'video' && preview.url) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: reviewer-attached reference clip
      <video
        src={preview.url}
        poster={preview.thumbnailUrl ?? undefined}
        controls
        preload="metadata"
        className="h-16 w-28 bg-black object-contain"
      />
    );
  }
  if ((preview.kind === 'audio' || preview.mimeType?.startsWith('audio/')) && preview.url) {
    return (
      <div className="flex w-56 flex-col gap-1 p-1.5">
        <span className="truncate text-2xs text-muted-foreground">{preview.name}</span>
        {/* biome-ignore lint/a11y/useMediaCaption: reviewer-attached reference audio */}
        <audio src={preview.url} controls preload="metadata" className="h-8 w-full" />
      </div>
    );
  }
  if (preview.mimeType === 'application/pdf' && preview.url) {
    return (
      <a
        href={preview.url}
        target="_blank"
        rel="noreferrer"
        title={`Open ${preview.name}`}
        className="relative block h-40 w-56 bg-background"
      >
        {/* The browser's own PDF viewer renders the first page in place; the
            overlay link opens the full document. */}
        <iframe
          src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`}
          title={preview.name}
          className="pointer-events-none size-full"
        />
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/90 px-1.5 py-0.5 text-2xs text-muted-foreground">
          {preview.name}
        </span>
      </a>
    );
  }
  return (
    <a
      href={preview.url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className="flex h-16 w-28 flex-col items-center justify-center gap-1 px-1 text-2xs text-muted-foreground hover:text-foreground"
    >
      <FileText className="size-4" />
      <span className="w-full truncate text-center">{preview.name}</span>
    </a>
  );
}

export function AttachmentPreviewList({ previews }: { previews: AttachmentPreviewItem[] }) {
  if (previews.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Attachments">
      {previews.map((preview) => (
        <li
          key={preview.assetId}
          data-testid="comment-attachment"
          data-kind={preview.kind}
          data-mime={preview.mimeType ?? ''}
          className="overflow-hidden rounded-md border border-border bg-muted/40"
        >
          <Preview preview={preview} />
        </li>
      ))}
    </ul>
  );
}
