'use client';

import {
  type MediaAssetVersion,
  readableLayerName,
  type TemplateRebindPreview,
  templateDisplayName,
  UNTITLED_TEMPLATE_NAME,
} from '@continuum/contracts';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { uploadRefusal } from '@/components/forge/ForgeProjectDrop';
import {
  type MissingMedia,
  matchMissingMediaFiles,
  RepairProjectChoiceRequired,
  repairMissingMediaPackage,
} from '@/components/forge/repairMissingMedia';
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
import { useUiErrorMessage } from '@/i18n/errors';
import {
  type FolderFile,
  folderFilesFromDrop,
  folderFilesFromInput,
} from '@/lib/library/folderUpload';
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
  sourceFamily?: 'presentation';
  onConfirmed: () => Promise<void>;
  missingFootage?: MissingMedia[];
  /** A file dropped on the gallery as this template's next revision: uploaded once, on arrival. */
  initialFile?: File;
  onInitialFileTaken?: () => void;
};

export function SourceRebindPanel(props: SourceRebindProps) {
  return <SourceRebindSession key={`${props.brandId}:${props.assetId}`} {...props} />;
}

function SourceRebindSession(props: SourceRebindProps) {
  // Keep unmatched batch files when a successful repair advances the source version.
  const [files, setFiles] = useState<FolderFile[]>([]);
  return (
    <SourceRebindForm
      key={props.expectedVersionId}
      {...props}
      repairFiles={files}
      onRepairFiles={setFiles}
    />
  );
}

const mediaKey = (item: MissingMedia) => `${item.projectPath ?? ''}:${item.file}`;

function SourceRebindForm({
  brandId,
  assetId,
  expectedVersionId,
  suggestedVersionId,
  repairOnly = false,
  onNeedsReview,
  aepName,
  sourceFamily,
  onConfirmed,
  initialFile,
  onInitialFileTaken,
  missingFootage = [],
  repairFiles,
  onRepairFiles,
}: SourceRebindProps & {
  repairFiles: FolderFile[];
  onRepairFiles: (files: FolderFile[]) => void;
}) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('forge');

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
  const repairing = useRef(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectChoices, setProjectChoices] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, File>>({});
  const matches = matchMissingMediaFiles(missingFootage, repairFiles);
  const matchedRepairs = matches.flatMap(({ missing, matches: choices }) => {
    const file =
      assignments[mediaKey(missing)] ?? (choices.length === 1 ? choices[0]?.file : undefined);
    return file ? [{ missing, file }] : [];
  });
  const unmatchedFiles = repairFiles.filter(
    (candidate) =>
      !matches.some((row) => row.matches.includes(candidate)) &&
      !Object.values(assignments).includes(candidate.file),
  );

  const receiveRepairFiles = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    try {
      const entries = event.dataTransfer.items?.length
        ? await folderFilesFromDrop(event.dataTransfer.items)
        : null;
      onRepairFiles(
        entries ??
          Array.from(event.dataTransfer.files).map((file) => ({
            file,
            folders: [],
          })),
      );
      setAssignments({});
      setRepairError(null);
    } catch (error) {
      setRepairError(error instanceof Error ? error.message : 'Could not read the dropped folder.');
    }
  };

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
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_compare_source_revisions_ea5ecf63'),
      );
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
      const message = uiErrorText(error);
      toast.error(uploadRefusal({ name: file.name, sizeBytes: file.size }, message) ?? message);
    } finally {
      setBusy(false);
      setUploading(null);
    }
  };

  const repair = async (items: Array<{ missing: MissingMedia; file: File | null }>) => {
    if (busy || repairing.current || !items.length) return;
    repairing.current = true;
    setBusy(true);
    setRepairError(null);
    setUploading(
      items.length === 1
        ? (items[0]!.missing.file.split(/[\\/]/).pop() ?? 'media')
        : `${items.length} media files`,
    );
    let savedVersionId: string | null = null;
    let applied = false;
    try {
      for (const { missing, file } of items) {
        const extension = missing.file.match(/\.(ai|psd)$/i)?.[0].toLowerCase();
        if (file && extension && !file.name.toLowerCase().endsWith(extension))
          throw new Error(
            `Choose a ${extension} file for ${missing.name || missing.file.split(/[\\/]/).pop()}.`,
          );
      }
      const listed = await listAssetVersions({ brandId, assetId });
      const current = listed.find((item) => item.id === expectedVersionId);
      if (!current?.signedUrl)
        throw new Error('The current template source is unavailable. Refresh and try again.');
      if (
        (current.sizeBytes ?? 0) +
          items.reduce((total, item) => total + (item.file?.size ?? 0), 0) >
        64 * 1024 * 1024
      )
        throw new Error(
          'These files are too large for in-browser repair. Upload a corrected ZIP revision.',
        );
      const response = await fetch(current.signedUrl);
      if (!response.ok) throw new Error('Could not download the current template source.');
      const repaired = repairMissingMediaPackage(
        new Uint8Array(await response.arrayBuffer()),
        current.fileName,
        await Promise.all(
          items.map(async ({ missing, file }) => ({
            missing: {
              ...missing,
              projectPath: missing.projectPath ?? projectChoices[mediaKey(missing)],
            },
            replacement: file ? new Uint8Array(await file.arrayBuffer()) : undefined,
          })),
        ),
        aepName,
      );
      if (!alive.current) return;
      const result = await uploadNewAssetVersion({
        brandId,
        assetId,
        baseVersionId: listed.find((item) => item.isHead)?.id ?? expectedVersionId,
        file: new File(
          [new Uint8Array(repaired)],
          current.fileName.replace(/\.(aep|aepx|aet)$/i, '.zip'),
          { type: 'application/zip' },
        ),
        note: `Repaired ${items.map((item) => item.missing.file.split(/[\\/]/).pop()).join(', ')}`,
      });
      if (!result.versionId) throw new Error('Repair upload did not create a Library version.');
      savedVersionId = result.versionId;
      const inspected = await previewTemplateRebind({
        brandId,
        assetId,
        versionId: result.versionId,
        expectedVersionId,
      });
      if (!alive.current) return;
      if (
        inspected.missingFootage?.some((remaining) =>
          items.some(
            ({ missing }) =>
              remaining.file === missing.file &&
              (!missing.projectPath ||
                !remaining.projectPath ||
                remaining.projectPath === missing.projectPath),
          ),
        )
      )
        throw new Error(
          'Some supplied files are still missing. Check their project and media paths below.',
        );
      if (inspected.requiresReview || inspected.slots.some((slot) => slot.status === 'missing')) {
        setVersionId(result.versionId);
        setPreview(inspected);
        throw new Error(
          'The repair changed template fields. Review the saved revision before using it.',
        );
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
        translateUi('value0_media_file_value1_repaired_i_c43279dd', {
          count: Number(items.length),
        }),
      );
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof RepairProjectChoiceRequired) setProjects(error.projects);
      if (savedVersionId && !applied) onNeedsReview?.(savedVersionId);
      const message = uiErrorText(error);
      setRepairError(message);
      toast.error(message);
    } finally {
      repairing.current = false;
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
      toast.success(translateUi('source_revision_updated_8b321ab3'));
    } catch (error) {
      if (!alive.current) return;
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_update_the_source_revisio_e211028f'),
      );
    } finally {
      setBusy(false);
    }
  };

  const repairRows =
    missingFootage.length > 0 ? (
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="sr-only">{translateUi('missing_media_repair_e135544e')}</legend>
        <fieldset
          aria-label={translateUi('batch_media_repair_89b37c65')}
          className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-xs"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void receiveRepairFiles(event)}
        >
          <p>{translateUi('drop_missing_files_or_a_folder_here_d0d1f792')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="cursor-pointer">
              {' '}
              {translateUi('choose_missing_files_a6007a63')}{' '}
              <Input
                type="file"
                multiple
                className="sr-only"
                aria-label={translateUi('choose_missing_files_a6007a63')}
                onChange={(event) => {
                  onRepairFiles(
                    Array.from(event.target.files ?? []).map((file) => ({
                      file,
                      folders: [],
                    })),
                  );
                  setAssignments({});
                  event.target.value = '';
                }}
              />
            </Label>
            <Label className="cursor-pointer">
              {' '}
              {translateUi('choose_media_folder_8e92e2f9')}{' '}
              <input
                type="file"
                multiple
                {...{ webkitdirectory: '' }}
                className="sr-only"
                aria-label={translateUi('choose_media_folder_8e92e2f9')}
                onChange={(event) => {
                  onRepairFiles(folderFilesFromInput(event.target.files ?? []));
                  setAssignments({});
                  event.target.value = '';
                }}
              />
            </Label>
            <Button
              type="button"
              size="sm"
              disabled={busy || !matchedRepairs.length}
              onClick={() => void repair(matchedRepairs)}
            >
              {' '}
              {translateUi('repair_1196b6c5')} {matchedRepairs.length}{' '}
              {translateUi('matched_file_63a63ced')}
              {matchedRepairs.length === 1 ? '' : 's'}
            </Button>
          </div>
        </fieldset>
        {unmatchedFiles.length ? (
          <p role="status">
            {' '}
            {translateUi('unmatched_files_0a259868')}{' '}
            {unmatchedFiles.map(({ file }) => file.name).join(', ')}
            {translateUi('choose_a_file_on_its_named_row_belo_02078b20')}{' '}
          </p>
        ) : null}
        {matches.map(({ missing: item, matches: choices }, index) => (
          <div key={mediaKey(item)} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor={`repair-media-${repairOnly ? 'preview' : 'source'}-${assetId}-${index}`}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-dashed border-destructive/50 p-3 text-xs"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const file = event.dataTransfer.files[0];
                  if (file && !busy) {
                    setAssignments((current) => ({
                      ...current,
                      [mediaKey(item)]: file,
                    }));
                    void repair([{ missing: item, file }]);
                  }
                }}
              >
                <span>
                  <strong>{item.name || item.file.split(/[\\/]/).pop()}</strong>
                  <span className="block text-muted-foreground">
                    {' '}
                    {translateUi('drop_this_file_here_or_click_to_cho_7b23ac5a')}{' '}
                  </span>
                  <span className="block break-all text-muted-foreground">{item.file}</span>
                  {item.projectPath ? (
                    <span className="block text-muted-foreground">
                      {translateUi('project_5917f323')} {item.projectPath}
                    </span>
                  ) : null}
                  {assignments[mediaKey(item)] || choices.length === 1 ? (
                    <span className="block">
                      {' '}
                      {translateUi('matched_919d2f9c')}{' '}
                      {(assignments[mediaKey(item)] ?? choices[0]?.file)?.name}
                    </span>
                  ) : null}
                </span>
                <Input
                  id={`repair-media-${repairOnly ? 'preview' : 'source'}-${assetId}-${index}`}
                  type="file"
                  className="sr-only"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setAssignments((current) => ({
                        ...current,
                        [mediaKey(item)]: file,
                      }));
                      void repair([{ missing: item, file }]);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void repair([{ missing: item, file: null }])}
              >
                {' '}
                {translateUi('find_in_zip_0029e8fd')}{' '}
              </Button>
            </div>
            {repairFiles.length > 0 ? (
              <Select
                value={
                  assignments[mediaKey(item)]
                    ? repairFiles
                        .findIndex((candidate) => candidate.file === assignments[mediaKey(item)])
                        .toString()
                        .replace(/^-1$/, '')
                    : ''
                }
                onValueChange={(value) => {
                  const candidate = repairFiles[Number(value)];
                  if (candidate)
                    setAssignments((current) => ({
                      ...current,
                      [mediaKey(item)]: candidate.file,
                    }));
                }}
              >
                <SelectTrigger
                  aria-label={translateUi('replacement_for_value0_08054e7b', {
                    value0: String(item.name || item.file),
                  })}
                >
                  <SelectValue
                    placeholder={
                      choices.length > 1
                        ? translateUi('several_files_match_choose_one_401371e2')
                        : translateUi('assign_a_supplied_file_3b854407')
                    }
                  >
                    {assignments[mediaKey(item)]?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {repairFiles.map((candidate, candidateIndex) => (
                    <SelectItem key={candidateIndex} value={candidateIndex.toString()}>
                      {[...candidate.folders, candidate.file.name].join('/')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {!item.projectPath && projects.length ? (
              <Select
                value={projectChoices[mediaKey(item)] ?? ''}
                onValueChange={(value) => {
                  if (value)
                    setProjectChoices((current) => ({
                      ...current,
                      [mediaKey(item)]: value,
                    }));
                }}
              >
                <SelectTrigger
                  aria-label={translateUi('project_for_value0_55b07f41', {
                    value0: String(item.name || item.file),
                  })}
                >
                  <SelectValue
                    placeholder={translateUi('choose_the_project_that_references__17a8fae6')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ))}
        {repairError ? (
          <p role="alert" className="text-xs text-destructive">
            {repairError}
          </p>
        ) : null}
      </fieldset>
    ) : null;

  if (repairOnly)
    return (
      <div ref={root} className="flex flex-col gap-2">
        {repairRows}
        {uploading ? (
          <p role="status" className="text-xs text-muted-foreground">
            {' '}
            {translateUi('repairing_e2c5201c')} {uploading}…
          </p>
        ) : null}
      </div>
    );

  return (
    <div ref={root} className="flex flex-col gap-3">
      {repairRows}
      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('compare_a_library_version_before_ch_a6f108dc')}{' '}
      </p>
      {newerHead ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-xs"
        >
          <span> {translateUi('a_newer_library_version_is_saved_bu_6bb07db4')} </span>
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
            {' '}
            {translateUi('review_newer_version_d4df3a68')}{' '}
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
          <SelectTrigger className="w-72" aria-label={translateUi('source_revision_49114ee4')}>
            <SelectValue placeholder={translateUi('choose_an_existing_version_aed78e7d')}>
              {versionLabel(versions.find((item) => item.id === versionId))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versions.map((version) => (
              <SelectItem key={version.id} value={version.id}>
                {versionLabel(version)}
                {version.id === expectedVersionId ? translateUi('current_source_51f57b77') : ''}
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
          {busy ? <Loader2 className="animate-spin" /> : null}
          {translateUi('preview_changes_330c32c4')}{' '}
        </Button>
        <Label className="cursor-pointer">
          <Input
            type="file"
            accept={sourceFamily === 'presentation' ? '.pptx,.potx' : '.aep,.aepx,.aet,.zip'}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />{' '}
          {translateUi('upload_new_revision_5d2a1af8')}{' '}
        </Label>
      </div>
      {uploading ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />{' '}
          {translateUi('uploading_8b898ca3')} {uploading}{' '}
          {translateUi('as_a_new_revision_ea08fdd0')}{' '}
        </p>
      ) : null}
      {listError ? (
        <p role="alert" className="text-xs text-destructive">
          {listError}{' '}
          <Button variant="link" onClick={() => setReload((value) => value + 1)}>
            {' '}
            {translateUi('retry_942087cc')}{' '}
          </Button>
        </p>
      ) : null}
      {preview ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden border-y border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">{translateUi('slot_79689782')}</th>
                  <th className="px-3 py-2 text-left">{translateUi('kind_f5387f9b')}</th>
                  <th className="px-3 py-2 text-left">{translateUi('change_c0bf75bd')}</th>
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
              <AlertTriangle className="size-4" />{' '}
              {translateUi('ambiguous_slots_must_be_resolved_be_021a7f11')}{' '}
            </p>
          ) : null}
          {missing ? (
            <Label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={acceptMissing}
                onCheckedChange={(checked) => setAcceptMissing(checked === true)}
              />{' '}
              {translateUi('accept_missing_slots_in_this_revisi_4b5095cd')}{' '}
            </Label>
          ) : null}
          <Button
            type="button"
            disabled={busy || ambiguous || (missing && !acceptMissing)}
            onClick={() => void confirm()}
          >
            {' '}
            {translateUi('use_this_revision_58a93f1e')}{' '}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
