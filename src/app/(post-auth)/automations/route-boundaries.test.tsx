/**
 * Route-boundary coverage for /automations.
 *
 * Two layers are covered here: the boundary components themselves, and the RSC
 * page functions whose failure behaviour those boundaries exist to catch. The
 * pages are async server functions, so they are called directly with their
 * module seams replaced (brand context, Supabase server client, next/navigation,
 * and the two heavy client components). `mock.module` is not hoisted, so the
 * pages are imported dynamically, after the seams register, never statically.
 *
 * The next/navigation surface is declared here in full rather than spread from
 * whatever the process last registered, because mock.module is process-wide and
 * resolves once per run. Only redirect/notFound carry test-specific behaviour,
 * and they fall back to no-op passthrough once this file's tests finish so the
 * process-wide mock never leaks throwing navigation into other specs.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import AutomationWorkspaceError from './[automationId]/error';
import AutomationWorkspaceLoading from './[automationId]/loading';
import AutomationWorkspaceNotFound from './[automationId]/not-found';
import AutomationsError from './error';
import AutomationsLoading from './loading';

const ACTIVE_BRAND_ID = '0f3a3d1e-6b7e-4f52-9e0a-2c9a1d5b7f11';
const AUTOMATION_ID = '5a2c9f44-1d3e-4a88-b2c7-6f0e9d4a2b31';
const OTHER_AUTOMATION_ID = 'c81f2a70-7b3d-4c19-8a52-3e6b0f9d1c42';

class RedirectSignal extends Error {
  readonly destination: string;

  constructor(destination: string) {
    super(`NEXT_REDIRECT to ${destination}`);
    this.name = 'RedirectSignal';
    this.destination = destination;
  }
}

class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
    this.name = 'NotFoundSignal';
  }
}

type SupabaseReadResult = { data: unknown; error: { message: string } | null };

type RecordedQuery = {
  schema: string;
  table: string;
  columns: string;
  filters: Record<string, unknown>;
  usedMaybeSingle: boolean;
};

// PostgREST's builder is awaitable at any point in the chain, so the fake is a
// real promise carrying the chain methods rather than a hand-rolled thenable.
type FakeQueryMethods = {
  select: (columns: string) => FakeQuery;
  eq: (column: string, value: unknown) => FakeQuery;
  order: (column: string, options?: { ascending: boolean }) => FakeQuery;
  maybeSingle: () => Promise<SupabaseReadResult>;
};

type FakeQuery = Promise<SupabaseReadResult> & FakeQueryMethods;

let activeBrandId: string | null = ACTIVE_BRAND_ID;
let readResult: SupabaseReadResult = { data: [], error: null };
let recordedQuery: RecordedQuery | null = null;

function createFakeQuery(query: RecordedQuery): FakeQuery {
  const fakeQuery: FakeQuery = Object.assign(Promise.resolve(readResult), {
    select(columns: string) {
      query.columns = columns;
      return fakeQuery;
    },
    eq(column: string, value: unknown) {
      query.filters[column] = value;
      return fakeQuery;
    },
    order() {
      return fakeQuery;
    },
    maybeSingle() {
      query.usedMaybeSingle = true;
      return Promise.resolve(readResult);
    },
  });

  return fakeQuery;
}

function createFakeSupabaseClient() {
  return {
    schema(schema: string) {
      return {
        from(table: string) {
          const query: RecordedQuery = {
            schema,
            table,
            columns: '',
            filters: {},
            usedMaybeSingle: false,
          };
          recordedQuery = query;
          return createFakeQuery(query);
        },
      };
    },
  };
}

mock.module('@/lib/brands/active-brand-context', () => ({
  getActiveBrandContext: async () => ({
    activeBrandId,
    brandSummaries: [],
    permissions: [],
    activeBrandTier: 0,
    user: null,
  }),
}));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => createFakeSupabaseClient(),
}));

mock.module('@/components/automations/workspace/AutomationTemplateGallery', () => ({
  AutomationTemplateGallery: ({ brandId }: { brandId: string }) => (
    <div data-testid="template-gallery" data-brand-id={brandId} />
  ),
}));

mock.module('@/components/automations/workspace/AutomationWorkspace', () => ({
  AutomationWorkspace: ({ automationId }: { automationId: string }) => (
    <div data-testid="automation-workspace" data-automation-id={automationId} />
  ),
}));

type NavigationBehavior = {
  redirect: (path: string) => void;
  notFound: () => void;
};

const passthroughNavigation: NavigationBehavior = {
  redirect: () => {},
  notFound: () => {},
};

let navigationBehavior: NavigationBehavior = passthroughNavigation;

const navigationModuleFactory = () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '',
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
  useSelectedLayoutSegments: () => [],
  redirect: (path: string) => navigationBehavior.redirect(path),
  notFound: () => navigationBehavior.notFound(),
});

mock.module('next/navigation', navigationModuleFactory);

let automationsPage: typeof import('./page')['default'] | null = null;
// The workspace page's default export is now just the Suspense wrapper; the
// redirect/notFound/throw contract under test lives in the loader beneath it.
let automationWorkspacePage:
  | typeof import('./[automationId]/automationWorkspaceLoader')['AutomationWorkspaceLoader']
  | null = null;

const NAVIGATION_SHADOW_DIAGNOSTIC =
  'Could not link the automations page modules. mock.module is process-wide and ' +
  'resolved once per run: src/app/(post-auth)/scale/PaidMediaClient.test.tsx registers ' +
  'next/navigation with only useRouter and useSearchParams, so every other importer of ' +
  "redirect/notFound loses those exports. Add redirect and notFound to that spec's " +
  'factory, or run this file on its own.';

beforeAll(async () => {
  mock.module('next/navigation', navigationModuleFactory);
  try {
    automationsPage = (await import('./page')).default;
    automationWorkspacePage = (await import('./[automationId]/automationWorkspaceLoader'))
      .AutomationWorkspaceLoader;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${NAVIGATION_SHADOW_DIAGNOSTIC} Loader error: ${detail}`);
  }
});

function createRedirectSpy() {
  return mock((destination: string): void => {
    throw new RedirectSignal(destination);
  });
}

function createNotFoundSpy() {
  return mock((): void => {
    throw new NotFoundSignal();
  });
}

let redirectSpy = createRedirectSpy();
let notFoundSpy = createNotFoundSpy();

async function captureRejection(runPage: () => Promise<unknown>): Promise<unknown> {
  try {
    await runPage();
  } catch (thrown) {
    return thrown;
  }

  throw new Error('Expected the page to reject, but it resolved.');
}

function expectError(thrown: unknown): Error {
  expect(thrown).toBeInstanceOf(Error);
  if (!(thrown instanceof Error)) {
    throw new Error('Unreachable: rejection value was not an Error.');
  }
  return thrown;
}

function openIndexPage() {
  if (!automationsPage) {
    throw new Error('The automations index page module was not loaded.');
  }
  return automationsPage();
}

function openWorkspacePage(automationId: string) {
  if (!automationWorkspacePage) {
    throw new Error('The automations workspace page module was not loaded.');
  }
  return automationWorkspacePage({ params: Promise.resolve({ automationId }) });
}

beforeEach(() => {
  activeBrandId = ACTIVE_BRAND_ID;
  readResult = { data: [], error: null };
  recordedQuery = null;
  redirectSpy = createRedirectSpy();
  notFoundSpy = createNotFoundSpy();
  navigationBehavior = {
    redirect: (destination) => redirectSpy(destination),
    notFound: () => notFoundSpy(),
  };
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  navigationBehavior = passthroughNavigation;
});

describe('automations route boundaries', () => {
  it('retries the index route when Try again is pressed', () => {
    const reset = mock(() => {});
    render(<AutomationsError error={new Error('read failed')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeTruthy();
  });

  it('retries the workspace route when Try again is pressed', () => {
    const reset = mock(() => {});
    render(<AutomationWorkspaceError error={new Error('read failed')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to automations' })).toBeTruthy();
  });

  it('offers an escape link from the not-found boundary', () => {
    render(<AutomationWorkspaceNotFound />);

    expect(screen.getByText('Workflow not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to automations' })).toBeTruthy();
  });

  it('shapes the index skeleton like a card page and the workspace skeleton like editor chrome', () => {
    const index = render(<AutomationsLoading />).container;
    const workspace = render(<AutomationWorkspaceLoading />).container;

    expect(index.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(workspace.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

    // Each skeleton has to be structurally unmistakable for the other one: the
    // index is a plain scrolling body, the workspace is header + palette rail +
    // inspector rail. Swapping either component's markup fails these counts.
    expect(index.querySelectorAll('header').length).toBe(0);
    expect(index.querySelectorAll('aside').length).toBe(0);
    expect(workspace.querySelectorAll('header').length).toBe(1);
    expect(workspace.querySelectorAll('aside').length).toBe(2);
  });
});

describe('automations index page', () => {
  it('rejects when the workflow read fails so error.tsx owns the retry', async () => {
    readResult = { data: null, error: { message: 'permission denied for table automations' } };

    const thrown = await captureRejection(() => openIndexPage());

    expect(expectError(thrown).message).toContain('permission denied for table automations');
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('renders the empty state when the read succeeds with no rows', async () => {
    readResult = { data: [], error: null };

    const { container } = render(await openIndexPage());
    const view = within(container);

    expect(view.getByText('No workflows yet')).toBeTruthy();
    expect(container.querySelectorAll('a[href^="/automations/"]').length).toBe(0);
    expect(view.getByTestId('template-gallery').getAttribute('data-brand-id')).toBe(
      ACTIVE_BRAND_ID,
    );
    expect(recordedQuery?.schema).toBe('brand_profiles');
    expect(recordedQuery?.table).toBe('automations');
    expect(recordedQuery?.filters.brand_id).toBe(ACTIVE_BRAND_ID);
  });

  it('renders a card per workflow when rows come back', async () => {
    readResult = {
      data: [
        {
          id: AUTOMATION_ID,
          name: 'Weekly recap',
          enabled: true,
          updated_at: '2026-07-20T10:00:00.000Z',
        },
        {
          id: OTHER_AUTOMATION_ID,
          name: 'Lead nurture',
          enabled: false,
          updated_at: '2026-07-19T10:00:00.000Z',
        },
      ],
      error: null,
    };

    const { container } = render(await openIndexPage());
    const view = within(container);

    expect(view.queryByText('No workflows yet')).toBeNull();
    expect(container.querySelectorAll('a[href^="/automations/"]').length).toBe(2);
    expect(
      container.querySelector(`a[href="/automations/${AUTOMATION_ID}"]`)?.textContent,
    ).toContain('Weekly recap');
    expect(
      container.querySelector(`a[href="/automations/${AUTOMATION_ID}"]`)?.textContent,
    ).toContain('Enabled');
    expect(
      container.querySelector(`a[href="/automations/${OTHER_AUTOMATION_ID}"]`)?.textContent,
    ).toContain('Paused');
  });

  it('redirects to onboarding when no brand is active', async () => {
    activeBrandId = null;

    const thrown = await captureRejection(() => openIndexPage());

    expect(thrown).toBeInstanceOf(RedirectSignal);
    expect(redirectSpy).toHaveBeenCalledWith('/onboarding');
    expect(recordedQuery).toBeNull();
  });
});

describe('automations workspace page', () => {
  it('renders the workspace when the automation belongs to the active brand', async () => {
    readResult = { data: { id: AUTOMATION_ID, brand_id: ACTIVE_BRAND_ID }, error: null };

    const { container } = render(await openWorkspacePage(AUTOMATION_ID));
    const view = within(container);

    expect(view.getByTestId('automation-workspace').getAttribute('data-automation-id')).toBe(
      AUTOMATION_ID,
    );
    expect(notFoundSpy).not.toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(recordedQuery?.usedMaybeSingle).toBe(true);
  });

  it('calls notFound when the automation is missing or owned by another brand', async () => {
    readResult = { data: null, error: null };

    const thrown = await captureRejection(() => openWorkspacePage(AUTOMATION_ID));

    expect(thrown).toBeInstanceOf(NotFoundSignal);
    expect(notFoundSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(recordedQuery?.filters.id).toBe(AUTOMATION_ID);
    expect(recordedQuery?.filters.brand_id).toBe(ACTIVE_BRAND_ID);
  });

  it('rejects instead of 404-ing when the workspace read fails', async () => {
    readResult = { data: null, error: { message: 'connection reset by peer' } };

    const thrown = await captureRejection(() => openWorkspacePage(AUTOMATION_ID));

    expect(expectError(thrown).message).toContain('connection reset by peer');
    expect(thrown).not.toBeInstanceOf(NotFoundSignal);
    expect(notFoundSpy).not.toHaveBeenCalled();
  });

  it('redirects to onboarding when no brand is active', async () => {
    activeBrandId = null;

    const thrown = await captureRejection(() => openWorkspacePage(AUTOMATION_ID));

    expect(thrown).toBeInstanceOf(RedirectSignal);
    expect(redirectSpy).toHaveBeenCalledWith('/onboarding');
    expect(notFoundSpy).not.toHaveBeenCalled();
    expect(recordedQuery).toBeNull();
  });
});
