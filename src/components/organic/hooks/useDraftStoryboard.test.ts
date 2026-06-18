import { describe, expect, it } from "bun:test";

import { selectDraftStoryboard } from "./useDraftStoryboard";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

const slot = (over: Partial<OrganicCalendarDraft>): OrganicCalendarDraft =>
  ({ id: "x", mediaCount: 0, ...over }) as unknown as OrganicCalendarDraft;

describe("selectDraftStoryboard", () => {
  it("returns signed storyboard URLs for a draft matched by backendDraftId, dropping base64", () => {
    const days = [
      {
        slots: [
          slot({
            id: "fe-1",
            backendDraftId: "be-1",
            mediaSuggestion: {
              storyboard: [
                { role: "primary", bucket: "b", storagePath: "p1", storageUrl: "https://signed/a", format: "post" },
                { role: "slide_2", bucket: "b", storagePath: "p2", storageUrl: "data:image/png;base64,AAAA" },
              ],
            },
          }),
        ],
      },
    ];
    expect(selectDraftStoryboard(days, [], "be-1")).toEqual(["https://signed/a"]);
  });

  it("matches by FE id and finds the draft in the backlog", () => {
    const backlog = [
      slot({
        id: "fe-2",
        mediaSuggestion: {
          storyboard: [{ role: "primary", bucket: "b", storagePath: "p", storageUrl: "https://signed/c" }],
        },
      }),
    ];
    expect(selectDraftStoryboard([], backlog, "fe-2")).toEqual(["https://signed/c"]);
  });

  it("returns an empty array for a missing draftId or no match", () => {
    expect(selectDraftStoryboard([], [], null)).toEqual([]);
    expect(selectDraftStoryboard([{ slots: [] }], [], "missing")).toEqual([]);
  });
});
