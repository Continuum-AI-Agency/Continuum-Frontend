import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { CheckpointBlockV2 } from '@/lib/jaina/schemas';
import { BlockHeading } from './BlockHeading';
import {
  displayBlockTitle,
  displayEntity,
  EntityNamesProvider,
  entityNamesOf,
  idKey,
} from './entityNames';

afterEach(cleanup);

const block = (raw: Record<string, unknown>): CheckpointBlockV2 =>
  ({ scope: 'account', priority: 1, provenance: null, ...raw }) as unknown as CheckpointBlockV2;

describe('idKey — what a raw id looks like', () => {
  it('reads every spelling of a Meta id down to its digits', () => {
    expect(idKey('act_521903353286118')).toBe('521903353286118');
    expect(idKey('account-521903353286118')).toBe('521903353286118');
    expect(idKey('campaign-120212345678901')).toBe('120212345678901');
    expect(idKey('adset_120212345678901')).toBe('120212345678901');
    expect(idKey('120212345678901')).toBe('120212345678901');
  });

  it('is not fooled by a name', () => {
    expect(idKey('Easyfit')).toBeNull();
    expect(idKey('CAÑADAS // MENSAJES // AGOSTO 2026')).toBeNull();
    expect(idKey('Copy 3')).toBeNull();
    expect(idKey('')).toBeNull();
  });
});

describe('entityNamesOf — the names the report already knows', () => {
  it('takes the name an actions row gives its entity', () => {
    const names = entityNamesOf([
      block({
        block_id: 'moves',
        category: 'actions',
        title: 'Next moves',
        rows: [
          {
            priority: 'P1',
            entity: {
              id: '120212345678901',
              name: 'ALEIRA // MENSAJES',
              kind: null,
              level: 'campaign',
            },
            action: 'Pause',
            sizing: null,
            evidence: { metric: 'cost', value: 54.84, unit: 'MXN', window: '7d', comparator: null },
            cite_ids: [],
          },
        ],
        citations: [],
      }),
    ]);
    expect(names.get('120212345678901')).toBe('ALEIRA // MENSAJES');
  });

  it('takes the name a table row prints beside its entity_id', () => {
    const names = entityNamesOf([
      block({
        block_id: 'rows',
        category: 'data_table',
        title: 'Campaigns',
        columns: [
          { key: 'campaign', label: 'Campaign', format: 'text', align: 'left' },
          { key: 'spend', label: 'Spend', format: 'currency', align: 'right' },
        ],
        rows: [{ campaign: 'CAÑADAS // MENSAJES', spend: 2197 }],
        row_meta: [{ entity_id: 'campaign-120299999999999' }],
      }),
    ]);
    expect(names.get('120299999999999')).toBe('CAÑADAS // MENSAJES');
  });

  it('takes the provenance label as the name of the id the title carries', () => {
    const names = entityNamesOf([
      block({
        block_id: 'kpis',
        category: 'metric_grid',
        title: 'Key Metrics — account-521903353286118',
        provenance: {
          source: 'computed',
          tool: 'get_key_metrics',
          period: null,
          entity_label: 'Easyfit',
          record_count: 4,
        },
        metrics: [],
      }),
    ]);
    expect(names.get('521903353286118')).toBe('Easyfit');
  });

  it('never records an id as a name', () => {
    const names = entityNamesOf([
      block({
        block_id: 'kpis',
        category: 'metric_grid',
        title: 'Key Metrics — act_521903353286118',
        provenance: {
          source: 'computed',
          tool: null,
          period: null,
          entity_label: 'act_521903353286118',
          record_count: 4,
        },
        metrics: [],
      }),
    ]);
    expect(names.size).toBe(0);
  });
});

describe('displayBlockTitle — names, never ids', () => {
  const names = new Map([['521903353286118', 'Easyfit']]);

  it('swaps a trailing id for the name when the report knows one', () => {
    expect(displayBlockTitle('Key Metrics — account-521903353286118', names)).toBe(
      'Key Metrics — Easyfit',
    );
    expect(displayBlockTitle('Performance Trend — act_521903353286118', names)).toBe(
      'Performance Trend — Easyfit',
    );
    expect(displayBlockTitle('Top Results - 521903353286118', names)).toBe('Top Results — Easyfit');
  });

  it('keeps an honest id when nobody named it, and a title with no id at all', () => {
    expect(displayBlockTitle('Key Metrics — account-999999999999999', names)).toBe(
      'Key Metrics — account-999999999999999',
    );
    expect(displayBlockTitle('Rendimiento general de la cuenta', names)).toBe(
      'Rendimiento general de la cuenta',
    );
    expect(displayBlockTitle('Spend — Easyfit', names)).toBe('Spend — Easyfit');
  });

  it('resolves a bare entity the same way', () => {
    expect(displayEntity('act_521903353286118', names)).toBe('Easyfit');
    expect(displayEntity('act_1', names)).toBe('act_1');
  });
});

describe('BlockHeading — the title every block draws', () => {
  it('prints the name from the report’s map and never the raw id', () => {
    render(
      <EntityNamesProvider names={new Map([['521903353286118', 'Easyfit']])}>
        <BlockHeading title="Key Metrics — account-521903353286118" />
      </EntityNamesProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Key Metrics — Easyfit' })).toBeTruthy();
    expect(screen.queryByText(/521903353286118/)).toBeNull();
  });

  it('prints the title as given outside any report', () => {
    render(<BlockHeading title="Key Metrics — account-521903353286118" />);
    expect(
      screen.getByRole('heading', { name: 'Key Metrics — account-521903353286118' }),
    ).toBeTruthy();
  });

  it('sets the title at table size, semibold', () => {
    render(<BlockHeading title="Spend" />);
    const heading = screen.getByRole('heading', { name: 'Spend' });
    expect(heading.className).toContain('text-sm');
    expect(heading.className).toContain('font-semibold');
  });
});
