'use client';

import {
  FIGMA_IMPORT_MAX_FRAMES,
  type FigmaFile,
  type FigmaFolder,
  type FigmaFrame,
  type FigmaImportedAsset,
  parseFigmaLink,
} from '@continuum/contracts';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { FigmaIcon } from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import {
  beginFigmaConnection,
  FigmaApiError,
  figmaErrorMessage,
  importFigmaFrames,
  listFigmaFiles,
  listFigmaFolders,
  listFigmaFrames,
} from '@/lib/library/figma';

type BusyState = 'folders' | 'files' | 'frames' | 'import' | 'connect' | null;

/** `figmaErrorMessage`'s refusals in the UI language; `reconnect` stays its decision. */
export function useFigmaErrorText() {
  const translateUi = useUiTranslations('library');
  return useCallback(
    (error: unknown): { message: string; reconnect: boolean } => {
      const { reconnect } = figmaErrorMessage(error);
      const code =
        error instanceof FigmaApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'operation_failed';
      const message = (() => {
        switch (code) {
          case 'invalid_link':
            return translateUi('paste_a_link_to_a_figma_design_file_or_frame_e0cb89f');
          case 'invalid_configuration':
            return translateUi('figma_is_not_configured_for_this_en_10c07e99');
          case 'figma_not_connected':
            return translateUi('connect_figma_then_try_again_f8c5792');
          case 'provider_unavailable':
            return translateUi('figma_didn_t_answer_try_again_in_a_moment_8fd149d');
          case 'figma_file_forbidden':
            return translateUi('the_connected_figma_account_can_t_open_this_f_19e99be');
          case 'figma_not_found':
            return translateUi('figma_couldn_t_find_that_file_or_frame_check__3f87949');
          case 'figma_node_not_a_frame':
            return translateUi('that_link_points_at_a_page_or_a_layer_not_a_f_03c6260');
          case 'figma_paste_missing':
          case 'figma_paste_unreadable':
          case 'figma_paste_unsupported':
            return translateUi('figma_s_copy_could_not_be_read_copy_the_frame_466191a');
          case 'figma_paste_empty':
            return translateUi('that_figma_copy_holds_no_layers_copy_a_frame__8fce72a');
          case 'figma_paste_too_large':
            return translateUi('that_figma_selection_is_too_big_to_paste_copy_31a4e9f');
          case 'figma_fonts_missing': {
            const fonts = error instanceof FigmaApiError ? error.missingFonts.join(', ') : '';
            return fonts
              ? translateUi('add_fonts_to_the_brand_first_drop_the_ttf_or__f8b9550', { fonts })
              : translateUi('add_the_missing_fonts_to_the_brand_first_drop_cb551ff');
          }
          case 'rate_limited':
            return error instanceof FigmaApiError && error.retryAfterSec
              ? translateUi('figma_s_api_limit_for_this_account_is_used_up_d15e26e', {
                  minutes: Math.ceil(error.retryAfterSec / 60),
                })
              : translateUi('figma_s_api_limit_for_this_account_is_used_up_d4b4bea');
          case 'http_502':
          case 'http_504':
            return translateUi('the_import_is_still_running_import_again_in_a_11aa35d');
          default:
            return translateUi('the_import_failed_code_fd31eb7', { code });
        }
      })();
      return { message, reconnect };
    },
    [translateUi],
  );
}

export function FigmaImportDialog({
  brandId,
  onImported,
  label,
  size = 'sm',
}: {
  brandId: string;
  onImported: (assets: FigmaImportedAsset[]) => void;
  label?: string;
  size?: 'sm' | 'default';
}) {
  const translateUi = useUiTranslations('library');
  const figmaErrorText = useFigmaErrorText();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [teamId, setTeamId] = useState('');
  // Every folder seen so far; choosing one adds its subfolders, so nesting needs no extra UI.
  const [folders, setFolders] = useState<FigmaFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [files, setFiles] = useState<FigmaFile[]>([]);
  const [fileKey, setFileKey] = useState('');
  const [frames, setFrames] = useState<FigmaFrame[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<unknown>(null);
  const failure = error ? figmaErrorText(error) : null;

  const folderLabel = (folder: FigmaFolder): string => {
    const parent = folders.find((candidate) => candidate.id === folder.parentFolderId);
    return parent ? `${folderLabel(parent)} / ${folder.name}` : folder.name;
  };

  async function loadFolders() {
    if (!teamId.trim() || busy !== null) return;
    setBusy('folders');
    setError(null);
    try {
      setFolders(await listFigmaFolders(brandId, { teamId: teamId.trim() }));
      setFolderId('');
      setFiles([]);
      setFrames([]);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(null);
    }
  }

  async function chooseFolder(value: string) {
    setFolderId(value);
    setFileKey('');
    setFrames([]);
    setSelected([]);
    setBusy('files');
    setError(null);
    try {
      const [children, found] = await Promise.all([
        listFigmaFolders(brandId, { folderId: value }),
        listFigmaFiles(brandId, value),
      ]);
      setFolders((known) => [
        ...known,
        ...children.filter((child) => !known.some((folder) => folder.id === child.id)),
      ]);
      setFiles(found);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile(value: string, keep: string[] = []) {
    setFileKey(value);
    setFrames([]);
    setSelected([]);
    setBusy('frames');
    setError(null);
    try {
      const listed = (await listFigmaFrames(brandId, value)).frames;
      setFrames(listed);
      // Only what can be seen can be unchecked: a linked page or layer is not kept.
      setSelected(keep.filter((id) => listed.some((frame) => frame.id === id)));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(null);
    }
  }

  // A link to a frame imports that frame with no listing: every Figma read counts against the
  // account's monthly limit. A link to a file lists its frames.
  async function openLink() {
    if (busy !== null) return;
    const parsed = parseFigmaLink(link);
    if (!parsed) {
      setError(new FigmaApiError('invalid_link'));
      return;
    }
    setError(null);
    if (parsed.nodeId) {
      setFileKey(parsed.fileKey);
      setFrames([]);
      setSelected([parsed.nodeId]);
      return;
    }
    await chooseFile(parsed.fileKey);
  }

  async function connect() {
    setBusy('connect');
    try {
      const callbackUrl = `${window.location.origin}/integrations/callback?provider=figma`;
      const url = await beginFigmaConnection({ brandId, callbackUrl });
      window.open(url, 'continuum-figma-oauth', 'popup,width=720,height=760');
    } catch (cause) {
      toast.error(figmaErrorText(cause).message);
    } finally {
      setBusy(null);
    }
  }

  async function importSelected() {
    if (!fileKey || !selected.length) return;
    setBusy('import');
    setError(null);
    try {
      const assets = await importFigmaFrames({ brandId, fileKey, nodeIds: selected });
      const created = assets.filter((asset) => asset.status !== 'exists').length;
      const unchanged = assets.length - created;
      toast.success(
        unchanged
          ? translateUi('created_plural_one_figma_frame_imported_uncha_a283339', {
              created,
              unchanged,
            })
          : translateUi('created_plural_one_figma_frame_imported_the_f_a6a8160', { created }),
      );
      onImported(assets);
      setOpen(false);
    } catch (cause) {
      setError(cause);
      // A link copied from a page (or a layer) names no frame: show the file's frames to pick.
      if (
        cause instanceof FigmaApiError &&
        cause.code === 'figma_node_not_a_frame' &&
        !frames.length
      ) {
        setBusy(null);
        await chooseFile(fileKey);
        setError(cause);
      }
    } finally {
      setBusy(null);
    }
  }

  const linkedOnly = Boolean(fileKey && !frames.length && selected.length && busy === null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size={size}>
            <FigmaIcon className="size-4" />
            <span className="hidden sm:inline">{label ?? translateUi('figma_ce460410')}</span>
          </Button>
        }
      />
      <DialogContent className="flex max-h-[82dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{translateUi('import_from_figma_2e559556')}</DialogTitle>
          <DialogDescription>
            {translateUi('each_frame_becomes_a_design_template_its_text_bc14614')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <Input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder={translateUi('paste_a_figma_link_share_copy_link_105a652')}
              aria-label={translateUi('figma_link_566f802')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void openLink();
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!link.trim() || busy !== null}
              onClick={() => void openLink()}
            >
              {translateUi('open_ed077f3')}
            </Button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {translateUi('browse_a_team_instead_e7fd9d1')}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  placeholder={translateUi('figma_team_id_the_number_after_team_in_a_team_edef905')}
                  aria-label={translateUi('figma_team_id_2932da7a')}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void loadFolders();
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!teamId.trim() || busy !== null}
                  onClick={() => void loadFolders()}
                >
                  {busy === 'folders' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {translateUi('browse_3227aa96')}
                </Button>
              </div>
              {folders.length ? (
                <Select
                  value={folderId}
                  disabled={busy !== null}
                  onValueChange={(value) => void chooseFolder(value)}
                >
                  <SelectTrigger aria-label={translateUi('figma_folder_2d32f51c')}>
                    <SelectValue placeholder={translateUi('choose_a_folder_5c71b8cd')} />
                  </SelectTrigger>
                  <SelectContent>
                    {folders
                      .map((folder) => ({ id: folder.id, label: folderLabel(folder) }))
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          {folder.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : null}
              {files.length ? (
                <Select
                  value={fileKey}
                  disabled={busy !== null}
                  onValueChange={(value) => void chooseFile(value)}
                >
                  <SelectTrigger aria-label={translateUi('figma_file_cbda49d3')}>
                    <SelectValue placeholder={translateUi('choose_a_file_3e10c3cd')} />
                  </SelectTrigger>
                  <SelectContent>
                    {files.map((file) => (
                      <SelectItem key={file.key} value={file.key}>
                        {file.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </details>

          {failure ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm"
            >
              <span>{failure.message}</span>
              {failure.reconnect ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void connect()}
                >
                  {busy === 'connect' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <FigmaIcon className="size-4" />
                  )}
                  {translateUi('connect_1a2303ed')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {busy === 'files' || busy === 'frames' ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />{' '}
              {translateUi('loading_from_figma_f34d9916')}
            </div>
          ) : linkedOnly ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-primary/5 px-3 py-2 text-sm">
              <span>{translateUi('the_linked_frame_is_ready_to_import_9ac90aa')}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void chooseFile(fileKey, selected)}
              >
                {translateUi('show_all_frames_in_this_file_22dce7e')}
              </Button>
            </div>
          ) : frames.length ? (
            <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-medium text-muted-foreground">
                {translateUi('frames_2c447e8d')}
              </legend>
              {frames.map((frame) => {
                const checked = selected.includes(frame.id);
                return (
                  <label
                    key={frame.id}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={!checked && selected.length >= FIGMA_IMPORT_MAX_FRAMES}
                      onChange={() =>
                        setSelected((current) =>
                          checked
                            ? current.filter((id) => id !== frame.id)
                            : current.length < FIGMA_IMPORT_MAX_FRAMES
                              ? [...current, frame.id]
                              : current,
                        )
                      }
                    />
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}
                    >
                      {checked ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{frame.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {frame.pageName}
                        {frame.width && frame.height
                          ? ` · ${Math.round(frame.width)}×${Math.round(frame.height)}`
                          : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : fileKey && busy === null && !failure ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {translateUi('no_frames_found_in_this_file_82a02d4')}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.length
              ? translateUi('value0_selected_975acbfe', { count: selected.length })
              : translateUi('select_up_to_max_frames_284c387', { max: FIGMA_IMPORT_MAX_FRAMES })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {translateUi('cancel_19766ed6')}
            </Button>
            <Button
              type="button"
              disabled={!selected.length || busy !== null}
              onClick={() => void importSelected()}
            >
              {busy === 'import' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FigmaIcon className="size-4" />
              )}
              {busy === 'import'
                ? translateUi('importing_c01c432')
                : translateUi('import_2cff9baa')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
