import { beforeEach, describe, expect, it, mock } from "bun:test";

const requestMock = mock((_args: unknown) => Promise.resolve({} as unknown));
mock.module("@/lib/api/http", () => ({ request: (args: unknown) => requestMock(args) }));

import { dismissRecommendation, listRecommendedCompetitors } from "./competitorSpy";

beforeEach(() => requestMock.mockReset());

describe("recommended competitor client calls", () => {
  it("GETs recommendations for a brand and unwraps the envelope", async () => {
    requestMock.mockResolvedValue({ recommended: [{ name: "Acme" }] });
    const res = await listRecommendedCompetitors("brand-1");
    const arg = requestMock.mock.calls[0]?.[0] as { path: string };
    expect(arg.path).toBe("/api/competitor-ad-spy/competitors/recommended?brandId=brand-1");
    expect(res).toEqual([{ name: "Acme" }] as never);
  });

  it("POSTs a dismiss request with brandId + name", async () => {
    requestMock.mockResolvedValue({ dismissed: true, name: "Acme" });
    const res = await dismissRecommendation({ brandId: "brand-1", name: "Acme" });
    const arg = requestMock.mock.calls[0]?.[0] as { path: string; method: string; body: unknown };
    expect(arg.path).toBe("/api/competitor-ad-spy/competitors/recommended/dismiss");
    expect(arg.method).toBe("POST");
    expect(arg.body).toEqual({ brandId: "brand-1", name: "Acme" });
    expect(res.dismissed).toBe(true);
  });

  it("forwards the restore flag when un-dismissing", async () => {
    requestMock.mockResolvedValue({ dismissed: false, name: "Acme" });
    await dismissRecommendation({ brandId: "brand-1", name: "Acme", restore: true });
    const arg = requestMock.mock.calls[0]?.[0] as { body: { restore?: boolean } };
    expect(arg.body.restore).toBe(true);
  });
});
