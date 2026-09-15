/**
 * Renders — the brand's ledger — against a mocked render API.
 *
 * What this guards: the list (recreated from RenderGrids.test.tsx), text search over name,
 * template display name, set, ad and channel; clickable sort headers; collapsible groups by
 * template display name; each job's delivery chain in every state it can be in; the workspace
 * column hidden by default; and a row expanding into its detail with the step timeline.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob, ApiRenderTemplateSummary } from '@continuum/contracts';

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const BASE: ApiRenderJob = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '133',
  templateName: 'forge_bench_starcraft',
  contractHash: 'hash',
  taskUid: 'T1',
  status: 'finished',
  test: true,
  outputs: [],
  delivery: [],
  error: null,
  createdAt: ago(0),
  updatedAt: ago(0),
  label: null,
  renderRequestId: null,
  renderSetId: null,
  renderSetRowId: null,
  rootRowId: null,
  parentRowId: null,
  renderSetName: 'Campaign set',
  labelPath: ['Root', 'Spain'],
  renderSetRevision: null,
  templateSource: null,
  environment: 'Continuum_app',
  fit: null,
  judge: null,
  deliveryTarget: null,
  slackDelivery: null,
  approval: null,
};

const REPLACE = {
  action: 'replace' as const,
  adAccountId: 'act_1',
  campaignId: 'c1',
  campaignName: 'Launch Q3',
  adsetId: 's1',
  adsetName: 'Iberia 18–34',
  adId: '1201',
  adName: 'Hero story',
};

const MADRID: ApiRenderJob = {
  ...BASE,
  id: '11111111-1111-4111-8111-111111111112',
  label: 'Madrid',
  labelPath: ['Root', 'Madrid'],
  createdAt: ago(3),
  updatedAt: ago(2.9),
  outputs: [
    {
      id: 'o1',
      kind: 'image',
      fileName: 'madrid_1080x1920.png',
      mimeType: 'image/png',
      url: 'https://cdn.example.com/madrid.png',
      width: 1080,
      height: 1920,
      assetId: '77777777-7777-4777-8777-777777777771',
      versionId: '77777777-7777-4777-8777-777777777772',
    },
  ],
  slackDelivery: {
    destinationId: '66666666-6666-4666-8666-666666666661',
    channelName: 'renders',
    status: 'posted',
    permalink: 'https://slack.com/archives/C1/p1',
    postedAt: ago(2.8),
  },
  deliveryTarget: REPLACE,
  approval: { status: 'pending' },
};

const ROMA: ApiRenderJob = {
  ...BASE,
  id: '11111111-1111-4111-8111-111111111113',
  label: 'Roma',
  labelPath: ['Root', 'Roma'],
  status: 'failed',
  error: 'The fleet refused this render.',
  createdAt: ago(2),
  slackDelivery: {
    destinationId: '66666666-6666-4666-8666-666666666662',
    channelName: 'client-review',
    status: 'skipped',
    reason: 'The render did not pass its check',
  },
};

const PROMO: ApiRenderJob = {
  ...BASE,
  id: '11111111-1111-4111-8111-111111111114',
  templateKey: '200',
  templateName: '[DRAFT/agent] summer_sale',
  label: 'Promo B',
  labelPath: ['Promo B'],
  renderSetName: null,
  status: 'rendering',
  createdAt: ago(1),
  deliveryTarget: { ...REPLACE, adId: '1202', adName: 'Carousel square' },
  approval: { status: 'rejected', decidedAt: ago(0.5) },
};

const TEMPLATE = { key: '133', name: 'forge_bench_starcraft', displayName: 'StarCraft Promo' };

let jobsFixture: ApiRenderJob[] = [];
let templatesFixture: Partial<ApiRenderTemplateSummary>[] = [];

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listJobs: async () => ({ items: jobsFixture, nextCursor: null }),
    getJob: async (_brandId: string, id: string) => jobsFixture.find((job) => job.id === id),
    listRenderSets: async () => ({ items: [], nextCursor: null }),
    listTemplates: async () => ({ items: templatesFixture, nextCursor: null }),
  },
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ realtime: { setAuth: async () => undefined } }),
}));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: () => () => undefined,
}));

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RenderJobsGrid } from './RenderJobsGrid';

const BRAND = BASE.brandId;

/** The row names in document order — what a person reads top to bottom. */
const rowOrder = () => {
  const text = screen.getByRole('table').textContent ?? '';
  return ['Madrid', 'Roma', 'Promo B']
    .filter((name) => text.includes(name))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
};

async function renderLedger(jobs: ApiRenderJob[], templates: Partial<ApiRenderTemplateSummary>[]) {
  jobsFixture = jobs;
  templatesFixture = templates;
  render(<RenderJobsGrid brandId={BRAND} />);
  await screen.findByText(jobs[0]?.label ?? 'Spain');
}

afterEach(() => {
  cleanup();
});

describe('RenderJobsGrid', () => {
  test('lists the brand’s renders', async () => {
    // Recreated from RenderGrids.test.tsx. The raw build name is no longer shown: the group reads
    // its prettified display name, and the row reads its own label.
    jobsFixture = [BASE];
    templatesFixture = [];
    render(<RenderJobsGrid brandId={BRAND} />);
    expect(await screen.findByText('Forge bench starcraft')).toBeTruthy();
    expect(screen.queryByText('forge_bench_starcraft')).toBeNull();
    expect(screen.getByText('Spain')).toBeTruthy();
    expect(screen.getByText('Root')).toBeTruthy();
    expect(screen.getByText('Campaign set')).toBeTruthy();
    expect(screen.getByText('finished')).toBeTruthy();
    expect(screen.getByText(/1 render • 1 finished • 0 in flight/)).toBeTruthy();
    // No app names in the default view: the Workspace column starts hidden.
    expect(screen.queryByText('Continuum_app')).toBeNull();
    expect(screen.getByRole('button', { name: /Columns/ })).toBeTruthy();
  }, 30_000);

  test('groups by template display name with counts and a status summary, collapsible', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    const starcraft = screen.getByRole('button', { name: /StarCraft Promo/ });
    expect(starcraft.textContent).toContain('1 finished · 1 failed');
    expect(starcraft.textContent).toMatch(/2$/);
    const summer = screen.getByRole('button', { name: /Summer sale/ });
    expect(summer.textContent).toContain('1 in flight');
    expect(summer.textContent).toMatch(/1$/);

    fireEvent.click(starcraft);
    expect(starcraft.getAttribute('aria-expanded')).toBe('false');
    expect(rowOrder()).toEqual(['Promo B']);
    fireEvent.click(starcraft);
    expect(rowOrder()).toContain('Madrid');
  }, 30_000);

  test('headers sort: newest first by default, then by name when Name is clicked', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    // Newest first; groups follow the order each first appears.
    expect(rowOrder()).toEqual(['Promo B', 'Roma', 'Madrid']);
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }));
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe(
      'ascending',
    );
    expect(rowOrder()).toEqual(['Madrid', 'Roma', 'Promo B']);
    // Descending by name puts Roma first, so its template's group leads.
    fireEvent.click(screen.getByRole('button', { name: /^Name/ }));
    expect(rowOrder()).toEqual(['Roma', 'Madrid', 'Promo B']);
  }, 30_000);

  test('search matches name, template, set, ad and channel over the loaded pages', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    const search = screen.getByLabelText('Search renders');
    const expectMatch = (query: string, names: string[]) => {
      fireEvent.change(search, { target: { value: query } });
      expect(rowOrder().sort()).toEqual([...names].sort());
    };
    expectMatch('roma', ['Roma']);
    expectMatch('starcraft promo', ['Madrid', 'Roma']);
    expectMatch('summer', ['Promo B']);
    expectMatch('unassigned', ['Promo B']);
    expectMatch('hero story', ['Madrid']);
    expectMatch('client-review', ['Roma']);
    expect(screen.getByText(/1 of 3 loaded renders match/)).toBeTruthy();

    fireEvent.change(search, { target: { value: 'nothing like this' } });
    expect(screen.getByText('No loaded renders match “nothing like this”.')).toBeTruthy();
  }, 30_000);

  test('each job shows its delivery chain: Library, Slack and Meta with their states', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

    const madrid = within(rowOf('Madrid'));
    expect(madrid.getByLabelText('saved')).toBeTruthy();
    expect(madrid.getByText('#renders')).toBeTruthy();
    expect(madrid.getByText('posted')).toBeTruthy();
    expect(madrid.getByText('Hero story')).toBeTruthy();
    expect(madrid.getByText(/Launch Q3 › Iberia 18–34 ›/)).toBeTruthy();
    expect(madrid.getByText('awaiting approval')).toBeTruthy();

    const roma = within(rowOf('Roma'));
    expect(roma.queryByLabelText('saved')).toBeNull();
    expect(roma.getByText('#client-review')).toBeTruthy();
    expect(roma.getByText('skipped').getAttribute('title')).toBe(
      'The render did not pass its check',
    );
    expect(roma.queryByText(/Meta ›/)).toBeNull();

    const promo = within(rowOf('Promo B'));
    expect(promo.getByText('Carousel square')).toBeTruthy();
    expect(promo.getByText('rejected')).toBeTruthy();
  }, 30_000);

  test('a row expands into its detail with preview, properties and the step timeline', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    fireEvent.click(screen.getByText('Madrid'));

    expect(await screen.findByRole('heading', { name: 'Madrid' })).toBeTruthy();
    expect(screen.getByText('Root · StarCraft Promo')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Madrid · 9:16' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open file/ }).getAttribute('href')).toBe(
      'https://cdn.example.com/madrid.png',
    );
    expect(screen.getByRole('link', { name: /Slack post/ }).getAttribute('href')).toBe(
      'https://slack.com/archives/C1/p1',
    );

    const steps = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(
      steps.map((step) => [
        step.querySelector('.font-medium, .text-muted-foreground')?.textContent,
        step.dataset.state,
      ]),
    ).toEqual([
      ['Queued', 'done'],
      ['Rendering', 'done'],
      ['Checks', 'skipped'],
      ['Library', 'done'],
      ['Slack', 'done'],
      ['Meta approval', 'active'],
      ['Published', 'pending'],
    ]);
    expect(within(steps[5]!).getByText('awaiting approval')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /All renders/ }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(rowOrder()).toEqual(['Promo B', 'Roma', 'Madrid']);
  }, 30_000);
});
