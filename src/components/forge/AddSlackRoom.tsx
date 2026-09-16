'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderSlackChannel,
  ApiRenderSlackChannelListResponse,
} from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  describeSlackFailure,
  ROLE_BLURB,
  type SlackRoomRole,
} from '@/components/forge/slackRoomCopy';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Turns one Slack channel into a room this brand posts to. The channel list comes only from the
// Slack workspaces connected to this brand, so a brand user never sees another tenant's channels.
//
// One component, two callers: the Forge review tray offers ops/client while choosing where a
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
        setProblem(describeSlackFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const add = async () => {
    setSaving(true);
    setProblem(null);
    try {
      onAdded(await apiRendersApi.createDeliveryDestination({ brandId, role, channelId }));
    } catch (error) {
      setProblem(describeSlackFailure(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2 text-xs">
      {channels === null ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden /> Loading this brand’s Slack
          channels…
        </p>
      ) : channels.channels.length ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Channel</span>
            <select
              aria-label="Channel to add"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Choose a channel</option>
              {groupByWorkspace(channels).map(([workspace, group]) => {
                const options = group.map((channel) => (
                  // A Slack Connect channel keeps its id in every workspace it is shared into.
                  <option key={`${workspace}:${channel.id}`} value={channel.id}>
                    {channel.isPrivate ? '🔒 ' : '#'}
                    {channel.name}
                    {channel.isPrivate && !channel.isMember
                      ? ' — invite the Continuum app first'
                      : ''}
                  </option>
                ));
                return workspace ? (
                  <optgroup key={workspace} label={workspace}>
                    {options}
                  </optgroup>
                ) : (
                  options
                );
              })}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground">Who reads it</span>
            <select
              aria-label="Channel role"
              value={role}
              onChange={(event) => setRole(event.target.value as SlackRoomRole)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {roles.map((option) => (
                <option key={option} value={option}>
                  {ROLE_BLURB[option]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : problem ? null : (
        <p className="text-muted-foreground">No channels found in this brand’s Slack workspaces.</p>
      )}
      {problem ? <p className="text-muted-foreground">{problem}</p> : null}
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={!channelId || saving}
          onClick={() => void add()}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          Add channel
        </Button>
      </div>
    </div>
  );
}
