'use client';

// Edit Sheet for an automation. Mounted once per chat surface with the
// surface's agent fixed; the only way in is the detail sheet's Edit action, so
// there is always an automation loaded — creation lives in the automation
// workspace, not here.

import type { AgentTarget, Automation } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { useAutomation, useUpdateAutomation } from '@/lib/automations/automations';
import { browserTimezone } from '@/lib/automations/schedule';
import { useAutomationSheetStore } from '@/lib/automations/sheet-store';
import {
  type AutomationBuilderFormValues,
  builderFormSchema,
  scheduleToFormFields,
  toRecipients,
  toSchedule,
} from './AutomationBuilder/builderFormSchema';
import { RecipientsFields } from './AutomationBuilder/RecipientsFields';
import { ScheduleFields } from './AutomationBuilder/ScheduleFields';

const AGENT_LABELS: Record<AgentTarget, string> = {
  jaina: 'Jaina · Paid media',
  organic: 'Organic agent',
};

const emptyFormValues = (): AutomationBuilderFormValues => ({
  name: '',
  prompt: '',
  scheduleKind: 'weekly',
  time: '09:00',
  dayOfWeek: 1,
  dayOfMonth: 1,
  timezone: browserTimezone(),
  cronExpr: '',
  memberUserIds: [],
  externalEmails: [],
  enabled: true,
});

const automationToFormValues = (automation: Automation): AutomationBuilderFormValues => ({
  name: automation.name,
  prompt: automation.prompt,
  ...scheduleToFormFields(automation.schedule),
  memberUserIds: automation.recipients.memberUserIds,
  externalEmails: automation.recipients.externalEmails,
  enabled: automation.enabled,
});

type AutomationBuilderSheetProps = {
  agent: AgentTarget;
  brandId: string | null;
};

export function AutomationBuilderSheet({ agent, brandId }: AutomationBuilderSheetProps) {
  const { show } = useToast();
  const builderOpen = useAutomationSheetStore((state) => state.builderOpen);
  const editAutomationId = useAutomationSheetStore((state) => state.editAutomationId);
  const close = useAutomationSheetStore((state) => state.close);

  const { data: editAutomation } = useAutomation(editAutomationId ?? undefined);
  const updateMutation = useUpdateAutomation(brandId ?? undefined);

  // Two surfaces mount their own instance; only the one whose agent matches the
  // loaded automation responds.
  const isOwnedByThisSurface = editAutomation?.agent === agent;
  const open = builderOpen && isOwnedByThisSurface && Boolean(brandId);

  const form = useForm<AutomationBuilderFormValues>({
    resolver: zodResolver(builderFormSchema),
    defaultValues: emptyFormValues(),
  });

  useEffect(() => {
    if (!open || !editAutomation) return;
    form.reset(automationToFormValues(editAutomation));
  }, [open, editAutomation, form]);

  if (!brandId) return null;

  const onSubmit = async (values: AutomationBuilderFormValues) => {
    if (!editAutomationId) return;
    try {
      await updateMutation.mutateAsync({
        automationId: editAutomationId,
        patch: {
          name: values.name,
          prompt: values.prompt,
          schedule: toSchedule(values),
          recipients: toRecipients(values),
          enabled: values.enabled,
        },
      });
      show({ title: 'Automation updated', variant: 'success' });
      close();
    } catch (error) {
      show({
        title: 'Could not update automation',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'error',
      });
    }
  };

  const isSubmitting = updateMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit automation</SheetTitle>
          <SheetDescription>
            {AGENT_LABELS[agent]} runs this prompt on a schedule and emails the report to your
            recipients.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col gap-6 px-4 pb-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Weekly performance report" maxLength={120} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={8}
                      placeholder="What should the agent analyze and report on each run?"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Runs exactly as written — skills and @-mentions are not applied to scheduled
                    runs yet.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <div>
              <h3 className="mb-3 text-sm font-medium">Schedule</h3>
              <ScheduleFields control={form.control} />
            </div>

            <Separator />
            <div>
              <h3 className="mb-3 text-sm font-medium">Email recipients</h3>
              <RecipientsFields brandId={brandId} control={form.control} />
            </div>

            <Separator />
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>Enabled</FormLabel>
                    <FormDescription>Runs on schedule and emails the report.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <SheetFooter className="mt-auto flex-row justify-end gap-2 px-0">
              <Button type="button" variant="ghost" onClick={close} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save changes'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
