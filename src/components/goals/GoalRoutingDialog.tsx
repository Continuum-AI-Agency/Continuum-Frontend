'use client';

import {
  type UpsertGoalCapabilityRouteRequest,
  upsertGoalCapabilityRouteRequestSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useValidationErrorMap } from '@/i18n/validation';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { goalControlLabel } from './goalControlLabels';

const NONE = '__none__';

type RouteFormInput = z.input<typeof upsertGoalCapabilityRouteRequestSchema>;

export function GoalRoutingDialog({
  goal,
  requiredCapabilities,
  onSave,
}: {
  goal: GoalWorkspaceView;
  requiredCapabilities: readonly string[];
  onSave: (input: UpsertGoalCapabilityRouteRequest) => Promise<boolean>;
}) {
  const uiText = useTranslations('dashboard');
  const validationErrorMap = useValidationErrorMap();
  const [open, setOpen] = useState(false);
  const people = goal.participants.filter((participant) => participant.actor.kind === 'human');
  const form = useForm<RouteFormInput, unknown, UpsertGoalCapabilityRouteRequest>({
    resolver: zodResolver(upsertGoalCapabilityRouteRequestSchema, { error: validationErrorMap }),
    defaultValues: {
      capability: requiredCapabilities[0] ?? 'strategy',
      primaryUserId: '',
      scope: 'goal',
    },
  });
  const capability = form.watch('capability');

  useEffect(() => {
    const existing =
      goal.capabilityRoutes.find(
        (route) => route.capability === capability && route.goalId === goal.id,
      ) ??
      goal.capabilityRoutes.find(
        (route) => route.capability === capability && route.goalId === undefined,
      );
    form.reset({
      capability,
      primaryUserId: existing?.primaryUserId ?? '',
      backupUserId: existing?.backupUserId,
      escalationUserId: existing?.escalationUserId,
      scope: existing?.goalId ? 'goal' : 'brand',
      slaHours: existing?.slaHours,
    });
  }, [capability, form, goal.capabilityRoutes, goal.id]);

  const submit = form.handleSubmit(async (input) => {
    if (await onSave(input)) setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-2xs">
            <Settings2 className="size-3" />
            {uiText('m_792c81a4cf')}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{uiText('route_goal_stakeholders_eb69e14')}</DialogTitle>
          <DialogDescription>
            {uiText('resolve_each_capability_to_one_primary_owner__29935c0')}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Controller
            control={form.control}
            name="capability"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="goal-route-capability">
                  {uiText('capability_5faf58a')}
                </label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="goal-route-capability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requiredCapabilities.map((value) => (
                      <SelectItem key={value} value={value}>
                        {goalControlLabel(value, uiText)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          {(['primaryUserId', 'backupUserId', 'escalationUserId'] as const).map((fieldName) => (
            <Controller
              key={fieldName}
              control={form.control}
              name={fieldName}
              render={({ field }) => (
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor={`goal-route-${fieldName}`}>
                    {fieldName === 'primaryUserId'
                      ? uiText('m_e55cfc9e4e')
                      : fieldName === 'backupUserId'
                        ? uiText('m_c81353c144')
                        : uiText('m_da98e3129d')}
                  </label>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(value) => field.onChange(value === NONE ? undefined : value)}
                  >
                    <SelectTrigger id={`goal-route-${fieldName}`}>
                      <SelectValue placeholder={uiText('choose_a_teammate_7c42b83')} />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldName !== 'primaryUserId' ? (
                        <SelectItem value={NONE}>{uiText('none_dc937b5')}</SelectItem>
                      ) : null}
                      {people.map((participant) =>
                        participant.actor.kind === 'human' ? (
                          <SelectItem key={participant.id} value={participant.actor.userId}>
                            {participant.name}
                          </SelectItem>
                        ) : null,
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />
          ))}
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="goal-route-scope">
                  {uiText('save_as_60af8a3')}
                </label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="goal-route-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goal">{uiText('this_goal_override_02de8fe')}</SelectItem>
                    <SelectItem value="brand">{uiText('brand_default_7a0bec8')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          {Object.keys(form.formState.errors).length > 0 ? (
            <p className="text-sm text-destructive">{uiText('m_350350d40a')}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {uiText('cancel_19766ed')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? uiText('saving_23e3929')
                : uiText('save_route_c840788')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
