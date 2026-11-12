'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useValidationErrorMap } from '@/i18n/validation';
import { type PresentationScope, presentationsApi } from '@/lib/api/presentations.client';

const formatsSchema = (translateUi: ReturnType<typeof useUiTranslations<'forge'>>) =>
  z.object({ pptx: z.boolean(), pdf: z.boolean() }).refine((value) => value.pptx || value.pdf, {
    message: translateUi('validationOutputFormats'),
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
  const validationErrorMap = useValidationErrorMap();

  const displayLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');

  const form = useForm<z.infer<ReturnType<typeof formatsSchema>>>({
    resolver: zodResolver(formatsSchema(translateUi), {
      error: validationErrorMap,
    }),
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
        {' '}
        {translateUi('create_an_editable_powerpoint_file__ac5b2d6c')}{' '}
      </p>
      {blocked ? (
        <p role="alert" className="text-sm text-destructive">
          {' '}
          {translateUi('resolve_the_blocking_import_issues__55c6d981')}{' '}
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
            <FieldLabel htmlFor="presentation-export-pptx">
              {translateUi('powerpoint_pptx_5fd9ab01')}
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="presentation-export-pdf"
              checked={pdf}
              disabled={busy}
              onCheckedChange={(value) => form.setValue('pdf', value === true)}
            />
            <FieldLabel htmlFor="presentation-export-pdf">
              {translateUi('pdf_pdf_18086e0b')}
            </FieldLabel>
          </Field>
          <FieldError errors={[form.formState.errors.pptx]} />
          {dirty ? (
            <Button type="button" variant="outline" onClick={() => void save()}>
              {' '}
              {translateUi('save_before_exporting_5d93cc9d')}{' '}
            </Button>
          ) : null}
          <Button type="submit" variant="outline" disabled={busy || dirty || blocked}>
            {busy
              ? translateUi('preparing_export_e6b52069')
              : translateUi('review_export_6b5bead6')}
          </Button>
        </FieldGroup>
      </form>
      {preview ? (
        <section
          aria-label={translateUi('export_confirmation_cea4e89d')}
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <h3 className="text-sm font-medium">{translateUi('approve_export_c5934a75')}</h3>
          <p className="text-sm">
            “{title}
            {translateUi('revision_1235355f')} {preview.revision}
            {translateUi('as_45c24a28')}{' '}
            {preview.formats.map((format) => format.toUpperCase()).join(' and ')}.
          </p>
          <p className="text-xs text-muted-foreground">
            {' '}
            {translateUi('approval_expires_c1c99fa7')}{' '}
            {new Date(preview.expiresAt).toLocaleTimeString(displayLocale, {
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            {translateUi('further_edits_require_a_new_review_389f075e')}{' '}
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
            {busy
              ? translateUi('exporting_a2dd9cbb')
              : translateUi('confirm_export_to_files_5ff5ccab')}
          </Button>
        </section>
      ) : null}
      {outputs.length ? (
        <section
          aria-label={translateUi('exported_files_79bcebb0')}
          className="flex flex-col gap-2"
        >
          <h3 className="text-sm font-medium">{translateUi('saved_to_files_5376e7f3')}</h3>
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
