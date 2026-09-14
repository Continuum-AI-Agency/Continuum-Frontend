'use client';

import type { MediaAssetVersion, TemplateRebindPreview } from '@continuum/contracts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

type SourceRebindProps = {
  brandId: string;
  assetId: string;
  expectedVersionId: string;
  onConfirmed: () => Promise<void>;
};

export function SourceRebindPanel(props: SourceRebindProps) {
  return (
    <SourceRebindForm
      key={`${props.brandId}:${props.assetId}:${props.expectedVersionId}`}
      {...props}
    />
  );
}

function SourceRebindForm({ brandId, assetId, expectedVersionId, onConfirmed }: SourceRebindProps) {
  const [versions, setVersions] = useState<MediaAssetVersion[]>([]);
  const [versionId, setVersionId] = useState('');
  const [preview, setPreview] = useState<TemplateRebindPreview | null>(null);
  const [acceptMissing, setAcceptMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);

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
      toast.error(error instanceof Error ? error.message : 'Could not upload the revision');
    } finally {
      setBusy(false);
    }
  };

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
    <section className="rounded-lg border p-4">
      <h3 className="text-sm font-medium">Source revision</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Compare a Library version before changing what this template parses. Building and publishing
        remain separate.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
              {versions.find((item) => item.id === versionId)?.fileName}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                Version {version.versionNumber} · {version.fileName}
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
      {listError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {listError}{' '}
          <Button variant="link" onClick={() => setReload((value) => value + 1)}>
            Retry
          </Button>
        </p>
      ) : null}
      {preview ? (
        <div className="mt-4 space-y-3">
          <div className="overflow-hidden rounded-md border">
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
                    <td className="px-3 py-2">{slot.name ?? slot.slotKey}</td>
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
    </section>
  );
}
