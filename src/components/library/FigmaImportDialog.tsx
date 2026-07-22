'use client';

import type { FigmaFile, FigmaFrame, FigmaProject } from '@continuum/contracts';
import { Check, Figma, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

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
import {
  beginFigmaConnection,
  importFigmaFrames,
  listFigmaFiles,
  listFigmaFrames,
  listFigmaProjects,
} from '@/lib/library/figma';

type BusyState = 'projects' | 'files' | 'frames' | 'import' | 'connect' | null;

export function FigmaImportDialog({
  brandId,
  onImported,
}: {
  brandId: string;
  onImported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [projects, setProjects] = useState<FigmaProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [files, setFiles] = useState<FigmaFile[]>([]);
  const [fileKey, setFileKey] = useState('');
  const [frames, setFrames] = useState<FigmaFrame[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadProjects() {
    if (!teamId.trim()) return;
    setBusy('projects');
    setError(null);
    try {
      setProjects(await listFigmaProjects(brandId, teamId.trim()));
      setProjectId('');
      setFiles([]);
      setFrames([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'provider_unavailable');
    } finally {
      setBusy(null);
    }
  }

  async function chooseProject(value: string) {
    setProjectId(value);
    setFileKey('');
    setFrames([]);
    setBusy('files');
    setError(null);
    try {
      setFiles(await listFigmaFiles(brandId, value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'provider_unavailable');
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
      setError(cause instanceof Error ? cause.message : 'provider_unavailable');
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
      toast.error(cause instanceof Error ? cause.message : 'Could not connect Figma');
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
        `${created} Figma frame${created === 1 ? '' : 's'} imported${unchanged ? ` · ${unchanged} already current` : ''}`,
      );
      onImported();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'operation_failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Figma className="size-4" />
          <span className="hidden sm:inline">Figma</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[82dvh] flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>Import from Figma</DialogTitle>
          <DialogDescription>
            Select frames to store as private, versioned Library assets with refreshable provenance.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <Input
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
              placeholder="Figma team ID"
              aria-label="Figma team ID"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void loadProjects();
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!teamId.trim() || busy !== null}
              onClick={() => void loadProjects()}
            >
              {busy === 'projects' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Browse
            </Button>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm"
            >
              <span>
                {error === 'invalid_configuration'
                  ? 'Figma is not configured for this environment.'
                  : error === 'provider_unavailable' || error.includes('not_connected')
                    ? 'Connect Figma, then browse again.'
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
                  <Figma className="size-4" />
                )}
                Connect
              </Button>
            </div>
          ) : null}

          {projects.length ? (
            <Select value={projectId} onValueChange={(value) => void chooseProject(value)}>
              <SelectTrigger aria-label="Figma project">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {files.length ? (
            <Select value={fileKey} onValueChange={(value) => void chooseFile(value)}>
              <SelectTrigger aria-label="Figma file">
                <SelectValue placeholder="Choose a file" />
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
              <Loader2 className="mr-2 size-4 animate-spin" /> Loading from Figma…
            </div>
          ) : frames.length ? (
            <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-medium text-muted-foreground">Frames</legend>
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
              No top-level frames found in this file.
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selected.length ? `${selected.length} selected` : 'Select up to 50 frames'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selected.length || busy !== null}
              onClick={() => void importSelected()}
            >
              {busy === 'import' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Figma className="size-4" />
              )}
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
