'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Presentation } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast-imperative';
import { presentationsApi } from '@/lib/api/presentations.client';

const schema = z.object({ title: z.string().trim().min(1, 'Name your presentation.').max(2000) });
export function NewPresentationButton({
  brandId,
  onCreated,
}: {
  brandId: string;
  onCreated: (assetId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { title: '' },
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
      >
        <Presentation data-icon="inline-start" />
        Create presentation
      </Button>
      {open ? (
        <form
          onSubmit={form.handleSubmit(async (values) => {
            setBusy(true);
            try {
              const result = await presentationsApi.create(
                brandId,
                values.title,
                crypto.randomUUID(),
              );
              await onCreated(result.assetId);
            } catch (reason) {
              toast.error(
                reason instanceof Error ? reason.message : 'The presentation could not be created.',
              );
            } finally {
              setBusy(false);
            }
          })}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-presentation-title">Deck name</FieldLabel>
              <Input id="new-presentation-title" disabled={busy} {...form.register('title')} />
              <FieldError errors={[form.formState.errors.title]} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create blank deck'}
            </Button>
          </FieldGroup>
        </form>
      ) : null}
    </div>
  );
}
