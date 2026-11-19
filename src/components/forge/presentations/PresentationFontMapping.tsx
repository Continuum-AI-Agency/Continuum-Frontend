'use client';

import type { PresentationCommand } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useValidationErrorMap } from '@/i18n/validation';

const schema = z.object({
  from: z.string().trim().min(1).max(200),
  to: z.string().trim().min(1).max(200),
});
export function PresentationFontMapping({
  busy,
  onCommands,
}: {
  busy: boolean;
  onCommands: (commands: PresentationCommand[]) => Promise<boolean>;
}) {
  const validationErrorMap = useValidationErrorMap();

  const translateUi = useUiTranslations('forge');

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema, { error: validationErrorMap }),
    defaultValues: { from: '', to: 'Inter' },
  });
  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        await onCommands([{ type: 'font.map', ...values }]);
      })}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="presentation-font-original">
            {translateUi('missing_typeface_12070f82')}
          </FieldLabel>
          <Input id="presentation-font-original" disabled={busy} {...form.register('from')} />
          <FieldError errors={[form.formState.errors.from]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="presentation-font-replacement">
            {translateUi('replacement_typeface_e6d113df')}
          </FieldLabel>
          <Input id="presentation-font-replacement" disabled={busy} {...form.register('to')} />
          <FieldError errors={[form.formState.errors.to]} />
        </Field>
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('this_explicitly_replaces_the_missin_2073f8d0')}{' '}
        </p>
        <Button type="submit" variant="outline" disabled={busy}>
          {' '}
          {translateUi('apply_font_mapping_f12df7a0')}{' '}
        </Button>
      </FieldGroup>
    </form>
  );
}
