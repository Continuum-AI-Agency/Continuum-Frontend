import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { CanvasMediaLoader } from "./CanvasMediaLoader";

describe("CanvasMediaLoader", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an accessible canvas loading state", () => {
    render(<CanvasMediaLoader />);

    expect(screen.getByRole("status", { name: "Loading AI Studio canvas" })).toBeTruthy();
    expect(screen.getByText("Preparing media canvas")).toBeTruthy();
    expect(screen.getByText("Session")).toBeTruthy();
    expect(screen.getByText("Media Engine")).toBeTruthy();
  });

  it("accepts custom class names", () => {
    const { container } = render(<CanvasMediaLoader className="loader-hook" />);
    expect(container.querySelector(".loader-hook")).toBeTruthy();
  });
});

