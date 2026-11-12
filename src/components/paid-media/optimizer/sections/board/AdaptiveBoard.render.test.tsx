import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdAccountReading, BoardModuleId } from '@continuum/contracts';
import { cleanup, fireEvent } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { BoardModuleProps } from './types';

// The board around its modules. The modules are each other agents' and have render tests of
// their own, so the registry here draws a stub per module that names its slot; one of them
// throws, to prove a module that fails costs only its own frame. `mock.module` replaces a module
// for the whole process, so this file runs on its own; every mock spreads the real module.
let throwing: BoardModuleId | null = null;
const realRegistry = await import('./registry');
const { ModuleFrame } = await import('./ModuleFrame');
function StubModule({ slot }: BoardModuleProps) {
  if (slot.module === throwing) throw new Error(`stub ${slot.module} failed`);
  return (
    <ModuleFrame
      reason={slot.reason}
      size={slot.size}
      testId={`board-module-${slot.module}`}
      title={realRegistry.BOARD_MODULE_TITLES[slot.module]}
    >
      <p>{slot.module} body</p>
    </ModuleFrame>
  );
}
mock.module('./registry', () => ({
  ...realRegistry,
  BOARD_MODULES: Object.fromEntries(
    Object.keys(realRegistry.BOARD_MODULES).map((id) => [id, StubModule]),
  ),
}));

// Vivo 47's Google reading as the adaptive page wrote it on Oct 31 (data.js): Fix first, the
// conversion signal first, 572 real leads against 3,857 Google conversions.
const VIVO_47: AdAccountReading = {
  platform: 'google_ads',
  mode: 'fix',
  modeLabel: 'Fix first',
  modeReason:
    'El 85% de lo que Google cuenta como conversión es una visita: la puja compra visitas, así que cualquier subida de presupuesto espera esa corrección.',
  result: {
    label: 'leads reales',
    count: 572,
    platformReported: 3857,
    costPerResult: 73.86,
    goal: null,
    spend: 42_796.38,
    currency: 'MXN',
    windowDays: 30,
  },
  board: [
    {
      module: 'signal',
      size: 'l',
      score: 96,
      reason: '85% son eventos de atención.',
    },
    {
      module: 'decisions',
      size: 'm',
      score: 88,
      reason: '6 tarjetas, 2 altas.',
    },
    {
      module: 'result',
      size: 'm',
      score: 84,
      reason: 'Google reporta 3,857; contamos 572.',
    },
    {
      module: 'quality',
      size: 's',
      score: 71,
      reason: '56% del gasto de keywords en QS ≤ 3.',
    },
    {
      module: 'portfolios',
      size: 'w',
      score: 40,
      reason: '1 portafolio de Google.',
    },
  ],
  hidden: [{ module: 'structure', reason: 'Una campaña lleva el 83% del gasto.' }],
  asks: [
    '¿Cuántos leads reales llevo este mes?',
    '¿Por qué Google cuenta visitas como conversiones?',
  ],
  notices: [],
};

let reading: AdAccountReading | null = VIVO_47;
let readingLoading = false;
const realReading = await import('./useAdAccountReading');
mock.module('./useAdAccountReading', () => ({
  ...realReading,
  useAdAccountReading: () => ({ reading, isLoading: readingLoading }),
}));

const { AdaptiveBoard } = await import('./AdaptiveBoard');
const { BoardSwitch } = await import('./BoardSwitch');
const { BOARD_LAYOUT_KEY } = await import('./boardLayout');

afterEach(() => {
  cleanup();
  throwing = null;
  reading = VIVO_47;
  readingLoading = false;
  window.localStorage.clear();
});

const BASE = {
  brandId: 'b1',
  platform: 'google_ads' as const,
  adAccountId: null,
  currency: 'MXN',
  portfolios: [],
  onOpenActions: () => {},
  onOpenActivity: () => {},
  onSelectPortfolio: () => {},
  onCreatePortfolio: () => {},
};
const TAB_ASKS = [
  {
    key: 'search_terms',
    label: 'Which search terms bring leads?',
    prompt: 'p',
  },
];

const slotOrder = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-board-slot]')].map((slot) =>
    slot.getAttribute('data-board-slot'),
  );

describe('AdaptiveBoard — the header', () => {
  it('says the mode, why, and the result that counts', () => {
    const { getByTestId } = render(<AdaptiveBoard ctx={{ ...BASE, reading: VIVO_47 }} />);
    expect(getByTestId('board-mode').getAttribute('data-mode')).toBe('fix');
    expect(getByTestId('board-mode-label').textContent).toBe('Fix first');
    expect(getByTestId('board-mode-reason').textContent).toStartWith('El 85% de lo que Google');
    expect(getByTestId('board-result-chip').textContent).toBe('572 leads reales');
  });

  it('adds the goal to the chip when the reading has one', () => {
    const withGoal = {
      ...VIVO_47,
      result: { ...VIVO_47.result, count: null, goal: 99 },
    };
    const { getByTestId } = render(<AdaptiveBoard ctx={{ ...BASE, reading: withGoal }} />);
    expect(getByTestId('board-result-chip').textContent).toBe('leads reales · goal $99.00 MXN');
  });
});

describe('AdaptiveBoard — the modules', () => {
  it('lays the modules out in the reading’s order, each at its size', async () => {
    const { getByTestId, findByTestId } = render(
      <AdaptiveBoard ctx={{ ...BASE, reading: VIVO_47 }} />,
    );
    const board = getByTestId('adaptive-board');
    expect(board.getAttribute('data-board-order')).toBe(
      'signal,decisions,result,quality,portfolios',
    );
    expect(slotOrder(board)).toEqual(['signal', 'decisions', 'result', 'quality', 'portfolios']);
    const sizes = [...board.querySelectorAll('[data-board-slot]')].map((slot) => slot.className);
    expect(sizes[0]).toContain('xl:row-span-2');
    expect(sizes[3]).not.toContain('md:col-span-2');
    expect(sizes[4]).toContain('xl:col-span-4');
    expect((await findByTestId('board-module-result')).textContent).toContain('result body');
  });

  it('holds every slot’s skeleton while the reading is gathered', () => {
    const { getByTestId } = render(<AdaptiveBoard ctx={{ ...BASE, reading: VIVO_47 }} loading />);
    const board = getByTestId('adaptive-board');
    expect(board.getAttribute('data-loading')).toBe('true');
    expect(board.querySelectorAll('[data-module-state="loading"]')).toHaveLength(5);
  });

  it('draws a module that throws as its frame saying so, and the rest of the board', async () => {
    throwing = 'quality';
    const errors = console.error;
    console.error = () => {};
    try {
      const { findByTestId } = render(<AdaptiveBoard ctx={{ ...BASE, reading: VIVO_47 }} />);
      const failed = await findByTestId('board-module-quality');
      expect(failed.getAttribute('data-module-state')).toBe('error');
      expect(failed.textContent).toContain('This view could not be drawn.');
      expect((await findByTestId('board-module-portfolios')).textContent).toContain(
        'portfolios body',
      );
    } finally {
      console.error = errors;
    }
  });

  it('says the problems under the Fix-first line without changing the mode', () => {
    const withNotice: AdAccountReading = {
      ...VIVO_47,
      mode: 'operate',
      modeLabel: 'Autopilot',
      notices: [
        {
          module: 'portfolios',
          reason: 'Tours Programados perdió sus 3 conjuntos: es el 10% del presupuesto diario.',
          share: 0.1,
        },
      ],
    };
    const { getByTestId } = render(<AdaptiveBoard ctx={{ ...BASE, reading: withNotice }} />);
    expect(getByTestId('board-notices').textContent).toBe(
      'Tours Programados perdió sus 3 conjuntos: es el 10% del presupuesto diario.',
    );
  });
});

describe('AdaptiveBoard — Ask Jaina', () => {
  it('asks the reading’s questions, in the account’s language, scoped to the platform', () => {
    const { getByTestId } = render(
      <AdaptiveBoard
        asks={[{ key: 'a', label: '¿Cuántos?', prompt: '¿Cuántos?' }]}
        ctx={{ ...BASE, reading: VIVO_47 }}
      />,
    );
    const link = getByTestId('board-asks').querySelector('a');
    expect(link?.textContent).toBe('¿Cuántos?');
    expect(link?.getAttribute('href')).toStartWith('/scale?tab=jaina&platform=google_ads&new=1');
  });
});

describe('BoardSwitch — Adaptive · Today', () => {
  const today = <p data-testid="today-layout">Today’s Overview</p>;

  it('opens on the board, with the reading’s questions', () => {
    const { getByTestId, queryByTestId } = render(
      <BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />,
    );
    expect(getByTestId('adaptive-board')).toBeTruthy();
    expect(queryByTestId('today-layout')).toBeNull();
    expect(getByTestId('board-layout-adaptive').getAttribute('aria-pressed')).toBe('true');
    const labels = [...getByTestId('board-asks').querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).toEqual(VIVO_47.asks);
  });

  it('keeps the tab’s own questions when the reading asks none', () => {
    reading = { ...VIVO_47, asks: [] };
    const { getByTestId } = render(<BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />);
    expect(getByTestId('board-asks').querySelector('a')?.textContent).toBe(
      'Which search terms bring leads?',
    );
  });

  it('switches to Today exactly as it renders, remembers it, and switches back', () => {
    const first = render(<BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />);
    fireEvent.click(first.getByTestId('board-layout-today'));
    expect(first.getByTestId('today-layout').textContent).toBe('Today’s Overview');
    expect(first.queryByTestId('adaptive-board')).toBeNull();
    expect(
      first.getByTestId('board-today-bar').contains(first.getByTestId('board-layout-toggle')),
    ).toBe(true);
    expect(window.localStorage.getItem(BOARD_LAYOUT_KEY)).toBe('today');
    first.unmount();

    const again = render(<BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />);
    expect(again.getByTestId('today-layout')).toBeTruthy();
    fireEvent.click(again.getByTestId('board-layout-adaptive'));
    expect(again.getByTestId('adaptive-board')).toBeTruthy();
    expect(window.localStorage.getItem(BOARD_LAYOUT_KEY)).toBe('adaptive');
  });

  it('still switches for a viewer whose storage refuses the write', () => {
    const setItem = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      const { getByTestId } = render(<BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />);
      fireEvent.click(getByTestId('board-layout-today'));
      expect(getByTestId('today-layout')).toBeTruthy();
      fireEvent.click(getByTestId('board-layout-adaptive'));
      expect(getByTestId('adaptive-board')).toBeTruthy();
    } finally {
      window.localStorage.setItem = setItem;
    }
  });

  it('holds the spine’s frames while there is no reading yet', () => {
    reading = null;
    readingLoading = true;
    const { getByTestId } = render(<BoardSwitch asks={TAB_ASKS} base={BASE} today={today} />);
    const board = getByTestId('adaptive-board');
    expect(board.getAttribute('data-loading')).toBe('true');
    expect(
      [...board.querySelectorAll('[data-module-state="loading"]')].map((node) =>
        node.getAttribute('data-testid'),
      ),
    ).toEqual([
      'board-module-result-skeleton',
      'board-module-decisions-skeleton',
      'board-module-portfolios-skeleton',
    ]);
    expect(getByTestId('board-layout-toggle')).toBeTruthy();
  });
});
