'use client';

import type { PresentationCommand } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

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
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
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
          <FieldLabel htmlFor="presentation-font-original">Missing typeface</FieldLabel>
          <Input id="presentation-font-original" disabled={busy} {...form.register('from')} />
          <FieldError errors={[form.formState.errors.from]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="presentation-font-replacement">Replacement typeface</FieldLabel>
          <Input id="presentation-font-replacement" disabled={busy} {...form.register('to')} />
          <FieldError errors={[form.formState.errors.to]} />
        </Field>
        <p className="text-xs text-muted-foreground">
          This explicitly replaces the missing typeface throughout the deck. Review slide previews
          before exporting.
        </p>
        <Button type="submit" variant="outline" disabled={busy}>
          Apply font mapping
        </Button>
      </FieldGroup>
    </form>
  );
}
