import { ACTION_DEFS, type ActionId } from '@continuum/contracts';

// Turns an op's zod config schema into render-ready field descriptors, so the one
// generic ActionNode popover can draw the controls for every op in the registry.
// The point is that adding an op is a registry entry and nothing else: no per-op UI
// branch to forget, and no second list of "which ops have which knobs" to drift.
//
// Two rules keep this honest:
//  1. Defaults come from `schema.parse({})`, never from digging the wrapper apart.
//     Every op's config is already asserted to parse from `{}` in the contract's own
//     test, so that call is the single source of truth and it cannot disagree with
//     what the runner will actually receive.
//  2. Introspection is used ONLY for kind / bounds / enum options, and a key whose
//     kind cannot be determined is reported by `unsupportedConfigKeys` rather than
//     rendered as a broken control or silently dropped.

/** A `null` default is real: `startSec: z.number().nullable().default(null)` means
 *  "no window set", which is not the same value as 0. The UI renders an empty
 *  control for it and writes null back when the user clears the field. */
export type ConfigField =
  | {
      key: string;
      label: string;
      kind: 'number';
      min?: number;
      max?: number;
      step: number;
      nullable: boolean;
      defaultValue: number | null;
    }
  | { key: string; label: string; kind: 'string'; nullable: boolean; defaultValue: string | null }
  | { key: string; label: string; kind: 'boolean'; nullable: boolean; defaultValue: boolean }
  | {
      key: string;
      label: string;
      kind: 'enum';
      options: readonly string[];
      nullable: boolean;
      defaultValue: string | null;
    };

// ---------------------------------------------------------------------------
// zod 4 introspection
// ---------------------------------------------------------------------------

/**
 * The slice of a zod 4 schema this module reads. Zod exports no stable
 * introspection type, so we describe only the properties we touch and probe every
 * one of them defensively — a minor zod release that moves a field must degrade to
 * "unsupported key", never throw in a popover.
 *
 * Verified against zod 4.4.3:
 *   ZodObject  → `.def.type === 'object'`, `.def.shape` (declaration-ordered)
 *   .default() → `.def.type === 'default'`, `.def.innerType`
 *   .nullable()→ `.def.type === 'nullable'`, `.def.innerType`
 *   ZodNumber  → `.def.type === 'number'`; bounds are exposed as the derived
 *                `.minValue` / `.maxValue` getters (Infinity when unbounded), which
 *                is far steadier than walking `.def.checks` — those entries are
 *                bare check objects carrying `_zod.def`, with no `.def` of their own.
 *   ZodEnum    → `.def.type === 'enum'`, `.def.entries` as a value→value record
 */
interface ZodLike {
  readonly def?: {
    readonly type?: unknown;
    readonly innerType?: unknown;
    readonly shape?: unknown;
    readonly entries?: unknown;
  };
  readonly minValue?: unknown;
  readonly maxValue?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asZod = (value: unknown): ZodLike | undefined =>
  isRecord(value) && isRecord(value.def) ? (value as ZodLike) : undefined;

const defType = (schema: ZodLike): string | undefined =>
  typeof schema.def?.type === 'string' ? schema.def.type : undefined;

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const WRAPPER_TYPES = new Set(['default', 'prefault', 'optional', 'nullable', 'catch', 'readonly']);

/** Peels the wrappers off to reach the schema that decides the control's kind,
 *  reporting on the way whether `null` is a legal value for the field. */
function unwrap(schema: ZodLike): { inner: ZodLike; nullable: boolean } {
  let inner = schema;
  let nullable = false;
  // Bounded: a malformed or self-referential schema must not hang the popover.
  for (let depth = 0; depth < 8; depth += 1) {
    const type = defType(inner);
    if (!type || !WRAPPER_TYPES.has(type)) break;
    if (type === 'nullable' || type === 'optional') nullable = true;
    const next = asZod(inner.def?.innerType);
    if (!next) break;
    inner = next;
  }
  return { inner, nullable };
}

/**
 * A wide whole-number range (−360…360 degrees, 0…200 blur pixels) wants whole
 * steps; a narrow or fractional one (0…1 opacity, 0…3 grade, 0.1…8 speed) wants a
 * fine one. 0.05 is the coarsest step that still reaches every tenth exactly,
 * so dragging a 0…1 slider never lands on 0.30000000000000004.
 */
const stepFor = (min?: number, max?: number): number => {
  const wholeAndWide =
    min !== undefined &&
    max !== undefined &&
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    max - min > 5;
  return wholeAndWide ? 1 : 0.05;
};

const TOKEN_EXPANSIONS: Readonly<Record<string, string>> = {
  sec: 'Seconds',
  px: 'Pixels',
  frac: 'Fraction',
};

/** `marginFrac` → `Margin Fraction`. Exported for its own test; the abbreviations
 *  are the ones the registry actually uses, not a general dictionary. */
export function humaniseConfigKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(
      (token) =>
        TOKEN_EXPANSIONS[token.toLowerCase()] ?? token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join(' ');
}

function fieldFor(key: string, schema: ZodLike, defaultValue: unknown): ConfigField | undefined {
  const { inner, nullable } = unwrap(schema);
  const label = humaniseConfigKey(key);
  const isNull = defaultValue === null && nullable;

  switch (defType(inner)) {
    case 'number': {
      if (typeof defaultValue !== 'number' && !isNull) return undefined;
      const min = finite(inner.minValue);
      const max = finite(inner.maxValue);
      return {
        key,
        label,
        kind: 'number',
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
        step: stepFor(min, max),
        nullable,
        defaultValue: typeof defaultValue === 'number' ? defaultValue : null,
      };
    }
    case 'string': {
      if (typeof defaultValue !== 'string' && !isNull) return undefined;
      return {
        key,
        label,
        kind: 'string',
        nullable,
        defaultValue: typeof defaultValue === 'string' ? defaultValue : null,
      };
    }
    case 'boolean': {
      if (typeof defaultValue !== 'boolean') return undefined;
      return { key, label, kind: 'boolean', nullable, defaultValue };
    }
    case 'enum': {
      const entries = inner.def?.entries;
      if (!isRecord(entries)) return undefined;
      const options = Object.values(entries).filter(
        (option): option is string => typeof option === 'string',
      );
      if (options.length === 0) return undefined;
      if (typeof defaultValue !== 'string' && !isNull) return undefined;
      return {
        key,
        label,
        kind: 'enum',
        options,
        nullable,
        defaultValue: typeof defaultValue === 'string' ? defaultValue : null,
      };
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** The op's defaults, straight from the schema. `{}` if the schema refuses to
 *  produce them — which the contract's own test says cannot happen. */
function schemaDefaults(actionId: ActionId): Record<string, unknown> {
  const parsed = ACTION_DEFS[actionId].config.safeParse({});
  return parsed.success && isRecord(parsed.data) ? parsed.data : {};
}

function introspect(actionId: ActionId): { fields: ConfigField[]; unsupported: string[] } {
  const schema = asZod(ACTION_DEFS[actionId].config);
  const shape = schema?.def?.shape;
  if (!isRecord(shape)) return { fields: [], unsupported: [] };

  const defaults = schemaDefaults(actionId);
  const fields: ConfigField[] = [];
  const unsupported: string[] = [];

  // Object.keys on the shape preserves declaration order, which is the order the
  // author chose and the order the popover should read in.
  for (const key of Object.keys(shape)) {
    const child = asZod(shape[key]);
    const field = child ? fieldFor(key, child, defaults[key]) : undefined;
    if (field) fields.push(field);
    else unsupported.push(key);
  }
  return { fields, unsupported };
}

/** Render-ready fields for an op's `data.config`, in schema declaration order. */
export function configFieldsFor(actionId: ActionId): ConfigField[] {
  return introspect(actionId).fields;
}

/** Config keys this module could not turn into a control. Empty for every op in the
 *  registry today; a future op that adds an unsupported type shows up here — and in
 *  the test — instead of quietly losing a knob. */
export function unsupportedConfigKeys(actionId: ActionId): string[] {
  return introspect(actionId).unsupported;
}

/** Parse raw stored config against the op's schema, falling back to defaults.
 *  A persisted value that no longer validates (an op whose bounds tightened, a
 *  hand-edited workflow) must not brick the node. */
export function parseActionConfig(actionId: ActionId, raw: unknown): Record<string, unknown> {
  const defaults = schemaDefaults(actionId);
  const merged = isRecord(raw) ? { ...defaults, ...raw } : defaults;
  const parsed = ACTION_DEFS[actionId].config.safeParse(merged);
  return parsed.success && isRecord(parsed.data) ? parsed.data : defaults;
}

/** The number variant of `ConfigField`, for callers that have already narrowed. */
export type NumberConfigField = Extract<ConfigField, { kind: 'number' }>;

/**
 * A slider needs a range a drag can resolve. Most of the registry qualifies — 0…1
 * opacity, −180…180 hue, 1…60 fps — but three shapes do not, and each must fall back
 * to a scrub field rather than render a slider that cannot be aimed:
 *
 *  - nullable (`maxParts` is bounded 1…100 but defaults to null, and a track has no
 *    position that means "unset" — null is not the minimum, it is the absence of one)
 *  - unbounded (`startSec`, `endSec`, `atSec` carry a min and no max: a clip's length
 *    is not knowable from the schema, so there is no honest right-hand end)
 *  - bounded so wide the track runs out of pixels (`size: 1…10_000` at step 1 is ~55
 *    values per pixel on a 180px track, which is a number box wearing a slider)
 *
 * Mechanical, so a new op inherits the right control without a per-field allowlist.
 */
const MAX_SLIDER_STEPS = 1000;

export function numericControlFor(field: NumberConfigField): 'slider' | 'scrub' {
  if (field.nullable) return 'scrub';
  if (field.min === undefined || field.max === undefined) return 'scrub';
  if (!(field.step > 0)) return 'scrub';
  return (field.max - field.min) / field.step > MAX_SLIDER_STEPS ? 'scrub' : 'slider';
}
