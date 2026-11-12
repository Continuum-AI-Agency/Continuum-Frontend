'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Presentation } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast-imperative';
import { useValidationErrorMap } from '@/i18n/validation';
import { presentationsApi } from '@/lib/api/presentations.client';

const schema = (translateUi: ReturnType<typeof useUiTranslations<'forge'>>) =>
  z.object({
    title: z.string().trim().min(1, translateUi('validationPresentationName')).max(2000),
  });
export function NewPresentationButton({
  brandId,
  onCreated,
}: {
  brandId: string;
  onCreated: (assetId: string) => Promise<void>;
}) {
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<ReturnType<typeof schema>>>({
    resolver: zodResolver(schema(translateUi), { error: validationErrorMap }),
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
        <Presentation data-icon="inline-start" /> {translateUi('create_presentation_b4fd9a4b')}{' '}
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
                reason instanceof Error
                  ? reason.message
                  : translateUi('the_presentation_could_not_be_creat_327baa85'),
              );
            } finally {
              setBusy(false);
            }
          })}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-presentation-title">
                {translateUi('deck_name_9da9a1e0')}
              </FieldLabel>
              <Input id="new-presentation-title" disabled={busy} {...form.register('title')} />
              <FieldError errors={[form.formState.errors.title]} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? translateUi('creating_c79ed949') : translateUi('create_blank_deck_ecd5738b')}
            </Button>
          </FieldGroup>
        </form>
      ) : null}
    </div>
  );
}
