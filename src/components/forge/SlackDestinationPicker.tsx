'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderDeliveryDestinationsResponse,
} from '@continuum/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AddSlackRoom } from '@/components/forge/AddSlackRoom';
import {
  NOT_CONNECTED_COPY,
  NOT_INSTALLED_COPY,
  ROLE_LABEL,
} from '@/components/forge/slackRoomCopy';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SLACK_SETTINGS_PATH } from '@/lib/api/slackWorkspaces.client';

/** "No room" needs a value of its own: a Select item cannot be the empty string. */
const NO_ROOM = 'none';

// Where a finished render is posted in Slack, if anywhere. The destinations are the brand's own
// `chat_destinations` rows; the channel list for adding one comes only from the Slack workspaces
// connected to this brand, so a brand user never sees another tenant's channels. A brand can
// have several workspaces, so every channel carries its workspace name. Connecting a workspace
// lives in Settings → Integrations — this links there rather than embedding the install flow.

// Room-wide copy and the failure map live in `slackRoomCopy`, shared with the Settings section;
// re-exported here because this is where the review tray already reads them from.
export { describeSlackFailure, isSlackDeliveryUnavailable } from '@/components/forge/slackRoomCopy';

export type SlackPickerState =
  | 'loading'
  | 'unavailable'
  | { error: string }
  | ApiRenderDeliveryDestinationsResponse['slack'];

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
  const roomLabel = (destination: ApiRenderDeliveryDestination) =>
    withWorkspace(
      `#${destination.channelName} · ${ROLE_LABEL[destination.role]}`,
      destination.workspaceName ?? slack.workspaceName,
    );
  const roomLabels: Record<string, string> = {
    [NO_ROOM]: 'Don’t post to Slack',
    ...Object.fromEntries(destinations.map((destination) => [destination.id, roomLabel(destination)])),
  };
  return (
    <div className="space-y-2">
      {destinations.length ? (
        <div className="flex flex-col gap-1 text-xs">
          <Label htmlFor="forge-slack-channel" className="text-muted-foreground">
            Post each finished render to
          </Label>
          <Select
            value={value?.id ?? NO_ROOM}
            onValueChange={(next) =>
              onChange(destinations.find((item) => item.id === next) ?? null)
            }
          >
            <SelectTrigger
              id="forge-slack-channel"
              aria-label="Slack channel"
              size="sm"
              className="w-full"
            >
              <SelectValue items={roomLabels} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROOM}>Don’t post to Slack</SelectItem>
              {destinations.map((destination) => (
                <SelectItem key={destination.id} value={destination.id}>
                  {roomLabel(destination)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        // A render goes to one team or one client; an alerts room is set up in Settings, not here.
        <AddSlackRoom
          brandId={brandId}
          roles={FORGE_ROLES}
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

const FORGE_ROLES = ['ops', 'client'] as const;

const withWorkspace = (label: string, workspaceName: string | null | undefined) =>
  workspaceName ? `${label} · ${workspaceName}` : label;
