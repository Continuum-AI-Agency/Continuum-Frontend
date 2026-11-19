'use client';

import type {
  ApiRenderDeliveryDestination,
  ApiRenderDeliveryDestinationsResponse,
} from '@continuum/contracts';
import { Plus } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
import { Link } from '@/i18n/navigation';
import { SLACK_SETTINGS_PATH } from '@/lib/api/slackWorkspaces.client';
import { useForgePresentationText } from './useForgePresentationText';

/** "No room" needs a value of its own: a Select item cannot be the empty string. */
const NO_ROOM = 'none';

// Where a finished render is posted in Slack, if anywhere. The destinations are the brand's own
// `chat_destinations` rows; the channel list for adding one comes only from the Slack workspaces
// connected to this brand, so a brand user never sees another tenant's channels. A brand can
// have several workspaces, so every channel carries its workspace name. Connecting a workspace
// lives in Settings → Integrations — this links there rather than embedding the install flow.

// Room-wide copy and the failure map live in `slackRoomCopy`, shared with the Settings section;
// re-exported here because this is where Forge's delivery code already reads them from.
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
  const translateUi = useUiTranslations('forge');
  const presentForge = useForgePresentationText();

  const [added, setAdded] = useState<ApiRenderDeliveryDestination[]>([]);
  const [adding, setAdding] = useState(false);

  if (slack === 'loading') {
    return (
      <p className="text-xs text-muted-foreground">{translateUi('checking_slack_fe521ab4')}</p>
    );
  }
  if (slack === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('slack_delivery_isn_t_available_yet__1b3cf556')}{' '}
      </p>
    );
  }
  if ('error' in slack) {
    return (
      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('couldn_t_load_slack_channels_0ccfec27')} {slack.error}{' '}
        {translateUi('renders_still_go_to_the_library_b943fa53')}{' '}
      </p>
    );
  }
  const destinations = [
    ...slack.destinations,
    ...added.filter((extra) => !slack.destinations.some((known) => known.id === extra.id)),
  ];
  const roomLabel = (destination: ApiRenderDeliveryDestination) =>
    withWorkspace(
      `#${destination.channelName} · ${presentForge(ROLE_LABEL[destination.role])}`,
      destination.workspaceName ?? slack.workspaceName,
    );
  const roomLabels: Record<string, string> = {
    [NO_ROOM]: 'Don’t post to Slack',
    ...Object.fromEntries(
      destinations.map((destination) => [destination.id, roomLabel(destination)]),
    ),
  };
  return (
    <div className="space-y-2">
      {destinations.length ? (
        <div className="flex flex-col gap-1 text-xs">
          <Label htmlFor="forge-slack-channel" className="text-muted-foreground">
            {' '}
            {translateUi('post_each_finished_render_to_cd9f3273')}{' '}
          </Label>
          <Select
            value={value?.id ?? NO_ROOM}
            onValueChange={(next) =>
              onChange(destinations.find((item) => item.id === next) ?? null)
            }
          >
            <SelectTrigger
              id="forge-slack-channel"
              aria-label={translateUi('slack_channel_da7d161a')}
              size="sm"
              className="w-full"
            >
              <SelectValue items={roomLabels} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROOM}>{translateUi('don_t_post_to_slack_38373a43')}</SelectItem>
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
          {' '}
          {translateUi('no_slack_channel_is_set_up_for_this_80a1788c')}{' '}
        </p>
      )}
      {value?.role === 'client' ? (
        <p className="text-2xs text-muted-foreground">
          {' '}
          {translateUi('a_client_channel_gets_a_post_only_a_bfea5f73')}{' '}
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
              ? translateUi('connect_slack_to_this_brand_in_sett_21a0f689')
              : translateUi('reinstall_slack_for_this_brand_in_s_f34471dd')}
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
          <Plus className="size-3.5" aria-hidden /> {translateUi('add_a_channel_075fee45')}{' '}
        </Button>
      )}
    </div>
  );
}

const FORGE_ROLES = ['ops', 'client'] as const;

const withWorkspace = (label: string, workspaceName: string | null | undefined) =>
  workspaceName ? `${label} · ${workspaceName}` : label;
