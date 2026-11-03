/**
 * The prototype's fixtures (`dashboard/datos_ejemplo/data_piloto.json` and
 * `data_v1.json`) name some keys after the month they were generated in. This
 * maps a fixture onto the generic keys of `EasyfitDashboardPayload` so tests
 * and the UI can keep using the fixtures as sample data.
 */
export const EASYFIT_PROTOTYPE_KEY_MAP = {
  nov_en_curso: 'mes_en_curso',
  oct_quincenas: 'quincenas_mes_anterior',
  mix_semanal_oct: 'mix_semanal',
  anuncios_oct: 'anuncios_mes_anterior',
  inv_general_jul_oct: 'inv_general_meses_reporte',
} as const satisfies Record<string, string>;

type PrototypeKey = keyof typeof EASYFIT_PROTOTYPE_KEY_MAP;

const isPrototypeKey = (key: string): key is PrototypeKey => key in EASYFIT_PROTOTYPE_KEY_MAP;

/**
 * Renames the month-specific keys of a fixture; every other key passes through.
 * The result is still untyped data: validate it with `easyfitDashboardPayloadSchema`
 * after filling in the keys the fixtures lack (`meta`, `proyeccion`, `hallazgos`).
 */
export function adaptEasyfitPrototypeKeys(
  fixture: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fixture).map(([key, value]) => [
      isPrototypeKey(key) ? EASYFIT_PROTOTYPE_KEY_MAP[key] : key,
      value,
    ]),
  );
}
