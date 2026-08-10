'use client';
import { Image as ImageIcon, RotateCw, SquarePen, Trash2, Upload } from 'lucide-react';

import Image from 'next/image';
import React from 'react';
import { type FileError, type FileRejection, useDropzone } from 'react-dropzone';
import { ImageMarkupDialog } from '@/components/ai-studio/markup/ImageMarkupDialog';
import { Dropzone, DropzoneEmptyState } from '@/components/dropzone';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/ToastProvider';
import {
  formatMiB,
  IMAGE_REFERENCE_MAX_BYTES,
  inferMimeTypeFromPath,
  parseReferenceDropPayload,
  resolveReferenceMimeType,
} from '@/lib/ai-studio/referenceDrop';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { applyMarkupToRef, revertRefToOriginal } from '@/lib/ai-studio/referenceEdits';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import type { RefImage, SupportedModel } from '@/lib/types/chatImage';

type ReferenceDockProps = {
  mode: 'image' | 'video';
  model?: SupportedModel;
  maxRefs: number;
  refs: RefImage[];
  firstFrame?: RefImage;
  lastFrame?: RefImage;
  onChangeRefs: (refs: RefImage[]) => void;
  onChangeFirstFrame?: (ref?: RefImage) => void;
  onChangeLastFrame?: (ref?: RefImage) => void;
};

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

export type LocalFile = File & { preview?: string; errors: readonly FileError[] };

export type DZReturn = ReturnType<typeof useDropzone> & {
  files: LocalFile[];
  setFiles: React.Dispatch<React.SetStateAction<LocalFile[]>>;
  successes: string[];
  isSuccess: boolean;
  loading: boolean;
  errors: { name: string; message: string }[];
  setErrors: React.Dispatch<React.SetStateAction<{ name: string; message: string }[]>>;
  onUpload: () => Promise<void>;
  maxFileSize: number;
  maxFiles: number;
  allowedMimeTypes: string[];
};

const useLocalDropzone = (
  opts: { maxFiles: number; allowedMimeTypes: string[]; maxFileSize: number },
  onAcceptUpload: (files: File[]) => Promise<void>,
  onReject?: (rejected: FileRejection[]) => void,
): DZReturn => {
  const [files, setFiles] = React.useState<LocalFile[]>([]);
  const [errors, setErrors] = React.useState<{ name: string; message: string }[]>([]);
  const [successes, setSuccesses] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  const dz = useDropzone({
    noClick: true,
    noDragEventsBubbling: false,
    maxFiles: opts.maxFiles,
    maxSize: opts.maxFileSize,
    multiple: opts.maxFiles !== 1,
    accept: opts.allowedMimeTypes.reduce<Record<string, string[]>>(
      (acc, type) => ({ ...acc, [type]: [] }),
      {},
    ),
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) {
        onReject?.(rejected);
      }

      if (accepted.length === 0) return;

      // This dropzone is used as a file picker + visual affordance; we process immediately.
      void (async () => {
        try {
          setLoading(true);
          setErrors([]);
          await onAcceptUpload(accepted);
          setSuccesses([]);
        } catch (error) {
          setErrors([
            {
              name: accepted[0]?.name ?? 'file',
              message: error instanceof Error ? error.message : 'Failed to process file',
            },
          ]);
        } finally {
          setLoading(false);
          setFiles([]);
        }
      })();
    },
  });

  const onUpload = React.useCallback(async () => {
    setLoading(true);
    setErrors([]);
    await onAcceptUpload(files);
    setSuccesses(files.map((f) => f.name));
    setLoading(false);
    setFiles([]);
  }, [files, onAcceptUpload]);

  const isSuccess = errors.length === 0 && successes.length > 0;

  return {
    ...dz,
    files,
    setFiles,
    successes,
    isSuccess,
    loading,
    errors,
    setErrors,
    onUpload,
    maxFileSize: opts.maxFileSize,
    maxFiles: opts.maxFiles,
    allowedMimeTypes: opts.allowedMimeTypes,
  };
};

export function ReferenceDock({
  mode,
  model,
  maxRefs,
  refs,
  firstFrame,
  lastFrame,
  onChangeRefs,
  onChangeFirstFrame,
  onChangeLastFrame,
}: ReferenceDockProps) {
  const { show } = useToast();
  const [isDragging, setIsDragging] = React.useState(false);

  const supportsRefImages = mode === 'image' || model === 'veo-3-1';
  const supportsFrames = model === 'veo-3-1-fast';

  const [markupState, setMarkupState] = React.useState<{
    target: 'ref' | 'first' | 'last';
    refId?: string;
    sourceBase64: string;
    sourceMime: string;
    title: string;
  } | null>(null);
  const hasCreativeAssetPayload = React.useCallback((types: DataTransfer['types']) => {
    const list = Array.from(types ?? []);
    return list.includes(CREATIVE_ASSET_DRAG_TYPE) || list.includes(RF_DRAG_MIME);
  }, []);

  const resolveDropSlot = React.useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return undefined;
    const slot = target.closest<HTMLElement>('[data-reference-drop-slot]')?.dataset
      .referenceDropSlot;
    return slot === 'first' || slot === 'last' ? slot : undefined;
  }, []);

  const fileToBase64 = React.useCallback(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      }),
    [],
  );

  const enforceMaxAttachmentBytes = React.useCallback(
    (opts: { label: string; sizeBytes: number; maxBytes: number }) => {
      if (opts.sizeBytes <= opts.maxBytes) return true;
      show({
        title: 'Attachment too large',
        description: `${opts.label} is ${formatMiB(opts.sizeBytes)} (max ${formatMiB(opts.maxBytes)}).`,
        variant: 'error',
      });
      return false;
    },
    [show],
  );

  const handleLocalFiles = React.useCallback(
    async (files: FileList | File[] | null, slot?: 'first' | 'last') => {
      if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return;
      const fileArray = Array.isArray(files) ? files : Array.from(files);
      const remaining = Math.max(0, maxRefs - refs.length);
      const maxToProcess = slot ? 1 : remaining;
      if (maxToProcess === 0) {
        show({
          title: 'Reference limit',
          description: `Max ${maxRefs} reference images`,
          variant: 'error',
        });
        return;
      }

      const slice = fileArray.slice(0, maxToProcess);
      const nextRefs: RefImage[] = [];

      for (const file of slice) {
        const mime = file.type || inferMimeTypeFromPath(file.name) || 'application/octet-stream';
        const isImage = mime.startsWith('image/');

        if (!isImage) {
          show({
            title: 'Unsupported',
            description: 'Only image references are supported',
            variant: 'error',
          });
          continue;
        }
        if (
          !enforceMaxAttachmentBytes({
            label:
              slot === 'first' ? 'First frame' : slot === 'last' ? 'Last frame' : 'Reference image',
            sizeBytes: file.size,
            maxBytes: IMAGE_REFERENCE_MAX_BYTES,
          })
        ) {
          if (slot) return;
          continue;
        }

        const base64 = await fileToBase64(file);
        const ref: RefImage = {
          id: `${file.name}-${Date.now()}`,
          name: file.name,
          path: file.name,
          mime,
          base64,
          referenceType: mode === 'video' ? 'asset' : undefined,
        };

        if (slot === 'first') {
          onChangeFirstFrame?.(ref);
          return;
        }
        if (slot === 'last') {
          onChangeLastFrame?.(ref);
          return;
        }
        nextRefs.push(ref);
      }

      if (nextRefs.length > 0) {
        onChangeRefs([...refs, ...nextRefs]);
      }
    },
    [
      enforceMaxAttachmentBytes,
      fileToBase64,
      maxRefs,
      mode,
      onChangeFirstFrame,
      onChangeLastFrame,
      onChangeRefs,
      refs,
      show,
    ],
  );

  const rejectDropzoneFiles = React.useCallback(
    (rejected: FileRejection[]) => {
      const message = rejected
        .flatMap((rej) => rej.errors.map((e) => `${rej.file.name}: ${e.message}`))
        .slice(0, 3)
        .join(' • ');
      show({
        title: 'File rejected',
        description: message || 'Unsupported file',
        variant: 'error',
      });
    },
    [show],
  );

  const handleDrop = React.useCallback(
    async (event: React.DragEvent<HTMLDivElement>, slot?: 'first' | 'last') => {
      event.preventDefault();
      setIsDragging(false);

      const dataTransfer = event.dataTransfer;
      try {
        if (dataTransfer.files && dataTransfer.files.length > 0) {
          await handleLocalFiles(dataTransfer.files, slot);
          // don't return; allow creative payloads in same drop
        }

        const rawPayload =
          dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
          dataTransfer.getData(RF_DRAG_MIME) ||
          dataTransfer.getData(TEXT_MIME);
        if (!rawPayload) {
          if (!dataTransfer.files || dataTransfer.files.length === 0) {
            show({
              title: 'Drop ignored',
              description: 'No asset data detected in drop.',
              variant: 'warning',
            });
          }
          return;
        }

        const parsed = parseReferenceDropPayload(rawPayload);
        if (!parsed) {
          show({
            title: 'Drop failed',
            description: 'Unrecognized drop payload',
            variant: 'error',
          });
          return;
        }

        const resolvedMime = resolveReferenceMimeType(parsed);
        const isImage = /^image\//i.test(resolvedMime);

        if (!isImage) {
          show({
            title: 'Unsupported',
            description: 'Only image references are supported',
            variant: 'error',
          });
          return;
        }

        if (parsed.kind === 'remote' && typeof parsed.sizeBytes === 'number') {
          const maxBytes = IMAGE_REFERENCE_MAX_BYTES;
          const label =
            slot === 'first' ? 'First frame' : slot === 'last' ? 'Last frame' : 'Reference image';
          if (!enforceMaxAttachmentBytes({ label, sizeBytes: parsed.sizeBytes, maxBytes })) {
            return;
          }
        }

        const maxBytes = IMAGE_REFERENCE_MAX_BYTES;
        const label =
          slot === 'first' ? 'First frame' : slot === 'last' ? 'Last frame' : 'Reference image';
        const { base64, sourceName, byteLength } = await resolveDroppedBase64(parsed, maxBytes);
        if (
          typeof byteLength === 'number' &&
          !enforceMaxAttachmentBytes({ label, sizeBytes: byteLength, maxBytes })
        ) {
          return;
        }

        if (refs.length >= maxRefs && !slot) {
          show({
            title: 'Reference limit',
            description: `Max ${maxRefs} reference images`,
            variant: 'error',
          });
          return;
        }

        const ref: RefImage = {
          id: `${sourceName ?? 'ref'}-${Date.now()}`,
          name: sourceName,
          path: parsed.kind === 'remote' ? (parsed.path ?? parsed.publicUrl ?? '') : 'data-url',
          mime: resolvedMime,
          base64,
          referenceType: mode === 'video' ? 'asset' : undefined,
        };

        if (slot === 'first') {
          onChangeFirstFrame?.(ref);
        } else if (slot === 'last') {
          onChangeLastFrame?.(ref);
        } else {
          onChangeRefs([...refs, ref]);
        }
      } catch (error) {
        console.error(error);
        show({
          title: 'Failed to add reference',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'error',
        });
      }
    },
    [
      enforceMaxAttachmentBytes,
      handleLocalFiles,
      refs,
      maxRefs,
      mode,
      onChangeRefs,
      onChangeFirstFrame,
      onChangeLastFrame,
      show,
    ],
  );

  const openMarkup = React.useCallback(
    (opts: { target: 'ref' | 'first' | 'last'; ref?: RefImage }) => {
      if (!opts.ref) return;
      setMarkupState({
        target: opts.target,
        refId: opts.ref.id,
        sourceBase64: opts.ref.base64,
        sourceMime: opts.ref.mime,
        title: `Edit ${opts.ref.name ?? 'reference'}`,
      });
    },
    [],
  );

  const refsDropzone = useLocalDropzone(
    { maxFiles: maxRefs, allowedMimeTypes: ['image/*'], maxFileSize: Number.POSITIVE_INFINITY },
    async (files) => handleLocalFiles(files, undefined),
    rejectDropzoneFiles,
  );
  const firstDropzone = useLocalDropzone(
    { maxFiles: 1, allowedMimeTypes: ['image/*'], maxFileSize: Number.POSITIVE_INFINITY },
    async (files) => handleLocalFiles(files, 'first'),
    rejectDropzoneFiles,
  );
  const lastDropzone = useLocalDropzone(
    { maxFiles: 1, allowedMimeTypes: ['image/*'], maxFileSize: Number.POSITIVE_INFINITY },
    async (files) => handleLocalFiles(files, 'last'),
    rejectDropzoneFiles,
  );

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: creative-asset drag-and-drop dock, not a click surface; the keyboard-accessible path is the upload dropzone within */}
      <div
        className={`flex max-h-[520px] min-h-[220px] flex-col gap-3 overflow-hidden rounded-xl p-4 shadow-xl transition ${isDragging ? 'ring-2 ring-offset-2 ring-offset-[var(--color-panel)] ring-[var(--accent-9)]' : ''}`}
        style={{
          backgroundColor: 'var(--color-surface)',
          border: `1px solid var(--gray-6)`,
        }}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types ?? []);
          if (!types.includes('Files') && !hasCreativeAssetPayload(e.dataTransfer.types)) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDropCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const slot = resolveDropSlot(e.target);
          void handleDrop(e, slot);
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon />
            <span className="font-medium">References</span>
          </div>
          <Pill variant="muted">{refs.length}</Pill>
        </div>

        {supportsRefImages ? (
          <div>
            <Dropzone
              {...refsDropzone}
              className="mb-3 w-full rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-white max-h-56 overflow-hidden"
            >
              <ScrollArea className="mb-3 max-h-44 pr-2">
                <div className="flex flex-wrap gap-2">
                  {refs.map((ref) => (
                    <RefChip
                      key={ref.id}
                      refImage={ref}
                      allowReferenceType={mode === 'video'}
                      onTypeChange={(type) =>
                        onChangeRefs(
                          refs.map((r) => (r.id === ref.id ? { ...r, referenceType: type } : r)),
                        )
                      }
                      onEdit={() => openMarkup({ target: 'ref', ref })}
                      onRevert={
                        ref.originalBase64
                          ? () =>
                              onChangeRefs(
                                refs.map((r) => (r.id === ref.id ? revertRefToOriginal(r) : r)),
                              )
                          : undefined
                      }
                      onRemove={() => onChangeRefs(refs.filter((r) => r.id !== ref.id))}
                    />
                  ))}
                  {refs.length === 0 ? (
                    <span className="text-xs text-gray-400">Drop or upload images.</span>
                  ) : null}
                </div>
              </ScrollArea>
              <DropzoneEmptyState />
            </Dropzone>
          </div>
        ) : null}

        {mode === 'video' ? (
          <div className="grid grid-cols-2 gap-3">
            {supportsFrames ? (
              <>
                <FrameTile
                  label="First frame"
                  refImage={firstFrame}
                  dropzoneProps={firstDropzone}
                  onClear={() => onChangeFirstFrame?.()}
                  onRevert={
                    firstFrame?.originalBase64
                      ? () => onChangeFirstFrame?.(revertRefToOriginal(firstFrame))
                      : undefined
                  }
                  onEdit={() => openMarkup({ target: 'first', ref: firstFrame })}
                  dropSlot="first"
                />
                <FrameTile
                  label="Last frame"
                  refImage={lastFrame}
                  dropzoneProps={lastDropzone}
                  onClear={() => onChangeLastFrame?.()}
                  onRevert={
                    lastFrame?.originalBase64
                      ? () => onChangeLastFrame?.(revertRefToOriginal(lastFrame))
                      : undefined
                  }
                  onEdit={() => openMarkup({ target: 'last', ref: lastFrame })}
                  dropSlot="last"
                />
              </>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <Upload />
          <span className="text-xs text-gray-400">
            Drag from Creative Library to seed your generation.
          </span>
        </div>
      </div>

      {markupState ? (
        <ImageMarkupDialog
          open={Boolean(markupState)}
          sourceBase64={markupState.sourceBase64}
          sourceMime={markupState.sourceMime}
          title={markupState.title}
          maxBytes={IMAGE_REFERENCE_MAX_BYTES}
          onClose={() => setMarkupState(null)}
          onSave={(result) => {
            if (markupState.target === 'ref' && markupState.refId) {
              onChangeRefs(
                refs.map((r) => (r.id === markupState.refId ? applyMarkupToRef(r, result) : r)),
              );
              show({
                title: 'Markup saved',
                description: 'Reference updated.',
                variant: 'success',
              });
            }
            if (markupState.target === 'first' && firstFrame) {
              onChangeFirstFrame?.(applyMarkupToRef(firstFrame, result));
              show({
                title: 'Markup saved',
                description: 'First frame updated.',
                variant: 'success',
              });
            }
            if (markupState.target === 'last' && lastFrame) {
              onChangeLastFrame?.(applyMarkupToRef(lastFrame, result));
              show({
                title: 'Markup saved',
                description: 'Last frame updated.',
                variant: 'success',
              });
            }
            setMarkupState(null);
          }}
        />
      ) : null}
    </>
  );
}

function RefChip({
  refImage,
  onRemove,
  onEdit,
  onRevert,
  allowReferenceType,
  onTypeChange,
}: {
  refImage: RefImage;
  onRemove: () => void;
  onEdit?: () => void;
  onRevert?: () => void;
  allowReferenceType?: boolean;
  onTypeChange?: (type: 'asset' | 'style') => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-1 backdrop-blur max-w-full">
      <Image
        src={`data:${refImage.mime};base64,${refImage.base64}`}
        alt={refImage.name ?? refImage.id}
        width={48}
        height={48}
        unoptimized
        className="h-10 w-10 sm:h-12 sm:w-12 rounded-md object-cover"
      />
      <span className="text-xs truncate max-w-[140px] sm:max-w-[180px]">
        {refImage.name ?? 'ref'}
      </span>
      {refImage.originalBase64 ? <Pill variant="warning">edited</Pill> : null}
      {allowReferenceType ? (
        <select
          className="rounded border border-white/15 bg-slate-900/80 text-xs"
          value={refImage.referenceType ?? 'asset'}
          onChange={(e) => onTypeChange?.(e.target.value as 'asset' | 'style')}
        >
          <option value="asset">asset</option>
          <option value="style">style</option>
        </select>
      ) : null}
      {onRevert ? (
        <Button size="icon-sm" variant="ghost" onClick={onRevert}>
          <RotateCw />
        </Button>
      ) : null}
      {onEdit ? (
        <Button size="icon-sm" variant="ghost" onClick={onEdit}>
          <SquarePen />
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function FrameTile({
  label,
  refImage,
  onClear,
  onEdit,
  onRevert,
  dropzoneProps,
  dropSlot,
}: {
  label: string;
  refImage?: RefImage;
  onClear: () => void;
  onEdit?: () => void;
  onRevert?: () => void;
  dropzoneProps: ReturnType<typeof useDropzone> & {
    files: LocalFile[];
    setFiles: React.Dispatch<React.SetStateAction<LocalFile[]>>;
    successes: string[];
    isSuccess: boolean;
    loading: boolean;
    errors: { name: string; message: string }[];
    setErrors: React.Dispatch<React.SetStateAction<{ name: string; message: string }[]>>;
    onUpload: () => Promise<void>;
    maxFileSize: number;
    maxFiles: number;
    allowedMimeTypes: string[];
  };
  dropSlot: 'first' | 'last';
}) {
  return (
    <div
      data-reference-drop-slot={dropSlot}
      className="flex min-h-[128px] flex-col justify-between rounded-lg border border-dashed border-white/20 bg-white/5 p-2 backdrop-blur transition hover:border-white/40"
    >
      <span className="text-sm font-medium">{label}</span>
      {refImage ? (
        <div className="relative h-full min-h-[140px]">
          <Image
            src={`data:${refImage.mime};base64,${refImage.base64}`}
            alt={label}
            fill
            unoptimized
            sizes="(max-width: 640px) 80vw, 200px"
            className="rounded-md object-contain"
          />
          {refImage.originalBase64 ? (
            <Pill variant="warning" className="absolute left-1 top-1">
              edited
            </Pill>
          ) : null}
          <div className="absolute right-1 top-1 flex items-center gap-1">
            {onRevert ? (
              <Button size="icon-sm" variant="outline" onClick={onRevert}>
                <RotateCw />
              </Button>
            ) : null}
            {onEdit ? (
              <Button size="icon-sm" variant="outline" onClick={onEdit}>
                <SquarePen />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="border-destructive text-destructive hover:text-destructive"
              onClick={onClear}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : (
        <Dropzone
          {...dropzoneProps}
          className="h-full w-full rounded-md border border-dashed border-white/15 bg-white/5 text-white min-h-[140px]"
        >
          <DropzoneEmptyState />
        </Dropzone>
      )}
    </div>
  );
}
