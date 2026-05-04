import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import { BrandedNotFound } from "./BrandedNotFound";

describe("BrandedNotFound", () => {
  it("renders branded 404 recovery actions", () => {
    const { container } = render(<BrandedNotFound />);
    const text = container.textContent ?? "";
    const buttons = Array.from(container.getElementsByTagName("button"));
    const links = Array.from(container.getElementsByTagName("a"));
    const heading = container.getElementsByTagName("h2")[0];

    expect(text).toContain("Continuum AI");
    expect(text).toContain("404");
    expect(text).toContain("We can't find that page.");
    expect(heading?.getAttribute("style")).toContain("color: #f8fafc");
    expect(buttons.some((button) => button.textContent === "Go back")).toBe(true);
    expect(links.find((link) => link.textContent === "Take me home")?.getAttribute("href")).toBe("/");
  });
});
