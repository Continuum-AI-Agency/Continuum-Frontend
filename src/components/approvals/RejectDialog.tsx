'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import { useValidationErrorMap } from '@/i18n/validation';

const rejectSchema = (translate: ReturnType<typeof useTranslations<'common'>>) =>
  z.object({
    reason: z
      .string()
      .min(3, translate('validationRejectReasonMin', { count: 3 }))
      .max(2000),
  });

type RejectFormValues = z.infer<ReturnType<typeof rejectSchema>>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
  busy?: boolean;
  actionLabel: string;
};

export function RejectDialog({ open, onOpenChange, onConfirm, busy, actionLabel }: Props) {
  const uiText = useTranslations('common');
  const validationErrorMap = useValidationErrorMap();
  const schema = React.useMemo(() => rejectSchema(uiText), [uiText]);
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(schema, { error: validationErrorMap }),
    defaultValues: { reason: '' },
  });

  React.useEffect(() => {
    if (!open) form.reset({ reason: '' });
  }, [open, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onConfirm(values.reason);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{uiText('m_8c25acaf7f')}</DialogTitle>
          <DialogDescription>
            {actionLabel}
            {uiText('m_03a05b2f5a')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{uiText('reason_f81ab83')}</FormLabel>
                  <FormControl>
                    <Textarea autoFocus placeholder={uiText('m_d2faf5d583')} rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {uiText('cancel_19766ed')}
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? uiText('m_812b8d2a3b') : uiText('reject_ab604a3')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
