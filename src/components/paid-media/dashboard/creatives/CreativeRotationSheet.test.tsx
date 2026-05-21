import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";

import type { ActionLog } from "@/lib/types/dco";

import { CreativeRotationList } from "./CreativeRotationList";
import { summarizeCreativeRotations } from "./useCreativeRotations";

function makeLog(overrides: Partial<ActionLog>): ActionLog {
  return {
    id: overrides.id ?? "log-1",
    brandId: "brand-1",
    metaAccountId: "act_1",
    metaCampaignId: overrides.metaCampaignId ?? "c-1",
    metaAdsetId: overrides.metaAdsetId ?? "as-1",
    metaAdId: overrides.metaAdId ?? "ad-1",
    actionType: overrides.actionType ?? "CREATIVE_SWITCH_EXTERNAL",
    status: overrides.status ?? "SUCCESS",
    scopeType: overrides.scopeType ?? "AD",
    scopeId: overrides.scopeId ?? "ad-1",
    occurredAt: overrides.occurredAt ?? "2026-05-01T00:00:00.000Z",
    actionPayload: overrides.actionPayload ?? {},
    paramsChanged: {},
    result: {},
    decisionNote: overrides.decisionNote ?? null,
    error: overrides.error ?? null,
  };
}

function findByDataAttr(root: Element, attr: string): Element[] {
  const out: Element[] = [];
  const walker = (node: Element) => {
    if (node.getAttribute && node.getAttribute(attr) !== null) out.push(node);
    for (const child of Array.from(node.children)) walker(child);
  };
  walker(root);
  return out;
}

afterEach(() => cleanup());

describe("CreativeRotationList (sheet body)", () => {
  it("shows empty state when there are no rotations", () => {
    const { container } = render(<CreativeRotationList rotations={[]} />);
    expect(container.textContent).toContain("No DCO rotations recorded");
  });

  it("renders rotation rows reverse-chronological with decision notes and focus state", () => {
    const logs = [
      makeLog({
        id: "a",
        occurredAt: "2026-05-01T00:00:00.000Z",
        decisionNote: "Higher CTR variant chosen",
        actionPayload: { original_creative_url: "u1", new_creative_url: "u2" },
      }),
      makeLog({
        id: "b",
        occurredAt: "2026-05-03T00:00:00.000Z",
        decisionNote: "Replaced low-quality item",
        actionPayload: { original_creative_url: "u2", new_creative_url: "u3" },
      }),
    ];

    const summary = summarizeCreativeRotations({ adId: "ad-1", logs });
    const reversed = [...summary.rotations].reverse();
    const { container } = render(<CreativeRotationList rotations={reversed} focusedId="a" />);

    expect(container.textContent).toContain("Higher CTR variant chosen");
    expect(container.textContent).toContain("Replaced low-quality item");

    const rows = findByDataAttr(container, "data-rotation-id");
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute("data-rotation-id")).toBe("b");

    const byId = (id: string) => rows.find((row) => row.getAttribute("data-rotation-id") === id);
    expect(byId("a")?.getAttribute("data-focused")).toBe("true");
    expect(byId("b")?.getAttribute("data-focused")).toBeNull();
  });
});
