'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderDeliveryDestinationsResponse,
  ApiRenderSlackChannel,
  ApiRenderSlackChannelListResponse,
} from '@continuum/contracts';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SLACK_SETTINGS_PATH } from '@/lib/api/slackWorkspaces.client';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// Where a finished render is posted in Slack, if anywhere. The destinations are the brand's own
// `chat_destinations` rows; the channel list for adding one comes only from the Slack workspaces
// connected to this brand, so a brand user never sees another tenant's channels. A brand can
// have several workspaces, so every channel carries its workspace name. Connecting a workspace
// lives in Settings → Integrations — this links there rather than embedding the install flow.

export type SlackPickerState =
  | 'loading'
  | 'unavailable'
  | { error: string }
  | ApiRenderDeliveryDestinationsResponse['slack'];

const ROLE_LABEL: Record<ApiRenderDeliveryDestination['role'], string> = {
  ops: 'Ops',
  client: 'Client',
  alerts: 'Alerts',
  dm: 'DM',
};

const NOT_CONNECTED_COPY = 'No Slack workspace is connected to this brand yet.';
const NOT_INSTALLED_COPY =
  'The Continuum app is no longer installed in this brand’s Slack workspace. Reinstall it to add a channel.';

/** The backend answers 503 `chat_destinations_unavailable` until Slack delivery is wired. */
export function isSlackDeliveryUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes('chat_destinations_unavailable');
}

// The server's codes in the words the picker's own states use; an unmapped failure keeps its text.
const SLACK_FAILURE_COPY: Record<string, string> = {
  chat_destinations_unavailable: 'Slack delivery isn’t available yet.',
  slack_not_connected: NOT_CONNECTED_COPY,
  slack_not_installed: NOT_INSTALLED_COPY,
  slack_channel_not_found: 'That channel is gone — pick another.',
  forbidden_brand_role: 'Only brand owners, admins and operators can add a Slack channel.',
};

/** A Slack or render-service failure in words; render_* codes use the discovery copy. */
export function describeSlackFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = Object.keys(SLACK_FAILURE_COPY).find((key) => message.includes(key));
  if (code) return SLACK_FAILURE_COPY[code]!;
  return message ? describeRenderDiscoveryFailure(error) : 'Slack did not answer. Try again.';
}

export function SlackDestinationPicker({
  brandId,
  slack,
  value,
  onChange,
}: {
  brandId: string;
  slack: SlackPickerState;
  value: ApiRenderDeliveryDestination | null;
  onChange: (destination: ApiRenderDeliveryDestination | null) => void;
}) {
  const [added, setAdded] = useState<ApiRenderDeliveryDestination[]>([]);
  const [adding, setAdding] = useState(false);

  if (slack === 'loading') {
    return <p className="text-xs text-muted-foreground">Checking Slack…</p>;
  }
  if (slack === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        Slack delivery isn’t available yet. Renders still go to the Library.
      </p>
    );
  }
  if ('error' in slack) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn’t load Slack channels: {slack.error} Renders still go to the Library.
      </p>
    );
  }
  const destinations = [
    ...slack.destinations,
    ...added.filter((extra) => !slack.destinations.some((known) => known.id === extra.id)),
  ];
  return (
    <div className="space-y-2">
      {destinations.length ? (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Post each finished render to</span>
          <select
            aria-label="Slack channel"
            value={value?.id ?? ''}
            onChange={(event) =>
              onChange(destinations.find((item) => item.id === event.target.value) ?? null)
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Don’t post to Slack</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {withWorkspace(
                  `#${destination.channelName} · ${ROLE_LABEL[destination.role]}`,
                  destination.workspaceName ?? slack.workspaceName,
                )}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">
          No Slack channel is set up for this brand yet.
        </p>
      )}
      {value?.role === 'client' ? (
        <p className="text-2xs text-muted-foreground">
          A client channel gets a post only after the render passes its check.
        </p>
      ) : null}
      {slack.state !== 'ready' ? (
        // Posting uses the destination's own installation, so the brand's channels above stay
        // pickable; only adding one needs a connected, installed workspace.
        <p className="text-xs text-muted-foreground">
          {slack.state === 'not_connected' ? NOT_CONNECTED_COPY : NOT_INSTALLED_COPY}{' '}
          <Link
            href={SLACK_SETTINGS_PATH}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {slack.state === 'not_connected'
              ? 'Connect Slack to this brand in Settings'
              : 'Reinstall Slack for this brand in Settings'}
          </Link>
        </p>
      ) : adding ? (
        <AddChannel
          brandId={brandId}
          onCancel={() => setAdding(false)}
          onAdded={(destination) => {
            setAdded((current) => [...current, destination]);
            setAdding(false);
            onChange(destination);
          }}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" aria-hidden /> Add a channel
        </Button>
      )}
    </div>
  );
}

const withWorkspace = (label: string, workspaceName: string | null | undefined) =>
  workspaceName ? `${label} · ${workspaceName}` : label;

// A channel list spanning workspaces is grouped by workspace; one unnamed workspace stays flat.
function groupByWorkspace(response: ApiRenderSlackChannelListResponse) {
  const groups = new Map<string, ApiRenderSlackChannel[]>();
  for (const channel of response.channels) {
    const workspace = channel.workspaceName ?? response.workspaceName ?? '';
    groups.set(workspace, [...(groups.get(workspace) ?? []), channel]);
  }
  return [...groups];
}

function AddChannel({
  brandId,
  onAdded,
  onCancel,
}: {
  brandId: string;
  onAdded: (destination: ApiRenderDeliveryDestination) => void;
  onCancel: () => void;
}) {
  const [channels, setChannels] = useState<ApiRenderSlackChannelListResponse | null>(null);
  const [channelId, setChannelId] = useState('');
  const [role, setRole] = useState<'ops' | 'client'>('ops');
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
              onChange={(event) => setRole(event.target.value === 'client' ? 'client' : 'ops')}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="ops">Ops — your team, every render</option>
              <option value="client">Client — posts only after the render passes its check</option>
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
