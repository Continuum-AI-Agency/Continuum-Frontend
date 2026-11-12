'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import { PageHeader } from '@/components/shared/PageHeader';
import { Panel } from '@/components/shared/Panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { fetchHyperframesFilmFields, renderHyperframesFilm } from '@/lib/library/hyperframesFilm';

const problem = (error: unknown) =>
  error instanceof Error ? error.message : 'The template could not be rendered.';

/** An uploaded HyperFrames template, its copy edited, rendered to a Library film. */
export function HyperframesFilmPanel({
  brandId,
  assetId,
  name,
  onBack,
}: {
  brandId: string;
  assetId: string;
  name: string;
  onBack?: () => void;
}) {
  const translateUi = useUiTranslations('forge');

  const fields = useQuery({
    queryKey: forgeQueryKeys.hyperframesFilmFields(brandId, assetId),
    queryFn: ({ signal }) => fetchHyperframesFilmFields(brandId, assetId, signal),
    staleTime: Infinity,
    retry: false,
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const film = useMutation({
    mutationFn: () =>
      renderHyperframesFilm(assetId, {
        brandId,
        edits: (fields.data ?? []).flatMap((field) => {
          const value = values[field.id];
          return value !== undefined && value !== field.value ? [{ fieldId: field.id, value }] : [];
        }),
      }),
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PageHeader
        title={name}
        description={translateUi('hyperframes_template_00f25313')}
        action={
          <>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                {' '}
                {translateUi('back_to_templates_1b58f427')}{' '}
              </Button>
            ) : null}
            <Button disabled={!fields.data || film.isPending} onClick={() => film.mutate()}>
              {film.isPending
                ? translateUi('rendering_6241b615')
                : translateUi('render_film_36e33035')}
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <Panel
          title={translateUi('copy_e21f935f')}
          bodyClassName="flex flex-col gap-3 overflow-y-auto"
        >
          {fields.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{translateUi('template_copy_is_unavailable_e3f53cc5')}</AlertTitle>
              <AlertDescription>{problem(fields.error)}</AlertDescription>
            </Alert>
          ) : !fields.data ? (
            <Skeleton className="h-40" />
          ) : fields.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {' '}
              {translateUi('this_template_has_no_editable_copy__7c845ef8')}{' '}
            </p>
          ) : (
            <FieldGroup>
              {fields.data.map((field, index) => (
                <Field key={field.id}>
                  <FieldLabel htmlFor={`hyperframes-copy-${index}`}>
                    {translateUi('copy_e21f935f')} {index + 1}
                  </FieldLabel>
                  <Textarea
                    id={`hyperframes-copy-${index}`}
                    rows={2}
                    maxLength={10_000}
                    value={values[field.id] ?? field.value}
                    disabled={film.isPending}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }))
                    }
                  />
                </Field>
              ))}
            </FieldGroup>
          )}
        </Panel>
        <Panel title={translateUi('film_113af979')} bodyClassName="flex flex-col gap-3">
          {film.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{translateUi('the_film_did_not_render_dbeae43d')}</AlertTitle>
              <AlertDescription>{problem(film.error)}</AlertDescription>
            </Alert>
          ) : null}
          {film.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {' '}
              {translateUi('rendering_every_frame_a_short_templ_3b64d915')}{' '}
            </p>
          ) : film.data ? (
            <>
              {/* biome-ignore lint/a11y/useMediaCaption: a rendered motion template has no caption track */}
              <video src={film.data.url} controls className="w-full rounded-md bg-black" />
              <p className="text-sm text-muted-foreground">
                {translateUi('saved_to_the_library_ea513d03')}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {' '}
              {translateUi('render_the_template_to_see_it_play__d0eff61e')}{' '}
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
