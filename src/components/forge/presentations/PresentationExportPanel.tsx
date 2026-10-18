'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { type PresentationScope, presentationsApi } from '@/lib/api/presentations.client';

const formatsSchema = z
  .object({ pptx: z.boolean(), pdf: z.boolean() })
  .refine((value) => value.pptx || value.pdf, {
    message: 'Choose at least one output format.',
    path: ['pptx'],
  });
type Preview = Awaited<ReturnType<typeof presentationsApi.previewExport>>;
type Output = Awaited<ReturnType<typeof presentationsApi.confirmExport>>['outputs'][number];

export function PresentationExportPanel({
  scope,
  revision,
  title,
  dirty,
  blocked,
  save,
  onError,
}: {
  scope: PresentationScope;
  revision: number;
  title: string;
  dirty: boolean;
  blocked: boolean;
  save: () => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const form = useForm<z.infer<typeof formatsSchema>>({
    resolver: zodResolver(formatsSchema),
    defaultValues: { pptx: true, pdf: true },
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const pptx = form.watch('pptx');
  const pdf = form.watch('pdf');
  // biome-ignore lint/correctness/useExhaustiveDependencies: Any revision, edit or format change invalidates export approval.
  useEffect(() => {
    setPreview(null);
  }, [revision, dirty, pptx, pdf]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Create an editable PowerPoint file and a static PDF. Each output is saved to Files with this
        deck’s source and revision.
      </p>
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          Resolve the blocking import issues before exporting. Your original PowerPoint file is
          preserved.
        </p>
      ) : null}
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setBusy(true);
          try {
            const formats: Array<'pptx' | 'pdf'> = [
              ...(values.pptx ? ['pptx' as const] : []),
              ...(values.pdf ? ['pdf' as const] : []),
            ];
            setPreview(await presentationsApi.previewExport(scope, revision, formats));
            setOutputs([]);
          } catch (reason) {
            onError(reason instanceof Error ? reason.message : 'Export could not be prepared.');
          } finally {
            setBusy(false);
          }
        })}
      >
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="presentation-export-pptx"
              checked={pptx}
              disabled={busy}
              onCheckedChange={(value) => form.setValue('pptx', value === true)}
            />
            <FieldLabel htmlFor="presentation-export-pptx">PowerPoint (.pptx)</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="presentation-export-pdf"
              checked={pdf}
              disabled={busy}
              onCheckedChange={(value) => form.setValue('pdf', value === true)}
            />
            <FieldLabel htmlFor="presentation-export-pdf">PDF (.pdf)</FieldLabel>
          </Field>
          <FieldError errors={[form.formState.errors.pptx]} />
          {dirty ? (
            <Button type="button" variant="outline" onClick={() => void save()}>
              Save before exporting
            </Button>
          ) : null}
          <Button type="submit" variant="outline" disabled={busy || dirty || blocked}>
            {busy ? 'Preparing export…' : 'Review export'}
          </Button>
        </FieldGroup>
      </form>
      {preview ? (
        <section
          aria-label="Export confirmation"
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium">Approve export</h3>
          <p className="text-sm">
            “{title}”, revision {preview.revision}, as{' '}
            {preview.formats.map((format) => format.toUpperCase()).join(' and ')}.
          </p>
          <p className="text-xs text-muted-foreground">
            Approval expires{' '}
            {new Date(preview.expiresAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
            . Further edits require a new review.
          </p>
          <Button
            disabled={busy || dirty || blocked || preview.revision !== revision}
            onClick={async () => {
              if (Date.parse(preview.expiresAt) <= Date.now()) {
                setPreview(null);
                return onError('Export approval expired. Review the export again.');
              }
              setBusy(true);
              try {
                const result = await presentationsApi.confirmExport(
                  scope,
                  preview.confirmationToken,
                );
                setOutputs(result.outputs);
                setPreview(null);
              } catch (reason) {
                onError(
                  reason instanceof Error
                    ? reason.message
                    : 'Export failed. Your presentation remains saved.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Exporting…' : 'Confirm export to Files'}
          </Button>
        </section>
      ) : null}
      {outputs.length ? (
        <section aria-label="Exported files" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Saved to Files</h3>
          {outputs.map((output) => (
            <a
              key={`${output.assetId}:${output.versionId}`}
              href={output.url}
              target="_blank"
              rel="noreferrer"
              className="break-all text-sm text-primary underline underline-offset-4"
            >
              {output.fileName}
            </a>
          ))}
        </section>
      ) : null}
    </div>
  );
}
