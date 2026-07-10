'use client';

import { ChevronDownIcon } from 'lucide-react';
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
            <FormLabel>Frequency</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="How often" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="cron">Custom (cron)</SelectItem>
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
              <FormLabel>Day of week</FormLabel>
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
                      aria-label={day.label}
                      className="px-2.5 text-xs"
                    >
                      {day.label}
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
              <FormLabel>Day of month</FormLabel>
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
              <FormLabel>Time</FormLabel>
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
              <FormLabel>Cron expression</FormLabel>
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
            <FormLabel>Timezone</FormLabel>
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
            Advanced: switch to a raw cron expression
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <p className="text-xs text-muted-foreground">
              Pick “Custom (cron)” under Frequency to enter any 5-field cron expression (minimum
              interval 15 minutes).
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {previewSchedule && <NextRunsPreview schedule={previewSchedule} />}
    </div>
  );
}
