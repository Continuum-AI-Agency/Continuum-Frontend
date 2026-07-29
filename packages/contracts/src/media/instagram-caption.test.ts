import { describe, expect, it } from "bun:test";

import {
  INSTAGRAM_CAPTION_MAX_LENGTH,
  INSTAGRAM_HASHTAG_MAX,
  buildInstagramCaption,
  buildPlatformCaption,
  clampInstagramCaption,
  clampPlatformCaption,
} from "./instagram-caption";

describe("buildInstagramCaption", () => {
  it("joins caption body and hashtag tiers with a blank line", () => {
    const out = buildInstagramCaption("Hello world", {
      high: ["#one"],
      medium: ["two"],
      low: ["#three"],
    });
    expect(out).toBe("Hello world\n\n#one #two #three");
  });

  it("returns just the body when there are no hashtags", () => {
    expect(buildInstagramCaption("Just text", {})).toBe("Just text");
    expect(buildInstagramCaption("Just text", undefined)).toBe("Just text");
  });

  it("returns just the tags when there is no caption", () => {
    expect(buildInstagramCaption("", ["sun", "#moon"])).toBe("#sun #moon");
  });

  it("prefixes # and dedupes (case-insensitive) across tiers", () => {
    const out = buildInstagramCaption("c", {
      high: ["sale", "#Sale"],
      medium: ["sale"],
      low: ["new"],
    });
    expect(out).toBe("c\n\n#sale #new");
  });

  it("caps the hashtag BLOCK at the limit without touching # in caption prose", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const out = buildInstagramCaption("Save #now on everything", tags);
    const tagBlock = out.split("\n\n")[1] ?? "";
    expect(tagBlock.split(" ")).toHaveLength(INSTAGRAM_HASHTAG_MAX);
    // The prose hashtag survives — it is not counted or stripped.
    expect(out.startsWith("Save #now on everything")).toBe(true);
  });

  it("respects an explicit maxHashtags override", () => {
    const out = buildInstagramCaption("c", ["a", "b", "c", "d"], { maxHashtags: 2 });
    expect(out).toBe("c\n\n#a #b");
  });

  it("clamps the assembled caption to the max length", () => {
    const body = "x".repeat(INSTAGRAM_CAPTION_MAX_LENGTH + 500);
    const out = buildInstagramCaption(body, ["tag"]);
    expect(out.length).toBeLessThanOrEqual(INSTAGRAM_CAPTION_MAX_LENGTH);
  });
});

describe("clampInstagramCaption", () => {
  it("passes through short captions unchanged", () => {
    expect(clampInstagramCaption("short")).toBe("short");
  });

  it("handles null/undefined as empty string", () => {
    expect(clampInstagramCaption(undefined)).toBe("");
    expect(clampInstagramCaption(null)).toBe("");
  });

  it("truncates over-length captions to the limit", () => {
    const out = clampInstagramCaption("y".repeat(3000), 2200);
    expect(out.length).toBeLessThanOrEqual(2200);
  });

  it("trims back to a word boundary instead of leaving a partial token", () => {
    // 2198 chars + space + a long word that would be cut mid-token at 2200.
    const text = `${"a ".repeat(1099)}supercalifragilistic`;
    const out = clampInstagramCaption(text, 2200);
    expect(out.length).toBeLessThanOrEqual(2200);
    expect(out.endsWith("supercalifragilistic")).toBe(false);
    // No dangling partial of the final word.
    expect(/\bsupercalif?r?a?g?i?l?i?s?t?i?c?$/.test(out)).toBe(false);
  });
});

describe("buildPlatformCaption", () => {
  it("is byte-identical to buildInstagramCaption on the instagram path", () => {
    const hashtags = { high: ["#sale"], medium: ["new", "#sale"], low: ["fresh"] };
    for (const body of ["Hello world", "", "x".repeat(3000), "Save #now on everything"]) {
      expect(buildPlatformCaption("instagram", body, hashtags)).toBe(
        buildInstagramCaption(body, hashtags),
      );
    }
  });

  it("does NOT truncate a 2,600-char LinkedIn caption that Instagram would clamp", () => {
    // The live bug: EditableCaption counted this green at 3000 while the publisher
    // clamped every platform at 2200 and posted it cut off.
    const body = `${"word ".repeat(519)}finalword`;
    expect(body.length).toBeGreaterThan(2200);
    expect(body.length).toBeLessThan(3000);

    const linkedin = buildPlatformCaption("linkedin", body);
    expect(linkedin).toBe(body.trim());
    expect(linkedin.length).toBe(body.trim().length);

    const instagram = buildPlatformCaption("instagram", body);
    expect(instagram.length).toBeLessThanOrEqual(2200);
    expect(instagram.length).toBeLessThan(linkedin.length);
    // Clamped at a word boundary, so no dangling partial token.
    expect(instagram.endsWith("word")).toBe(true);
    expect(instagram).toBe(body.trim().slice(0, instagram.length));
  });

  it("gives Facebook the widest ceiling of the three", () => {
    const body = "y".repeat(5000);
    expect(buildPlatformCaption("facebook", body)).toHaveLength(5000);
    expect(buildPlatformCaption("linkedin", body).length).toBeLessThanOrEqual(3000);
    expect(buildPlatformCaption("instagram", body).length).toBeLessThanOrEqual(2200);
  });

  it("caps the hashtag block per platform", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag${i}`);
    const out = buildPlatformCaption("linkedin", "c", tags);
    expect((out.split("\n\n")[1] ?? "").split(" ")).toHaveLength(30);
  });
});

describe("clampPlatformCaption", () => {
  it("clamps against the destination platform's own maximum", () => {
    const text = "z".repeat(4000);
    expect(clampPlatformCaption("instagram", text)).toHaveLength(2200);
    expect(clampPlatformCaption("linkedin", text)).toHaveLength(3000);
    expect(clampPlatformCaption("facebook", text)).toHaveLength(4000);
  });

  it("handles null/undefined as empty string", () => {
    expect(clampPlatformCaption("linkedin", undefined)).toBe("");
    expect(clampPlatformCaption("linkedin", null)).toBe("");
  });
});
