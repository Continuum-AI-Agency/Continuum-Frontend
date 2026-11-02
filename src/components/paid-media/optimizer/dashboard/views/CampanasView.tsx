// Campañas y plataformas: Meta campaign types, the lead form month by month, Google Ads by
// campaign, and which ad accounts carry spend (docs/05 §4).

import type {
  EasyfitChipThreshold,
  EasyfitChipThresholds,
  EasyfitDashboardPayload,
} from '@continuum/contracts';
import { formatMonth, formatMxn, formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { CostChip } from '../parts/CostChip';
import { DataTable } from '../parts/DataTable';
import { Block, FindingCard, FindingGrid, ViewGrid, ViewLead } from '../parts/layout';

export function CampanasView({
  payload,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
}) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const money = (value: number | null) => formatMxn(value, locale);
  const { google, cuentas_meta: metaAccounts, otra_cuenta: otherAccount } = payload;
  const signupCost = (value: number | null, threshold: EasyfitChipThreshold) => (
    <CostChip emptyLabel={t.states.noSignups} threshold={threshold} value={value} />
  );

  return (
    <ViewGrid>
      <ViewLead title={t.campanas.lead}>{t.campanas.leadBody}</ViewLead>
      <Block
        subtitle={t.campanas.typeSub(count(payload.sin_campana_altas))}
        title={t.campanas.typeTitle}
      >
        <DataTable
          caption={t.campanas.typeTitle}
          columns={[
            {
              header: t.campanas.colType,
              cell: (row) => <span className="font-medium">{row.nombre}</span>,
            },
            { header: t.campanas.colSpend, numeric: true, cell: (row) => money(row.inversion) },
            {
              header: t.campanas.colLeads,
              numeric: true,
              cell: (row) =>
                row.leads_form != null
                  ? t.campanas.leads(count(row.leads_form))
                  : count(row.conversaciones_meta),
            },
            { header: t.campanas.colContacts, numeric: true, cell: (row) => count(row.contactos) },
            { header: t.campanas.colTours, numeric: true, cell: (row) => count(row.tours) },
            { header: t.campanas.colSignups, numeric: true, cell: (row) => count(row.altas) },
            {
              header: t.campanas.colPer100,
              numeric: true,
              cell: (row) => formatNumber(row.altas_x100, locale, 1),
            },
            {
              header: t.campanas.colAnnual,
              numeric: true,
              cell: (row) => formatPct(row.pct_anual, locale, 0),
            },
            {
              header: t.campanas.colCost,
              numeric: true,
              cell: (row) => signupCost(row.cpa, thresholds.costo_alta_tipo_campana),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.nombre}
          rows={payload.tipo_campana}
        />
      </Block>
      <Block subtitle={t.campanas.formSub} title={t.campanas.formTitle}>
        <DataTable
          caption={t.campanas.formTitle}
          columns={[
            {
              header: t.campanas.colMonth,
              cell: (row) => (
                <span className="font-medium">
                  {formatMonth(row.mes, locale, { withYear: true })}
                </span>
              ),
            },
            { header: t.campanas.colSpend, numeric: true, cell: (row) => money(row.inversion) },
            { header: t.campanas.colMetaLeads, numeric: true, cell: (row) => count(row.leads) },
            { header: t.campanas.colCpl, numeric: true, cell: (row) => money(row.cpl_form) },
            { header: t.campanas.colInPeaking, numeric: true, cell: (row) => count(row.contactos) },
            { header: t.campanas.colTours, numeric: true, cell: (row) => count(row.tours) },
            { header: t.campanas.colSignups, numeric: true, cell: (row) => count(row.altas) },
            {
              header: t.campanas.colCost,
              numeric: true,
              cell: (row) => signupCost(row.cpa, thresholds.costo_alta_formulario),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.mes}
          rows={payload.formulario_mes}
        />
      </Block>
      <Block
        span="wide"
        subtitle={t.campanas.googleSub(count(google.contactos_peaking), count(google.altas))}
        title={t.campanas.googleTitle}
      >
        <DataTable
          caption={t.campanas.googleTitle}
          columns={[
            {
              header: t.campanas.colCampaign,
              cell: ([name]) => <span className="font-medium">{name}</span>,
            },
            { header: t.campanas.colSpend, numeric: true, cell: ([, spend]) => money(spend) },
            { header: t.campanas.colClicks, numeric: true, cell: ([, , clicks]) => count(clicks) },
            {
              header: t.campanas.colGoogleConv,
              numeric: true,
              cell: ([, , , conversions]) => count(conversions),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={([name]) => name}
          rows={google.campanas}
        />
      </Block>
      <Block span="narrow" title={t.campanas.accountsTitle}>
        <FindingGrid single>
          <FindingCard
            tag={t.sources.meta}
            text={t.campanas.metaAccounts(
              metaAccounts.con_gasto.join(', '),
              count(metaAccounts.sin_gasto),
            )}
            title={metaAccounts.con_gasto[0] ?? '—'}
            tone="neutral"
          />
          <FindingCard
            tag={t.sources.google}
            text={t.campanas.googleSpend(money(google.inv_30d), money(google.inv_7d))}
            title={t.campanas.googleTitle}
            tone={google.altas === 0 && google.inv_30d > 0 ? 'warn' : 'neutral'}
          />
          <FindingCard
            tag={t.campanas.otherAccountTag}
            text={t.campanas.otherAccountText(
              count(otherAccount.contactos),
              count(otherAccount.tours),
              count(otherAccount.altas),
            )}
            title={t.campanas.otherAccountTitle}
            tone="warn"
          />
        </FindingGrid>
      </Block>
    </ViewGrid>
  );
}
