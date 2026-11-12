'use client';

import {
  FORGE_PROJECT_FILE_MAX_MB,
  LIBRARY_PRESENTATION_MAX_BYTES,
  type TemplateSourceSummary,
} from '@continuum/contracts';
import { FileUp, FolderUp } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { NewPresentationButton } from '@/components/forge/presentations/NewPresentationButton';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import {
  type FolderFile,
  folderFilesFromDrop,
  folderFilesFromInput,
} from '@/lib/library/folderUpload';
import { cn } from '@/lib/utils';

export const FORGE_PROJECT_ACCEPT =
  '.aep,.aepx,.aet,.zip,.html,.htm,.psd,.ai,.blend,.pptx,.potx,.ttf,.otf';

/** Layered Photoshop and Illustrator files the Forge turns into a template: every layer comes in,
 * text stays live. */
export const FORGE_DESIGN_EXTENSIONS = ['.psd', '.ai'];

export const isForgeDesignFile = (name: string) =>
  FORGE_DESIGN_EXTENSIONS.includes(name.slice(name.lastIndexOf('.')).toLowerCase());

/** The Library upload records no checksum above this size, so a bigger file has nothing to match. */
const HASHED_UP_TO_BYTES = 64 * 1024 * 1024;

/** sha256 hex of a dropped file, the same digest the upload stores as the source's checksum. */
export async function fileSha256(file: Blob): Promise<string | null> {
  if (file.size > HASHED_UP_TO_BYTES) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  }
}

export type DroppedFileMatch =
  | { kind: 'same'; source: TemplateSourceSummary }
  | { kind: 'named'; source: TemplateSourceSummary }
  | { kind: 'new' };

/**
 * A dropped file against the templates already here: the same bytes (open that one, upload
 * nothing), the same file name (a new revision, or a new template — the person says which), or new.
 * A source that recorded no checksum never matches on bytes.
 */
export function matchDroppedFile(
  fileName: string,
  checksum: string | null,
  sources: readonly TemplateSourceSummary[],
): DroppedFileMatch {
  const same = checksum
    ? sources.find((source) => source.sourceChecksum?.toLowerCase() === checksum.toLowerCase())
    : undefined;
  if (same) return { kind: 'same', source: same };
  const named = sources.find((source) => source.parse?.filename === fileName);
  return named ? { kind: 'named', source: named } : { kind: 'new' };
}

/**
 * Storage's size refusal as a sentence naming the limit. The TUS endpoint answers 413 before a byte
 * moves, which the resumable client reports only as a status; a direct upload carries the text.
 */
export function uploadRefusal(
  file: { name: string; sizeBytes: number },
  error: string | undefined,
): string | null {
  if (!error || !/exceeded the maximum allowed size|failed \(413\)/i.test(error)) return null;
  const megabytes = Math.max(1, Math.round(file.sizeBytes / (1024 * 1024)));
  const limitMb = /\.(pptx|potx)$/i.test(file.name)
    ? LIBRARY_PRESENTATION_MAX_BYTES / (1024 * 1024)
    : FORGE_PROJECT_FILE_MAX_MB;
  return `${file.name} is ${megabytes} MB, over the ${limitMb} MB upload limit, so it was not uploaded. Ask an admin to raise the limit.`;
}

/**
 * Packages to upload, fonts to store first, and the rest refused. Fonts are welcome beside a
 * package because clients often send the typefaces next to the zip rather than inside it.
 */
export function partitionForgeProjectFiles(files: File[]): {
  accepted: File[];
  fonts: File[];
  rejected: File[];
} {
  return files.reduce<{ accepted: File[]; fonts: File[]; rejected: File[] }>(
    (result, file) => {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      // A .blend uploads like an .aep: the Library registers it and the forge parses it.
      if (
        [
          '.aep',
          '.aepx',
          '.aet',
          '.zip',
          '.html',
          '.htm',
          '.blend',
          '.pptx',
          '.potx',
          ...FORGE_DESIGN_EXTENSIONS,
        ].includes(extension)
      )
        result.accepted.push(file);
      else if (['.ttf', '.otf'].includes(extension)) result.fonts.push(file);
      else result.rejected.push(file);
      return result;
    },
    { accepted: [], fonts: [], rejected: [] },
  );
}

export function ForgeProjectDrop({
  compact = false,
  onFiles,
  onFonts,
  onRejected,
  brandId,
  onPresentationCreated,
}: {
  compact?: boolean;
  onFiles: (files: File[]) => void;
  onFonts: (files: File[]) => Promise<void>;
  onRejected: (files: File[]) => void;
  brandId?: string;
  onPresentationCreated?: (assetId: string) => Promise<void>;
}) {
  const translateUi = useUiTranslations('forge');

  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [packing, setPacking] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const choose = () => input.current?.click();
  const receive = async (files: File[]) => {
    try {
      const { expandDesignArchives } = await import('./designArchive');
      files = await expandDesignArchives(files);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('could_not_open_the_zip_4b43b056'),
      );
      return;
    }
    const { accepted, fonts, rejected } = partitionForgeProjectFiles(files);
    if (rejected.length) onRejected(rejected);
    // Fonts before the package: it is parsed seconds after it lands, and that parse is what
    // looks for them.
    if (fonts.length) await onFonts(fonts);
    if (accepted.length) onFiles(accepted);
  };
  const receiveFolder = async (entries: FolderFile[]) => {
    if (!entries.length) return;
    setPacking(true);
    try {
      const { packageProjectFolder } = await import('./projectFolder');
      await receive([await packageProjectFolder(entries)]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_prepare_the_folder_dac2d6de'),
      );
    } finally {
      setPacking(false);
    }
  };

  return (
    <div className={cn('flex h-full gap-2', compact ? 'flex-row' : 'flex-col')}>
      <input
        ref={input}
        type="file"
        multiple
        accept={FORGE_PROJECT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label={translateUi('project_files_2a3d9a24')}
        onChange={(event) => {
          void receive(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        {...{ webkitdirectory: '' }}
        className="sr-only"
        tabIndex={-1}
        aria-label={translateUi('project_folder_59923a31')}
        disabled={packing}
        onChange={(event) => {
          void receiveFolder(
            folderFilesFromInput(event.target.files ?? [], Number.POSITIVE_INFINITY),
          );
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={cn(
          'min-h-40 w-full flex-1 flex-col items-center justify-center gap-2 whitespace-normal rounded-xl border-dashed px-[var(--card-pad)] py-6 text-center',
          compact && 'min-h-0 flex-row justify-start py-3 text-left [&>span:last-child]:max-w-none',
          dragDepth > 0 && 'border-primary bg-primary/5',
        )}
        onClick={choose}
        disabled={packing}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragDepth((depth) => Math.max(0, depth - 1));
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault();
          setDragDepth(0);
          if (packing) return;
          // Snapshot before walking: the browser releases the drag data after this event.
          const files = Array.from(event.dataTransfer.files);
          try {
            const entries = await folderFilesFromDrop(
              event.dataTransfer.items,
              Number.POSITIVE_INFINITY,
            );
            if (entries) await receiveFolder(entries);
            else await receive(files);
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : translateUi('could_not_read_the_dropped_folder_d467d8ff'),
            );
          }
        }}
      >
        <span className="flex items-center gap-2 text-sm">
          <FileUp aria-hidden />
          {packing
            ? translateUi('preparing_folder_10c8d169')
            : translateUi('new_template_30d87ec4')}
        </span>
        <span className="max-w-60 text-xs font-normal text-muted-foreground">
          {' '}
          {translateUi('drop_a_powerpoint_deck_or_template__648ed68e')}{' '}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={packing}
        onClick={() => folderInput.current?.click()}
      >
        <FolderUp aria-hidden /> {translateUi('upload_folder_e35182e6')}{' '}
      </Button>
      {brandId && onPresentationCreated ? (
        <NewPresentationButton brandId={brandId} onCreated={onPresentationCreated} />
      ) : null}
      {compact ? null : (
        <>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
              {' '}
              {translateUi('how_to_prepare_an_after_effects_tem_4adcd62d')}{' '}
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li> {translateUi('use_file_dependencies_collect_files_01e52695')} </li>
              <li> {translateUi('upload_the_collected_folder_or_zip__bbd17f30')} </li>
              <li> {translateUi('use_native_ae_text_for_editable_cop_e6aa7844')} </li>
            </ol>
          </details>
          <p className="text-xs text-muted-foreground">
            {' '}
            {translateUi('powerpoint_decks_and_templates_up_t_7ca26b0d')}{' '}
            {LIBRARY_PRESENTATION_MAX_BYTES / (1024 * 1024)}{' '}
            {translateUi('mb_other_projects_up_to_eea784da')} {FORGE_PROJECT_FILE_MAX_MB}{' '}
            {translateUi('mb_you_can_add_font_files_separatel_9deaa09a')}{' '}
          </p>
        </>
      )}
    </div>
  );
}
