import { afterEach, beforeEach, expect, test, vi } from "bun:test";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";

import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";

const replaceSpy = vi.fn<(path: string) => void>();
const showSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy }),
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ show: showSpy }),
}));

beforeEach(() => {
  replaceSpy.mockReset();
  showSpy.mockReset();
});

afterEach(() => {
  cleanup();
});

test("TierAccessRedirect shows a warning toast and redirects", async () => {
  await act(async () => {
    render(
      <TierAccessRedirect
        title="Access Restricted"
        description="Paid Media is a paid feature. Please contact an Administrator."
        redirectTo="/dashboard"
      />
    );
  });

  expect(showSpy).toHaveBeenCalledWith({
    title: "Access Restricted",
    description: "Paid Media is a paid feature. Please contact an Administrator.",
    variant: "warning",
    durationMs: 6000,
  });
  expect(replaceSpy).toHaveBeenCalledWith("/dashboard");
});
