// The one ad-platform vocabulary for the multi-platform optimizer: which platform, which
// entity, and how much money — said once here and imported by the ingest, the appliers,
// the engine, Jaina and the Frontend.
//
// Before this file the repo spelled the platform four ways ('google_ads', 'google-ads',
// 'google', 'meta_ads') and every new shell invented a fifth. Legacy spellings are
// accepted ONLY through normalizePlatformId at a read boundary; nothing new writes them.
// Design: docs/optimizer-multiplatform/index.html ("Dónde no coincidían las páginas").

import { z } from 'zod';
import { metaCurrencyOffset } from '../optimization/currency';

export const PlatformIdSchema = z.enum(['meta', 'google_ads', 'tiktok_ads']);
export type PlatformId = z.infer<typeof PlatformIdSchema>;

/** Every non-canonical spelling still alive in the repo, and what it means.
 *  'meta_ads' — list_brand_ad_accounts, diagnostics, convert-cbo; 'google-ads' —
 *  optimizer.portfolios.platform CHECK, onboarding; 'google' — user_integrations.provider;
 *  'tiktok-ads' — the hyphenated SQL CHECK form portfolios already use for Google.
 *  'tiktok' and 'facebook' are deliberately absent: they are ORGANIC providers, and
 *  reading one as an ads platform would aim a budget write at a creator account. */
export const LEGACY_PLATFORM_ALIASES: Readonly<Record<string, PlatformId>> = Object.freeze({
  meta_ads: 'meta',
  'google-ads': 'google_ads',
  google: 'google_ads',
  'tiktok-ads': 'tiktok_ads',
});

/** A platform literal from any legacy source -> the canonical id. Throws on anything
 *  else: an unknown platform is a bug to surface, never a default to guess. */
export function normalizePlatformId(raw: string): PlatformId {
  const key = raw.trim().toLowerCase();
  const canonical = PlatformIdSchema.safeParse(key);
  if (canonical.success) return canonical.data;
  const alias = LEGACY_PLATFORM_ALIASES[key];
  if (alias) return alias;
  throw new Error(`Unknown ad platform: ${JSON.stringify(raw)}`);
}

// ---------------------------------------------------------------------------
// Entities: a neutral level the engine reasons in, plus the platform's own name for it,
// so Jaina says "ad group" on Google and TikTok and never "ad set".
// ---------------------------------------------------------------------------

export const EntityLevelSchema = z.enum(['campaign', 'group', 'ad']);
export type EntityLevel = z.infer<typeof EntityLevelSchema>;

export const NativeLevelSchema = z.enum([
  'campaign',
  'adset',
  'ad_group',
  'asset_group',
  'ad',
  'asset',
]);
export type NativeLevel = z.infer<typeof NativeLevelSchema>;

const NATIVE_LEVELS: Readonly<
  Record<PlatformId, Readonly<Record<EntityLevel, readonly NativeLevel[]>>>
> = {
  meta: { campaign: ['campaign'], group: ['adset'], ad: ['ad'] },
  // A PMax campaign has asset groups where Search has ad groups, and assets where it has ads.
  google_ads: { campaign: ['campaign'], group: ['ad_group', 'asset_group'], ad: ['ad', 'asset'] },
  tiktok_ads: { campaign: ['campaign'], group: ['ad_group'], ad: ['ad'] },
};

/** The native level names a platform uses at one neutral level. */
export function nativeLevelsFor(platform: PlatformId, level: EntityLevel): readonly NativeLevel[] {
  return NATIVE_LEVELS[platform][level];
}

export function isNativeLevelOf(
  platform: PlatformId,
  level: EntityLevel,
  nativeLevel: NativeLevel,
): boolean {
  return nativeLevelsFor(platform, level).includes(nativeLevel);
}

const nativeLevelIssue = {
  message: 'nativeLevel is not a name this platform uses at this level',
  path: ['nativeLevel'],
};

/** One entity on one platform. Ids stay strings as the platform names them: TikTok ids are
 *  19 digits and do not survive a JavaScript number. `accountId` carries no `act_` prefix. */
export const EntityRefSchema = z
  .object({
    platform: PlatformIdSchema,
    level: EntityLevelSchema,
    nativeLevel: NativeLevelSchema,
    id: z.string().min(1),
    accountId: z.string().min(1),
    name: z.string().optional(),
  })
  .refine((ref) => isNativeLevelOf(ref.platform, ref.level, ref.nativeLevel), nativeLevelIssue);
// `EntityRef` is already taken by paid/hierarchy.ts (a leaderboard identity fragment).
export type PlatformEntityRef = z.infer<typeof EntityRefSchema>;

/** The neutral status an action may expect or target. Platform states (ENABLED, DISABLE,
 *  REMOVED, DELETE…) are mapped by each applier; removal is never a target anywhere. */
export const EntityStatusSchema = z.enum(['active', 'paused']);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

/** Campaigns whose sub-units the platform controls. The engine must not descend into them,
 *  the applier picks a different write endpoint, and Jaina names it in the title. */
export const EntityAutomationSchema = z.enum([
  'manual',
  'pmax',
  'advantage_plus',
  'smart_plus',
  'upgraded_smart_plus',
]);
export type EntityAutomation = z.infer<typeof EntityAutomationSchema>;

const AUTOMATIONS: Readonly<Record<PlatformId, readonly EntityAutomation[]>> = {
  meta: ['manual', 'advantage_plus'],
  google_ads: ['manual', 'pmax'],
  tiktok_ads: ['manual', 'smart_plus', 'upgraded_smart_plus'],
};

export function isAutomationOfPlatform(
  platform: PlatformId,
  automation: EntityAutomation,
): boolean {
  return AUTOMATIONS[platform].includes(automation);
}

// ---------------------------------------------------------------------------
// Money. The ledger keys on ISO 4217 minor units; each applier converts to what its API
// expects: Meta minor units (Meta's OWN offset table), Google micros, TikTok major units.
// ---------------------------------------------------------------------------

export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, upper case');

/** ISO 4217 minor-unit digits, where they differ from the default of two. */
const ISO_MINOR_DIGITS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
};

/** MAJOR -> MINOR multiplier by ISO 4217 (100 for MXN, 1 for JPY, 1000 for KWD). Not
 *  Meta's table — see metaCurrencyOffset for the one Meta's budget fields use. Throws on a
 *  malformed code: a guessed offset writes a 100x budget. */
export function currencyMinorOffset(iso: string): number {
  const code = iso.trim().toUpperCase();
  if (!CurrencyCodeSchema.safeParse(code).success) {
    throw new Error(`Not an ISO 4217 currency code: ${JSON.stringify(iso)}`);
  }
  return 10 ** (ISO_MINOR_DIGITS[code] ?? 2);
}

const MICROS_PER_MAJOR = 1_000_000;

export interface PlatformBudgetOptions {
  /** Google's currency_constant.billable_unit_micros. Defaults to one ISO minor unit. */
  billableUnitMicros?: number;
}

function assertLedgerMinor(minor: number): void {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new Error(`Ledger amount must be whole, non-negative minor units; got ${minor}`);
  }
}

/** Ledger minor units -> the number the platform's budget field takes. */
export function toPlatformBudget(
  platform: PlatformId,
  minor: number,
  currency: string,
  options: PlatformBudgetOptions = {},
): number {
  assertLedgerMinor(minor);
  const isoOffset = currencyMinorOffset(currency);
  switch (platform) {
    case 'meta':
      return Math.round((minor * metaCurrencyOffset(currency)) / isoOffset);
    case 'google_ads': {
      const unit = options.billableUnitMicros ?? MICROS_PER_MAJOR / isoOffset;
      if (!(unit > 0)) throw new Error(`billableUnitMicros must be positive; got ${unit}`);
      const micros = (minor * MICROS_PER_MAJOR) / isoOffset;
      return Math.round(micros / unit) * unit;
    }
    case 'tiktok_ads':
      return minor / isoOffset;
  }
}

/** The number a platform reports for a budget -> ledger minor units, rounded once here. */
export function fromPlatformBudget(platform: PlatformId, amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Platform budget amount must be a finite, non-negative number; got ${amount}`);
  }
  const isoOffset = currencyMinorOffset(currency);
  switch (platform) {
    case 'meta':
      return Math.round((amount * isoOffset) / metaCurrencyOffset(currency));
    case 'google_ads':
      return Math.round((amount * isoOffset) / MICROS_PER_MAJOR);
    case 'tiktok_ads':
      return Math.round(amount * isoOffset);
  }
}

/** A budget as the ledger holds it. `ownerRef` is the entity that owns the money (the
 *  campaign under CBO); `shared` marks a Google budget that other campaigns also spend,
 *  which no applier may move in place. `nativeBudgetId` is Google's campaign_budget id. */
export const BudgetRefSchema = z.object({
  kind: z.enum(['daily', 'lifetime', 'total']),
  minor: z.number().int().nonnegative(),
  currency: CurrencyCodeSchema,
  shared: z.boolean(),
  ownerRef: EntityRefSchema,
  nativeBudgetId: z.string().min(1).optional(),
});
export type BudgetRef = z.infer<typeof BudgetRefSchema>;
