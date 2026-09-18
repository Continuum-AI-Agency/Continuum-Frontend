/**
 * Renders — the brand's ledger — against a mocked render API.
 *
 * What this guards: the list (recreated from RenderGrids.test.tsx), text search over name,
 * template display name, set, ad account, ad and channel; clickable sort headers; collapsible
 * groups by template display name (ratio twins merge, names per workspace, collapse survives a
 * detail round trip); each job's delivery chain in every state it can be in; a refresh that only
 * changes an approval; the workspace column hidden by default; and a row expanding into its
 * detail with the step timeline.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ApiRenderJob, ApiRenderTemplateSummary } from '@continuum/contracts';
import type { PostgresChangesSubscription } from '@/lib/supabase/realtime';

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

const BASE: ApiRenderJob = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: '22222222-2222-4222-8222-222222222222',
  templateKey: '133',
  templateName: 'StarCraft Promo',
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
  deliveryTarget: { ...REPLACE, adAccountName: 'StarCraft Ads' },
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

const TEMPLATE = {
  key: '133',
  name: 'forge_bench_starcraft',
  environment: 'Continuum_app',
  displayName: 'StarCraft Promo',
};

const DEFAULT_BINDING = '55555555-5555-4555-8555-555555555551';
const CLIENT_BINDING = '55555555-5555-4555-8555-555555555552';
const environment = (bindingId: string, workspace: string, isDefault: boolean) => ({
  bindingId,
  workspace,
  environmentKey: 'prod',
  clientKey: 'forge',
  isDefault,
  status: { state: 'ready', workspace },
});

let jobsFixture: ApiRenderJob[] = [];
let templatesFixture: Partial<ApiRenderTemplateSummary>[] = [];
let clientTemplatesFixture: Partial<ApiRenderTemplateSummary>[] = [];
let environmentsFixture = [environment(DEFAULT_BINDING, 'Continuum_app', true)];
let realtime: PostgresChangesSubscription | undefined;
const listJobs = mock(async () => ({ items: jobsFixture, nextCursor: null }));
const getJob = mock(async (_brandId: string, id: string) =>
  jobsFixture.find((job) => job.id === id),
);
const listEnvironments = mock(async () => ({ items: environmentsFixture }));
const listTemplates = mock(async (_brandId: string, bindingId?: string | null) => ({
  items: bindingId === CLIENT_BINDING ? clientTemplatesFixture : bindingId ? [] : templatesFixture,
  nextCursor: null,
}));

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({
  apiRendersApi: {
    listJobs,
    getJob,
    listRenderSets: async () => ({ items: [], nextCursor: null }),
    listEnvironments,
    listTemplates,
  },
}));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ realtime: { setAuth: async () => undefined } }),
}));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: (options: PostgresChangesSubscription) => {
    realtime = options;
    return () => undefined;
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RenderJobsGrid } from './RenderJobsGrid';

const BRAND = BASE.brandId;

/** The row names in document order — what a person reads top to bottom. */
const rowOrder = () => {
  const text = screen.getByRole('table').textContent ?? '';
  return ['Madrid', 'Roma', 'Promo B']
    .filter((name) => text.includes(name))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
};

async function renderLedger(
  jobs: ApiRenderJob[],
  templates: Partial<ApiRenderTemplateSummary>[],
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  jobsFixture = jobs;
  templatesFixture = templates;
  const view = render(
    <QueryClientProvider client={client}>
      <RenderJobsGrid brandId={BRAND} />
    </QueryClientProvider>,
  );
  await screen.findByText(jobs[0]?.label ?? 'Spain');
  return view;
}

// happy-dom never fetches an image, so every <img> reads as finished with no pixels — exactly what
// a broken image looks like to the ledger's pre-commit check. Here images decode; the broken-file
// test fires the error itself.
let imagePrototype: object | null = null;
let naturalWidth: PropertyDescriptor | undefined;
beforeAll(() => {
  imagePrototype = Object.getPrototypeOf(document.createElement('img')) as object;
  naturalWidth = Object.getOwnPropertyDescriptor(imagePrototype, 'naturalWidth');
  Object.defineProperty(imagePrototype, 'naturalWidth', { configurable: true, get: () => 1 });
});
afterAll(() => {
  if (imagePrototype && naturalWidth) {
    Object.defineProperty(imagePrototype, 'naturalWidth', naturalWidth);
  }
});

beforeEach(() => {
  realtime = undefined;
  listJobs.mockClear();
  getJob.mockClear();
  listEnvironments.mockClear();
  listTemplates.mockClear();
});

afterEach(() => {
  cleanup();
  clientTemplatesFixture = [];
  environmentsFixture = [environment(DEFAULT_BINDING, 'Continuum_app', true)];
});

describe('RenderJobsGrid', () => {
  test('lists the brand’s renders', async () => {
    // Recreated from RenderGrids.test.tsx. The raw build name is no longer shown: the group reads
    // its prettified display name, and the row reads its own label.
    jobsFixture = [BASE];
    templatesFixture = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RenderJobsGrid brandId={BRAND} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('StarCraft Promo')).toBeTruthy();
    expect(screen.queryByText('forge_bench_starcraft')).toBeNull();
    expect(screen.getByText('Spain')).toBeTruthy();
    expect(screen.getByText('Root')).toBeTruthy();
    expect(screen.getByText('Campaign set')).toBeTruthy();
    expect(screen.getByText('finished')).toBeTruthy();
    expect(screen.getByText(/1 render • 1 finished • 0 in flight/)).toBeTruthy();
    // No app names in the default view: the Workspace column starts hidden.
    expect(screen.queryByText('Continuum_app')).toBeNull();
    expect(screen.getByRole('button', { name: /Columns/ })).toBeTruthy();
    expect(listEnvironments).not.toHaveBeenCalled();
    expect(listTemplates).not.toHaveBeenCalled();
  }, 30_000);

  test('the Template version column reads "Rev N · date", the digest when no revision came back, and names the gap when it has none', async () => {
    const SHA = `${'a1b2c3d4e5'.repeat(6)}f1b2`;
    const OTHER_SHA = `${'0f9e8d7c6b'.repeat(6)}a0b1`;
    const pinned: ApiRenderJob = {
      ...BASE,
      id: 'job-pinned',
      label: 'Pinned',
      templateSource: { assetId: 'asset-1', versionId: 'ver-1', sha256: SHA, versionNumber: null },
    };
    const revised: ApiRenderJob = {
      ...BASE,
      id: 'job-revised',
      label: 'Revised',
      createdAt: '2026-09-10T12:00:00.000Z',
      templateSource: {
        assetId: 'asset-1',
        versionId: 'ver-2',
        sha256: OTHER_SHA,
        versionNumber: 2,
      },
    };
    await renderLedger([pinned, revised, { ...BASE, id: 'job-legacy', label: 'Legacy' }], []);
    expect(screen.getByRole('columnheader', { name: /Template version/ })).toBeTruthy();
    // The source revision and the day the render ran, the full digest one hover away.
    expect(screen.getByText('Rev 2 · Sep 10').getAttribute('title')).toBe(
      `Template version ${OTHER_SHA}`,
    );
    // No revision read back: the digest, elided the same way the lineage panel elides it.
    expect(screen.getByText('a1b2c3d4e5…')).toBeTruthy();
    // ...and the render whose bytes nobody recorded says so, rather than showing an empty cell
    // that reads like "nothing to see here".
    expect(screen.getByText('Unrecorded')).toBeTruthy();
    // Pasting a digest out of a handoff finds the renders that used it.
    fireEvent.change(screen.getByLabelText('Search renders'), { target: { value: SHA } });
    const table = () => screen.getByRole('table').textContent ?? '';
    expect(table()).toContain('Pinned');
    expect(table()).not.toContain('Legacy');
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
    expectMatch('starcraft ads', ['Madrid']);
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
    // D15: Meta account › campaign › ad set › ad — the account by name once preflight resolved it.
    const path = madrid.getByText('Meta › StarCraft Ads › Launch Q3 › Iberia 18–34 ›');
    // A dense row truncates, and the whole chain is in the tooltip.
    expect(path.className).toContain('truncate');
    expect(path.parentElement?.getAttribute('title')).toBe(
      'Meta › StarCraft Ads › Launch Q3 › Iberia 18–34 › Hero story (ad account act_1)',
    );
    expect(madrid.getByText('awaiting approval')).toBeTruthy();

    const roma = within(rowOf('Roma'));
    expect(roma.queryByLabelText('saved')).toBeNull();
    expect(roma.getByText('#client-review')).toBeTruthy();
    expect(roma.getByText('skipped').getAttribute('title')).toBe(
      'The render did not pass its check',
    );
    expect(roma.queryByText(/Meta ›/)).toBeNull();

    const promo = within(rowOf('Promo B'));
    // A target stored before names were resolved still names its account, by id.
    expect(promo.getByText('Meta › act_1 › Launch Q3 › Iberia 18–34 ›')).toBeTruthy();
    expect(promo.getByText('Carousel square')).toBeTruthy();
    expect(promo.getByText('rejected')).toBeTruthy();
  }, 30_000);

  test('delivery reasons read as words: an unset bridge is not "held", a lost workspace is not a code', async () => {
    const unset: ApiRenderJob = {
      ...MADRID,
      id: '99999999-9999-4999-8999-999999999991',
      label: 'Bridge unset',
      approval: null,
      delivery: [
        {
          status: 'pending',
          adId: null,
          creativeId: null,
          reason: 'delivery_bridge_unconfigured',
          publishedAt: null,
        },
      ],
    };
    const lost: ApiRenderJob = {
      ...MADRID,
      id: '99999999-9999-4999-8999-999999999992',
      label: 'Workspace gone',
      approval: null,
      delivery: [
        {
          status: 'error',
          adId: null,
          creativeId: null,
          reason: 'binding_unresolved',
          publishedAt: null,
        },
      ],
    };
    await renderLedger([unset, lost], [TEMPLATE]);
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(within(rowOf('Bridge unset')).getByText('delivery not set up')).toBeTruthy();
    expect(within(rowOf('Bridge unset')).queryByText('held for approval')).toBeNull();
    fireEvent.click(screen.getByText('Workspace gone'));
    // The Delivery check says why in its own words.
    expect(
      await screen.findByText(/The workspace this render was made in no longer exists\./),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('binding_unresolved');
  }, 30_000);

  test('a row expands into its detail with its file, properties and the checks it went through', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    fireEvent.click(screen.getByText('Madrid'));

    expect(await screen.findByRole('heading', { name: 'Madrid' })).toBeTruthy();
    expect(screen.getByText('Root · StarCraft Promo')).toBeTruthy();
    // No contract to name its formats: the file is shown as its own format, at its stored size.
    const preview = screen.getByRole('group', { name: 'Render preview' });
    expect(
      within(preview).getByRole('img', { name: 'Madrid · madrid_1080x1920.png' }),
    ).toBeTruthy();
    expect(
      (preview.querySelector('[data-slot="format-preview-frame"]') as HTMLElement).style
        .aspectRatio,
    ).toBe('1080 / 1920');
    expect(screen.getByRole('link', { name: 'Download PNG' }).getAttribute('href')).toBe(
      'https://cdn.example.com/madrid.png',
    );
    expect(screen.getByRole('link', { name: /Slack post/ }).getAttribute('href')).toBe(
      'https://slack.com/archives/C1/p1',
    );

    const checks = within(screen.getByRole('list', { name: 'Checks' })).getAllByRole('listitem');
    expect(checks.map((row) => row.querySelector('.font-mono')?.textContent)).toEqual([
      'Inputs',
      'Placement',
      'Brand',
      'Render',
      'Judge',
      'Delivery',
    ]);
    const delivery = checks[5]!;
    expect(delivery.textContent).toContain(
      'Saved to Library · posted to #renders · awaiting approval',
    );
    fireEvent.click(within(delivery).getByRole('button', { name: 'Delivery details' }));
    // D15: the detail has room — the chain wraps across lines and every name stays whole.
    const chain = await screen.findByText('Meta › StarCraft Ads › Launch Q3 › Iberia 18–34 ›');
    expect(chain.className).toBe('text-muted-foreground');
    expect(chain.parentElement?.className).toContain('flex-wrap whitespace-normal');

    fireEvent.click(screen.getByRole('button', { name: /All renders/ }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(rowOrder()).toEqual(['Promo B', 'Roma', 'Madrid']);
  }, 30_000);

  test('a refresh that only changes the approval updates the badge', async () => {
    // Deciding an approval writes render_approvals, not ad_render_jobs.updated_at: the re-read job
    // ties on updatedAt with the one on screen, and the re-read must win the tie.
    await renderLedger([MADRID], [TEMPLATE]);
    const rowOf = () => within(screen.getByText('Madrid').closest('tr') as HTMLElement);
    expect(rowOf().getByText('awaiting approval')).toBeTruthy();

    jobsFixture = [{ ...MADRID, approval: { status: 'approved', decidedAt: ago(0.1) } }];
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(rowOf().getByText('approved · publishing…')).toBeTruthy());
    expect(rowOf().queryByText('awaiting approval')).toBeNull();
  }, 30_000);

  test('a realtime update refreshes one job while an insert refreshes the ordered page', async () => {
    await renderLedger([MADRID], [TEMPLATE]);
    const initialLists = listJobs.mock.calls.length;
    const update = realtime?.bindings.find((binding) => binding.event === 'UPDATE');
    const insert = realtime?.bindings.find((binding) => binding.event === 'INSERT');

    jobsFixture = [{ ...MADRID, status: 'rendering' }];
    act(() => update?.onRow({ id: MADRID.id, brand_id: BRAND }));
    await waitFor(() => expect(getJob).toHaveBeenCalledWith(BRAND, MADRID.id));
    expect(listJobs).toHaveBeenCalledTimes(initialLists);

    act(() => insert?.onRow({ id: ROMA.id, brand_id: BRAND }));
    await waitFor(() => expect(listJobs.mock.calls.length).toBe(initialLists + 1));
  }, 30_000);

  test('reuses a fresh ledger page after the tab remounts', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = await renderLedger([MADRID], [TEMPLATE], client);
    first.unmount();

    await renderLedger([MADRID], [TEMPLATE], client);
    expect(listJobs).toHaveBeenCalledTimes(1);
  }, 30_000);

  test('a collapsed group stays collapsed after opening a job and coming back', async () => {
    await renderLedger([MADRID, ROMA, PROMO], [TEMPLATE]);
    fireEvent.click(screen.getByRole('button', { name: /StarCraft Promo/ }));
    expect(rowOrder()).toEqual(['Promo B']);

    fireEvent.click(screen.getByText('Promo B'));
    expect(await screen.findByRole('heading', { name: 'Promo B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All renders/ }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());

    expect(
      screen.getByRole('button', { name: /StarCraft Promo/ }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(rowOrder()).toEqual(['Promo B']);
  }, 30_000);

  test('groups by display name: ratio twins merge, and each workspace names its own keys', async () => {
    // 134 is 133's 9:16 twin under the same name. The client workspace also has a key 133, but it
    // is a different template there — the default workspace's name must not leak onto it.
    const TWIN = { ...TEMPLATE, key: '134', name: 'forge_bench_starcraft_916' };
    environmentsFixture = [
      environment(DEFAULT_BINDING, 'Continuum_app', true),
      environment(CLIENT_BINDING, 'Client_ws', false),
    ];
    clientTemplatesFixture = [
      { key: '133', name: 'winter_promo', environment: 'Client_ws', displayName: 'Winter Promo' },
    ];
    const romaTwin = { ...ROMA, templateKey: '134', templateName: 'StarCraft Promo' };
    const promoClient = {
      ...PROMO,
      templateKey: '133',
      templateName: 'Winter Promo',
      environment: 'Client_ws',
    };
    await renderLedger([MADRID, romaTwin, promoClient], [TEMPLATE, TWIN]);

    await waitFor(() => expect(screen.getByRole('button', { name: /Winter Promo/ })).toBeTruthy());
    const starcraft = screen.getAllByRole('button', { name: /StarCraft Promo/ });
    expect(starcraft).toHaveLength(1);
    expect(starcraft[0]!.textContent).toContain('1 finished · 1 failed');
    expect(starcraft[0]!.textContent).toMatch(/2$/);
    expect(screen.getByRole('button', { name: /Winter Promo/ }).textContent).toMatch(/1$/);

    fireEvent.click(starcraft[0]!);
    expect(rowOrder()).toEqual(['Promo B']);
  }, 30_000);

  test('one template’s ledger: filtered by the server, grouped by set, its thumbnail the first format’s file', async () => {
    const file = (fileName: string) => ({
      id: `hash-${fileName}`,
      kind: 'image' as const,
      fileName,
      mimeType: 'image/jpeg',
      url: `https://cdn.test/${fileName}`,
      width: null,
      height: null,
      assetId: null,
      versionId: null,
    });
    const launch: ApiRenderJob = {
      ...BASE,
      id: '11111111-1111-4111-8111-111111111121',
      label: 'Launch',
      labelPath: ['Launch'],
      renderSetName: 'Launch week',
      // The fleet's order, not the template's.
      outputs: [
        file('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
        file('Producto_individual_con_descuento_1_1_1mjxxwb.jpg'),
        file('Producto_individual_con_descuento_16_9_9w5xxwa.jpg'),
      ],
    };
    const loose: ApiRenderJob = {
      ...BASE,
      id: '11111111-1111-4111-8111-111111111122',
      label: 'From the canvas',
      labelPath: ['From the canvas'],
      renderSetName: null,
    };
    jobsFixture = [launch, loose];
    const formats = [
      { id: '1:1', label: '1:1', ratio: '1:1', width: null, height: null },
      { id: '16:9', label: '16:9', ratio: '16:9', width: null, height: null },
    ];
    const view = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RenderJobsGrid brandId={BRAND} templateKey="133" formats={formats} />
      </QueryClientProvider>,
    );
    await screen.findByText('Launch');

    expect(listJobs.mock.calls.at(-1)).toEqual([
      BRAND,
      50,
      { renderSetId: undefined, templateKey: '133' },
    ]);
    expect(listTemplates).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Launch week/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /No set/ })).toBeTruthy();
    expect(screen.queryByLabelText('Filter by render set')).toBeNull();
    const thumbnail = (screen.getByText('Launch').closest('tr') as HTMLElement).querySelector(
      'img',
    );
    expect(thumbnail?.getAttribute('src')).toBe(
      'https://cdn.test/Producto_individual_con_descuento_1_1_1mjxxwb.jpg',
    );

    // Another template's row changing is not this ledger's business.
    const calls = listJobs.mock.calls.length;
    const insert = realtime?.bindings.find((binding) => binding.event === 'INSERT');
    act(() => insert?.onRow({ id: 'other', brand_id: BRAND, template_key: '200' }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(listJobs.mock.calls.length).toBe(calls);
    view.unmount();
  }, 30_000);
  test('a failed render reads its whole sentence, a broken thumbnail falls back to the tile, and Proof and Final are marked', async () => {
    const sentence =
      'The render farm stopped this render after 15 minutes without a file. Render it again; if it keeps timing out, the template may be too heavy for one pass.';
    const expired: ApiRenderJob = {
      ...MADRID,
      id: '11111111-1111-4111-8111-111111111131',
      label: 'Expired link',
      test: false,
    };
    const legacy: ApiRenderJob = {
      ...ROMA,
      id: '11111111-1111-4111-8111-111111111132',
      label: 'Legacy failure',
      error: 'render_error',
    };
    const timedOut: ApiRenderJob = {
      ...ROMA,
      id: '11111111-1111-4111-8111-111111111133',
      label: 'Timed out',
      error: sentence,
    };
    jobsFixture = [expired, legacy, timedOut];
    const madrid = { name: 'Madrid', width: 1080, height: 1920 };
    const formats = [
      { id: 'madrid', label: 'Madrid', ratio: null, comp: madrid, width: 1080, height: 1920 },
    ];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RenderJobsGrid brandId={BRAND} formats={formats} />
      </QueryClientProvider>,
    );
    await screen.findByText('Expired link');
    const rowOf = (label: string) => screen.getByText(label).closest('tr') as HTMLElement;

    // The backend's sentence, whole and wrapped; the legacy literal in words, never as the code.
    expect(within(rowOf('Timed out')).getByText(sentence).className).toContain('whitespace-normal');
    expect(
      within(rowOf('Legacy failure')).getByText(
        'The render farm reported an error and sent no file.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('table').textContent).not.toContain('render_error');

    expect(within(rowOf('Expired link')).getByText('Final')).toBeTruthy();
    expect(within(rowOf('Timed out')).getByText('Proof')).toBeTruthy();

    // An expired signed link: the image is replaced by the empty tile, never a broken image.
    const thumbnail = rowOf('Expired link').querySelector('img') as HTMLImageElement;
    expect(thumbnail.getAttribute('src')).toBe('https://cdn.example.com/madrid.png');
    fireEvent.error(thumbnail);
    expect(rowOf('Expired link').querySelector('img')).toBeNull();
  }, 30_000);

  test('a comp delivered as MP4, MOV and MXF lists every file, previews the playable one, and downloads each', async () => {
    const clip = (fileName: string, mimeType: string) => ({
      id: `hash-${fileName}`,
      kind: 'video' as const,
      fileName,
      mimeType,
      url: `https://cdn.test/${fileName}`,
      width: null,
      height: null,
      assetId: null,
      versionId: null,
    });
    const reel: ApiRenderJob = {
      ...BASE,
      id: '11111111-1111-4111-8111-111111111141',
      label: 'Reel',
      labelPath: ['Reel'],
      // The fleet's order: the MXF first, which no browser plays.
      outputs: [
        clip('Story_9_16_ab12cd.mxf', 'application/mxf'),
        clip('Story_9_16_ab12cd.mov', 'video/quicktime'),
        clip('Story_9_16_ab12cd.mp4', 'video/mp4'),
      ],
    };
    jobsFixture = [reel];
    const story = { name: 'Story 9:16', width: 1080, height: 1920 };
    const formats = [
      { id: 'story', label: 'Story', ratio: '9:16', comp: story, width: 1080, height: 1920 },
    ];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RenderJobsGrid brandId={BRAND} formats={formats} />
      </QueryClientProvider>,
    );
    await screen.findByText('Reel');
    expect(
      within(screen.getByText('Reel').closest('tr') as HTMLElement).getByText(
        '1 MP4 · 1 MOV · 1 MXF',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByText('Reel'));
    await screen.findByRole('heading', { name: 'Reel' });
    const preview = screen.getByRole('group', { name: 'Render preview' });
    expect(preview.querySelector('video')?.getAttribute('src')).toBe(
      'https://cdn.test/Story_9_16_ab12cd.mp4',
    );
    expect(
      ['MP4', 'MOV', 'MXF'].map((type) =>
        screen.getByRole('link', { name: `Download ${type}` }).getAttribute('href'),
      ),
    ).toEqual([
      'https://cdn.test/Story_9_16_ab12cd.mp4',
      'https://cdn.test/Story_9_16_ab12cd.mov',
      'https://cdn.test/Story_9_16_ab12cd.mxf',
    ]);
    // A file the browser cannot play falls back to words, and the downloads stay.
    fireEvent.error(preview.querySelector('video') as HTMLVideoElement);
    expect(
      within(preview).getByText('This browser can’t play this file. Download it below.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download MXF' })).toBeTruthy();
  }, 30_000);
});
