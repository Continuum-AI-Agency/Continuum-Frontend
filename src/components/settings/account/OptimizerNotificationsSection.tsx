'use client';

import type { OptimizerPingDestination, SlackChannel } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import {
  disableOptimizerNotifications,
  getOptimizerNotificationSettings,
  listSlackChannels,
  saveOptimizerNotificationSettings,
} from '@/lib/api/optimizerNotifications.client';

type OptimizerNotificationsSectionProps = {
  brandId: string;
  /** Omitted where the surface has no brand name in scope (the Optimizer tab). */
  brandName?: string;
};

const settingsKey = (brandId: string) => ['optimizer-notifications', brandId] as const;

export function OptimizerNotificationsSection({
  brandId,
  brandName = 'this brand',
}: OptimizerNotificationsSectionProps) {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);

  const settings = useQuery({
    queryKey: settingsKey(brandId),
    queryFn: ({ signal }) => getOptimizerNotificationSettings(brandId, signal),
    staleTime: 15_000,
  });

  const destination = settings.data?.destination ?? null;

  // Only fetched once someone actually picks "a channel" — a workspace listing is a
  // Slack round trip nobody browsing settings should pay for.
  const channels = useQuery({
    queryKey: ['slack-channels'],
    queryFn: ({ signal }) => listSlackChannels(signal),
    enabled: destination === 'channel',
    staleTime: 5 * 60_000,
  });

  const failed = (title: string) => (error: unknown) =>
    show({
      title,
      description: error instanceof Error ? error.message : 'Refresh and try again.',
      variant: 'error',
    });

  const save = useMutation({
    mutationFn: (input: { destination: OptimizerPingDestination; channel?: SlackChannel }) =>
      input.destination === 'dm'
        ? saveOptimizerNotificationSettings(brandId, { destination: 'dm' })
        : saveOptimizerNotificationSettings(brandId, {
            destination: 'channel',
            channelId: input.channel?.id ?? '',
            ...(input.channel?.name ? { channelName: input.channel.name } : {}),
          }),
    onSuccess: (next) => {
      queryClient.setQueryData(settingsKey(brandId), next);
      show({
        title: 'Optimizer notifications updated',
        description:
          next.destination === 'channel'
            ? `Budget changes for ${brandName} will post in #${next.channelName ?? 'the channel you picked'}.`
            : `Budget changes for ${brandName} will arrive in your Slack DMs.`,
        variant: 'success',
      });
    },
    onError: failed('Could not update optimizer notifications'),
  });

  const disable = useMutation({
    mutationFn: () => disableOptimizerNotifications(brandId),
    onSuccess: () => {
      queryClient.setQueryData(settingsKey(brandId), {
        enabled: false,
        destination: null,
        channelId: null,
        channelName: null,
        connectionId: null,
      });
      show({
        title: 'Optimizer notifications off',
        description: `Continuum will not message you about ${brandName}'s budget changes.`,
        variant: 'success',
      });
    },
    onError: failed('Could not switch optimizer notifications off'),
  });

  const busy = save.isPending || disable.isPending;
  const selectedChannel = channels.data?.channels.find(
    (channel) => channel.id === settings.data?.channelId,
  );
  const unreachableChannel = Boolean(
    selectedChannel && selectedChannel.isPrivate && !selectedChannel.isMember,
  );

  if (settings.isLoading) {
    return (
      <div role="status" aria-label="Loading optimizer notification settings" className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div className="flex items-start justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4 text-warning" />
          Optimizer notification settings could not be loaded
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const enabled = Boolean(settings.data?.enabled);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/20 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Tell me when the optimizer moves budget</p>
          <p className="text-xs text-muted-foreground">
            A Slack message each time Continuum changes {brandName}&rsquo;s ad set budgets, with
            what changed and why. Off unless you turn it on.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          aria-label="Optimizer Slack notifications"
          onCheckedChange={(checked) => {
            if (checked) save.mutate({ destination: 'dm' });
            else disable.mutate();
          }}
        />
      </div>

      {enabled ? (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <RadioGroup
            value={destination ?? 'dm'}
            onValueChange={(next) => {
              const chosen = next as OptimizerPingDestination;
              // Switching to "a channel" needs a channel before it can be saved, so this
              // only opens the picker; the save happens when one is chosen.
              if (chosen === 'channel') {
                queryClient.setQueryData(settingsKey(brandId), {
                  ...settings.data,
                  destination: 'channel',
                });
                setChannelPickerOpen(true);
                return;
              }
              save.mutate({ destination: 'dm' });
            }}
          >
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="dm" disabled={busy} />
              Send it to me as a direct message
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="channel" disabled={busy} />
              Post it in a Slack channel
            </Label>
          </RadioGroup>

          {destination === 'channel' ? (
            <div className="space-y-2">
              <Popover open={channelPickerOpen} onOpenChange={setChannelPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={channelPickerOpen}
                      aria-label="Slack channel"
                      disabled={busy}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {settings.data?.channelName
                          ? `#${settings.data.channelName}`
                          : 'Pick a channel'}
                      </span>
                      <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  }
                />
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search channels…" />
                    <CommandList>
                      <CommandEmpty>
                        {channels.isLoading
                          ? 'Loading channels…'
                          : channels.isError
                            ? 'Slack did not return a channel list.'
                            : 'No channel found.'}
                      </CommandEmpty>
                      <CommandGroup>
                        {(channels.data?.channels ?? []).map((channel) => (
                          <CommandItem
                            key={channel.id}
                            value={channel.name}
                            onSelect={() => {
                              setChannelPickerOpen(false);
                              save.mutate({ destination: 'channel', channel });
                            }}
                          >
                            <CheckIcon
                              className={
                                channel.id === settings.data?.channelId
                                  ? 'mr-2 size-4 opacity-100'
                                  : 'mr-2 size-4 opacity-0'
                              }
                            />
                            <span className="truncate">#{channel.name}</span>
                            {channel.isPrivate ? (
                              <Lock className="ml-auto size-3 text-muted-foreground" />
                            ) : null}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {unreachableChannel ? (
                <p className="flex items-start gap-2 text-xs leading-5 text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Continuum is not in #{selectedChannel?.name}. Invite the Continuum app to that
                  channel in Slack, or these messages will not arrive.
                </p>
              ) : (
                // Slack only lists a private channel to an app that is already in it, so a
                // missing private channel looks identical to one that does not exist.
                <p className="text-xs leading-5 text-muted-foreground">
                  Private channels appear here only after you invite the Continuum app to them in
                  Slack.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
