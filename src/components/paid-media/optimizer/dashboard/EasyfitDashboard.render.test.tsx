import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { EasyfitDashboardResponse, EasyfitPilotConfig } from '@continuum/contracts';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';
import { configFixture, responseFixture } from './__fixtures__/easyfitPayload';

// The shell's states come from its data hooks, so those are the seam: each test sets what the
// reads answered and asserts what the person sees. `mock.module` replaces the module for this
// file's process only.

type ReadState<T> = {
  isLoading: boolean;
  isError: boolean;
  data: T | undefined;
  refetch: () => Promise<unknown>;
};

const refetch = mock(async () => undefined);
const mutate = mock(
  (_config: EasyfitPilotConfig, _options?: { onSuccess?: () => void }) => undefined,
);
let dashboard: ReadState<EasyfitDashboardResponse>;
let config: ReadState<EasyfitPilotConfig>;
let canEdit = false;
let save: {
  mutate: typeof mutate;
  isPending: boolean;
  isError: boolean;
  error: unknown;
};

mock.module('./useEasyfitDashboardData', () => ({
  useEasyfitDashboard: () => dashboard,
  useEasyfitConfig: () => config,
  useCanEditEasyfitConfig: () => canEdit,
  useSaveEasyfitConfig: () => save,
}));

const { EasyfitDashboard } = await import('./EasyfitDashboard');

const ready = <T,>(data: T): ReadState<T> => ({
  isLoading: false,
  isError: false,
  data,
  refetch,
});

beforeEach(() => {
  window.history.replaceState(null, '', '/scale?tab=performance&optimizerView=dashboard');
  dashboard = ready(responseFixture);
  config = ready(configFixture);
  canEdit = false;
  save = { mutate, isPending: false, isError: false, error: null };
  mutate.mockClear();
  refetch.mockClear();
});

afterEach(cleanup);

const renderDashboard = () =>
  render(<EasyfitDashboard brandId="6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64" />);

describe('EasyfitDashboard states', () => {
  it('shows a busy skeleton while the payload has never answered', () => {
    dashboard = { ...ready(responseFixture), isLoading: true, data: undefined };
    renderDashboard();

    const busy = screen.getByText('Cargando el dashboard').closest('[role="status"]');
    expect(busy?.getAttribute('aria-busy')).toBe('true');
  });

  it('says the read failed and retries on request', () => {
    dashboard = { ...ready(responseFixture), isError: true, data: undefined };
    renderDashboard();

    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('explains the empty state when no run has published a payload', () => {
    dashboard = ready({ ...responseFixture, payload: null });
    renderDashboard();

    expect(screen.getByText('Todavía no hay datos')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('EasyfitDashboard header', () => {
  it('names the module, the update time and each source’s data date', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Easy Fit · Altas' })).toBeTruthy();
    expect(screen.getByTestId('dashboard-updated').textContent).toContain('07:40');
    expect(screen.getByText('Peaking: datos al 1 nov')).toBeTruthy();
    expect(screen.getByText('Meta: datos al 31 oct')).toBeTruthy();
    expect(screen.queryByTestId('stale-banner')).toBeNull();
  });

  it('raises a "datos atrasados" banner naming the source that is behind', () => {
    dashboard = ready({
      ...responseFixture,
      meta: { ...responseFixture.meta, atrasadas: ['peaking'] },
    });
    renderDashboard();

    const banner = screen.getByTestId('stale-banner');
    expect(banner.textContent).toContain('Datos atrasados');
    expect(banner.textContent).toContain('Peaking no se actualizó');
    expect(screen.getByText('Peaking: datos al 1 nov').getAttribute('data-tone')).toBe('warn');
  });
});

describe('EasyfitDashboard sections', () => {
  it('opens on Piloto and moves between sections through the URL hash', () => {
    renderDashboard();

    expect(screen.getByTestId('pilot-month-2026-11')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Embudo a altas' }));
    expect(window.location.hash).toBe('#embudo');
    expect(screen.getByRole('table', { name: 'Cohortes por mes de clic' })).toBeTruthy();
    expect(window.location.search).toContain('optimizerView=dashboard');
  });

  it('deep-links a section from the hash', () => {
    window.history.replaceState(null, '', '/scale?optimizerView=dashboard#sucursales');
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Altas por sucursal' })).toBeTruthy();
  });

  it('offers all nine sections', () => {
    renderDashboard();

    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(9);
  });
});

describe('EasyfitDashboard config editing', () => {
  it('shows no edit control to a role that may not edit', () => {
    renderDashboard();

    expect(screen.queryByRole('button', { name: 'Editar metas y plan' })).toBeNull();
  });

  it('lets an editor change a month goal and saves the whole config', () => {
    canEdit = true;
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Editar metas y plan' }));
    const panel = screen.getByTestId('easyfit-config-panel');
    const goals = within(panel).getAllByLabelText('Objetivo de altas');
    fireEvent.change(goals[0] as HTMLElement, { target: { value: '750' } });
    fireEvent.submit(panel.querySelector('form') as HTMLFormElement);

    return new Promise<void>((resolve) => setTimeout(resolve, 0)).then(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
      const saved = mutate.mock.calls[0]?.[0];
      expect(saved?.piloto.piloto.meses[0]?.objetivo).toBe(750);
      expect(saved?.piloto.brand_id).toBe(configFixture.piloto.brand_id);
      expect(saved?.plan).toEqual(configFixture.plan);
    });
  });

  it('says in words when the server refuses the save with a 403', () => {
    canEdit = true;
    save = { ...save, isError: true, error: new ApiError('forbidden', 403) };
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'Editar metas y plan' }));
    expect(screen.getByRole('alert').textContent).toContain('Tu rol no puede editar');
  });
});
