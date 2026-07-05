import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import type { Competitor } from "@continuum/contracts";

;(
  globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }
).window.SyntaxError = SyntaxError;

import { CompetitorRail } from "./CompetitorRail";

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    brandId: "00000000-0000-0000-0000-000000000002",
    name: "Acme Co",
    slug: "acme-co",
    source: "user",
    metaPageId: null,
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const noop = () => {};

afterEach(cleanup);

describe("CompetitorRail health", () => {
  it("renders a health dot per competitor when showHealth is set", () => {
    const healthy = competitor({
      id: "00000000-0000-0000-0000-0000000000aa",
      name: "Healthy Brand",
      organicStatus: "ready",
      metaPageResolutionStatus: "resolved",
      metaPageResolvedAt: "2026-07-01T00:00:00.000Z",
    });
    const needsHandle = competitor({
      id: "00000000-0000-0000-0000-0000000000bb",
      name: "No Handle Brand",
      organicStatus: "needs_instagram",
    });

    const { getByLabelText } = render(
      <CompetitorRail
        competitors={[healthy, needsHandle]}
        onSelect={noop}
        showHealth
        adCounts={{ "00000000-0000-0000-0000-0000000000aa": 4 }}
      />,
    );

    expect(getByLabelText("Health: Healthy")).toBeDefined();
    expect(getByLabelText("Health: Needs handle")).toBeDefined();
  });

  it("omits health dots when showHealth is not set", () => {
    const { queryByLabelText } = render(
      <CompetitorRail competitors={[competitor()]} onSelect={noop} />,
    );
    expect(queryByLabelText(/^Health:/)).toBeNull();
  });
});
