'use client';

import { ChevronDownIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type AutomationBuilderFormValues, toSchedule } from './builderFormSchema';
import { NextRunsPreview } from './NextRunsPreview';
import { TimezoneCombobox } from './TimezoneCombobox';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

// Day-of-month is capped at 28 so monthly schedules never skip short months.
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function ScheduleFields({ control }: { control: Control<AutomationBuilderFormValues> }) {
  const uiText = useTranslations('automations');
  const uiLocale = useLocale();
  const weekday = new Intl.DateTimeFormat(uiLocale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const values = useWatch({ control });
  const scheduleKind = values.scheduleKind ?? 'daily';

  const previewSchedule =
    values.time && values.timezone
      ? toSchedule({
          name: '',
          prompt: '',
          scheduleKind,
          time: values.time,
          dayOfWeek: values.dayOfWeek ?? 1,
          dayOfMonth: values.dayOfMonth ?? 1,
          timezone: values.timezone,
          cronExpr: values.cronExpr ?? '',
          memberUserIds: [],
          externalEmails: [],
          enabled: true,
        })
      : null;

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="scheduleKind"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{uiText('frequency_16b6668')}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={uiText('how_often_7710cdf')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="daily">{uiText('daily_b36c261')}</SelectItem>
                <SelectItem value="weekly">{uiText('weekly_2975132')}</SelectItem>
                <SelectItem value="monthly">{uiText('monthly_9b11f6b')}</SelectItem>
                <SelectItem value="cron">{uiText('custom_cron_6dc53fd')}</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {scheduleKind === 'weekly' && (
        <FormField
          control={control}
          name="dayOfWeek"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uiText('day_of_week_a757b22')}</FormLabel>
              <FormControl>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="justify-start"
                  value={String(field.value)}
                  onValueChange={(value) => {
                    if (value) field.onChange(Number(value));
                  }}
                >
                  {WEEKDAYS.map((day) => (
                    <ToggleGroupItem
                      key={day.value}
                      value={String(day.value)}
                      aria-label={weekday.format(new Date(Date.UTC(2024, 0, 7 + day.value)))}
                      className="px-2.5 text-xs"
                    >
                      {weekday.format(new Date(Date.UTC(2024, 0, 7 + day.value)))}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {scheduleKind === 'monthly' && (
        <FormField
          control={control}
          name="dayOfMonth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uiText('day_of_month_d15f472')}</FormLabel>
              <Select
                value={String(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <FormControl>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="max-h-64">
                  {MONTH_DAYS.map((day) => (
                    <SelectItem key={day} value={String(day)}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {scheduleKind !== 'cron' && (
        <FormField
          control={control}
          name="time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uiText('time_33b9347')}</FormLabel>
              <FormControl>
                <Input type="time" className="w-32" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {scheduleKind === 'cron' && (
        <FormField
          control={control}
          name="cronExpr"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{uiText('cron_expression_9e6e7de')}</FormLabel>
              <FormControl>
                <Input placeholder="0 9 * * 1-5" className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={control}
        name="timezone"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{uiText('timezone_4ceca1d')}</FormLabel>
            <FormControl>
              <TimezoneCombobox value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {scheduleKind !== 'cron' && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDownIcon className="size-3.5" />
            {uiText('advanced_switch_to_a_raw_cron_expression_b8aae0b')}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <p className="text-xs text-muted-foreground">
              {uiText('pick_custom_cron_under_frequency_to_enter_any_bd7ee49')}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {previewSchedule && <NextRunsPreview schedule={previewSchedule} />}
    </div>
  );
}
