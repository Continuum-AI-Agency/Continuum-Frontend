'use client';

import {
  type MediaAssetVersion,
  readableLayerName,
  type TemplateRebindPreview,
  templateDisplayName,
  UNTITLED_TEMPLATE_NAME,
} from '@continuum/contracts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { uploadRefusal } from '@/components/forge/ForgeProjectDrop';
import { repairMissingMediaZip } from '@/components/forge/repairMissingMedia';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { confirmTemplateRebind, previewTemplateRebind } from '@/lib/library/templateSources';
import { listAssetVersions, uploadNewAssetVersion } from '@/lib/library/versions';

/** "Version 3 · Summer promo" — a Library filename is usually a uuid, which is no name at all. */
function versionLabel(version: MediaAssetVersion | undefined): string {
  if (!version) return '';
  const name = templateDisplayName(version.fileName);
  return name === UNTITLED_TEMPLATE_NAME
    ? `Version ${version.versionNumber}`
    : `Version ${version.versionNumber} · ${name}`;
}

type SourceRebindProps = {
  brandId: string;
  assetId: string;
  expectedVersionId: string;
  suggestedVersionId?: string;
  repairOnly?: boolean;
  onNeedsReview?: (versionId: string) => void;
  aepName?: string;
  onConfirmed: () => Promise<void>;
  missingFootage?: Array<{ name: string | null; file: string }>;
  /** A file dropped on the gallery as this template's next revision: uploaded once, on arrival. */
  initialFile?: File;
  onInitialFileTaken?: () => void;
};

export function SourceRebindPanel(props: SourceRebindProps) {
  return (
    <SourceRebindForm
      key={`${props.brandId}:${props.assetId}:${props.expectedVersionId}`}
      {...props}
    />
  );
}

function SourceRebindForm({
  brandId,
  assetId,
  expectedVersionId,
  suggestedVersionId,
  repairOnly = false,
  onNeedsReview,
  aepName,
  onConfirmed,
  initialFile,
  onInitialFileTaken,
  missingFootage = [],
}: SourceRebindProps) {
  const [versions, setVersions] = useState<MediaAssetVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [preview, setPreview] = useState<TemplateRebindPreview | null>(null);
  const [acceptMissing, setAcceptMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const alive = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  const took = useRef(false);

  useEffect(() => {
    if (suggestedVersionId) {
      setVersionId(suggestedVersionId);
      setPreview(null);
      setReload((value) => value + 1);
    }
  }, [suggestedVersionId]);

  useEffect(() => {
    alive.current = true;
    if (repairOnly)
      return () => {
        alive.current = false;
      };
    let cancelled = false;
    setListError(null);
    void listAssetVersions({ brandId, assetId })
      .then((items) => {
        if (!cancelled) setVersions(items);
      })
      .catch(() => {
        if (!cancelled) setListError('Could not load source revisions.');
      });
    return () => {
      cancelled = true;
      alive.current = false;
    };
  }, [assetId, brandId, reload, repairOnly]);

  const inspect = async (nextVersionId = versionId) => {
    if (!nextVersionId) return;
    setBusy(true);
    setPreview(null);
    try {
      const result = await previewTemplateRebind({
        brandId,
        assetId,
        versionId: nextVersionId,
        expectedVersionId,
      });
      if (!alive.current) return;
      setPreview(result);
      setAcceptMissing(false);
    } catch (error) {
      if (!alive.current) return;
      toast.error(error instanceof Error ? error.message : 'Could not compare source revisions');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setUploading(file.name);
    try {
      // A revision builds on the Library's head, not on the version the template is bound to: after
      // an upload nobody confirmed, those differ, and basing on the template's refused every later
      // upload as stale — refreshing could never fix it. Read at upload time: a drop arrives before
      // the list above has loaded.
      const head = (await listAssetVersions({ brandId, assetId })).find((item) => item.isHead);
      const result = await uploadNewAssetVersion({
        brandId,
        assetId,
        baseVersionId: head?.id ?? expectedVersionId,
        file,
      });
      if (!alive.current) return;
      if (!result.versionId) throw new Error('Upload did not return a registered Library version');
      const next = await listAssetVersions({ brandId, assetId });
      if (!alive.current) return;
      setVersions(next);
      setVersionId(result.versionId);
      await inspect(result.versionId);
    } catch (error) {
      if (!alive.current) return;
      const message = error instanceof Error ? error.message : 'Could not upload the revision';
      toast.error(uploadRefusal({ name: file.name, sizeBytes: file.size }, message) ?? message);
    } finally {
      setBusy(false);
      setUploading(null);
    }
  };

  const repair = async (missingFile: string, file: File | null) => {
    if (busy) return;
    setBusy(true);
    setUploading(file?.name ?? missingFile.split(/[\\/]/).pop() ?? 'media');
    let savedVersionId: string | null = null;
    let applied = false;
    try {
      const current = (await listAssetVersions({ brandId, assetId })).find(
        (item) => item.id === expectedVersionId,
      );
      if (!current?.signedUrl || !current.fileName.toLowerCase().endsWith('.zip'))
        throw new Error('The current source ZIP is unavailable for repair.');
      const response = await fetch(current.signedUrl);
      if (!response.ok) throw new Error('Could not download the current source ZIP.');
      const repaired = repairMissingMediaZip(
        new Uint8Array(await response.arrayBuffer()),
        missingFile,
        file ? new Uint8Array(await file.arrayBuffer()) : undefined,
        aepName,
      );
      const head = (await listAssetVersions({ brandId, assetId })).find((item) => item.isHead);
      const result = await uploadNewAssetVersion({
        brandId,
        assetId,
        baseVersionId: head?.id ?? expectedVersionId,
        file: new File([new Uint8Array(repaired)], current.fileName, { type: 'application/zip' }),
        note: `Repaired ${missingFile.split(/[\\/]/).pop()}`,
      });
      if (!result.versionId) throw new Error('Repair upload did not create a Library version.');
      savedVersionId = result.versionId;
      const inspected = await previewTemplateRebind({
        brandId,
        assetId,
        versionId: result.versionId,
        expectedVersionId,
      });
      if (inspected.missingFootage?.some((item) => item.file === missingFile))
        throw new Error('Forge still cannot find this file. Check the AEP media path.');
      if (inspected.requiresReview || inspected.slots.some((slot) => slot.status === 'missing')) {
        setVersionId(result.versionId);
        setPreview(inspected);
        throw new Error('The repaired ZIP changed template slots. Review this revision below.');
      }
      await confirmTemplateRebind({
        brandId,
        assetId,
        versionId: result.versionId,
        expectedVersionId,
        expectedChecksum: inspected.checksum,
        acceptMissing: false,
      });
      applied = true;
      if (!alive.current) return;
      await onConfirmed();
      toast.success(
        `${file?.name ?? missingFile.split(/[\\/]/).pop()} repaired in the template source`,
      );
    } catch (error) {
      if (!alive.current) return;
      if (savedVersionId && !applied) onNeedsReview?.(savedVersionId);
      toast.error(error instanceof Error ? error.message : 'Could not repair media');
    } finally {
      setBusy(false);
      setUploading(null);
    }
  };

  // After the listing effect, so a StrictMode remount has already set `alive` back when this
  // upload's awaits resume. `took` keeps the second run from uploading the same file twice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the file this panel opened with
  useEffect(() => {
    if (!initialFile || took.current) return;
    took.current = true;
    onInitialFileTaken?.();
    root.current?.scrollIntoView?.({ block: 'nearest' });
    void upload(initialFile);
  }, []);

  const ambiguous = preview?.slots.some((slot) => slot.status === 'ambiguous') ?? false;
  const missing = preview?.slots.some((slot) => slot.status === 'missing') ?? false;
  const newerHead = versions.find((item) => item.isHead && item.id !== expectedVersionId);
  const confirm = async () => {
    if (!preview || ambiguous || (missing && !acceptMissing)) return;
    setBusy(true);
    try {
      await confirmTemplateRebind({
        brandId,
        assetId,
        versionId: preview.versionId,
        expectedVersionId,
        expectedChecksum: preview.checksum,
        acceptMissing,
      });
      if (!alive.current) return;
      await onConfirmed();
      setPreview(null);
      toast.success('Source revision updated');
    } catch (error) {
      if (!alive.current) return;
      toast.error(error instanceof Error ? error.message : 'Could not update the source revision');
    } finally {
      setBusy(false);
    }
  };

  const repairRows =
    missingFootage.length > 0 ? (
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Missing media repair</legend>
        {missingFootage.map((item, index) => (
          <div key={item.file} className="flex items-center gap-2">
            <label
              htmlFor={`repair-media-${repairOnly ? 'preview' : 'source'}-${assetId}-${index}`}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-destructive/50 p-3 text-xs"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void repair(item.file, file);
              }}
            >
              <span>
                <strong>{item.name || item.file.split(/[\\/]/).pop()}</strong>
                <span className="block text-muted-foreground">
                  Drop this file here or click to choose
                </span>
                <span className="block break-all text-muted-foreground">{item.file}</span>
              </span>
              <Input
                id={`repair-media-${repairOnly ? 'preview' : 'source'}-${assetId}-${index}`}
                type="file"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void repair(item.file, file);
                  event.target.value = '';
                }}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void repair(item.file, null)}
            >
              Find in ZIP
            </Button>
          </div>
        ))}
      </fieldset>
    ) : null;

  if (repairOnly)
    return (
      <div ref={root} className="flex flex-col gap-2">
        {repairRows}
        {uploading ? (
          <p role="status" className="text-xs text-muted-foreground">
            Repairing {uploading}…
          </p>
        ) : null}
      </div>
    );

  return (
    <div ref={root} className="flex flex-col gap-3">
      {repairRows}
      <p className="text-xs text-muted-foreground">
        Compare a Library version before changing what this template parses. Building and publishing
        remain separate.
      </p>
      {newerHead ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-xs"
        >
          <span>
            A newer Library version is saved but this template still uses the previous source.
          </span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setVersionId(newerHead.id);
              void inspect(newerHead.id);
            }}
          >
            Review newer version
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          disabled={busy}
          value={versionId}
          onValueChange={(value) => {
            setVersionId(value);
            setPreview(null);
          }}
        >
          <SelectTrigger className="w-72" aria-label="Source revision">
            <SelectValue placeholder="Choose an existing version">
              {versionLabel(versions.find((item) => item.id === versionId))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {versionLabel(version)}
                {version.id === expectedVersionId ? ' (current source)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!versionId || versionId === expectedVersionId || busy}
          onClick={() => void inspect()}
        >
          {busy ? <Loader2 className="animate-spin" /> : null}Preview changes
        </Button>
        <Label className="cursor-pointer">
          <Input
            type="file"
            accept=".aep,.aepx,.aet,.zip"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          Upload new revision
        </Label>
      </div>
      {uploading ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Uploading {uploading} as a new revision…
        </p>
      ) : null}
      {listError ? (
        <p role="alert" className="text-xs text-destructive">
          {listError}{' '}
          <Button variant="link" onClick={() => setReload((value) => value + 1)}>
            Retry
          </Button>
        </p>
      ) : null}
      {preview ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden border-y border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Slot</th>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">Change</th>
                </tr>
              </thead>
              <tbody>
                {preview.slots.map((slot) => (
                  <tr key={slot.slotKey} className="border-t">
                    <td className="px-3 py-2">
                      {slot.name ? readableLayerName(slot.name) : slot.slotKey}
                    </td>
                    <td className="px-3 py-2">{slot.kind}</td>
                    <td className="px-3 py-2 capitalize">{slot.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ambiguous ? (
            <p className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-4" />
              Ambiguous slots must be resolved before this revision can be used.
            </p>
          ) : null}
          {missing ? (
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={acceptMissing}
                onCheckedChange={(checked) => setAcceptMissing(checked === true)}
              />
              Accept missing slots in this revision
            </Label>
          ) : null}
          <Button
            type="button"
            disabled={busy || ambiguous || (missing && !acceptMissing)}
            onClick={() => void confirm()}
          >
            Use this revision
          </Button>
        </div>
      ) : null}
    </div>
  );
}
