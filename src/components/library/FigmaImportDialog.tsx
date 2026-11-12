'use client';

import type { FigmaFile, FigmaFolder, FigmaFrame } from '@continuum/contracts';
import { Check, Loader2, RefreshCw } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
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
import { useUiErrorMessage } from '@/i18n/errors';
import {
  beginFigmaConnection,
  importFigmaFrames,
  listFigmaFiles,
  listFigmaFolders,
  listFigmaFrames,
} from '@/lib/library/figma';

type BusyState = 'folders' | 'files' | 'frames' | 'import' | 'connect' | null;

export function FigmaImportDialog({
  brandId,
  onImported,
}: {
  brandId: string;
  onImported: () => void;
}) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  // Every folder seen so far; choosing one adds its subfolders, so nesting needs no extra UI.
  const [folders, setFolders] = useState<FigmaFolder[]>([]);
  const [folderId, setFolderId] = useState('');
  const [files, setFiles] = useState<FigmaFile[]>([]);
  const [fileKey, setFileKey] = useState('');
  const [frames, setFrames] = useState<FigmaFrame[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const folderLabel = (folder: FigmaFolder): string => {
    const parent = folders.find((candidate) => candidate.id === folder.parentFolderId);
    return parent ? `${folderLabel(parent)} / ${folder.name}` : folder.name;
  };

  async function loadFolders() {
    if (!teamId.trim()) return;
    setBusy('folders');
    setError(null);
    try {
      setFolders(await listFigmaFolders(brandId, { teamId: teamId.trim() }));
      setFolderId('');
      setFiles([]);
      setFrames([]);
    } catch (cause) {
      setError(uiErrorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFolder(value: string) {
    setFolderId(value);
    setFileKey('');
    setFrames([]);
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
      setError(uiErrorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function chooseFile(value: string) {
    setFileKey(value);
    setSelected([]);
    setBusy('frames');
    setError(null);
    try {
      setFrames((await listFigmaFrames(brandId, value)).frames);
    } catch (cause) {
      setError(uiErrorText(cause));
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setBusy('connect');
    try {
      const callbackUrl = `${window.location.origin}/integrations/callback?provider=figma`;
      const url = await beginFigmaConnection({ brandId, callbackUrl });
      window.open(url, 'continuum-figma-oauth', 'popup,width=720,height=760');
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : translateUi('could_not_connect_figma_c1ccc5c1'),
      );
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
        translateUi('value0_figma_frame_value1_imported__cb8f8021', {
          count: Number(created),
          details: String(unchanged ? ` · ${unchanged} already current` : ''),
        }),
      );
      onImported();
      setOpen(false);
    } catch (cause) {
      setError(uiErrorText(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <FigmaIcon className="size-4" />
            <span className="hidden sm:inline">{translateUi('figma_ce460410')}</span>
          </Button>
        }
      />
      <DialogContent className="flex max-h-[82dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{translateUi('import_from_figma_2e559556')}</DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('select_frames_to_store_as_private_v_cf908729')}{' '}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <Input
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              placeholder={translateUi('figma_team_id_2932da7a')}
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
              )}{' '}
              {translateUi('browse_3227aa96')}{' '}
            </Button>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm"
            >
              <span>
                {error === 'invalid_configuration'
                  ? translateUi('figma_is_not_configured_for_this_en_10c07e99')
                  : error === 'provider_unavailable' || error.includes('not_connected')
                    ? translateUi('connect_figma_then_browse_again_c2329879')
                    : error}
              </span>
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
                )}{' '}
                {translateUi('connect_1a2303ed')}{' '}
              </Button>
            </div>
          ) : null}

          {folders.length ? (
            <Select value={folderId} onValueChange={(value) => void chooseFolder(value)}>
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
            <Select value={fileKey} onValueChange={(value) => void chooseFile(value)}>
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

          {busy === 'files' || busy === 'frames' ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />{' '}
              {translateUi('loading_from_figma_f34d9916')}{' '}
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
                      disabled={!checked && selected.length >= 50}
                      onChange={() =>
                        setSelected((current) =>
                          checked
                            ? current.filter((id) => id !== frame.id)
                            : current.length < 50
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
          ) : fileKey && busy === null ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {' '}
              {translateUi('no_top_level_frames_found_in_this_f_2eaa199d')}{' '}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.length
              ? translateUi('value0_selected_975acbfe', { count: Number(selected.length) })
              : translateUi('select_up_to_50_frames_730d87b7')}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {' '}
              {translateUi('cancel_19766ed6')}{' '}
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
              )}{' '}
              {translateUi('import_2cff9baa')}{' '}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
