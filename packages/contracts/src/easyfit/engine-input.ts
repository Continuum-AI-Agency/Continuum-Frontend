import { z } from 'zod';
import { easyfitPilotConfigSchema, easyfitPlatformSchema } from './config';
import { easyfitSourceDatesSchema } from './dashboard-payload';

/**
 * Everything the attribution engine needs, and nothing it must not see.
 *
 * Rows carry hashed phones (`phoneHash = sha256(tel10)`, see `./phone.ts`) and
 * never names, member numbers or clear phones. Timestamps are ISO-8601 with an
 * offset (Peaking exports `+00:00`); dates are `YYYY-MM-DD` already in the
 * pilot's time zone (America/Mexico_City). The engine converts instants to that
 * zone itself, so connectors pass what the source gave them.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoInstantSchema = z.string().datetime({ offset: true });
const idSchema = z.string().min(1);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'expected sha256 hex');

/** One Poliwin member row; the engine applies the inclusion rules of `docs/02` itself. */
export const easyfitAltaRowSchema = z
  .object({
    /** Stable key for the row (the connector hashes centro + número de socio + fecha). */
    altaKey: idSchema,
    /** Poliwin "Centro" as exported, e.g. "ALEIRA", "AVILA CAMACHO". */
    centro: z.string().min(1),
    fechaAlta: isoDateSchema,
    tipoSocio: z.string(),
    tipoCuota: z.string(),
    estadoSocio: z.string(),
    fechaBaja: isoDateSchema.nullable(),
    edad: z.number().nullable(),
    sexo: z.string().nullable(),
    /** Hashes of "Móvil" and "Teléfono", unusable numbers already dropped. */
    phoneHashes: z.array(sha256HexSchema),
  })
  .strict();
export type EasyfitAltaRow = z.infer<typeof easyfitAltaRowSchema>;

/** `contacts.attribution` of a Peaking web-form contact, kept raw so the engine applies `docs/02`. */
export const easyfitWebAttributionSchema = z
  .object({
    referrer: z.string().nullable(),
    landingPage: z.string().nullable(),
    gclid: z.string().nullable(),
  })
  .strict();

export const easyfitContactRowSchema = z
  .object({
    contactId: idSchema,
    phoneHash: sha256HexSchema.nullable(),
    createdAt: isoInstantSchema,
    /** Peaking `external_source` (`ai_agent`, `web_form`, `wa_template_bulk…`). */
    externalSource: z.string().nullable(),
    /** Peaking `ad_source_id` / `ad_headline` / `ad_first_touch_at` on the contact itself. */
    adSourceId: z.string().nullable(),
    adHeadline: z.string().nullable(),
    adFirstTouchAt: isoInstantSchema.nullable(),
    webAttribution: easyfitWebAttributionSchema.nullable(),
  })
  .strict();
export type EasyfitContactRow = z.infer<typeof easyfitContactRowSchema>;

export const easyfitThreadChannelSchema = z.enum(['whatsapp', 'messenger', 'instagram']);

/** One Peaking conversation thread; tours reference threads, channels classify contacts. */
export const easyfitThreadRowSchema = z
  .object({
    threadId: idSchema,
    contactId: idSchema,
    channel: easyfitThreadChannelSchema,
    /** True when the thread carries a `ctwa_clid` (click-to-WhatsApp without an ad id). */
    hasCtwaClid: z.boolean(),
    startedAt: isoInstantSchema,
  })
  .strict();
export type EasyfitThreadRow = z.infer<typeof easyfitThreadRowSchema>;

/** A CRM opportunity that carries its own ad touch (`crm_opportunities.ad_source_id`). */
export const easyfitOpportunityRowSchema = z
  .object({
    contactId: idSchema,
    adSourceId: z.string().min(1),
    adHeadline: z.string().nullable(),
    adFirstTouchAt: isoInstantSchema.nullable(),
    createdAt: isoInstantSchema,
  })
  .strict();
export type EasyfitOpportunityRow = z.infer<typeof easyfitOpportunityRowSchema>;

export const easyfitTourSourceSchema = z.enum(['tag', 'variable']);
export type EasyfitTourSource = z.infer<typeof easyfitTourSourceSchema>;

/**
 * One raw tour signal: the "Agendó Day Pass" tag or `tour_agendado = SI`.
 * The engine folds signals into one tour per contact per month.
 */
export const easyfitTourSignalRowSchema = z
  .object({
    threadId: idSchema,
    at: isoInstantSchema,
    source: easyfitTourSourceSchema,
    /** `sucursal_elegida` from `conversation_state.context_data`, variable signals only. */
    branchChosen: z.string().nullable(),
  })
  .strict();
export type EasyfitTourSignalRow = z.infer<typeof easyfitTourSignalRowSchema>;

/** One day × platform × ad (or adset, or campaign) of spend. */
export const easyfitDailySpendRowSchema = z
  .object({
    date: isoDateSchema,
    platform: easyfitPlatformSchema,
    accountId: idSchema,
    campaignId: idSchema,
    campaignName: z.string().nullable(),
    adsetId: z.string().nullable(),
    adsetName: z.string().nullable(),
    adId: z.string().nullable(),
    adName: z.string().nullable(),
    spend: z.number().nonnegative(),
    impressions: z.number().nonnegative(),
    clicks: z.number().nonnegative(),
    /** Meta "Messaging conversations started"; null when the source did not report it. */
    conversationsStarted: z.number().nonnegative().nullable(),
    /** Meta "Purchases" (today fired by the Day Pass tag) or Google conversions. */
    purchases: z.number().nonnegative().nullable(),
    /** Meta lead-form results. */
    leadsForm: z.number().nonnegative().nullable(),
  })
  .strict();
export type EasyfitDailySpendRow = z.infer<typeof easyfitDailySpendRowSchema>;

/** Meta spend broken down by age range (the account's last 30 days), for the audiences view. */
export const easyfitSpendByAgeRowSchema = z
  .object({
    ageRange: z.string().min(1),
    spend: z.number().nonnegative(),
    impressions: z.number().nonnegative(),
    clicks: z.number().nonnegative(),
  })
  .strict();
export type EasyfitSpendByAgeRow = z.infer<typeof easyfitSpendByAgeRowSchema>;

/** Append-only catalog entries: an ad deleted in Meta stays here with `deleted: true`. */
const catalogLifecycle = {
  firstSeen: isoDateSchema.nullable(),
  lastSeen: isoDateSchema.nullable(),
  deleted: z.boolean(),
};

export const easyfitCatalogAdSchema = z
  .object({
    adId: idSchema,
    adsetId: idSchema,
    campaignId: idSchema,
    adName: z.string(),
    ...catalogLifecycle,
  })
  .strict();
export type EasyfitCatalogAd = z.infer<typeof easyfitCatalogAdSchema>;

export const easyfitAdsetTargetingSchema = z
  .object({
    ageRange: z.string().nullable(),
    geo: z.string().nullable(),
    lookalikes: z.string().nullable(),
    customAudiencesIncluded: z.string().nullable(),
    interests: z.string().nullable(),
  })
  .strict();

export const easyfitCatalogAdsetSchema = z
  .object({
    adsetId: idSchema,
    campaignId: idSchema,
    adsetName: z.string(),
    status: z.string().nullable(),
    targeting: easyfitAdsetTargetingSchema.nullable(),
    ...catalogLifecycle,
  })
  .strict();
export type EasyfitCatalogAdset = z.infer<typeof easyfitCatalogAdsetSchema>;

export const easyfitCatalogCampaignSchema = z
  .object({
    campaignId: idSchema,
    campaignName: z.string(),
    platform: easyfitPlatformSchema,
    accountId: z.string().nullable(),
    ...catalogLifecycle,
  })
  .strict();
export type EasyfitCatalogCampaign = z.infer<typeof easyfitCatalogCampaignSchema>;

export const easyfitCatalogSchema = z
  .object({
    ads: z.array(easyfitCatalogAdSchema),
    adsets: z.array(easyfitCatalogAdsetSchema),
    campaigns: z.array(easyfitCatalogCampaignSchema),
  })
  .strict();
export type EasyfitCatalog = z.infer<typeof easyfitCatalogSchema>;

export const easyfitEngineInputSchema = z
  .object({
    /**
     * The instant the figures are computed for. Every "today", window and
     * "month in course" derives from it, which is what makes the engine
     * deterministic: same input, same payload.
     */
    asOf: isoInstantSchema,
    /** Date of the data each connector actually delivered; surfaces as `meta.fuentes`. */
    fuentes: easyfitSourceDatesSchema,
    config: easyfitPilotConfigSchema,
    altas: z.array(easyfitAltaRowSchema),
    contacts: z.array(easyfitContactRowSchema),
    threads: z.array(easyfitThreadRowSchema),
    opportunities: z.array(easyfitOpportunityRowSchema),
    tourSignals: z.array(easyfitTourSignalRowSchema),
    spend: z.array(easyfitDailySpendRowSchema),
    spendByAge: z.array(easyfitSpendByAgeRowSchema),
    catalog: easyfitCatalogSchema,
  })
  .strict();
export type EasyfitEngineInput = z.infer<typeof easyfitEngineInputSchema>;
