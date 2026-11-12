'use client';

import { createDocumentRenameSchema, type DocumentRenameInput } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useValidationErrorMap } from '@/i18n/validation';

// Renames the user-facing label only. The stored filename that storage_path was built
// from is untouched, so a rename can never invalidate a signed URL or orphan an object.
export function RenameDocumentDialog({
  open,
  currentName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  currentName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (displayName: string) => Promise<void>;
}) {
  const uiText = useTranslations('common');
  const validationErrorMap = useValidationErrorMap();
  const renameSchema = useMemo(
    () =>
      createDocumentRenameSchema({
        required: uiText('validationRequired'),
        tooLong: uiText('validationMaxCharacters', { count: 255 }),
      }),
    [uiText],
  );
  const form = useForm<DocumentRenameInput>({
    resolver: zodResolver(renameSchema, { error: validationErrorMap }),
    defaultValues: { displayName: currentName },
  });

  // Reopening on a different row must not keep the previous row's draft.
  useEffect(() => {
    if (open) form.reset({ displayName: currentName });
  }, [open, currentName, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values.displayName);
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uiText('m_632855734f')}</DialogTitle>
          <DialogDescription>{uiText('m_c790cdbbb1')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uiText('name_dcd1d52')}</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                {uiText('cancel_19766ed')}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? uiText('saving_23e3929') : uiText('save_1509f56')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
