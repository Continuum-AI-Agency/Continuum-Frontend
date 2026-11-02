import { z } from 'zod';

/**
 * The payload the "Altas" dashboard renders.
 *
 * Shape = the union of the keys `dashboard/fuente/script2.js` reads from
 * `data_piloto.json` (every key, `P.*`) and from `data_v1.json` (`D.tiempos`,
 * `D.edad_inversion_vs_altas`, `D.mix_semanal_oct`, `D.anuncios_oct`,
 * `D.cruce_sucursal`, `D.cuentas_calidad`). Value shapes follow the fixtures,
 * not `schemas/dashboard_payload.schema.json`, which lags behind them. Fixture
 * keys named after a specific month are generic here; `./prototype-adapter.ts`
 * maps a fixture onto this shape:
 *
 *    nov_en_curso        → mes_en_curso
 *    oct_quincenas       → quincenas_mes_anterior
 *    mix_semanal_oct     → mix_semanal
 *    anuncios_oct        → anuncios_mes_anterior
 *    inv_general_jul_oct → inv_general_meses_reporte
 *
 * Discrepancies found while reconciling the three sources:
 *
 *  - schema `mes_en_curso` {mes, altas, altas_meta, inversion_meta, inversion_google,
 *    proyeccion_altas} vs fixture `nov_en_curso` {altas, altas_meta}. Kept the
 *    fixture's field names and added `mes`, `inv_meta`, `inv_google`, `inv_total`,
 *    `estado`; the projection is its own key, `proyeccion`.
 *  - schema `quincenas` vs fixture `oct_quincenas`; fixture has no `inv_google`.
 *    Added `inv_google`/`inv_total` so `cpa_total` can follow docs/02 (all
 *    platforms) instead of Meta only as `pilot.py` computed it.
 *  - schema `anuncios_mes` vs fixture `anuncios_oct` (in `data_v1.json`, not in
 *    `data_piloto.json`).
 *  - schema `cuentas` vs fixture `cuentas_meta` + `otra_cuenta` + `cuentas_calidad`.
 *  - schema `hallazgos` has no fixture counterpart: the prototype hard-codes its
 *    insight cards in script2.js. Here they are rule-generated (docs/05
 *    "Reglas para los hallazgos automáticos").
 *  - schema `meta` {actualizado, fuentes} exists in neither fixture; added here
 *    because the prototype hard-codes "Datos al 31 oct 2026". It is the single
 *    source of freshness: HTTP envelopes derive theirs from `meta.fuentes` and
 *    `meta.atrasadas`.
 *  - fixture `cohortes[].conversaciones`, `tipo_campana[].conversaciones_meta`,
 *    `formulario_mes[].leads` are `null` for months whose Meta export was missing;
 *    kept nullable.
 *  - fixture `google.campanas` is a list of 4-tuples [name, spend, clicks,
 *    conversions], read positionally by script2.js (`r[0]..r[3]`). Kept.
 *  - fixture `piloto` carries the targets as parallel arrays (one entry per pilot
 *    month) and script2.js indexes them by position. Kept; `config/piloto.json`
 *    has the same data as one object per month.
 */

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);
const money = z.number();
const nullableNumber = z.number().nullable();
const count = z.number().int();

export const easyfitPayloadPilotoSchema = z
  .object({
    meses: z.array(yearMonth),
    etiquetas: z.array(z.string()),
    piso: z.array(count),
    objetivo: z.array(count),
    presupuesto: z.array(money),
    cpa_obj: z.array(money),
    cpa_techo: z.array(money),
    cpa_anio_pasado: z.array(money),
    meta_obj: z.array(count),
    meta_cpa_obj: z.array(money),
    ltv: money,
    ltv_sin_iva: money,
    cpa_12m: money,
    cpa_ene_sep: money,
    cpa_jul_oct: money,
    ltv_curva: z.array(money),
  })
  .strict();

export const easyfitPayloadHistoricoRowSchema = z
  .object({
    mes: yearMonth,
    altas: count,
    /** null before Peaking recorded ad ids (2026-06). */
    altas_meta: count.nullable(),
    inv_meta: nullableNumber,
    inv_google: nullableNumber,
    inv_total: nullableNumber,
    /** false when the investment is derived from the proposal's cost per alta. */
    exacta: z.boolean(),
    cpa_total: nullableNumber,
    cpa_meta: nullableNumber,
    pct_meta: nullableNumber,
  })
  .strict();

export const easyfitPayloadMesEnCursoSchema = z
  .object({
    mes: yearMonth,
    altas: count,
    altas_meta: count,
    inv_meta: money,
    inv_google: money,
    inv_total: money,
    /** 'en curso' | 'por iniciar' | 'cerrado' per docs/05 §1. */
    estado: z.enum(['en curso', 'por iniciar', 'cerrado']),
  })
  .strict();

/**
 * Month-end projection of the month in course. Poliwin posts altas on the 1st and
 * the 15th, so the projection counts postings, not days: with one posting in,
 * the month is projected at twice it; with both in, it is the current count.
 * Null when the month is not in course or nothing has posted yet.
 */
export const easyfitPayloadProyeccionSchema = z
  .object({
    altas: count,
    altas_meta: count,
    metodo: z.literal('quincenas'),
  })
  .strict()
  .nullable();
export type EasyfitPayloadProyeccion = z.infer<typeof easyfitPayloadProyeccionSchema>;

export const easyfitPayloadQuincenaRowSchema = z
  .object({
    q: z.string(),
    altas: count,
    altas_meta: count,
    inv_meta: money,
    inv_google: money,
    inv_total: money,
    cpa_total: nullableNumber,
    cpa_meta: nullableNumber,
  })
  .strict();

export const easyfitPayloadSucursalRowSchema = z
  .object({
    nombre: z.string(),
    altas: count,
    altas_meta: count,
    inv_meta: money,
    cpa_meta: nullableNumber,
    pct_meta: nullableNumber,
    pct_anual_meta: nullableNumber,
  })
  .strict();

export const easyfitPayloadSeriesByMonthSchema = z
  .object({
    meses: z.array(yearMonth),
    series: z.record(z.string(), z.array(count)),
  })
  .strict();

export const easyfitPayloadTipoCampanaRowSchema = z
  .object({
    nombre: z.string(),
    inversion: money,
    conversaciones_meta: nullableNumber,
    leads_form: nullableNumber,
    contactos: count,
    tours: count,
    altas: count,
    cpa: nullableNumber,
    costo_contacto: nullableNumber,
    altas_x100: nullableNumber,
    pct_anual: nullableNumber,
  })
  .strict();

export const easyfitPayloadFormularioMesRowSchema = z
  .object({
    mes: yearMonth,
    inversion: money,
    leads: nullableNumber,
    contactos: count,
    tours: count,
    altas: count,
    cpl_form: nullableNumber,
    cpa: nullableNumber,
  })
  .strict();

export const easyfitPayloadOfertaRowSchema = z
  .object({
    nombre: z.string(),
    contactos: count,
    tours: count,
    altas: count,
    altas_x100: nullableNumber,
    pct_anual: nullableNumber,
    inversion: nullableNumber,
    cpa: nullableNumber,
    costo_est: nullableNumber,
    cpa_est: nullableNumber,
  })
  .strict();

export const easyfitPayloadAnualMetaMesRowSchema = z
  .object({ mes: yearMonth, pct: nullableNumber, n: count })
  .strict();

export const easyfitPayloadAudienciaRowSchema = z
  .object({
    nombre: z.string(),
    inversion: money,
    contactos: count,
    tours: count,
    altas: count,
    cpa: nullableNumber,
    altas_x100: nullableNumber,
  })
  .strict();

export const easyfitPayloadCohorteRowSchema = z
  .object({
    mes: yearMonth,
    inversion: money,
    conversaciones: nullableNumber,
    contactos: count,
    tours: count,
    altas: count,
    altas_con_tour: count,
    cpa: nullableNumber,
    madura: z.boolean(),
  })
  .strict();

export const easyfitPayloadTourPalancaSchema = z
  .object({ alta_si: nullableNumber, alta_no: nullableNumber })
  .strict();

export const easyfitPayloadGrupoOfertaSchema = z
  .object({ contactos: count, altas: count, altas_x100: nullableNumber })
  .strict();

export const easyfitPayloadToursLecturaRowSchema = z
  .object({
    mes: yearMonth,
    day_pass: count,
    tour_agendado: count,
    purchase_meta: nullableNumber,
  })
  .strict();

/** [campaign name, spend, clicks, conversions] — positional, as script2.js reads it. */
export const easyfitPayloadGoogleCampaignTupleSchema = z.tuple([
  z.string(),
  money,
  z.number(),
  z.number(),
]);

export const easyfitPayloadGoogleSchema = z
  .object({
    inv_30d: money,
    inv_7d: money,
    clics: z.number(),
    cpc: nullableNumber,
    contactos_peaking: count,
    altas: count,
    campanas: z.array(easyfitPayloadGoogleCampaignTupleSchema),
  })
  .strict();

export const easyfitPayloadCuentasMetaSchema = z
  .object({ con_gasto: z.array(z.string()), sin_gasto: count })
  .strict();

export const easyfitPayloadOtraCuentaSchema = z
  .object({ contactos: count, tours: count, altas: count })
  .strict();

export const easyfitPayloadHistogramSchema = z
  .object({
    labels: z.array(z.string()),
    valores: z.array(count),
  })
  .strict();

export const easyfitPayloadTiemposSchema = z
  .object({
    clic_a_tour: easyfitPayloadHistogramSchema.extend({ mediana_horas: nullableNumber }).strict(),
    clic_a_alta: easyfitPayloadHistogramSchema.extend({ mediana_dias: nullableNumber }).strict(),
  })
  .strict();

export const easyfitPayloadEdadRowSchema = z
  .object({
    rango: z.string(),
    pct_inversion: nullableNumber,
    ctr: nullableNumber,
    pct_altas: nullableNumber,
  })
  .strict();

export const easyfitPayloadMixSemanalSchema = z
  .object({
    semanas: z.array(z.string()),
    series: z.record(z.string(), z.array(count)),
  })
  .strict();

export const easyfitPayloadAnuncioRowSchema = z
  .object({
    ad_id: z.string(),
    anuncio: z.string(),
    titular: z.string(),
    sucursal: z.string(),
    audiencia: z.string(),
    formato: z.string(),
    inversion: money,
    contactos: count,
    tours: count,
    cpl: nullableNumber,
    costo_tour: nullableNumber,
  })
  .strict();

export const easyfitPayloadCruceSucursalSchema = z
  .object({
    filas: z.array(z.string()),
    columnas: z.array(z.string()),
    valores: z.array(z.array(count)),
  })
  .strict();

export const easyfitPayloadCuentaCalidadRowSchema = z
  .object({
    cuenta: z.string(),
    contactos: count,
    tasa_tour: nullableNumber,
    tasa_alta: nullableNumber,
    titulares: z.array(z.string()),
  })
  .strict();

export const easyfitSourceSchema = z.enum(['poliwin', 'peaking', 'meta', 'google']);
export type EasyfitSource = z.infer<typeof easyfitSourceSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Date of the data actually used, per source. */
export const easyfitSourceDatesSchema = z
  .object({ poliwin: isoDate, peaking: isoDate, meta: isoDate, google: isoDate })
  .strict();
export type EasyfitSourceDates = z.infer<typeof easyfitSourceDatesSchema>;

export const easyfitPayloadMetaSchema = z
  .object({
    /** The `asOf` the payload was computed for. */
    actualizado: z.string(),
    mes_en_curso: yearMonth,
    /** Complete months before the month in course that the funnel tables cover. */
    meses_reporte: z.array(yearMonth),
    /** Subset of `meses_reporte` whose click cohort is at least 30 days old. */
    meses_maduros: z.array(yearMonth),
    fuentes: easyfitSourceDatesSchema,
    /** Sources whose data is older than the day before `actualizado`. */
    atrasadas: z.array(easyfitSourceSchema),
  })
  .strict();

export const easyfitHallazgoSeveritySchema = z.enum([
  'critica',
  'advertencia',
  'oportunidad',
  'dato',
]);
export type EasyfitHallazgoSeverity = z.infer<typeof easyfitHallazgoSeveritySchema>;

export const easyfitHallazgoTagSchema = z.enum([
  'Brecha',
  'Calidad',
  'Palanca',
  'Costo',
  'Sucursal',
  'Dato',
]);
export type EasyfitHallazgoTag = z.infer<typeof easyfitHallazgoTagSchema>;

/** One rule-generated finding (docs/05 "Reglas para los hallazgos automáticos"). */
export const easyfitHallazgoSchema = z
  .object({
    severidad: easyfitHallazgoSeveritySchema,
    etiqueta: easyfitHallazgoTagSchema,
    titulo: z.string().min(1),
    texto: z.string(),
    metrica: z.object({ nombre: z.string(), valor: z.number() }).strict().optional(),
  })
  .strict();
export type EasyfitHallazgo = z.infer<typeof easyfitHallazgoSchema>;

export const easyfitDashboardPayloadSchema = z
  .object({
    meta: easyfitPayloadMetaSchema,
    piloto: easyfitPayloadPilotoSchema,
    historico: z.array(easyfitPayloadHistoricoRowSchema),
    mes_en_curso: easyfitPayloadMesEnCursoSchema,
    proyeccion: easyfitPayloadProyeccionSchema,
    quincenas_mes_anterior: z.array(easyfitPayloadQuincenaRowSchema),
    sucursales: z.array(easyfitPayloadSucursalRowSchema),
    inv_general_meses_reporte: money,
    altas_suc_mes: easyfitPayloadSeriesByMonthSchema,
    tipo_campana: z.array(easyfitPayloadTipoCampanaRowSchema),
    sin_campana_altas: count,
    formulario_mes: z.array(easyfitPayloadFormularioMesRowSchema),
    ofertas: z.array(easyfitPayloadOfertaRowSchema),
    anual_meta_mes: z.array(easyfitPayloadAnualMetaMesRowSchema),
    audiencias: z.array(easyfitPayloadAudienciaRowSchema),
    cohortes: z.array(easyfitPayloadCohorteRowSchema),
    tour_palanca: easyfitPayloadTourPalancaSchema,
    grupos_oferta: z.record(z.string(), easyfitPayloadGrupoOfertaSchema),
    tours_lecturas: z.array(easyfitPayloadToursLecturaRowSchema),
    google: easyfitPayloadGoogleSchema,
    cuentas_meta: easyfitPayloadCuentasMetaSchema,
    otra_cuenta: easyfitPayloadOtraCuentaSchema,
    tiempos: easyfitPayloadTiemposSchema,
    edad_inversion_vs_altas: z.array(easyfitPayloadEdadRowSchema),
    mix_semanal: easyfitPayloadMixSemanalSchema,
    anuncios_mes_anterior: z.array(easyfitPayloadAnuncioRowSchema),
    cruce_sucursal: easyfitPayloadCruceSucursalSchema,
    cuentas_calidad: z.array(easyfitPayloadCuentaCalidadRowSchema),
    hallazgos: z.array(easyfitHallazgoSchema),
  })
  .strict();
export type EasyfitDashboardPayload = z.infer<typeof easyfitDashboardPayloadSchema>;
