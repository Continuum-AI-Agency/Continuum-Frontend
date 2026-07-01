// Brand-configurable ad-naming taxonomy. A brand declares how it names its ads
// (a delimiter plus an ordered list of field labels, e.g. `|` and
// [funnel, format, audience]); paid-media metric rows then carry a structured
// `parsed_name` so the AI can identify an ad by its named components instead of
// re-parsing a raw string. Everything degrades gracefully: with no schema
// configured, `parsed_name` is simply omitted and the raw name is still
// returned. The canonical store is brand_profiles.ad_naming_schemas.

import { z } from "zod";

// Stored brand schema — mirror of a brand_profiles.ad_naming_schemas row. The
// `id`/`version` are stamped into every parsed name so a consumer knows which
// schema interpreted it.
export const adNamingSchemaConfigSchema = z.object({
  id: z.string().uuid(),
  brand_id: z.string().uuid(),
  platform: z.enum(["meta", "google", "all"]),
  delimiter: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1),
  version: z.number().int().positive(),
});
export type AdNamingSchemaConfig = z.infer<typeof adNamingSchemaConfigSchema>;

// Parsed result attached to a metric row. `matched` is true only when the ad
// name split into exactly as many segments as the schema declares fields.
export const parsedAdNameSchema = z.object({
  schema_id: z.string().uuid(),
  schema_version: z.number().int(),
  delimiter: z.string(),
  matched: z.boolean(),
  segments: z.array(z.string()),
  fields: z.record(z.string(), z.string().nullable()),
});
export type ParsedAdName = z.infer<typeof parsedAdNameSchema>;

// Pure, never-throws parser. Splits the raw ad name on the schema delimiter,
// trims each segment, and maps the ordered field labels onto the segments
// (missing segments map to null; extra segments stay visible in `segments` but
// are dropped from the label map).
export function parseAdName(name: string, schema: AdNamingSchemaConfig): ParsedAdName {
  const segments = name.split(schema.delimiter).map((segment) => segment.trim());
  const fields: Record<string, string | null> = {};
  schema.fields.forEach((label, index) => {
    const value = segments[index];
    fields[label] = value === undefined || value.length === 0 ? null : value;
  });
  return {
    schema_id: schema.id,
    schema_version: schema.version,
    delimiter: schema.delimiter,
    matched: segments.length === schema.fields.length,
    segments,
    fields,
  };
}
