'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
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
        description="HyperFrames template"
        action={
          <>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                Back to templates
              </Button>
            ) : null}
            <Button disabled={!fields.data || film.isPending} onClick={() => film.mutate()}>
              {film.isPending ? 'Rendering…' : 'Render film'}
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <Panel title="Copy" bodyClassName="flex flex-col gap-3 overflow-y-auto">
          {fields.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Template copy is unavailable</AlertTitle>
              <AlertDescription>{problem(fields.error)}</AlertDescription>
            </Alert>
          ) : !fields.data ? (
            <Skeleton className="h-40" />
          ) : fields.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This template has no editable copy. It renders as uploaded.
            </p>
          ) : (
            <FieldGroup>
              {fields.data.map((field, index) => (
                <Field key={field.id}>
                  <FieldLabel htmlFor={`hyperframes-copy-${index}`}>Copy {index + 1}</FieldLabel>
                  <Textarea
                    id={`hyperframes-copy-${index}`}
                    rows={2}
                    maxLength={10_000}
                    value={values[field.id] ?? field.value}
                    disabled={film.isPending}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.id]: event.target.value }))
                    }
                  />
                </Field>
              ))}
            </FieldGroup>
          )}
        </Panel>
        <Panel title="Film" bodyClassName="flex flex-col gap-3">
          {film.isError ? (
            <Alert variant="destructive">
              <AlertTitle>The film did not render</AlertTitle>
              <AlertDescription>{problem(film.error)}</AlertDescription>
            </Alert>
          ) : null}
          {film.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Rendering every frame. A short template takes about a minute.
            </p>
          ) : film.data ? (
            <>
              {/* biome-ignore lint/a11y/useMediaCaption: a rendered motion template has no caption track */}
              <video src={film.data.url} controls className="w-full rounded-md bg-black" />
              <p className="text-sm text-muted-foreground">Saved to the Library.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Render the template to see it play. Each render is saved to the Library.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
