import { z } from 'zod';

/**
 * Meta Conversions API (CAPI): the shapes a brand's conversion events take on their way from
 * Continuum to `POST /{pixel_id}/events`.
 *
 * Events arrive RAW (plain email, phone, names) from three places — a one-off send in Settings,
 * a CSV of offline/CRM conversions, and a brand's own inbound webhook sources — and all three
 * normalize to `CapiEventInput`. Hashing happens on the Backend only, right before the Graph
 * call; nothing here is hashed and no raw value is ever persisted.
 *
 * Native webhooks (HubSpot, Calendly, Typeform…) send a fixed payload shape, so a source carries
 * a `fieldMap` (CAPI field → dot path into their JSON) and `applyCapiFieldMap` turns one of their
 * payloads into one event. The same function backs the Frontend's "paste a sample payload"
 * preview and the Backend's ingest, so the preview cannot disagree with what is sent.
 */

export const CAPI_MAX_EVENTS_PER_REQUEST = 1_000;
const DAY_SECONDS = 86_400;
/** Meta refuses the WHOLE request when one event is older than this. */
export const CAPI_MAX_EVENT_AGE_DAYS = 7;
export const CAPI_MAX_PHYSICAL_STORE_EVENT_AGE_DAYS = 62;
const FUTURE_TOLERANCE_SECONDS = 5 * 60;

export const CAPI_ROUTES = {
  pixels: '/api/paid/conversions/pixels',
  settings: '/api/paid/conversions/settings',
  sources: '/api/paid/conversions/sources',
  events: '/api/paid/conversions/events',
  deliveries: '/api/paid/conversions/deliveries',
  /** Public ingest: `${hooks}/:publicId`. */
  hooks: '/api/paid/conversions/hooks',
} as const;

export const capiActionSourceSchema = z.enum([
  'website',
  'email',
  'app',
  'phone_call',
  'chat',
  'physical_store',
  'system_generated',
  'business_messaging',
  'other',
]);
export type CapiActionSource = z.infer<typeof capiActionSourceSchema>;

export const CAPI_STANDARD_EVENT_NAMES = [
  'Lead',
  'Purchase',
  'CompleteRegistration',
  'Contact',
  'Schedule',
  'SubmitApplication',
  'Subscribe',
  'StartTrial',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
] as const;

const CAPI_EVENT_FIELDS = ['event_name', 'event_time', 'event_id', 'event_source_url'] as const;
export const CAPI_USER_FIELDS = [
  'email',
  'phone',
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'city',
  'state',
  'zip',
  'country',
  'external_id',
  'client_ip_address',
  'client_user_agent',
  'fbc',
  'fbp',
  'lead_id',
] as const;
const CAPI_CUSTOM_FIELDS = ['value', 'currency', 'order_id', 'content_name'] as const;

/** Every field a webhook source can map, and every column a CSV upload can carry. */
export const capiMappableFieldSchema = z.enum([
  ...CAPI_EVENT_FIELDS,
  ...CAPI_USER_FIELDS,
  ...CAPI_CUSTOM_FIELDS,
]);
export type CapiMappableField = z.infer<typeof capiMappableFieldSchema>;

const text = (max: number) => z.string().trim().min(1).max(max);

export const capiUserInputSchema = z.object(
  Object.fromEntries(CAPI_USER_FIELDS.map((field) => [field, text(500).optional()])) as Record<
    (typeof CAPI_USER_FIELDS)[number],
    z.ZodOptional<z.ZodString>
  >,
);
export type CapiUserInput = z.infer<typeof capiUserInputSchema>;

export const capiCustomDataSchema = z.object({
  value: z.number().finite().nonnegative().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO code')
    .optional(),
  order_id: text(200).optional(),
  content_name: text(500).optional(),
});

const hasIdentifier = (user: CapiUserInput): boolean =>
  Boolean(
    user.email ||
      user.phone ||
      user.external_id ||
      user.fbc ||
      user.fbp ||
      user.lead_id ||
      (user.client_ip_address && user.client_user_agent),
  );

export const capiEventInputSchema = z
  .object({
    event_name: text(100),
    /** Unix seconds — when the conversion actually happened, not when it was sent. */
    event_time: z.number().int().positive(),
    /** Dedupe key shared with the browser pixel. The Backend derives one when absent. */
    event_id: text(200).optional(),
    action_source: capiActionSourceSchema,
    event_source_url: z.string().trim().url().max(2_000).optional(),
    user: capiUserInputSchema,
    custom_data: capiCustomDataSchema.optional(),
  })
  .superRefine((event, ctx) => {
    if (!hasIdentifier(event.user)) {
      ctx.addIssue({
        code: 'custom',
        path: ['user'],
        message:
          'needs at least one of email, phone, external_id, fbc, fbp, lead_id, or IP + user agent',
      });
    }
    if (
      event.action_source === 'website' &&
      (!event.event_source_url || !event.user.client_user_agent)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['event_source_url'],
        message: 'website events need event_source_url and client_user_agent',
      });
    }
    if (
      event.event_name === 'Purchase' &&
      (event.custom_data?.value === undefined || !event.custom_data?.currency)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['custom_data'],
        message: 'Purchase events need value and currency',
      });
    }
  });
export type CapiEventInput = z.infer<typeof capiEventInputSchema>;

/** Why Meta would refuse this event's time, or null. Checked before sending, per event. */
export function capiEventTimeProblem(event: CapiEventInput, nowSeconds: number): string | null {
  const maxAgeDays =
    event.action_source === 'physical_store'
      ? CAPI_MAX_PHYSICAL_STORE_EVENT_AGE_DAYS
      : CAPI_MAX_EVENT_AGE_DAYS;
  if (event.event_time > nowSeconds + FUTURE_TOLERANCE_SECONDS) {
    return 'event_time is in the future';
  }
  if (event.event_time < nowSeconds - maxAgeDays * DAY_SECONDS) {
    return `event_time is older than ${maxAgeDays} days`;
  }
  return null;
}

export const capiEventIssueSchema = z.object({
  index: z.number().int().nonnegative(),
  message: z.string(),
});
export type CapiEventIssue = z.infer<typeof capiEventIssueSchema>;

/** The 400 body when any event fails validation; nothing was sent to Meta. */
export const capiInvalidEventsErrorSchema = z.object({
  error: z.literal('invalid_events'),
  issues: z.array(capiEventIssueSchema),
});

const capiEventsSchema = z.array(capiEventInputSchema).min(1).max(CAPI_MAX_EVENTS_PER_REQUEST);

export const capiSendRequestSchema = z.object({
  brandId: z.string().uuid(),
  source: z.enum(['manual', 'csv']),
  /** Send with the brand's saved test_event_code, so events land in Events Manager → Test Events. */
  test: z.boolean(),
  events: capiEventsSchema,
});
export type CapiSendRequest = z.infer<typeof capiSendRequestSchema>;

export const capiSendResultSchema = z.object({
  deliveryId: z.string().uuid(),
  eventsReceived: z.number().int().nonnegative(),
  fbtraceId: z.string().nullable(),
  messages: z.array(z.string()),
  testEventCode: z.string().nullable(),
});
export type CapiSendResult = z.infer<typeof capiSendResultSchema>;

export const capiPixelSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  lastFiredTime: z.string().nullable(),
  adAccountId: z.string(),
});
export type CapiPixel = z.infer<typeof capiPixelSchema>;
export const capiPixelsResponseSchema = z.object({ pixels: z.array(capiPixelSchema) });

export const capiSettingsSchema = z.object({
  brandId: z.string().uuid(),
  adAccountId: z.string(),
  pixelId: z.string(),
  pixelName: z.string().nullable(),
  testEventCode: z.string().nullable(),
  /** An automation webhook destination every delivery result is forwarded to, or null. */
  forwardDestinationId: z.string().uuid().nullable(),
  updatedAt: z.string(),
});
export type CapiSettings = z.infer<typeof capiSettingsSchema>;
export const capiSettingsResponseSchema = z.object({ settings: capiSettingsSchema.nullable() });

export const capiSettingsUpdateSchema = z.object({
  brandId: z.string().uuid(),
  adAccountId: text(64),
  pixelId: text(64),
  pixelName: z.string().trim().max(500).nullable().optional(),
  testEventCode: z.string().trim().max(64).nullable(),
  forwardDestinationId: z.string().uuid().nullable(),
});
export type CapiSettingsUpdate = z.infer<typeof capiSettingsUpdateSchema>;

/** CAPI field → dot path into the sender's JSON (`contact.email`, `lines.0.amount`). */
export const capiFieldMapSchema = z.partialRecord(capiMappableFieldSchema, text(200));
export type CapiFieldMap = z.infer<typeof capiFieldMapSchema>;

/** A brand's named inbound webhook. Empty `fieldMap` = the sender posts `CapiWebhookBody`. */
export const capiSourceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  /** The unguessable last path segment of the ingest URL: `${CAPI_ROUTES.hooks}/${publicId}`. */
  publicId: z.string(),
  eventName: z.string(),
  actionSource: capiActionSourceSchema,
  fieldMap: capiFieldMapSchema,
  /** When true, unsigned requests are refused; when false, a signature is still checked if sent. */
  requireSignature: z.boolean(),
  enabled: z.boolean(),
  /** Stamped on every authenticated arrival, including ones that then fail to map. */
  lastReceivedAt: z.string().nullable(),
  /**
   * The last arrival's key STRUCTURE with every value redacted (strings `"<string>"`, or a
   * same-format stand-in `XXX` / `https://example.com/` / `"0"`; numbers 0), so a field map can
   * be picked from what the sender really posts. Never customer data.
   */
  lastSample: z.unknown().nullable(),
  createdAt: z.string(),
});
export type CapiSource = z.infer<typeof capiSourceSchema>;
export const capiSourcesResponseSchema = z.object({ sources: z.array(capiSourceSchema) });

export const capiSourceCreateSchema = z.object({
  brandId: z.string().uuid(),
  name: text(120),
  eventName: text(100),
  actionSource: capiActionSourceSchema,
  fieldMap: capiFieldMapSchema.default({}),
  requireSignature: z.boolean().default(false),
});
/** `signingSecret` (whsec_…) is returned once, at creation, and never again. */
export const capiSourceCreateResponseSchema = z.object({
  source: capiSourceSchema,
  signingSecret: z.string(),
});

export const capiSourceUpdateSchema = z.object({
  brandId: z.string().uuid(),
  name: text(120).optional(),
  eventName: text(100).optional(),
  actionSource: capiActionSourceSchema.optional(),
  fieldMap: capiFieldMapSchema.optional(),
  requireSignature: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

/** The native ingest body, for senders that can shape their own JSON. */
export const capiWebhookBodySchema = z.object({
  events: capiEventsSchema,
  test: z.boolean().optional(),
});

export const capiDeliverySourceSchema = z.enum(['manual', 'csv', 'webhook', 'bench']);

export const capiDeliverySchema = z.object({
  id: z.string().uuid(),
  source: capiDeliverySourceSchema,
  sourceId: z.string().uuid().nullable(),
  pixelId: z.string(),
  eventCount: z.number().int().nonnegative(),
  eventNames: z.array(z.string()),
  testEventCode: z.string().nullable(),
  eventsReceived: z.number().int().nonnegative().nullable(),
  fbtraceId: z.string().nullable(),
  error: z.string().nullable(),
  forwardStatus: z.enum(['delivered', 'failed']).nullable(),
  forwardError: z.string().nullable(),
  createdAt: z.string(),
});
export type CapiDelivery = z.infer<typeof capiDeliverySchema>;
export const capiDeliveriesResponseSchema = z.object({ deliveries: z.array(capiDeliverySchema) });

/** What a forward destination receives after each delivery. Carries no customer data. */
export const capiForwardBodySchema = z.object({
  type: z.literal('meta_capi.delivery'),
  brandId: z.string().uuid(),
  delivery: capiDeliverySchema,
});

const readPath = (payload: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => {
    if (Array.isArray(node)) return /^\d+$/.test(key) ? node[Number(key)] : undefined;
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined;
  }, payload);

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Unix seconds from seconds, milliseconds, a numeric string, or an ISO date. */
const toUnixSeconds = (value: unknown): number | undefined => {
  const raw =
    typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw > 1e12 ? raw / 1_000 : raw);
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1_000);
  }
  return undefined;
};

const toAmount = (value: unknown): number | undefined => {
  const raw = typeof value === 'string' ? Number(value.replace(/[,\s]/g, '')) : value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
};

export type CapiMappedEvent = { ok: true; event: CapiEventInput } | { ok: false; issues: string[] };

/**
 * One sender payload (a webhook body, or a CSV row keyed by header) → one validated event.
 * `eventName` is the source's default; a mapped `event_name` overrides it. An unmapped or
 * unreadable `event_time` falls back to `nowSeconds` — the moment it was received.
 */
export function applyCapiFieldMap(
  payload: unknown,
  mapping: { eventName: string; actionSource: CapiActionSource; fieldMap: CapiFieldMap },
  nowSeconds: number,
): CapiMappedEvent {
  const read = (field: CapiMappableField): unknown => {
    const path = mapping.fieldMap[field];
    return path ? readPath(payload, path) : undefined;
  };
  const user = Object.fromEntries(
    CAPI_USER_FIELDS.flatMap((field) => {
      const value = asText(read(field));
      return value ? [[field, value]] : [];
    }),
  );
  const value = toAmount(read('value'));
  const currency = asText(read('currency'));
  const orderId = asText(read('order_id'));
  const contentName = asText(read('content_name'));
  const customData = {
    ...(value !== undefined ? { value } : {}),
    ...(currency ? { currency } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(contentName ? { content_name: contentName } : {}),
  };
  const eventId = asText(read('event_id')) ?? orderId;
  const eventSourceUrl = asText(read('event_source_url'));
  const parsed = capiEventInputSchema.safeParse({
    event_name: asText(read('event_name')) ?? mapping.eventName,
    event_time: toUnixSeconds(read('event_time')) ?? nowSeconds,
    ...(eventId ? { event_id: eventId } : {}),
    action_source: mapping.actionSource,
    ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
    user,
    ...(Object.keys(customData).length > 0 ? { custom_data: customData } : {}),
  });
  if (parsed.success) return { ok: true, event: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    ),
  };
}

/** The CSV upload's mapping: every recognized column header maps to itself. */
export function capiCsvFieldMap(headers: readonly string[]): CapiFieldMap {
  const fieldMap: CapiFieldMap = {};
  for (const header of headers) {
    const field = capiMappableFieldSchema.safeParse(header.trim().toLowerCase());
    if (field.success) fieldMap[field.data] = header;
  }
  return fieldMap;
}
