'use client';

import { type DocumentRenameInput, documentRenameSchema } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
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
  const form = useForm<DocumentRenameInput>({
    resolver: zodResolver(documentRenameSchema),
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
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>
            Changes the name shown here and to agents. The original file is unchanged.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
