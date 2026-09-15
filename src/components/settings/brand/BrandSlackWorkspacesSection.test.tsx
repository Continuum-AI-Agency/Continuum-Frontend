import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';

// The real slackWorkspaces client and contract schema run; only the HTTP transport is replaced.

const BRAND = '00000000-0000-4000-8000-000000000010';
const LIST_PATH = `/api/chat/slack/brands/${BRAND}/workspaces`;

type RequestOptions = {
  path: string;
  method?: string;
  schema?: { parse: (value: unknown) => unknown };
};

const workspace = (installationId: string, overrides: Record<string, unknown> = {}) => ({
  installationId,
  teamId: `T-${installationId}`,
  teamName: `Team ${installationId}`,
  status: 'active',
  linkedAt: '2026-09-15T12:00:00.000Z',
  ...overrides,
});

let rows: unknown[] = [];

const requestMock = mock(async (options: RequestOptions) => {
  if (options.method === 'DELETE') {
    const installationId = options.path.split('/').pop();
    rows = rows.filter(
      (row) => (row as { installationId: string }).installationId !== installationId,
    );
    return undefined;
  }
  const body = { workspaces: rows };
  return options.schema ? options.schema.parse(body) : body;
});
const showMock = mock(() => {});

mock.module('@/lib/api/http', () => ({ http: { request: requestMock } }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show: showMock }) }));

import { BrandSlackWorkspacesSection } from './BrandSlackWorkspacesSection';

const renderSection = (canManage: boolean) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BrandSlackWorkspacesSection brandId={BRAND} canManage={canManage} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  rows = [
    workspace('agency'),
    workspace('client', { teamName: null, teamId: 'T0CLIENT', status: 'revoked' }),
  ];
  requestMock.mockClear();
  showMock.mockClear();
});

afterEach(cleanup);

describe('BrandSlackWorkspacesSection', () => {
  it("lists the brand's workspaces with their install state", async () => {
    const { findByText, getByText } = renderSection(false);

    const agency = await findByText('Team agency');
    expect(within(agency.closest('li') as HTMLElement).getByText('Active')).toBeTruthy();
    // A workspace Slack never named falls back to its team id.
    const client = getByText('T0CLIENT');
    expect(within(client.closest('li') as HTMLElement).getByText('Needs reinstall')).toBeTruthy();
    expect(requestMock.mock.calls[0]?.[0].path).toBe(LIST_PATH);
  });

  it('owners and admins install with a top-level link to the Backend that carries the brand', async () => {
    const { findByRole, getByRole } = renderSection(true);

    const href = new URL(
      (await findByRole('link', { name: 'Add to Slack' })).getAttribute('href') ?? '',
    );
    expect(href.pathname).toBe('/api/chat/slack/install/start');
    expect(href.searchParams.get('brandId')).toBe(BRAND);
    expect(href.searchParams.get('returnTo')).toBe('/settings?section=integrations');
    // The revoked workspace gets the same install link as its way back.
    expect(getByRole('link', { name: 'Reinstall' }).getAttribute('href')).toBe(href.toString());
  });

  it('everyone else sees the list read-only', async () => {
    const { findByText, queryByRole } = renderSection(false);

    expect(await findByText('Team agency')).toBeTruthy();
    expect(queryByRole('link', { name: 'Add to Slack' })).toBeNull();
    expect(queryByRole('link', { name: 'Reinstall' })).toBeNull();
    expect(queryByRole('button', { name: /Disconnect/ })).toBeNull();
  });

  it('disconnects a workspace only after the confirm, then shows the refetched list', async () => {
    const { findByText, getAllByRole, findByRole, queryAllByText, queryByText } = renderSection(true);
    await findByText('Team agency');

    fireEvent.click(getAllByRole('button', { name: /Disconnect/ })[0] as HTMLElement);
    expect(requestMock.mock.calls.some(([options]) => options.method === 'DELETE')).toBe(false);
    fireEvent.click(await findByRole('button', { name: 'Disconnect workspace' }));

    await waitFor(() => expect(queryAllByText('Team agency').length).toBe(0));
    expect(requestMock.mock.calls.find(([options]) => options.method === 'DELETE')?.[0].path).toBe(
      `${LIST_PATH}/agency`,
    );
    expect(queryByText('T0CLIENT')).toBeTruthy();
  });
});
