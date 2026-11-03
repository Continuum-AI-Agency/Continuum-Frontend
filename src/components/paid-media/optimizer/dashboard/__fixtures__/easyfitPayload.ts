// The module package's real aggregates at 31-oct-2026 (data_piloto.json + the data_v1.json keys
// the dashboard reads), renamed onto the contract's generic keys by the contract's own adapter,
// completed with the fields the contract adds over the prototype (meta, the month in course's
// spend, projection, findings), and parsed through the contract schema so a fixture that
// drifts from the contract fails here instead of in a view test. The projection and the two
// findings are illustrative values, not engine output.

import {
  adaptEasyfitPrototypeKeys,
  type EasyfitDashboardPayload,
  type EasyfitDashboardResponse,
  type EasyfitPilotConfig,
  easyfitDashboardPayloadSchema,
  easyfitPilotConfigSchema,
} from '@continuum/contracts';
import pilot from './data_piloto.json';
import supporting from './data_v1.json';

const { nov_en_curso: current, oct_quincenas: fortnights } = pilot;

export const payloadFixture: EasyfitDashboardPayload = easyfitDashboardPayloadSchema.parse({
  ...adaptEasyfitPrototypeKeys(pilot),
  ...adaptEasyfitPrototypeKeys({
    tiempos: supporting.tiempos,
    edad_inversion_vs_altas: supporting.edad_inversion_vs_altas,
    mix_semanal_oct: supporting.mix_semanal_oct,
    anuncios_oct: supporting.anuncios_oct,
    cruce_sucursal: supporting.cruce_sucursal,
    cuentas_calidad: supporting.cuentas_calidad,
  }),
  meta: {
    actualizado: '2026-11-01T15:00:00-06:00',
    mes_en_curso: '2026-11',
    meses_reporte: ['2026-07', '2026-08', '2026-09', '2026-10'],
    meses_maduros: ['2026-07', '2026-08', '2026-09'],
    fuentes: {
      poliwin: '2026-11-01',
      peaking: '2026-11-01',
      meta: '2026-10-31',
      google: '2026-10-31',
    },
    atrasadas: [],
  },
  mes_en_curso: {
    ...current,
    mes: '2026-11',
    inv_meta: 0,
    inv_google: 0,
    inv_total: 0,
    estado: 'en curso',
  },
  proyeccion: { altas: 690, altas_meta: 70, metodo: 'quincenas' },
  quincenas_mes_anterior: fortnights.map((row) => ({
    ...row,
    inv_google: 0,
    inv_total: row.inv_meta,
  })),
  hallazgos: [
    {
      severidad: 'critica',
      etiqueta: 'Brecha',
      titulo: 'Al ritmo actual el mes cierra con 63 altas de Meta de 115',
      texto: '$110,000 a $61 por contacto son ~1,800 contactos.',
    },
    {
      severidad: 'oportunidad',
      etiqueta: 'Sucursal',
      titulo: 'Mover presupuesto hacia Cañadas',
      texto: 'Cañadas consigue el alta de Meta más barata.',
    },
  ],
});

export const responseFixture: EasyfitDashboardResponse = {
  payload: payloadFixture,
  meta: {
    generated_at: '2026-11-01T07:40:00-06:00',
    fuentes: {
      poliwin: '2026-11-01',
      peaking: '2026-11-01',
      meta: '2026-10-31',
      google: '2026-10-31',
    },
    atrasadas: [],
  },
};

/** config/piloto.json + config/ofertas.json + config/sucursales.json of the package, plus a plan. */
export const configFixture: EasyfitPilotConfig = easyfitPilotConfigSchema.parse({
  piloto: {
    brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    zona_horaria: 'America/Mexico_City',
    moneda: 'MXN',
    fuente_altas: 'poliwin',
    sucursales: ['Aleira', 'Ávila Camacho', 'Cañadas', 'ITESO'],
    plataformas_con_gasto: [
      { plataforma: 'meta', account_id: 'act_521903353286118', nombre: 'Easyfit' },
      { plataforma: 'google_ads', account_id: '5251780631', nombre: 'Easy Fit 2026' },
    ],
    cuentas_meta_a_vigilar: [],
    piloto: {
      nombre: 'Piloto nov 2026 – ene 2027',
      presupuesto_cubre: 'todas las plataformas',
      meses: [
        {
          mes: '2026-11',
          presupuesto: 110000,
          piso: 662,
          objetivo: 729,
          costo_alta_obj: 151,
          costo_alta_techo: 166,
          costo_alta_anio_pasado: 148,
          altas_meta_obj: 115,
          costo_alta_meta_obj: 957,
        },
        {
          mes: '2026-12',
          presupuesto: 110000,
          piso: 385,
          objetivo: 486,
          costo_alta_obj: 226,
          costo_alta_techo: 286,
          costo_alta_anio_pasado: 269,
          altas_meta_obj: 90,
          costo_alta_meta_obj: 1222,
        },
        {
          mes: '2027-01',
          presupuesto: 130000,
          piso: 662,
          objetivo: 845,
          costo_alta_obj: 154,
          costo_alta_techo: 196,
          costo_alta_anio_pasado: 127,
          altas_meta_obj: 140,
          costo_alta_meta_obj: 929,
        },
      ],
      pct_altas_meta_obj: 17,
    },
    base: { costo_alta_12m: 161, costo_alta_ene_sep: 154, costo_alta_jul_oct: 170 },
    ltv: {
      meses_12_con_iva: 4240,
      meses_12_sin_iva: 3650,
      curva_acumulada_m0_m11: [
        2759, 2919, 3111, 3260, 3398, 3531, 3655, 3762, 3859, 3965, 4102, 4239,
      ],
    },
    atribucion: {
      ventana_dias_despues_alta: 15,
      minima_dias: 1,
      desde_alta: '2025-11-01',
      peaking_desde: '2026-05-22',
      peaking_ad_id_desde: '2026-06-11',
    },
    corte: { cierre_mes_dia_siguiente: 15, cohorte_madura_dias: 30 },
    umbrales_chip: { costo_alta_meta: { verde_max: 1000, rojo_min: 1300 } },
  },
  ofertas: {
    tasas_historicas: {
      anualidad: { altas_x100: 8.1, tasa_tour: 28, pct_anual: 83 },
      daypass_dias_gratis: { altas_x100: 5.0, tasa_tour: 37, pct_anual: 48 },
      primer_mes_barato: { altas_x100: 2.0, tasa_tour: 20, pct_anual: 35 },
      mensualidad_333: { altas_x100: 4.9, tasa_tour: 25, pct_anual: 69 },
    },
    activas: [
      {
        mes: '2026-11',
        oferta: 'DayPass 3 días',
        clase: 'daypass_dias_gratis',
        vigencia: 'todo noviembre',
        copies: [],
      },
      {
        mes: '2026-11',
        oferta: 'Primer mes $10',
        clase: 'primer_mes_barato',
        vigencia: 'todo noviembre',
        copies: [],
      },
    ],
  },
  sucursales: {
    sucursales: [
      {
        nombre: 'Aleira',
        poliwin_centro: 'ALEIRA',
        alias_nombres: ['ALEIRA'],
        alias_peaking: ['Aleira'],
      },
    ],
  },
  plan: [
    {
      titulo: 'Darle más peso a "DayPass 3 días" que a "$10 primer mes"',
      cuerpo: 'El DayPass trae 2.5 veces más altas por contacto.',
      etiqueta: 'Oferta',
    },
    {
      titulo: 'Optimizar Meta hacia altas',
      cuerpo: 'Subir las altas de Poliwin a Meta.',
      etiqueta: 'Medición',
    },
  ],
});
