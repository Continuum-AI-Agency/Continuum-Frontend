import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ApiRenderDeliveryDestination } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  chooseOption,
  installPickerDomGlobals,
  openSelect,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import { ApiError } from '@/lib/api/errors';

installPickerDomGlobals();

/** Both pickers are shadcn Selects now: options exist only while the list is open, in a portal. */
const optionsOf = (name: string) => {
  openSelect(name);
  return screen.getAllByRole('option').map((option) => option.textContent);
};

const BRAND = '00000000-0000-4000-8000-000000000010';

const destination = (
  id: string,
  channelName: string,
  workspaceName?: string | null,
): ApiRenderDeliveryDestination => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  role: 'ops',
  channelId: `C${id}`,
  channelName,
  ...(workspaceName === undefined ? {} : { workspaceName }),
});

let channelsResult: unknown;
const listSlackChannelsMock = mock((_brandId: string) =>
  channelsResult instanceof Error
    ? Promise.reject(channelsResult)
    : Promise.resolve(channelsResult),
);
const createDestinationMock = mock((input: { channelId: string }) =>
  Promise.resolve(destination('99', input.channelId === 'C0CLIENT' ? 'client-review' : 'x')),
);

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listSlackChannels: listSlackChannelsMock,
    createDeliveryDestination: createDestinationMock,
  },
}));

import { SlackDestinationPicker } from './SlackDestinationPicker';

const ready = (destinations: ApiRenderDeliveryDestination[], workspaceName: string | null = null) =>
  ({ state: 'ready', workspaceName, destinations }) as const;

beforeEach(() => {
  channelsResult = {
    workspaceName: null,
    channels: [
      { id: 'C0OPS', name: 'renders', isPrivate: false, isMember: true, workspaceName: 'Agency' },
      {
        id: 'C0CLIENT',
        name: 'review',
        isPrivate: false,
        isMember: true,
        workspaceName: 'Client Co',
      },
    ],
  };
  listSlackChannelsMock.mockClear();
  createDestinationMock.mockClear();
});

afterEach(cleanup);

describe('SlackDestinationPicker', () => {
  it("labels every destination with its own workspace, falling back to the response's", () => {
    render(
      <SlackDestinationPicker
        brandId={BRAND}
        slack={ready(
          [
            destination('01', 'renders', 'Agency'),
            destination('02', 'review', 'Client Co'),
            destination('03', 'alerts', null),
          ],
          'Default WS',
        )}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(optionsOf('Slack channel')).toEqual([
      'Don’t post to Slack',
      '#renders · Ops · Agency',
      '#review · Ops · Client Co',
      '#alerts · Ops · Default WS',
    ]);
  });

  it('leaves a destination unlabelled when no workspace name is known at all', () => {
    render(
      <SlackDestinationPicker
        brandId={BRAND}
        slack={ready([destination('01', 'renders')])}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(optionsOf('Slack channel')[1]).toBe('#renders · Ops');
  });

  it("sends a brand with no workspace, or a removed install, to the brand's Slack settings", () => {
    const notConnected = render(
      <SlackDestinationPicker
        brandId={BRAND}
        slack={{ state: 'not_connected', workspaceName: null, destinations: [] }}
        value={null}
        onChange={() => {}}
      />,
    );
    const connect = notConnected.getByRole('link', {
      name: 'Connect Slack to this brand in Settings',
    });
    expect(connect.getAttribute('href')).toBe('/settings?section=integrations');
    expect(notConnected.queryByRole('button', { name: /Add a channel/ })).toBeNull();
    notConnected.unmount();

    const notInstalled = render(
      <SlackDestinationPicker
        brandId={BRAND}
        slack={{ state: 'not_installed', workspaceName: null, destinations: [] }}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(
      notInstalled
        .getByRole('link', { name: 'Reinstall Slack for this brand in Settings' })
        .getAttribute('href'),
    ).toBe('/settings?section=integrations');
  });

  it("groups the brand's channels by workspace and adds the chosen one", async () => {
    const onChange = mock((_value: ApiRenderDeliveryDestination | null) => {});
    const { getByRole, findByRole } = render(
      <SlackDestinationPicker brandId={BRAND} slack={ready([])} value={null} onChange={onChange} />,
    );

    fireEvent.click(getByRole('button', { name: /Add a channel/ }));
    await findByRole('combobox', { name: 'Channel to add' });
    expect(listSlackChannelsMock).toHaveBeenCalledWith(BRAND);
    openSelect('Channel to add');
    // The workspace headings are what tell two same-named channels apart.
    expect(
      screen.getAllByRole('group').map((group) => group.textContent),
    ).toEqual(['Agency#renders', 'Client Co#review']);

    chooseOption('#review');
    fireEvent.click(getByRole('button', { name: 'Add channel' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(createDestinationMock).toHaveBeenCalledWith({
      brandId: BRAND,
      role: 'ops',
      channelId: 'C0CLIENT',
    });
    expect(onChange.mock.calls[0]?.[0]?.channelName).toBe('client-review');
  });

  it('a viewer who may not list channels reads why, never the code', async () => {
    channelsResult = new ApiError('forbidden_brand_role', 403);
    const { getByRole, findByText } = render(
      <SlackDestinationPicker brandId={BRAND} slack={ready([])} value={null} onChange={() => {}} />,
    );

    fireEvent.click(getByRole('button', { name: /Add a channel/ }));
    expect(await findByText(/Only brand owners, admins and operators/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('forbidden_brand_role');
  });
});
