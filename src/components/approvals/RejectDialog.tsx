'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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

const schema = z.object({
  reason: z.string().min(3, 'Tell the rule engine why — at least 3 characters.').max(2000),
});

type RejectFormValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
  busy?: boolean;
  actionLabel: string;
};

export function RejectDialog({ open, onOpenChange, onConfirm, busy, actionLabel }: Props) {
  const form = useForm<RejectFormValues>({
    resolver: zodResolver(schema),
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
          <DialogTitle>Reject this action</DialogTitle>
          <DialogDescription>
            {actionLabel}. The reason is stored on the audit row and surfaces to whoever reviews
            this rule next.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      autoFocus
                      placeholder="Strategy change — keeping this ad live"
                      rows={4}
                      {...field}
                    />
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
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? 'Rejecting…' : 'Reject'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
