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
  onConfirmed: () => Promise<void>;
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
  onConfirmed,
  initialFile,
  onInitialFileTaken,
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
    alive.current = true;
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
  }, [assetId, brandId, reload]);

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
      const result = await uploadNewAssetVersion({
        brandId,
        assetId,
        baseVersionId: expectedVersionId,
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

  return (
    <div ref={root} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Compare a Library version before changing what this template parses. Building and publishing
        remain separate.
      </p>
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
