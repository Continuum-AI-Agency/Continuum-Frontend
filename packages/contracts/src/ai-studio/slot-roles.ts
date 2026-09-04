import { z } from 'zod';

/**
 * Slot ROLE vocabulary — the semantic name a render-template slot plays in a product record
 * (price, product_image, …). Mirrors the fenced JSON block in `docs/render-registry-contract.md`
 * §7 and `template-forge/src/contract/slotRoles.js`; a parity test on each side pins the copies.
 *
 * - `brand_logo` is reserved: Continuum fills it, an agent proposal must never bind it.
 * - A role is `declared` (operator), `agent` (autoplug, confidence >= 0.95) or `human`; a stored
 *   human role is never overwritten, and a field name alone never decides a role.
 */
export const SLOT_ROLES = [
  'sku', 'external_id', 'name', 'description', 'quantity',
  'price', 'currency', 'old_price', 'discount_percent',
  'promo_start', 'promo_end', 'promo_dates',
  'product_image', 'brand_logo', 'background_image', 'background_color',
  'legal_text', 'color_primary', 'color_secondary', 'color_accent', 'color_text',
  'cta_text', 'landing_url',
] as const;

export type SlotRole = (typeof SLOT_ROLES)[number];

export const slotRoleSchema = z.enum(SLOT_ROLES);

export const SLOT_ROLE_KIND: Record<SlotRole, 'text' | 'number' | 'date' | 'image' | 'color'> = {
  sku: 'text', external_id: 'text', name: 'text', description: 'text', quantity: 'number',
  price: 'number', currency: 'text', old_price: 'number', discount_percent: 'number',
  promo_start: 'date', promo_end: 'date', promo_dates: 'text',
  product_image: 'image', brand_logo: 'image', background_image: 'image', background_color: 'color',
  legal_text: 'text', color_primary: 'color', color_secondary: 'color', color_accent: 'color', color_text: 'color',
  cta_text: 'text', landing_url: 'text',
};

export const RESERVED_SLOT_ROLES: readonly SlotRole[] = ['brand_logo'];

export const SLOT_ROLE_SOURCES = ['declared', 'agent', 'human'] as const;
export type SlotRoleSource = (typeof SLOT_ROLE_SOURCES)[number];
export const slotRoleSourceSchema = z.enum(SLOT_ROLE_SOURCES);

export const SLOT_ROLE_AGENT_CONFIDENCE_THRESHOLD = 0.95;

export function isSlotRole(value: unknown): value is SlotRole {
  return typeof value === 'string' && (SLOT_ROLES as readonly string[]).includes(value);
}
