'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderSlackChannel,
  ApiRenderSlackChannelListResponse,
} from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  describeSlackFailure,
  ROLE_BLURB,
  type SlackRoomRole,
} from '@/components/forge/slackRoomCopy';
import { useForgePresentationText } from '@/components/forge/useForgePresentationText';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Turns one Slack channel into a room this brand posts to. The channel list comes only from the
// Slack workspaces connected to this brand, so a brand user never sees another tenant's channels.
//
// One component, two callers: the Forge set settings offer ops/client while choosing where a
// render goes, and the brand admin's Settings section offers alerts as well. Which roles are on
// offer is the caller's decision — the panel itself is the same panel.

// A channel list spanning workspaces is grouped by workspace; one unnamed workspace stays flat.
function groupByWorkspace(response: ApiRenderSlackChannelListResponse) {
  const groups = new Map<string, ApiRenderSlackChannel[]>();
  for (const channel of response.channels) {
    const workspace = channel.workspaceName ?? response.workspaceName ?? '';
    groups.set(workspace, [...(groups.get(workspace) ?? []), channel]);
  }
  return [...groups];
}

export function AddSlackRoom({
  brandId,
  roles,
  onAdded,
  onCancel,
}: {
  brandId: string;
  roles: readonly SlackRoomRole[];
  onAdded: (destination: ApiRenderDeliveryDestination) => void;
  onCancel: () => void;
}) {
  const presentForge = useForgePresentationText();

  const translateUi = useUiTranslations('forge');

  const [channels, setChannels] = useState<ApiRenderSlackChannelListResponse | null>(null);
  const [channelId, setChannelId] = useState('');
  const [role, setRole] = useState<SlackRoomRole>(roles[0] ?? 'ops');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRendersApi
      .listSlackChannels(brandId)
      .then((response) => {
        if (!cancelled) setChannels(response);
      })
      .catch((error) => {
        if (cancelled) return;
        setChannels({ workspaceName: null, channels: [] });
        setProblem(describeSlackFailure(error, presentForge));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, presentForge]);

  const channelLabel = (channel: { id: string; name: string; isPrivate?: boolean }) =>
    `${channel.isPrivate ? '🔒 ' : '#'}${channel.name}`;

  const add = async () => {
    setSaving(true);
    setProblem(null);
    try {
      onAdded(
        await apiRendersApi.createDeliveryDestination({
          brandId,
          role,
          channelId,
        }),
      );
    } catch (error) {
      setProblem(describeSlackFailure(error, presentForge));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2 text-xs">
      {channels === null ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />{' '}
          {translateUi('loading_this_brand_s_slack_channels_5f3e90b6')}{' '}
        </p>
      ) : channels.channels.length ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slack-room-channel" className="text-muted-foreground">
              {' '}
              {translateUi('channel_ce4683e7')}{' '}
            </Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger
                id="slack-room-channel"
                aria-label={translateUi('channel_to_add_01faaca3')}
                size="sm"
                className="w-full"
              >
                <SelectValue
                  placeholder={translateUi('choose_a_channel_86306895')}
                  items={Object.fromEntries(
                    channels.channels.map((channel) => [channel.id, channelLabel(channel)]),
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {groupByWorkspace(channels).map(([workspace, group]) => {
                  const options = group.map((channel) => (
                    // A Slack Connect channel keeps its id in every workspace it is shared into.
                    <SelectItem key={`${workspace}:${channel.id}`} value={channel.id}>
                      {channelLabel(channel)}
                      {channel.isPrivate && !channel.isMember
                        ? translateUi('invite_the_continuum_app_first_3f00962f')
                        : ''}
                    </SelectItem>
                  ));
                  // Which workspace a channel is in is the only way to tell two same-named
                  // channels apart, so the grouping survives the move off <optgroup>.
                  return workspace ? (
                    <SelectGroup key={workspace}>
                      <SelectLabel>{workspace}</SelectLabel>
                      {options}
                    </SelectGroup>
                  ) : (
                    options
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="slack-room-role" className="text-muted-foreground">
              {' '}
              {translateUi('who_reads_it_7b68c4d4')}{' '}
            </Label>
            <Select value={role} onValueChange={(next) => setRole(next as SlackRoomRole)}>
              <SelectTrigger
                id="slack-room-role"
                aria-label={translateUi('channel_role_ed79788f')}
                size="sm"
                className="w-full"
              >
                <SelectValue items={ROLE_BLURB} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {presentForge(ROLE_BLURB[option])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : problem ? null : (
        <p className="text-muted-foreground">
          {translateUi('no_channels_found_in_this_brand_s_s_578bb71d')}
        </p>
      )}
      {problem ? <p className="text-muted-foreground">{problem}</p> : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          {' '}
          {translateUi('cancel_19766ed6')}{' '}
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!channelId || saving}
          onClick={() => void add()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}{' '}
          {translateUi('add_channel_62f66a6a')}{' '}
        </Button>
      </div>
    </div>
  );
}
