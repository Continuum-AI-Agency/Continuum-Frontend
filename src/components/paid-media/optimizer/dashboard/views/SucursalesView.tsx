// Sucursales: sign-ups, Meta sign-ups and cost per branch ordered cheapest first, and the
// ad-branch × tour-branch matrix in row percentages (docs/05 §7).

import type { EasyfitChipThresholds, EasyfitDashboardPayload } from '@continuum/contracts';
import { formatMxn, formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { CostChip } from '../parts/CostChip';
import { DataTable } from '../parts/DataTable';
import { Block, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';

/** Cheapest Meta sign-up first; branches with no Meta sign-up go last. */
function byMetaCost(
  a: EasyfitDashboardPayload['sucursales'][number],
  b: EasyfitDashboardPayload['sucursales'][number],
): number {
  return (a.cpa_meta ?? Number.POSITIVE_INFINITY) - (b.cpa_meta ?? Number.POSITIVE_INFINITY);
}

function CrossMatrix({ payload }: { payload: EasyfitDashboardPayload }) {
  const { locale, t } = useDashboardCopy();
  const { filas, columnas, valores } = payload.cruce_sucursal;
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        aria-label={t.sucursales.crossTitle}
        className="w-full border-separate border-spacing-0.5 text-xs"
      >
        <thead>
          <tr>
            <th className="text-left font-semibold text-muted-foreground" scope="col">
              {t.sucursales.crossCorner}
            </th>
            {columnas.map((column) => (
              <th
                className="text-right font-semibold text-muted-foreground"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((row, rowIndex) => {
            const cells = valores[rowIndex] ?? [];
            const total = cells.reduce((sum, value) => sum + value, 0);
            return (
              <tr key={row}>
                <th className="text-left font-medium" scope="row">
                  {row}
                </th>
                {columnas.map((column, columnIndex) => {
                  const tours = cells[columnIndex] ?? 0;
                  const share = total > 0 ? tours / total : 0;
                  const text = formatPct(100 * share, locale, 0);
                  return (
                    <td
                      className="rounded px-2 py-1.5 text-right font-mono tabular-nums"
                      key={column}
                      style={{
                        background: `color-mix(in oklab, ${SERIES_COLOR.blue} ${Math.round(share * 100)}%, transparent)`,
                        color: share >= 0.45 ? 'white' : undefined,
                      }}
                      title={t.sucursales.crossCell(text, formatNumber(tours, locale))}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SucursalesView({
  payload,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
}) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const branches = [...payload.sucursales].sort(byMetaCost);

  return (
    <ViewGrid>
      <ViewLead title={t.sucursales.lead}>
        {t.sucursales.leadBody(formatMxn(payload.inv_general_meses_reporte, locale))}
      </ViewLead>
      <Block subtitle={t.sucursales.tableSub} title={t.sucursales.tableTitle}>
        <DataTable
          caption={t.sucursales.tableTitle}
          columns={[
            {
              header: t.sucursales.colBranch,
              cell: (row) => <span className="font-medium">{row.nombre}</span>,
            },
            { header: t.sucursales.colSignups, numeric: true, cell: (row) => count(row.altas) },
            { header: t.sucursales.colMeta, numeric: true, cell: (row) => count(row.altas_meta) },
            {
              header: t.sucursales.colShare,
              numeric: true,
              cell: (row) => formatPct(row.pct_meta, locale),
            },
            {
              header: t.sucursales.colSpend,
              numeric: true,
              cell: (row) => formatMxn(row.inv_meta, locale),
            },
            {
              header: t.sucursales.colCost,
              numeric: true,
              cell: (row) => (
                <CostChip
                  emptyLabel={t.states.noSignups}
                  threshold={thresholds.costo_alta_meta}
                  value={row.cpa_meta}
                />
              ),
            },
            {
              header: t.sucursales.colAnnual,
              numeric: true,
              cell: (row) => formatPct(row.pct_anual_meta, locale, 0),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.nombre}
          rows={branches}
        />
      </Block>
      <Block span="wide" subtitle={t.sucursales.crossSub} title={t.sucursales.crossTitle}>
        <CrossMatrix payload={payload} />
      </Block>
    </ViewGrid>
  );
}
