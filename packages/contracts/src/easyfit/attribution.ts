import { z } from 'zod';

/**
 * Per-alta attribution — the engine's `fact_attribution` (docs/04), recomputed
 * whole on every run. Aggregates only: the key is a hash, the contact id is a
 * Peaking UUID, there is no name, phone or member number here.
 *
 * Vocabulary follows `docs/02` so the Spanish labels can be shown as they are.
 */

/** The four channel classes of `docs/02` §Atribución, point 4. */
export const easyfitAltaChannelSchema = z.enum([
  'Anuncio Meta',
  'WhatsApp orgánico',
  'Sin contacto previo',
  'Antes de Peaking',
]);
export type EasyfitAltaChannel = z.infer<typeof easyfitAltaChannelSchema>;

/** How the contact reached Peaking, finer than the alta channel. */
export const easyfitContactChannelSchema = z.enum([
  'Anuncio Meta',
  'Anuncio Meta (sin ID de anuncio)',
  'Google Ads (formulario web)',
  'Formulario web (orgánico/otro)',
  'Instagram / Messenger orgánico',
  'WhatsApp orgánico',
]);
export type EasyfitContactChannel = z.infer<typeof easyfitContactChannelSchema>;

/** Where the ad touch landed relative to the alta date (`docs/02` §Atribución, point 2). */
export const easyfitAttributionRuleSchema = z.enum([
  'Mínima',
  'Máxima',
  'Sin anuncio',
  'No atribuible',
]);
export type EasyfitAttributionRule = z.infer<typeof easyfitAttributionRuleSchema>;

/** When the person first appeared in Peaking, relative to the alta. */
export const easyfitContactMomentSchema = z.enum([
  'Antes de Peaking',
  'Sin contacto en Peaking',
  'Contacto antes del alta',
  'Contacto 0-15 días después',
  'Contacto después (ya era socio)',
]);
export type EasyfitContactMoment = z.infer<typeof easyfitContactMomentSchema>;

/** Which ad account an ad id belongs to (`docs/02` §Cuenta del anuncio). */
export const easyfitAdAccountClassSchema = z.enum([
  'Easyfit',
  'Easyfit no mapeado',
  'Otra cuenta',
  'Otro ID',
]);
export type EasyfitAdAccountClass = z.infer<typeof easyfitAdAccountClassSchema>;

export const easyfitAttributionRowSchema = z
  .object({
    altaKey: z.string().min(1),
    fechaAlta: z.string(),
    mesAlta: z.string(),
    centro: z.string(),
    sucursal: z.string(),
    tipoSocio: z.string(),
    tipoCuota: z.string(),
    estadoSocio: z.string(),
    /** First (sorted) Peaking contact id matched by phone; null when none. */
    contactId: z.string().nullable(),
    primerContactoPeaking: z.string().nullable(),
    diasContactoAAlta: z.number().int().nullable(),
    momento: easyfitContactMomentSchema,
    canal: easyfitAltaChannelSchema,
    /** Finest channel among the matched contacts created inside the window; null without contacts. */
    canalContacto: easyfitContactChannelSchema.nullable(),
    atribucion: easyfitAttributionRuleSchema,
    adId: z.string().nullable(),
    adsetId: z.string().nullable(),
    campaignId: z.string().nullable(),
    cuenta: easyfitAdAccountClassSchema.nullable(),
    fechaClick: z.string().nullable(),
    diasClickAAlta: z.number().int().nullable(),
    titularAnuncio: z.string().nullable(),
    googleCampaignId: z.string().nullable(),
    utmSource: z.string().nullable(),
    tourAntesDelAlta: z.boolean(),
    fechaTour: z.string().nullable(),
  })
  .strict();
export type EasyfitAttributionRow = z.infer<typeof easyfitAttributionRowSchema>;
