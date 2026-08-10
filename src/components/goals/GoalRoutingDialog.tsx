'use client';

import {
  type UpsertGoalCapabilityRouteRequest,
  upsertGoalCapabilityRouteRequestSchema,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Settings2 } from 'lucide-react';
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
import type { GoalWorkspaceView } from '@/lib/goals/models';

const NONE = '__none__';

const label = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());

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
  const [open, setOpen] = useState(false);
  const people = goal.participants.filter((participant) => participant.actor.kind === 'human');
  const form = useForm<RouteFormInput, unknown, UpsertGoalCapabilityRouteRequest>({
    resolver: zodResolver(upsertGoalCapabilityRouteRequestSchema),
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
            Configure
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Route Goal stakeholders</DialogTitle>
          <DialogDescription>
            Resolve each capability to one primary owner, one SLA backup, and one escalation owner.
            Goal overrides are local; brand defaults require owner or admin authority.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Controller
            control={form.control}
            name="capability"
            render={({ field }) => (
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="goal-route-capability">
                  Capability
                </label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="goal-route-capability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requiredCapabilities.map((value) => (
                      <SelectItem key={value} value={value}>
                        {label(value)}
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
                      ? 'Primary owner'
                      : fieldName === 'backupUserId'
                        ? 'SLA backup'
                        : 'Escalation owner'}
                  </label>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(value) => field.onChange(value === NONE ? undefined : value)}
                  >
                    <SelectTrigger id={`goal-route-${fieldName}`}>
                      <SelectValue placeholder="Choose a teammate" />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldName !== 'primaryUserId' ? (
                        <SelectItem value={NONE}>None</SelectItem>
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
                  Save as
                </label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="goal-route-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goal">This Goal override</SelectItem>
                    <SelectItem value="brand">Brand default</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          {form.formState.errors.root ? (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save route'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
