import { describe, expect, it } from "bun:test";

import { adNamingSchemaConfigSchema, parseAdName, parsedAdNameSchema } from "./adNaming";

const schema = adNamingSchemaConfigSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  brand_id: "22222222-2222-4222-8222-222222222222",
  platform: "meta",
  delimiter: "|",
  fields: ["funnel", "format", "audience"],
  version: 3,
});

describe("parseAdName", () => {
  it("maps segments onto the ordered field labels when the name matches", () => {
    const parsed = parseAdName("PROSP | Video | LAL1%", schema);
    expect(parsed.matched).toBe(true);
    expect(parsed.segments).toEqual(["PROSP", "Video", "LAL1%"]);
    expect(parsed.fields).toEqual({ funnel: "PROSP", format: "Video", audience: "LAL1%" });
    expect(parsed.schema_id).toBe(schema.id);
    expect(parsed.schema_version).toBe(3);
    // the returned shape validates against the wire schema
    expect(parsedAdNameSchema.safeParse(parsed).success).toBe(true);
  });

  it("maps missing trailing segments to null and flags a mismatch", () => {
    const parsed = parseAdName("PROSP|Video", schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.fields).toEqual({ funnel: "PROSP", format: "Video", audience: null });
  });

  it("keeps extra segments visible but drops them from the label map", () => {
    const parsed = parseAdName("PROSP|Video|LAL1%|Extra", schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.segments).toEqual(["PROSP", "Video", "LAL1%", "Extra"]);
    expect(Object.keys(parsed.fields)).toEqual(["funnel", "format", "audience"]);
  });

  it("treats an empty segment as null", () => {
    const parsed = parseAdName("PROSP||LAL1%", schema);
    expect(parsed.fields.format).toBeNull();
  });

  it("returns a single unmatched segment when the delimiter is absent", () => {
    const parsed = parseAdName("Just A Plain Name", schema);
    expect(parsed.matched).toBe(false);
    expect(parsed.segments).toEqual(["Just A Plain Name"]);
    expect(parsed.fields).toEqual({ funnel: "Just A Plain Name", format: null, audience: null });
  });
});

describe("adNamingSchemaConfigSchema", () => {
  it("rejects an empty fields array", () => {
    const result = adNamingSchemaConfigSchema.safeParse({ ...schema, fields: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty delimiter", () => {
    const result = adNamingSchemaConfigSchema.safeParse({ ...schema, delimiter: "" });
    expect(result.success).toBe(false);
  });
});
