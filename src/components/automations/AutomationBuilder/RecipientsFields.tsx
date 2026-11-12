'use client';

import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useRecipientCandidates } from '@/lib/automations/automations';
import { automationControlLabel } from '../workspace/automationControlLabels';
import type { AutomationBuilderFormValues } from './builderFormSchema';
import { ExternalEmailChipsInput } from './ExternalEmailChipsInput';

type RecipientsFieldsProps = {
  brandId: string;
  control: Control<AutomationBuilderFormValues>;
};

export function RecipientsFields({ brandId, control }: RecipientsFieldsProps) {
  const uiText = useTranslations('automations');
  const { data: candidates, isLoading } = useRecipientCandidates(brandId);

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="memberUserIds"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{uiText('workspace_members_ab95d45')}</FormLabel>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full bg-muted/70" />
                <Skeleton className="h-9 w-full bg-muted/70" />
              </div>
            ) : !candidates || candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {uiText('no_members_with_an_email_on_this_brand_c3eb0b6')}
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
                        <p className="text-xs capitalize text-muted-foreground">
                          {automationControlLabel(candidate.role, uiText)}
                        </p>
                      </div>
                      <Switch
                        checked={checked}
                        aria-label={uiText('m_9034f0bc9a', { email: candidate.email })}
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
            <FormLabel>{uiText('external_stakeholders_c3fb740')}</FormLabel>
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
