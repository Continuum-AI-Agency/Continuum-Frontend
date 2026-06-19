import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { StatCard, StatCardSkeleton } from "./StatCard";

describe("StatCard", () => {
  afterEach(() => cleanup());

  it("renders the label, value, and positive delta", () => {
    render(<StatCard label="Reach" value="48.2k" deltaPct={12} />);

    expect(screen.getByText("Reach")).toBeDefined();
    expect(screen.getByText("48.2k")).toBeDefined();
    expect(screen.getByText("12%")).toBeDefined();
  });

  it("omits the delta when none is provided", () => {
    render(<StatCard label="Hook rate" value="62%" />);

    expect(screen.getByText("62%")).toBeDefined();
    expect(screen.queryByText("%", { exact: true })).toBeNull();
  });

  it("still renders the value when a hover detail is provided", () => {
    render(<StatCard label="Spend" value="$2.3K" deltaPct={11} detail={<div>prev detail</div>} />);
    expect(screen.getByText("$2.3K")).toBeDefined();
  });

  it("renders a skeleton placeholder", () => {
    const { container } = render(<StatCardSkeleton />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(3);
  });
});
