import "../../../bun-test-setup";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const requestMock = mock((_args: unknown) => Promise.resolve({ competitor: { id: "c1" } } as unknown));
mock.module("@/lib/api/http", () => ({ request: (args: unknown) => requestMock(args) }));

import { useCreateCompetitor } from "./competitorSpy";

afterEach(cleanup);

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidateSpy = mock(qc.invalidateQueries.bind(qc));
  qc.invalidateQueries = invalidateSpy as unknown as typeof qc.invalidateQueries;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy };
}

describe("useCreateCompetitor invalidation", () => {
  it("invalidates the recommended list after tracking so accepted recs flip to alreadyTracked", async () => {
    requestMock.mockResolvedValue({ competitor: { id: "c1" } });
    const { wrapper, invalidateSpy } = setup();
    const { result } = renderHook(() => useCreateCompetitor("brand-1"), { wrapper });

    await result.current.mutateAsync({ name: "Acme" });

    await waitFor(() => {
      const invalidatedKeys = invalidateSpy.mock.calls.map((call) =>
        JSON.stringify((call[0] as { queryKey?: unknown })?.queryKey),
      );
      expect(invalidatedKeys.some((key) => key?.includes("recommended"))).toBe(true);
    });
  });
});
