'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderDeliveryDestinationsResponse,
  ApiRenderSlackChannel,
} from '@continuum/contracts';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';

// Where a finished render is posted in Slack, if anywhere. The destinations are the brand's own
// `chat_destinations` rows; the channel list for adding one is the requesting user's OWN Slack
// workspace, so a brand user never sees another tenant's channels. Connecting Slack lives in
// Settings → Connections — this links there rather than embedding the install flow.

export type SlackPickerState =
  | 'loading'
  | 'unavailable'
  | { error: string }
  | ApiRenderDeliveryDestinationsResponse['slack'];

const CONNECTIONS_HREF = '/settings?section=connections';

const ROLE_LABEL: Record<ApiRenderDeliveryDestination['role'], string> = {
  ops: 'Ops',
  client: 'Client',
  alerts: 'Alerts',
  dm: 'DM',
};

const NOT_CONNECTED_COPY = 'Connect your Slack account to add a channel for finished renders.';
const NOT_INSTALLED_COPY =
  'The Continuum app is no longer installed in your Slack workspace. Reinstall it from Settings to add a channel.';

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
};

function describeSlackFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const code = Object.keys(SLACK_FAILURE_COPY).find((key) => message.includes(key));
  return code ? SLACK_FAILURE_COPY[code]! : message || 'Slack did not answer. Try again.';
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
        Couldn’t load Slack channels ({slack.error}). Renders still go to the Library.
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
          <span className="text-muted-foreground">
            Post each finished render to{slack.workspaceName ? ` (${slack.workspaceName})` : ''}
          </span>
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
                #{destination.channelName} · {ROLE_LABEL[destination.role]}
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
        // pickable; only adding one needs the person's own Slack.
        <p className="text-xs text-muted-foreground">
          {slack.state === 'not_connected' ? NOT_CONNECTED_COPY : NOT_INSTALLED_COPY}{' '}
          <Link
            href={CONNECTIONS_HREF}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {slack.state === 'not_connected'
              ? 'Connect Slack in Settings'
              : 'Reinstall Slack in Settings'}
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

function AddChannel({
  brandId,
  onAdded,
  onCancel,
}: {
  brandId: string;
  onAdded: (destination: ApiRenderDeliveryDestination) => void;
  onCancel: () => void;
}) {
  const [channels, setChannels] = useState<ApiRenderSlackChannel[] | null>(null);
  const [channelId, setChannelId] = useState('');
  const [role, setRole] = useState<'ops' | 'client'>('ops');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRendersApi
      .listSlackChannels(brandId)
      .then((response) => {
        if (!cancelled) setChannels(response.channels);
      })
      .catch((error) => {
        if (cancelled) return;
        setChannels([]);
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
          <Loader2 className="size-3 animate-spin" aria-hidden /> Loading your Slack channels…
        </p>
      ) : channels.length ? (
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
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.isPrivate ? '🔒 ' : '#'}
                  {channel.name}
                  {channel.isPrivate && !channel.isMember
                    ? ' — invite the Continuum app first'
                    : ''}
                </option>
              ))}
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
        <p className="text-muted-foreground">No channels found in your Slack workspace.</p>
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
