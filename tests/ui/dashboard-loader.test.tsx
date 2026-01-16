import { afterEach, beforeEach, expect, test } from "bun:test";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";

import DashboardLoader from "@/components/dashboard/DashboardLoader";
import { DASHBOARD_LOADER_TOTAL_DURATION_MS } from "@/lib/ui/dashboardLoaderTiming";

type TimeoutEntry = {
  id: number;
  callback: () => void;
  delay: number;
};

const originalSetTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;

let timeouts: TimeoutEntry[] = [];

beforeEach(() => {
  timeouts = [];
  sessionStorage.clear();

  window.setTimeout = ((callback: () => void, delay?: number) => {
    const id = timeouts.length + 1;
    timeouts.push({ id, callback, delay: delay ?? 0 });
    return id;
  }) as typeof window.setTimeout;

  window.clearTimeout = ((timeoutId: number) => {
    const index = timeouts.findIndex((timeout) => timeout.id === timeoutId);
    if (index >= 0) {
      timeouts.splice(index, 1);
    }
  }) as typeof window.clearTimeout;
});

afterEach(() => {
  window.setTimeout = originalSetTimeout;
  window.clearTimeout = originalClearTimeout;
  cleanup();
});

test("DashboardLoader renders nothing without onboarding flag", () => {
  const { container } = render(<DashboardLoader />);
  expect(container.firstChild).toBeNull();
});

test("DashboardLoader fades then unmounts when onboarding flag is set", async () => {
  sessionStorage.setItem("from_onboarding", "true");

  let renderResult: ReturnType<typeof render> | undefined;
  await act(async () => {
    renderResult = render(<DashboardLoader />);
  });

  if (!renderResult) {
    throw new Error("Render failed");
  }

  expect(sessionStorage.getItem("from_onboarding")).toBeNull();
  expect(timeouts).toHaveLength(2);
  expect(timeouts[0]?.delay).toBe(DASHBOARD_LOADER_TOTAL_DURATION_MS);
  expect(timeouts[1]?.delay).toBe(DASHBOARD_LOADER_TOTAL_DURATION_MS + 800);

  const { container } = renderResult;
  expect(container.querySelector("div.fixed.inset-0.z-50")).toBeTruthy();

  await act(async () => {
    timeouts[0]?.callback();
  });

  expect(container.querySelector("div.fixed.inset-0.z-50")).toBeTruthy();

  await act(async () => {
    timeouts[1]?.callback();
  });

  expect(container.querySelector("div.fixed.inset-0.z-50")).toBeNull();
});
