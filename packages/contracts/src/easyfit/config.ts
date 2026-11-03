import { z } from 'zod';

/**
 * Pilot configuration for the Easy Fit "Altas" module.
 *
 * The three schemas mirror the reference package's `config/piloto.json`,
 * `config/ofertas.json` and `config/sucursales.json` key for key (Spanish
 * snake_case), so the files can be loaded and validated as they are. Fields the
 * reference pipeline hard-coded in `pilot.py` (the proposal's historical cost
 * per alta, the ad-id suffixes that identify an ad account) are added here as
 * optional keys so the engine has no magic numbers of its own.
 */

const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM');
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const easyfitPlatformSchema = z.enum(['meta', 'google']);
export type EasyfitPlatform = z.infer<typeof easyfitPlatformSchema>;

export const easyfitSpendPlatformSchema = z
  .object({
    plataforma: z.enum(['meta', 'google_ads']),
    account_id: z.string().min(1),
    nombre: z.string().min(1),
  })
  .strict();

export const easyfitPilotMonthSchema = z
  .object({
    mes: yearMonthSchema,
    presupuesto: z.number().nonnegative(),
    piso: z.number().int().nonnegative(),
    objetivo: z.number().int().nonnegative(),
    costo_alta_obj: z.number().nonnegative(),
    costo_alta_techo: z.number().nonnegative(),
    costo_alta_anio_pasado: z.number().nonnegative(),
    altas_meta_obj: z.number().int().nonnegative(),
    costo_alta_meta_obj: z.number().nonnegative(),
  })
  .strict();
export type EasyfitPilotMonth = z.infer<typeof easyfitPilotMonthSchema>;

export const easyfitChipThresholdSchema = z
  .object({ verde_max: z.number(), rojo_min: z.number() })
  .strict();
export type EasyfitChipThreshold = z.infer<typeof easyfitChipThresholdSchema>;

const chip = (verde_max: number, rojo_min: number) =>
  easyfitChipThresholdSchema.default({ verde_max, rojo_min });

/**
 * Green/red cut-offs of every status chip in docs/05, defaulting to the spec's
 * values (MXN). A chip is green at or below `verde_max`, red at or above
 * `rojo_min`, plain in between. `costo_alta_meta` is the branch table (§7);
 * the fortnight table (§2) has its own, looser pair.
 */
export const easyfitChipThresholdsSchema = z
  .object({
    costo_alta_meta: chip(1000, 1300),
    costo_alta_meta_quincena: chip(960, 1500),
    costo_alta_cohorte: chip(1000, 1600),
    costo_alta_tipo_campana: chip(1700, 3000),
    costo_alta_formulario: chip(1700, 3000),
    costo_alta_oferta_est: chip(1000, 2000),
    costo_alta_audiencia: chip(2950, 4000),
    costo_tour: chip(300, 600),
  })
  .strict()
  .prefault({});
export type EasyfitChipThresholds = z.infer<typeof easyfitChipThresholdsSchema>;

export const easyfitPilotoConfigSchema = z
  .object({
    brand_id: z.string().min(1),
    zona_horaria: z.literal('America/Mexico_City'),
    moneda: z.literal('MXN'),
    fuente_altas: z.literal('poliwin'),
    sucursales: z.array(z.string().min(1)).min(1),
    plataformas_con_gasto: z.array(easyfitSpendPlatformSchema),
    cuentas_meta_a_vigilar: z.array(z.string().min(1)),
    piloto: z
      .object({
        nombre: z.string().min(1),
        presupuesto_cubre: z.string(),
        meses: z.array(easyfitPilotMonthSchema).min(1),
        pct_altas_meta_obj: z.number(),
      })
      .strict(),
    base: z
      .object({
        costo_alta_12m: z.number(),
        costo_alta_ene_sep: z.number(),
        costo_alta_jul_oct: z.number(),
      })
      .strict(),
    ltv: z
      .object({
        meses_12_con_iva: z.number(),
        meses_12_sin_iva: z.number(),
        curva_acumulada_m0_m11: z.array(z.number()).length(12),
      })
      .strict(),
    atribucion: z
      .object({
        ventana_dias_despues_alta: z.number().int().positive(),
        minima_dias: z.number().int().nonnegative(),
        desde_alta: isoDateSchema,
        peaking_desde: isoDateSchema,
        peaking_ad_id_desde: isoDateSchema,
      })
      .strict(),
    corte: z
      .object({
        cierre_mes_dia_siguiente: z.number().int().min(1).max(28),
        cohorte_madura_dias: z.number().int().positive(),
      })
      .strict(),
    umbrales_chip: easyfitChipThresholdsSchema,
    /**
     * Months whose Meta spend is not in the warehouse yet: the proposal's cost per
     * alta for that month, so the history can carry a derived investment
     * (`exacta: false`). `pilot.py` had these as a literal dict (`cpa_prop`).
     */
    costo_alta_historico_propuesta: z.record(yearMonthSchema, z.number()).optional(),
    /**
     * Meta ad ids carry a per-account suffix. `docs/02` names "0434" as the
     * unconnected account and the pipeline recognised "0236" as the Easyfit
     * account's ads that are missing from the catalog ("Easyfit no mapeado").
     */
    sufijos_cuenta_anuncio: z
      .object({ easyfit: z.string().min(1), otra_cuenta: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
export type EasyfitPilotoConfig = z.infer<typeof easyfitPilotoConfigSchema>;

export const easyfitOfferClassSchema = z.enum([
  'anualidad',
  'daypass_dias_gratis',
  'primer_mes_barato',
  'mensualidad_333',
]);
export type EasyfitOfferClass = z.infer<typeof easyfitOfferClassSchema>;

export const easyfitOfferRateSchema = z
  .object({ altas_x100: z.number(), tasa_tour: z.number(), pct_anual: z.number() })
  .strict();

export const easyfitActiveOfferSchema = z
  .object({
    mes: yearMonthSchema,
    oferta: z.string().min(1),
    clase: easyfitOfferClassSchema,
    vigencia: z.string(),
    copies: z.array(z.string()),
  })
  .strict();
export type EasyfitActiveOffer = z.infer<typeof easyfitActiveOfferSchema>;

export const easyfitOfertasConfigSchema = z
  .object({
    nota: z.string().optional(),
    tasas_historicas: z.record(easyfitOfferClassSchema, easyfitOfferRateSchema),
    activas: z.array(easyfitActiveOfferSchema),
    pendiente: z.string().optional(),
  })
  .strict();
export type EasyfitOfertasConfig = z.infer<typeof easyfitOfertasConfigSchema>;

export const easyfitBranchConfigSchema = z
  .object({
    nombre: z.string().min(1),
    poliwin_centro: z.string().min(1),
    alias_nombres: z.array(z.string().min(1)),
    alias_peaking: z.array(z.string().min(1)),
  })
  .strict();
export type EasyfitBranchConfig = z.infer<typeof easyfitBranchConfigSchema>;

export const easyfitSucursalesConfigSchema = z
  .object({
    sucursales: z.array(easyfitBranchConfigSchema).min(1),
    fuera_de_alcance: z.array(z.string()).optional(),
    poliwin_codigos_centro_export: z.string().optional(),
  })
  .strict();
export type EasyfitSucursalesConfig = z.infer<typeof easyfitSucursalesConfigSchema>;

export const easyfitPlanTagSchema = z.enum([
  'Oferta',
  'Conversión',
  'Creativo',
  'Medición',
  'Presupuesto',
  'Audiencia',
]);
export type EasyfitPlanTag = z.infer<typeof easyfitPlanTagSchema>;

/** One action of the "Plan" tab — editable text, owned by Continuum (docs/05 §9). */
export const easyfitPlanItemSchema = z
  .object({
    titulo: z.string().min(1),
    cuerpo: z.string(),
    etiqueta: easyfitPlanTagSchema,
  })
  .strict();
export type EasyfitPlanItem = z.infer<typeof easyfitPlanItemSchema>;

/**
 * The module's editable configuration: the three config files loaded together
 * plus the Plan text. This is the body of GET/PUT /easyfit/config.
 */
export const easyfitPilotConfigSchema = z
  .object({
    piloto: easyfitPilotoConfigSchema,
    ofertas: easyfitOfertasConfigSchema,
    sucursales: easyfitSucursalesConfigSchema,
    plan: z.array(easyfitPlanItemSchema).default([]),
  })
  .strict();
export type EasyfitPilotConfig = z.infer<typeof easyfitPilotConfigSchema>;
export type EasyfitPilotConfigInput = z.input<typeof easyfitPilotConfigSchema>;
