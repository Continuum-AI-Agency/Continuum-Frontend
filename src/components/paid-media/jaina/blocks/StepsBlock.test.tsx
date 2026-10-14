import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { StepsBlockV2 } from '@/lib/jaina/schemas';
import StepsBlock from './StepsBlock';

afterEach(cleanup);

type Item = StepsBlockV2['items'][number];

const item = (overrides: Partial<Item>): Item => ({
  action: 'Sube el presupuesto de CAÑADAS // MENSAJES',
  where: 'Ads Manager → Conjuntos de anuncios → Presupuesto',
  expected_effect: 'Más conversaciones al mismo costo por resultado',
  figure: null,
  cite_ids: [],
  ...overrides,
});

const block = (items: Item[]): StepsBlockV2 => ({
  block_id: 'how',
  category: 'steps',
  scope: 'account',
  title: 'Cómo aprovecharlo',
  priority: 'primary',
  provenance: null,
  items,
  citations: [],
});

describe('StepsBlock — the moves, in the order they are done', () => {
  it('numbers each step and keeps the order it was sent in', () => {
    render(
      <StepsBlock
        block={block([item({}), item({ action: 'Revisa el costo por resultado en 3 días' })])}
        isStreaming={false}
      />,
    );
    const steps = Array.from(document.querySelectorAll('[data-step]'));
    expect(steps.map((step) => step.getAttribute('data-step'))).toEqual(['1', '2']);
    expect(steps[1].textContent).toContain('Revisa el costo por resultado en 3 días');
  });

  it('says where each move is done and what it should change', () => {
    render(<StepsBlock block={block([item({})])} isStreaming={false} />);
    expect(document.querySelector('[data-step-where]')?.textContent).toBe(
      'Ads Manager → Conjuntos de anuncios → Presupuesto',
    );
    expect(document.querySelector('[data-step-effect]')?.textContent).toBe(
      'Más conversaciones al mismo costo por resultado',
    );
  });

  it('prints a money figure as "$85.47 MXN" and stamps its raw value and currency', () => {
    render(
      <StepsBlock
        block={block([
          item({
            figure: {
              label: 'Costo por resultado',
              value: 85.47,
              unit: null,
              currency: 'MXN',
              format: 'currency',
              percent_basis: null,
            },
          }),
        ])}
        isStreaming={false}
      />,
    );
    const figure = screen.getByTestId('figure');
    expect(figure.textContent).toBe('$85.47 MXN');
    expect(figure.getAttribute('data-figure-raw')).toBe('85.47');
    expect(figure.getAttribute('data-figure-currency')).toBe('MXN');
  });

  it('names the currency once when the payload also sends it as the unit', () => {
    render(
      <StepsBlock
        block={block([
          item({
            figure: {
              label: 'Costo por conversación',
              value: 67.28,
              unit: 'MXN',
              currency: 'MXN',
              format: 'currency',
              percent_basis: null,
            },
          }),
        ])}
        isStreaming={false}
      />,
    );
    const line = screen.getByTestId('figure').parentElement?.textContent ?? '';
    expect(line).toBe('$67.28 MXN· Costo por conversación');
  });

  it('prints no figure line on a step that stands on none', () => {
    render(<StepsBlock block={block([item({})])} isStreaming={false} />);
    expect(screen.queryByTestId('figure')).toBeNull();
  });
});
