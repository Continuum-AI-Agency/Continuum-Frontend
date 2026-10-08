// A templated answer's table and a report's data table are the same table.
import { afterEach, describe, expect, it } from 'bun:test';
import type { TemplateFigure, TemplateTable } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import type { DataTableBlockV2 } from '@/lib/jaina/schemas';
import { JAINA_TABLE } from '../reading';
import { TemplateTableView } from '../templates/TemplateTableView';
import { DataTableBlock } from './DataTableBlock';

afterEach(cleanup);

const dataTable: DataTableBlockV2 = {
  block_id: 'rows',
  category: 'data_table',
  scope: 'account',
  title: 'Campaigns',
  priority: 1,
  provenance: null,
  grounding: null,
  columns: [
    { key: 'campaign', label: 'Campaign', format: 'text', align: 'left', percent_basis: null },
    { key: 'spend', label: 'Spend', format: 'currency', align: 'right', percent_basis: null },
  ],
  rows: [{ campaign: 'CAÑADAS // MENSAJES', spend: 2197 }],
  notes: null,
  dataset_id: null,
  row_meta: [{ currency: 'MXN' }],
  render_mode: 'table',
  card_fields: null,
} as unknown as DataTableBlockV2;

const figure: TemplateFigure = {
  id: 'spend',
  label: 'Spend',
  value: 2197,
  unit: 'currency',
  currency: 'MXN',
  window: { since: '2026-09-20', until: '2026-09-26', label: '20–26 Sep' },
  source: { tool: 'get_key_metrics', datasetId: 'ds1' },
  derivation: null,
  format: null,
} as unknown as TemplateFigure;
const templateTable: TemplateTable = {
  columns: [{ key: 'spend', label: 'Spend' }],
  rows: [{ label: 'CAÑADAS // MENSAJES', entity_id: null, cells: { spend: 'spend' } }],
} as unknown as TemplateTable;

const tableClasses = (container: HTMLElement) => ({
  table: container.querySelector('table')?.className,
  th: container.querySelector('th')?.className,
  td: container.querySelector('td')?.className,
});

describe('one table style', () => {
  it('draws the data table and the template table from the same classes', () => {
    const report = tableClasses(
      render(<DataTableBlock block={dataTable} isStreaming={false} />).container,
    );
    cleanup();
    const template = tableClasses(
      render(<TemplateTableView table={templateTable} figures={[figure]} />).container,
    );
    expect(report.table).toBe(JAINA_TABLE.table);
    expect(template.table).toBe(JAINA_TABLE.table);
    for (const classes of [report, template]) {
      expect(classes.th).toContain(JAINA_TABLE.th);
      expect(classes.td).toContain(JAINA_TABLE.td);
      expect(classes.table).not.toContain('text-xs');
    }
  });
});
