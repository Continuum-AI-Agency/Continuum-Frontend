'use client';

import type { ApiRenderSlackChannel, OptimizerPingDestination } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronsUpDownIcon, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { ApiError } from '@/lib/api/errors';
import {
  disableOptimizerNotifications,
  getOptimizerNotificationSettings,
  saveOptimizerNotificationSettings,
} from '@/lib/api/optimizerNotifications.client';
import { SLACK_SETTINGS_PATH } from '@/lib/api/slackWorkspaces.client';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

type OptimizerNotificationsSectionProps = {
  brandId: string;
  /** Omitted where the surface has no brand name in scope (the Optimizer tab). */
  brandName?: string;
};

const settingsKey = (brandId: string) => ['optimizer-notifications', brandId] as const;

export function OptimizerNotificationsSection({
  brandId,
  brandName: providedBrandName,
}: OptimizerNotificationsSectionProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('common');
  const brandName = providedBrandName ?? tUi('m_0380f51a7b');

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
  // Slack round trip nobody browsing settings should pay for. The channels are the brand's own
  // connected workspaces, the same list Forge picks delivery channels from.
  const channels = useQuery({
    queryKey: ['slack-channels', brandId],
    queryFn: () => apiRendersApi.listSlackChannels(brandId),
    enabled: destination === 'channel',
    staleTime: 5 * 60_000,
  });

  const failed = (title: string) => (error: unknown) =>
    show({
      title,
      description: error instanceof Error ? uiErrorMessage(error) : tUi('m_41848a0e55'),
      variant: 'error',
    });

  const save = useMutation({
    mutationFn: (input: {
      destination: OptimizerPingDestination;
      channel?: ApiRenderSlackChannel;
    }) =>
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
        title: tUi('m_ee3437a5eb'),
        description:
          next.destination === 'channel'
            ? tUi('m_554acd5a3e', {
                v0: String(brandName),
                v1: String(next.channelName ?? tUi('m_2900885654')),
              })
            : tUi('m_6bee1b3e66', { v0: String(brandName) }),
        variant: 'success',
      });
    },
    onError: failed(tUi('m_076a4d35b7')),
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
        title: tUi('m_8477db5358'),
        description: tUi('m_c997323464', { v0: String(brandName) }),
        variant: 'success',
      });
    },
    onError: failed(tUi('m_7b966cdd81')),
  });

  const busy = save.isPending || disable.isPending;
  const selectedChannel = channels.data?.channels.find(
    (channel) => channel.id === settings.data?.channelId,
  );
  const unreachableChannel = Boolean(
    selectedChannel && selectedChannel.isPrivate && !selectedChannel.isMember,
  );
  // 409: no Slack workspace connected to (or still installed for) the brand; 403: not allowed
  // to list its channels. Either way the fix is in the brand's Slack settings.
  const slackNotReady =
    channels.error instanceof ApiError && [403, 409].includes(channels.error.status)
      ? channels.error
      : null;

  if (settings.isLoading) {
    return (
      <div role="status" aria-label={tUi('m_f0cb7c5817')} className="space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <div className="flex items-start justify-between gap-4 py-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4 text-warning" />
          {tUi('m_79d2c54296')}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void settings.refetch()}>
          {tUi('m_9f5cd8a2e8')}
        </Button>
      </div>
    );
  }

  const enabled = Boolean(settings.data?.enabled);

  return (
    <div className="divide-y divide-border/60">
      <div className="flex items-center justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">{tUi('m_79d11adae6')}</p>
          <p className="text-xs text-muted-foreground">
            {tUi('m_d1fa9a99c1')}
            {brandName}
            {tUi('m_adc8328c1c')}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy}
          aria-label={tUi('m_dedf5fc3f6')}
          onCheckedChange={(checked) => {
            if (checked) save.mutate({ destination: 'dm' });
            else disable.mutate();
          }}
        />
      </div>

      {enabled ? (
        <div className="space-y-3 py-3">
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
              {tUi('m_4dba23b229')}
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="channel" disabled={busy} />
              {tUi('m_6690196403')}
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
                      aria-label={tUi('m_11670ab399')}
                      disabled={busy}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate">
                        {settings.data?.channelName
                          ? tUi('m_748dde3000', { v0: String(settings.data.channelName) })
                          : tUi('m_de93ca88d2')}
                      </span>
                      <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  }
                />
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={tUi('m_61d6e4198e')} />
                    <CommandList>
                      <CommandEmpty>
                        {channels.isLoading
                          ? tUi('m_293b4ed20a')
                          : channels.isError
                            ? tUi('m_685a8cf38c')
                            : tUi('m_f30e4e5025')}
                      </CommandEmpty>
                      <CommandGroup>
                        {(channels.data?.channels ?? []).map((channel) => (
                          <CommandItem
                            // A Slack Connect channel keeps its id in every workspace it is shared into.
                            key={`${channel.workspaceName ?? ''}:${channel.id}`}
                            value={`${channel.name} ${channel.workspaceName ?? ''}`}
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
                            {channel.workspaceName ? (
                              <span className="ml-2 truncate text-xs text-muted-foreground">
                                {channel.workspaceName}
                              </span>
                            ) : null}
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

              {slackNotReady ? (
                <p className="flex items-start gap-2 text-xs leading-5 text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {slackNotReady.message === 'slack_not_installed'
                      ? tUi('m_21a4092a2a')
                      : slackNotReady.status === 403
                        ? tUi('m_048b1ec8c7')
                        : tUi('m_1cc499c036')}{' '}
                    <Link
                      href={SLACK_SETTINGS_PATH}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {tUi('m_e67f0d04b2')}
                    </Link>
                  </span>
                </p>
              ) : unreachableChannel ? (
                <p className="flex items-start gap-2 text-xs leading-5 text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {tUi('m_9da6446db2')}
                  {selectedChannel?.name}
                  {tUi('m_68c9aa4d67')}
                </p>
              ) : (
                // Slack only lists a private channel to an app that is already in it, so a
                // missing private channel looks identical to one that does not exist.
                <p className="text-xs leading-5 text-muted-foreground">{tUi('m_da1212d5aa')}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
