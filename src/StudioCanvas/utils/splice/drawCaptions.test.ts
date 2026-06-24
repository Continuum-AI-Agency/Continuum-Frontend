import { describe, expect, it } from "bun:test";

import { wrapWords } from "./drawCaptions";
import type { CaptionWord } from "./captionCues";

const w = (text: string): CaptionWord => ({ text, startSec: 0, endSec: 1 });
// Fake measure: each character is 10px wide; a space is 10px.
const measure = (text: string) => text.length * 10;
const SPACE = 10;

describe("wrapWords", () => {
  it("keeps words on one line when they fit", () => {
    const lines = wrapWords(measure, [w("ab"), w("cd")], 100, SPACE);
    expect(lines).toHaveLength(1);
    expect(lines[0].map((x) => x.text)).toEqual(["ab", "cd"]);
  });

  it("wraps to a new line when the next word overflows maxWidth", () => {
    // "ab"(20) + space(10) + "cd"(20) = 50 fits; adding " ef"(10+20) = 80 > 70
    const lines = wrapWords(measure, [w("ab"), w("cd"), w("ef")], 70, SPACE);
    expect(lines.map((l) => l.map((x) => x.text))).toEqual([["ab", "cd"], ["ef"]]);
  });

  it("gives an over-wide single word its own line rather than dropping it", () => {
    const lines = wrapWords(measure, [w("supercalifragilistic")], 50, SPACE);
    expect(lines).toHaveLength(1);
    expect(lines[0][0].text).toBe("supercalifragilistic");
  });

  it("returns no lines for an empty cue", () => {
    expect(wrapWords(measure, [], 100, SPACE)).toEqual([]);
  });
});
