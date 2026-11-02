// Ofertas: sign-ups per 100 contacts and estimated cost by offer, this month's promotions
// from the pilot config with their historical reference, and the ads with spend this month
// (docs/05 §5).

import type {
  EasyfitChipThresholds,
  EasyfitDashboardPayload,
  EasyfitOfertasConfig,
} from '@continuum/contracts';
import { formatMxn, formatNumber, formatPct } from '../dashboardFormat';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { CostChip } from '../parts/CostChip';
import { BarCell, DataTable } from '../parts/DataTable';
import { Block, ViewGrid, ViewLead } from '../parts/layout';
import { SERIES_COLOR } from '../parts/palette';

/** The ads table shows the month's biggest spenders first, as many as a screen reads. */
const ADS_SHOWN = 20;

export function OfertasView({
  payload,
  offers,
  thresholds,
}: {
  payload: EasyfitDashboardPayload;
  thresholds: EasyfitChipThresholds;
  /** The pilot's offer config; the promotions table waits for it. */
  offers: EasyfitOfertasConfig | null;
}) {
  const { locale, t } = useDashboardCopy();
  const count = (value: number | null) => formatNumber(value, locale);
  const money = (value: number | null) => formatMxn(value, locale);
  const maxPer100 = Math.max(0, ...payload.ofertas.map((row) => row.altas_x100 ?? 0));
  const promotions = (offers?.activas ?? []).filter(
    (offer) => offer.mes === payload.meta.mes_en_curso,
  );
  const ads = [...payload.anuncios_mes_anterior]
    .sort((a, b) => b.inversion - a.inversion)
    .slice(0, ADS_SHOWN);

  return (
    <ViewGrid>
      <ViewLead title={t.ofertas.lead}>{t.ofertas.leadBody}</ViewLead>
      <Block subtitle={t.ofertas.offersSub} title={t.ofertas.offersTitle}>
        <DataTable
          caption={t.ofertas.offersTitle}
          columns={[
            {
              header: t.ofertas.colOffer,
              cell: (row) => <span className="font-medium">{row.nombre}</span>,
            },
            { header: t.ofertas.colContacts, numeric: true, cell: (row) => count(row.contactos) },
            { header: t.ofertas.colSignups, numeric: true, cell: (row) => count(row.altas) },
            {
              header: t.ofertas.colPer100,
              numeric: true,
              cell: (row) => (
                <BarCell
                  color={SERIES_COLOR.aqua}
                  max={maxPer100}
                  text={formatNumber(row.altas_x100, locale, 1)}
                  value={row.altas_x100}
                />
              ),
            },
            {
              header: t.ofertas.colAnnual,
              numeric: true,
              cell: (row) => formatPct(row.pct_anual, locale, 0),
            },
            {
              header: t.ofertas.colCostEst,
              numeric: true,
              cell: (row) => (
                <CostChip
                  emptyLabel={t.states.noSignups}
                  threshold={thresholds.costo_alta_oferta_est}
                  value={row.cpa_est}
                />
              ),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.nombre}
          rows={payload.ofertas}
        />
      </Block>
      {offers ? (
        <Block subtitle={t.ofertas.promoSub} title={t.ofertas.promoTitle}>
          <DataTable
            caption={t.ofertas.promoTitle}
            columns={[
              {
                header: t.ofertas.colPromo,
                cell: (row) => (
                  <span className="space-y-0.5">
                    <span className="block font-medium">{row.oferta}</span>
                    <span className="block text-muted-foreground">
                      {t.ofertas.validity(row.vigencia)}
                    </span>
                  </span>
                ),
              },
              { header: t.ofertas.colReference, cell: (row) => t.ofertas.offerClass[row.clase] },
              {
                header: t.ofertas.colPer100,
                numeric: true,
                cell: (row) =>
                  formatNumber(offers.tasas_historicas[row.clase]?.altas_x100, locale, 1),
              },
              {
                header: t.ofertas.colTourRate,
                numeric: true,
                cell: (row) => formatPct(offers.tasas_historicas[row.clase]?.tasa_tour, locale, 0),
              },
              {
                header: t.ofertas.colAnnual,
                numeric: true,
                cell: (row) => formatPct(offers.tasas_historicas[row.clase]?.pct_anual, locale, 0),
              },
            ]}
            emptyMessage={t.states.noRows}
            rowKey={(row) => `${row.mes}-${row.oferta}`}
            rows={promotions}
          />
        </Block>
      ) : null}
      <Block subtitle={t.ofertas.adsSub} title={t.ofertas.adsTitle}>
        <DataTable
          caption={t.ofertas.adsTitle}
          columns={[
            {
              header: t.ofertas.colAd,
              cell: (row) => (
                <span className="space-y-0.5">
                  <span className="block font-medium">{row.anuncio}</span>
                  <span className="block text-muted-foreground">
                    {row.audiencia} ·{' '}
                    {row.formato === 'Sin dato' ? t.ofertas.noFormat : row.formato}
                  </span>
                </span>
              ),
            },
            { header: t.ofertas.colBranch, cell: (row) => row.sucursal },
            { header: t.ofertas.colSpend, numeric: true, cell: (row) => money(row.inversion) },
            { header: t.ofertas.colContacts, numeric: true, cell: (row) => count(row.contactos) },
            { header: t.ofertas.colTours, numeric: true, cell: (row) => count(row.tours) },
            {
              header: t.ofertas.colCostTour,
              numeric: true,
              cell: (row) => (
                <CostChip
                  emptyLabel={t.ofertas.noTours}
                  threshold={thresholds.costo_tour}
                  value={row.costo_tour}
                />
              ),
            },
          ]}
          emptyMessage={t.states.noRows}
          rowKey={(row) => row.ad_id}
          rows={ads}
        />
      </Block>
    </ViewGrid>
  );
}
