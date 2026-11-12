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
import {
  useTranslations as useBetaTranslations,
  useTranslations as useUiTranslations,
} from 'next-intl';
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
  FigmaApiError,
  figmaErrorMessage,
  importFigmaFrames,
  listFigmaFiles,
  listFigmaFolders,
  listFigmaFrames,
} from '@/lib/library/figma';

type BusyState = 'folders' | 'files' | 'frames' | 'import' | 'connect' | null;

export function FigmaImportDialog({
  brandId,
  onImported,
  label = 'Figma',
  size = 'sm',
}: {
  brandId: string;
  onImported: (assets: FigmaImportedAsset[]) => void;
  label?: string;
  size?: 'sm' | 'default';
}) {
  const betaUiText = useBetaTranslations('library');

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

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
  const failure = error ? figmaErrorMessage(error) : null;

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
      toast.error(figmaErrorMessage(cause).message);
    } finally {
      setBusy(null);
    }
  }

  async function importSelected() {
    if (!fileKey || !selected.length) return;
    setBusy('import');
    setError(null);
    try {
      const assets = await importFigmaFrames({
        brandId,
        fileKey,
        nodeIds: selected,
      });
      const created = assets.filter((asset) => asset.status !== 'exists').length;
      const unchanged = assets.length - created;
      toast.success(betaUiText('figmaImportComplete', { created, unchanged }));
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
            <span className="hidden sm:inline">{label}</span>
          </Button>
        }
      />
      <DialogContent className="flex max-h-[82dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{translateUi('import_from_figma_2e559556')}</DialogTitle>
          <DialogDescription>{betaUiText('beta_bc14614ba0ee')}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <Input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder={betaUiText('beta_105a6529168d')}
              aria-label={betaUiText('beta_566f802ccc8d')}
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
              {betaUiText('beta_ed077f3d8125')}
            </Button>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {betaUiText('beta_e7fd9d15ddb6')}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  placeholder={betaUiText('beta_edef90584cbe')}
                  aria-label={betaUiText('beta_2932da7a5764')}
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
                  {betaUiText('beta_3227aa966625')}
                </Button>
              </div>
              {folders.length ? (
                <Select
                  value={folderId}
                  disabled={busy !== null}
                  onValueChange={(value) => void chooseFolder(value)}
                >
                  <SelectTrigger aria-label={betaUiText('beta_2d32f51caabd')}>
                    <SelectValue placeholder={betaUiText('beta_5c71b8cd7822')} />
                  </SelectTrigger>
                  <SelectContent>
                    {folders
                      .map((folder) => ({
                        id: folder.id,
                        label: folderLabel(folder),
                      }))
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
                  <SelectTrigger aria-label={betaUiText('beta_cbda49d36703')}>
                    <SelectValue placeholder={betaUiText('beta_3e10c3cd6e0d')} />
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
                  {betaUiText('beta_1a2303ede074')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {busy === 'files' || busy === 'frames' ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />{' '}
              {translateUi('loading_from_figma_f34d9916')}{' '}
            </div>
          ) : linkedOnly ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-primary/5 px-3 py-2 text-sm">
              <span>{betaUiText('beta_9ac90aa22a4b')}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void chooseFile(fileKey, selected)}
              >
                {betaUiText('beta_22dce7eaee5a')}
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
              {betaUiText('beta_82a02d496f04')}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.length
              ? betaUiText('beta_975acbfeba9a', { value0: selected.length })
              : betaUiText('beta_fe9ad4705b2e', {
                  value0: String(FIGMA_IMPORT_MAX_FRAMES),
                })}
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
              )}
              {busy === 'import'
                ? betaUiText('beta_c01c4324f1fa')
                : betaUiText('beta_2cff9baabf56')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
