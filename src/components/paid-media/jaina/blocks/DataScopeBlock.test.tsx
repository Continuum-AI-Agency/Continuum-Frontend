import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { DataScopeBlockV2 } from '@/lib/jaina/schemas';
import { AnswerLanguageProvider } from '../answerLanguageContext';

let DataScopeBlock: typeof import('./DataScopeBlock')['default'];

beforeAll(async () => {
  DataScopeBlock = (await import('./DataScopeBlock')).default;
});

afterEach(cleanup);

const block = {
  block_id: 'composed_scope',
  category: 'data_scope',
  scope: 'account',
  title: 'Alcance de los datos',
  priority: 'secondary',
  dates: '2026-10-06 → 2026-10-19',
  timezone: null,
  source: 'api',
  notes: ['Otras métricas: 2026-09-22 → 2026-10-05.'],
} as unknown as DataScopeBlockV2;

// gate-p3: a Spanish answer opened "Scope: … · live platform read" on beta.
describe('DataScopeBlock', () => {
  it('states the scope in the answer language', () => {
    const { container } = render(
      <AnswerLanguageProvider language="es">
        <DataScopeBlock block={block} isStreaming={false} />
      </AnswerLanguageProvider>,
    );
    expect(container.textContent).toContain('Alcance: 2026-10-06 → 2026-10-19');
    expect(container.textContent).toContain('lectura en vivo de la plataforma');
    expect(container.textContent).not.toMatch(/Scope:|live platform read/);
  });

  it('keeps English when the answer is English', () => {
    const { container } = render(<DataScopeBlock block={block} isStreaming={false} />);
    expect(container.textContent).toContain('Scope: 2026-10-06 → 2026-10-19');
    expect(container.textContent).toContain('live platform read');
  });
});
