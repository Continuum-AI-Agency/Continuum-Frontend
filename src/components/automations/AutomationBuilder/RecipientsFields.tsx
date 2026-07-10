'use client';

import type { Control } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useRecipientCandidates } from '@/lib/automations/automations';
import type { AutomationBuilderFormValues } from './builderFormSchema';
import { ExternalEmailChipsInput } from './ExternalEmailChipsInput';

type RecipientsFieldsProps = {
  brandId: string;
  control: Control<AutomationBuilderFormValues>;
};

export function RecipientsFields({ brandId, control }: RecipientsFieldsProps) {
  const { data: candidates, isLoading } = useRecipientCandidates(brandId);

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="memberUserIds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Workspace members</FormLabel>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full bg-muted/70" />
                <Skeleton className="h-9 w-full bg-muted/70" />
              </div>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No members with an email on this brand.
              </p>
            ) : (
              <div className="space-y-1">
                {candidates.map((candidate) => {
                  const checked = field.value.includes(candidate.userId);
                  return (
                    <div
                      key={candidate.userId}
                      className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{candidate.email}</p>
                        <p className="text-xs capitalize text-muted-foreground">{candidate.role}</p>
                      </div>
                      <Switch
                        checked={checked}
                        aria-label={`Email report to ${candidate.email}`}
                        onCheckedChange={(next) =>
                          field.onChange(
                            next
                              ? [...field.value, candidate.userId]
                              : field.value.filter((id) => id !== candidate.userId),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="externalEmails"
        render={({ field }) => (
          <FormItem>
            <FormLabel>External stakeholders</FormLabel>
            <FormControl>
              <ExternalEmailChipsInput value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
